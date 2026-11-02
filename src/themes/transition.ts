// Switching themes, animated. Each tile has its own progress from the theme being left to the one coming in (onScreen.p, 0 … 1),
// uploaded each frame as a texture the block shader blends the two atlases by (uThemeP). A wave starts at your tile and runs out
// `speed` tiles a second; a tile it has reached eases over `duration` ms, its solid blocks rising or sinking to the new height (the
// chunks it is passing through are built again every few frames, as the original's Oxford ruins wave did), its decorations and the
// creatures on it swapping once it is half way. A fade starts every tile at once. Switching back mid-way turns every tile round where
// it is; a third theme first hurries the one running to its end. Nothing here touches the game: only how it is drawn.
import * as THREE from "three";
import { shared } from "../render/shading/uniforms";
import { world } from "../render/arm";
import { scene } from "../render/scene";
import { api, game, mobs } from "../core/game";
import { CHUNK } from "../world/blocks";
import { dressArmor, makeMob } from "../../js/models";
import { hudInk } from "../resources/items/icons";
import { showSheets } from "./atlas";
import { onScreen, themeAt, themeShown, tileP } from "./state";
import { shapeRun } from "./blocks";
import { modelChanges } from "./creatures";
import { morphModel } from "./creature-morph";
import { crownsLeft, crownsMorphing } from "./crowns";
import type { Theme, ThemeTransition } from "./types";

const run = {
  on: false, wave: true, t0: 0, last: 0, built: 0, speed: 25, dur: 700, hurry: 1,
  origin: [0, 0] as [number, number], level: -1, queued: undefined as Theme | null | undefined,
  pBuilt: null as Float32Array | null, tex: null as THREE.DataTexture | null, bytes: null as Uint8Array | null,
  /** The characters' own wave's progress, a tile each (null: no character changes look: they go with the world's). */
  pc: null as Float32Array | null,
  /** Stones moving (Ruins): each column's two heights (blocks.ts shapeRun), and their height now over the built one, a texel a tile. */
  ends: null as { a: Float32Array; b: Float32Array } | null, ktex: null as THREE.DataTexture | null, kbytes: null as Uint8Array | null,
};
const CHAR_GAP = 600;                                           // (ms: the characters' wave this far behind the world's)
// does any character (a creature, or you) change look between the two themes?
const charsChange = (a: Theme | null, b: Theme | null) => [a, b].some((t) => !!t && !!(t.player?.model || Object.values(t.creatures || {}).some((c) => c.model)));
/** A character's progress where it stands: its own wave's, or the world's. */
const charP = (r: number, c: number): number => {
  if (!run.on) return 1;
  if (!run.pc) return tileP(r, c);
  const { W, H } = onScreen; r = Math.max(0, Math.min(H - 1, Math.floor(r))); c = Math.max(0, Math.min(W - 1, Math.floor(c)));
  return run.pc[r * W + c];
};
const smooth = (x: number) => x * x * (3 - 2 * x);
function kTex(W: number, H: number): Uint8Array {
  if (!run.ktex || run.ktex.image.width !== W || run.ktex.image.height !== H) {
    run.ktex?.dispose();
    run.kbytes = new Uint8Array(W * H);
    run.ktex = new THREE.DataTexture(run.kbytes, W, H, THREE.RedFormat, THREE.UnsignedByteType);
    run.ktex.minFilter = run.ktex.magFilter = THREE.NearestFilter; run.ktex.unpackAlignment = 1;
    shared.uShapeK.value = run.ktex;
  }
  return run.kbytes!;
}
// the stones once the wave is done: a chunk built again at the new heights shows them as built (1); one still to come, built at
// the taller height, scaled down to the new one
function paintSettling(): void {
  const e = run.ends, { W, H } = onScreen;
  if (e && run.kbytes) {
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const i = r * W + c, a = e.a[i], b = e.b[i];
      run.kbytes[i] = a === b || readyAt(r, c) ? 255 : Math.round((b / Math.max(a, b, 1e-6)) * 255);
    }
    run.ktex!.needsUpdate = true;
  }
  if (!queue.list.length) settled();
}
// the world built again after a switch, the last chunk done: nothing of the switch left to draw (unless crownsLeft)
function settled(): void { endShapes(); if (!crownsLeft.on) shared.uCrownSwap.value = 0; }
function endShapes(): void { run.ends = null; shared.uShapeOn.value = 0; }
const usesWave = (a: Theme | null, b: Theme | null) => [a, b].some((t) => !!t && !!(t.shape || t.decorate || t.crown || t.player?.model || Object.values(t.creatures || {}).some((c) => c.model)));
const remaps = () => !!(onScreen.from?.tile || onScreen.to?.tile);
const fullBuild = () => { queue.list = []; queue.ready = null; world.regrow = false; if (world.lastS && world.lastProp) world.build(world.lastProp, world.lastS); };
// (Pete) a switch builds the world again a chunk at a time, the one you're in at once and then one a frame, nearest first, instead of
// all of it in one go (a second or more); its wave waits for each chunk (a tile in one not built yet holds still, drawn as it was),
// and, with themePause on, the world holds still the while (themeMoving: your steps wait, a bot playing your world is paused)
const queue = { list: [] as number[], ready: null as Uint8Array | null, level: -1 };
function queueAll(regrow: boolean): void {
  const S = game.S;
  if (!S || !world.lastS || !world.lastProp) return;
  const [H, W] = S.size, NC = Math.ceil(W / CHUNK), NR = Math.ceil(H / CHUNK), [pr, pc] = S.pos;
  const d = (k: number) => Math.hypot(Math.floor(k / NC) * CHUNK + CHUNK / 2 - pr, (k % NC) * CHUNK + CHUNK / 2 - pc);
  queue.list = Array.from({ length: NC * NR }, (_, k) => k).sort((a, b) => d(a) - d(b));
  queue.ready = new Uint8Array(NC * NR); queue.level = S.level; world.regrow = regrow;
  holdWorld(true);
  buildNext();
}
function buildNext(): void {
  const k = queue.list.shift();
  if (k === undefined || !world.lastS || !world.lastProp) return;
  world.build(world.lastProp, world.lastS, new Set([k]));
  queue.ready![k] = 1;
  if (!queue.list.length) { world.regrow = false; if (!run.on) holdWorld(false); }
}
// each tile's progress to the shader (uThemeP); a tile whose chunk isn't built yet: 1, drawn as it stands
function paint(): void {
  const { W, H, p } = onScreen;
  if (!p || !run.bytes) return;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) run.bytes[r * W + c] = readyAt(r, c) ? Math.round(p[r * W + c] * 255) : 255;
  run.tex!.needsUpdate = true;
  run.ends ??= shapeRun.ends;                                   // (the build fills it in: blocks.ts themeHeights)
  const e = run.ends;
  if (!e) return;
  const k = kTex(W, H);                                         // stones: built at the taller height, scaled to where the wave has them
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {     // (a chunk not built yet: as it stands, 1)
    const i = r * W + c, a = e.a[i], b = e.b[i];
    k[i] = a === b || !readyAt(r, c) ? 255 : Math.round(((a + (b - a) * smooth(p[i])) / Math.max(a, b, 1e-6)) * 255);
  }
  run.ktex!.needsUpdate = true; shared.uShapeOn.value = 1;
}
const readyAt = (r: number, c: number) => !queue.ready || queue.ready[Math.floor(r / CHUNK) * Math.ceil(onScreen.W / CHUNK) + Math.floor(c / CHUNK)] === 1;
// Settings → World (Pete: a setting, not forced; off unless turned on): the world holds still while a theme switches
export const themePause = { on: (() => { try { return localStorage.getItem("craftax3d.themePause") === "1"; } catch { return false; } })() };
export function setThemePause(on: boolean): void {
  themePause.on = on;
  try { localStorage.setItem("craftax3d.themePause", on ? "1" : "0"); } catch {}
  holdWorld(on && themeMoving());
}
// a bot playing your world: paused for the switch, and played on after (unless it was paused already)
let botHeld = false;
function holdWorld(on: boolean): void {
  if (on && !themePause.on) return;
  const w = game.S?.world;
  if (on && w && w.you && w.control === "bot" && !w.paused && !botHeld) { botHeld = true; api("/api/pace", { paused: true }).catch(() => {}); }
  else if (!on && botHeld) { botHeld = false; api("/api/pace", { paused: false }).catch(() => {}); }
}
function settings(from: Theme | null, to: Theme | null): Required<ThemeTransition> {
  const own = (to ?? from)?.transition ?? {}, kind = own.kind ?? (usesWave(from, to) ? "wave" : "fade");
  return { kind, duration: own.duration ?? (kind === "wave" ? 700 : 350), speed: own.speed ?? 25 };
}
function texFor(W: number, H: number): void {
  if (run.tex && run.tex.image.width === W && run.tex.image.height === H) return;
  run.tex?.dispose();
  run.bytes = new Uint8Array(W * H);
  run.tex = new THREE.DataTexture(run.bytes, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  run.tex.minFilter = run.tex.magFilter = THREE.NearestFilter; run.tex.unpackAlignment = 1;
  shared.uThemeP.value = run.tex;
}
// the wave starts here: your tile now
function restart(now: number): void {
  const p = game.S?.pos ?? [0, 0];
  run.origin = [p[0], p[1]]; run.t0 = run.last = now; run.built = 0; run.hurry = 1;
  const s = settings(onScreen.from, onScreen.to);
  run.wave = s.kind === "wave"; run.dur = Math.max(1, s.duration); run.speed = Math.max(0.1, s.speed);
}

/** Switch to `to` (null: Standard): animated when a world is on screen, at once otherwise. */
export function switchTheme(to: Theme | null): void {
  queueMicrotask(() => themeShown.fn());
  const now = performance.now(), S = game.S;
  if (!run.on && to === onScreen.to) return;
  if (!S || !world.map) {                                       // nothing drawn yet: just take it
    onScreen.from = onScreen.to = to; onScreen.p = null; onScreen.k = 1; showSheets(to, to); return;
  }
  if (run.on) {
    if (to === onScreen.to) return;
    if (to === onScreen.from) {                                 // back again: every tile turns round where it is
      [onScreen.from, onScreen.to] = [onScreen.to, onScreen.from];
      for (let i = 0; i < onScreen.p!.length; i++) onScreen.p![i] = 1 - onScreen.p![i];
      run.pBuilt = run.pBuilt?.map((v) => 1 - v) ?? null;
      if (run.pc) for (let i = 0; i < run.pc.length; i++) run.pc[i] = 1 - run.pc[i];
      run.ends = null;
      onScreen.k = 1 - onScreen.k; run.queued = undefined;
      restart(now); showSheets(onScreen.to, onScreen.from);
      if (remaps() || crownsMorphing()) fullBuild();
      return;
    }
    run.queued = to; run.hurry = 4; run.wave = false; return;   // a third: this one hurries to its end, then that one starts
  }
  const [H, W] = S.size;
  onScreen.from = onScreen.to; onScreen.to = to;
  onScreen.p = new Float32Array(H * W); onScreen.W = W; onScreen.H = H; onScreen.k = 0;
  run.pBuilt = new Float32Array(H * W); run.level = S.level; run.on = true; run.queued = undefined;
  texFor(W, H); restart(now);
  showSheets(onScreen.to, onScreen.from);
  shared.uThemeOn.value = 1;
  // the trees' crowns morph as the wave passes; and crowns a crown-only switch left (crownsLeft) stay as they stand, at their
  // switch's end (uCrownSwap on, their tiles' progress 1: paint()), until their chunk is built again (Pete: they flashed back)
  shared.uCrownSwap.value = onScreen.from?.crown || onScreen.to?.crown || crownsLeft.on ? 1 : 0;
  run.pc = charsChange(onScreen.from, onScreen.to) ? new Float32Array(H * W) : null;   // (characters last, Pete: their own wave)
  run.ends = null;
  holdWorld(true);
  const shapes = !!(onScreen.from?.shape || onScreen.to?.shape);
  if (remaps() || crownsMorphing() || crownsLeft.on || shapes) queueAll(true);       // (each face's tile under both themes: the blend needs them)
  crownsLeft.on = false;
  paint();
  game.hud?.setLines(hudInk.lines);                             // (the HUD's icons, drawn again from the new tiles)
}
function finish(): void {
  // the last heights exactly and the old theme's decorations let go: the whole world again; crowns only: nothing (crownsLeft)
  const shaped = !!(onScreen.from?.shape || onScreen.to?.shape || onScreen.from?.decorate || onScreen.to?.decorate), q = run.queued;
  const crowny = !!(onScreen.from?.crown || onScreen.to?.crown);
  run.on = false; run.queued = undefined;
  onScreen.from = onScreen.to; onScreen.p = null; onScreen.k = 1; shared.uThemeOn.value = 0;
  // crowns: left as they stand (crown-only: crownsLeft), or, the world built again a chunk at a time, morphing on (at 1: run.tex
  // stays all 1s) till the last chunk is (settled(): Pete, the trees flashed back to their old crowns a moment)
  crownsLeft.on = !shaped && crowny; shared.uCrownSwap.value = crowny ? 1 : 0;
  showSheets(onScreen.to, onScreen.to);
  game.hud?.setLines(hudInk.lines);
  if (shaped) { queueAll(false); paintSettling(); }             // (the last heights exactly, its decorations: Pete, the snow drifts once it's done)
  else { endShapes(); if (!queue.list.length) holdWorld(false); }
  swapModels();
  if (q !== undefined) switchTheme(q);
}
// a creature (or you) whose model differs between the two themes: while the wave is on its tile it morphs from the old model to the
// new one (creature-morph.ts), and it takes the real one its tile shows once through
function swapModels(): void {
  for (const e of mobs.values()) {
    if (!modelChanges(e.kind)) continue;
    const p = charP(e.model.position.z, e.model.position.x);
    if (p > 0 && p < 1) {
      const pair = `${onScreen.from?.id}>${onScreen.to?.id}`;           // (switched back mid-way: the other way round)
      if (e.model.userData.pair !== pair) {
        const who = e.model.userData.who ?? 0, g = morphModel(makeMob(e.kind, onScreen.from, who), makeMob(e.kind, onScreen.to, who)), old = e.model;
        g.userData.who = who; g.userData.kind = e.kind; g.userData.theme = "(morphing)"; g.userData.pair = pair;
        g.position.copy(old.position); g.rotation.copy(old.rotation); g.scale.copy(old.scale); g.visible = old.visible;
        scene.remove(old); scene.add(g); e.model = g;
      }
      e.model.userData.set(p);
      continue;
    }
    const want = p >= 1 ? onScreen.to : onScreen.from, id = want?.id ?? null;
    if (e.model.userData.theme === id) continue;
    const m = makeMob(e.kind, want, e.model.userData.who ?? 0), old = e.model;
    m.position.copy(old.position); m.rotation.copy(old.rotation); m.scale.copy(old.scale); m.visible = old.visible;
    scene.remove(old); scene.add(m); e.model = m;
  }
  const pl = game.player;
  if (pl && modelChanges("player")) playerFade(pl);
}
// you, crossfading (Pete): while the wave is on your tile, the other theme's you stands in your place, posed as you are, and the two
// dissolve into each other by the tile's progress (the shader's uXfade); through, the one it shows is you
const fade = { ghost: null as THREE.Group | null };
const xfade = (m: THREE.Object3D, k: number, side: number) => { for (const mat of m.userData.mats) mat.uniforms.uXfade?.value.set(k, side); };
const yourModel = (t: Theme | null) => { const m = makeMob("player", t); for (const mat of m.userData.mats) mat.uniforms.uBoost.value = 1; return m; };
function becomeYou(m: THREE.Group, old: THREE.Object3D): void {
  m.position.copy(old.position); m.rotation.copy(old.rotation); m.visible = old.visible;
  scene.remove(old); if (!m.parent) scene.add(m); game.player = m; game.hud.onTool?.(game.hud.tool);
}
function playerFade(pl: THREE.Object3D): void {
  const p = charP(pl.position.z, pl.position.x), toId = onScreen.to?.id ?? null, fromId = onScreen.from?.id ?? null;
  if (p > 0 && p < 1 && fromId !== toId) {
    const mine = pl.userData.theme ?? null, other = mine === toId ? onScreen.from : onScreen.to;
    let g = fade.ghost;
    if (g && (g.userData.theme ?? null) !== (other?.id ?? null)) { scene.remove(g); g = fade.ghost = null; }
    if (!g) { g = fade.ghost = yourModel(other); scene.add(g); }
    if (game.S) dressArmor(g, game.S.inventory.armour, game.S.armour_enchant);   // (wearing what you wear: Pete, the armour faded out and back)
    g.position.copy(pl.position); g.rotation.copy(pl.rotation); g.scale.copy(pl.scale); g.visible = pl.visible;
    const a = pl.userData.limbs as THREE.Object3D[], b = g.userData.limbs as THREE.Object3D[];      // (posed as you: walking, swinging)
    a.forEach((l, i) => { if (b[i]) { b[i].rotation.copy(l.rotation); b[i].position.copy(l.position); } });
    if (pl.userData.head && g.userData.head) g.userData.head.rotation.copy(pl.userData.head.rotation);
    xfade(pl, p, mine === toId ? 1 : -1); xfade(g, p, mine === toId ? -1 : 1);
    return;
  }
  const want = p >= 1 ? onScreen.to : onScreen.from, wantId = want?.id ?? null, g = fade.ghost;
  fade.ghost = null;
  if (g && (g.userData.theme ?? null) === wantId && (pl.userData.theme ?? null) !== wantId) { xfade(g, 0, 0); becomeYou(g, pl); return; }
  if (g) scene.remove(g);
  xfade(pl, 0, 0);
  if ((pl.userData.theme ?? null) !== wantId) becomeYou(yourModel(want), pl);
}

/** A theme at once, no transition (a replay jumping to a moment): the world built again in it (build false: a new world, about to
 *  be built anyway), the creatures in its models. */
export function setThemeNow(to: Theme | null, build = true): void {
  queueMicrotask(() => themeShown.fn());
  if (!run.on && to === onScreen.to) return;
  run.on = false; run.queued = undefined;
  onScreen.from = onScreen.to = to; onScreen.p = null; onScreen.k = 1;
  shared.uThemeOn.value = 0; shared.uCrownSwap.value = 0; crownsLeft.on = false; endShapes();
  showSheets(to, to);
  game.hud?.setLines(hudInk.lines);
  if (build) fullBuild();
  swapModels();
}

/** Each frame (core/frame.ts): the tiles' progress, the blend, the chunks the wave is passing through, the creatures. */
export function themeTick(now: number): void {
  if (queue.list.length) {                                      // (the next chunk: one a frame; a floor changed: the rest needn't)
    if (!game.S || game.S.level !== queue.level) { queue.list = []; queue.ready = null; world.regrow = false; settled(); if (!run.on) holdWorld(false); }
    else { buildNext(); if (!run.on) paintSettling(); }
  }
  if (!run.on) return;
  const S = game.S, p = onScreen.p!;
  if (!S || S.level !== run.level || S.size[0] * S.size[1] !== p.length) { p.fill(1); run.pc?.fill(1); finish(); return; }
  const dt = Math.min(0.1, (now - run.last) / 1000) * run.hurry, reach = run.wave ? run.speed * (now - run.t0) / 1000 : Infinity;
  // the characters' wave (Pete: last): behind the world's by CHAR_GAP, and a tile's only once the world's has finished there
  const reachC = run.wave ? run.speed * (now - run.t0 - CHAR_GAP) / 1000 : now - run.t0 >= CHAR_GAP ? Infinity : -1;
  run.last = now;
  const { W, H } = onScreen, [or, oc] = run.origin, step = dt * 1000 / run.dur, pc = run.pc;
  let sum = 0, done = true;
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    const i = r * W + c, d = Math.hypot(r - or, c - oc), ready = readyAt(r, c);
    if (p[i] < 1 && ready && d <= reach) p[i] = Math.min(1, p[i] + step);
    if (pc && pc[i] < 1 && p[i] >= 1 && d <= reachC) pc[i] = Math.min(1, pc[i] + step);
    if (p[i] < 1 || (pc && pc[i] < 1)) done = false;
    sum += p[i];
  }
  paint();
  onScreen.k = sum / p.length;
  if (done) { finish(); return; }
  swapModels();
}
export const themeMoving = (): boolean => run.on || queue.list.length > 0;
