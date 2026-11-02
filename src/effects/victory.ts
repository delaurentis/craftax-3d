// The victory: the Necromancer's death (unmaking), VICTORY, and the portal that opens.
import "./shots";
import * as THREE from "three";
import { B } from "../../js/world";
import { makeMob } from "../../js/models";
import { shared, makeMaterial } from "../../js/shading";
import { local, REPLAY } from "../../js/local";
import { pixelText } from "../../js/pixeltitle";
import { net } from "../../js/net";
import { $, sound } from "../core/shared";
import { scene } from "../render/scene";
import { bones, bursts, world } from "../render/arm";
import { api, flat, game } from "../core/game";
import { apply } from "../core/apply";
import { DIVE_MS, TUNNEL_MS, endTunnel, enterPortal2D, startTunnel, tunnelState } from "./tunnel";
import { FADE_MS, inkLook, lookState, pickedLook } from "../looks/looks";
import { SIM_LOOK } from "../looks/registry";
import { simCaption } from "../looks/phosphor/caption";
import { leaveSkin, setLook } from "../views/views";
import { flash } from "../ui/hud/hint";
import { play, unlockPointer } from "../ui/screens/screen";
import { clearEntities } from "../ui/hud/buttons";
import { hitState } from "./hits";
import type { GameState, Pos } from "../core/types";

/** One of VICTORY's sparks on its canvas (tunnel.ts victoryFx): where, its speed, life left (1 → 0), its hue. */
export interface Spark { x: number; y: number; vx: number; vy: number; life: number; hue: number }
// this module's state that other modules set (one module can't assign another's let): victorySeed, bossAt, bossYaw, portalNear, portal,
// portalAt, sparks, entering
export interface Victory {
  /** The seed of the game won (null: none). */
  victorySeed: number | null;
  /** Where he stood and which way he faced (openPortal aims past it). */
  bossAt: Pos | null;
  bossYaw: number;
  /** The nearest you've been to the portal since it opened (tiles). */
  portalNear: number;
  portal: THREE.Group | null;
  /** The portal's tile: step onto it to go through. */
  portalAt: Pos | null;
  /** VICTORY's sparks: since when, and the ones alive. */
  sparks: { t0: number; list: Spark[] } | null;
  /** Going through the portal now. */
  entering: boolean;
}
export const victory = {} as Victory;
/** His unmaking: the body, the skeleton fading in, when it began, the sparkles and their paths. */
interface Unmake {
  n: THREE.Object3D; sk: THREE.Object3D; t0: number;
  pts: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  parts: { a: number; r: number; y: number; v: number; w: number; born: number }[];
}
/** A material of a creature model (js/models): shading.js's, with its uniforms. */
type MobMat = THREE.ShaderMaterial;

// victory (Pete: a big payoff at the end): the Necromancer falls and crumbles to dust as the screen quakes and his last roar echoes;
// VICTORY in the big pixel font with sparks and a fanfare, fading away (sooner once you move); then a portal opens
// across the arena against the far wall, an archway of near-black stone full of rippling blue-green light that lights the arena: walk
// in (local play goes on past the win, local.ts: walk to it and step onto its tile; a game that ended there, a move key, Space, Enter or
// a click) into a new Overworld, a new game. He dies standing: his flesh burns away to a skeleton in a swirl of purple sparkles
// (UNMAKE_MS, slow enough to watch), and the skeleton falls into a heap of faintly glowing bones that crumble as any skeleton's do
victory.victorySeed = null; victory.portal = null; export let portalT = 0; victory.sparks = null; export let victoryT = 0, unmake: Unmake | null = null;
export const UNMAKE_MS = 2200, QUAKE_MS = UNMAKE_MS + 1500;                       // the world shakes until he lies in a heap; then VICTORY
export let necroQuakeT = 0;
victory.portalAt = null; victory.entering = false; export let portalDive: { t0: number; from: { p: THREE.Vector3; q: THREE.Quaternion } | null } | null = null;                                     // the portal's tile: step onto it to go through
export const PORTAL_CUT = 3;
victory.portalNear = Infinity;                                                // the nearest you've been to it since it opened (tiles)
export const portalDist = (s: GameState) => Math.min(...portalTiles.map(([r, c]) => Math.max(Math.abs(s.pos[0] - r), Math.abs(s.pos[1] - c))));
export let portalTiles: Pos[] = [];                       // all of its opening (Pete: you could walk through it unseen): its tile and the one either side
victory.bossAt = null; victory.bossYaw = 0;                                                          // [row, col] where he stood (openPortal aims past it)
export function startVictory(s: GameState) {
  victory.victorySeed = s.seed; victoryT = performance.now();
  if (s.done) unlockPointer();                                               // (playing on: you walk to the portal)
  hitState.bossHitT = performance.now();
  // the body is him as he was, dark robes, hat and staff (Pete: the pale look he dies in read as a zombie lying there), where he
  // stood (mid-arena if his model is already gone)
  const was = world.props.children.find((m) => /^necromancer/.test(m.userData.kind || ""));
  if (was) world.props.remove(was);
  let n: THREE.Object3D | null = null;
  if (was || s.level === 8) {
    n = makeMob("necromancer");
    if (was) { n.position.copy(was.userData.home || was.position).setY(0); n.rotation.y = was.rotation.y; }
    else n.position.set((s.size[1] >> 1) + 0.5, 0, (s.size[0] >> 1) + 0.5);
  }
  victory.bossAt = n ? [Math.floor(n.position.z), Math.floor(n.position.x)] : null; victory.bossYaw = n ? n.rotation.y : 0;
  if (n) { scene.add(n); startUnmake(n); }
  sound.necroRoar?.(n ? n.position.x : s.pos[1] + 0.5, n ? n.position.z : s.pos[0] + 0.5);
  necroQuakeT = performance.now();                                           // (Pete) the world shakes the whole time he turns to bones
  const seed = s.seed;
  setTimeout(() => { if (victory.victorySeed === seed) showVictory(s); }, QUAKE_MS); // and only when it stops: VICTORY
}
export function showVictory(s: GameState) {
  sound.levelUp?.(); setTimeout(() => sound.chime(), 450); setTimeout(() => sound.chime(), 800);
  pixelText($("victory-title") as HTMLCanvasElement, "VICTORY!");
  // where the boss bar was (Pete): the score above VICTORY (it stays), "The Necromancer is dead" under it (they fade)
  const line = (t: string) => { const cv = document.createElement("canvas"); Object.assign(cv.dataset, { pixelFlat: "", pixelSize: 2, pixelMax: Math.min(600, innerWidth - 24) }); pixelText(cv, t); return cv; };
  $("victory-score")!.replaceChildren(line(`Score ${Math.round(s.score)} · ${s.achievements.length} achievements · ${s.timestep.toLocaleString("en-US")} steps`));
  $("victory-sub")!.replaceChildren(line("The Necromancer is dead"));
  $("victory")!.classList.remove("fade"); $("victory")!.classList.add("on");
  clearTimeout(victoryFade); victoryFade = setTimeout(() => $("victory")!.classList.add("fade"), 2800);   // (Pete: it hung on too long)
  victory.sparks = { t0: performance.now(), list: [] };
  setTimeout(() => { if (victory.victorySeed === s.seed) openPortal(s); }, 1400);
}
export let victoryFade: ReturnType<typeof setTimeout> | 0 = 0;
// his death (Pete): standing where he was, the necromancer fades out as a skeleton his size fades in, both lit violet from within,
// purple sparkles swirling up round him; then the skeleton drops into a heap (fell.ts Bones), its bones glowing faintly purple,
// and crumbles into purple dust, more of it than a skeleton's
export const setAlpha = (model: THREE.Object3D, a: number) => {
  if (lookState.lines) {                                                               // the line looks: no blending (it would corrupt the ids), a cut
    model.visible = a >= 0.5;
    for (const m of (model.userData.mats || []) as MobMat[]) if (m.transparent) { m.transparent = false; m.depthWrite = true; m.needsUpdate = true; }
    return;
  }
  model.visible = true;
  for (const m of (model.userData.mats || []) as MobMat[]) {
    if (!m.uniforms?.uAlpha) continue;
    const t = a < 0.999;
    if (m.transparent !== t) { m.transparent = t; m.depthWrite = !t; m.needsUpdate = true; }
    m.uniforms.uAlpha.value = a;
  }
};
export function startUnmake(n: THREE.Object3D) {
  const now = performance.now();
  if (n.userData.eyeAt) n.userData.eyeAt.visible = false;                   // (his eyes go out)
  const sk = makeMob("necromancer_bones");                                   // he keeps his robe and hat (Pete)
  sk.position.copy(n.position); sk.rotation.y = n.rotation.y;
  for (const m of (sk.userData.mats || []) as MobMat[]) { const c = m.uniforms.uColor?.value; if (c && c.r + c.g + c.b > 1.5) c.lerp(new THREE.Color(0xc8a0ff), 0.4); }   // the bones lavender, not the robe
  setAlpha(sk, 0); scene.add(sk);
  // sparkles: violet points spiralling up through his body
  const N = 220, pos = new Float32Array(N * 3), parts: Unmake["parts"] = [];
  for (let i = 0; i < N; i++) parts.push({ a: Math.random() * Math.PI * 2, r: 0.25 + Math.random() * 0.55, y: Math.random() * 2.4, v: 0.4 + Math.random() * 0.9, w: 1.5 + Math.random() * 2.5, born: Math.random() * UNMAKE_MS * 0.8 });
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.09, color: 0xc070ff, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pts.frustumCulled = false; scene.add(pts);
  unmake = { n, sk, t0: now, pts, parts };
}
export function unmakeFx(now: number) {
  if (!unmake) return;
  const { n, sk, t0, pts, parts } = unmake, el = now - t0, u = Math.min(1, el / UNMAKE_MS);
  const k = THREE.MathUtils.smoothstep(u, 0.15, 0.85);
  if (n.parent) {
    setAlpha(n, 1 - k); setAlpha(sk, k);
    for (const m of (n.userData.mats || []) as MobMat[]) m.uniforms.uEmissive.value = 0.3 + 1.4 * Math.sin(u * Math.PI);   // burning away, violet
    for (const m of (sk.userData.mats || []) as MobMat[]) m.uniforms.uEmissive.value = 0.45 + 0.8 * (1 - u);              // then a faint glow stays
    n.position.y = 0.04 * Math.sin(now / 30) * (1 - u);                                                      // trembling
  }
  const P = pts.geometry.attributes.position;
  parts.forEach((p, i) => {
    const t = (el - p.born) / 1000;
    if (t < 0) { P.setXYZ(i, 0, -100, 0); return; }
    const a = p.a + t * p.w, r = p.r * (1 + 0.4 * t);
    P.setXYZ(i, sk.position.x + Math.cos(a) * r, p.y * 0.4 + t * p.v + 0.1, sk.position.z + Math.sin(a) * r);
  });
  P.needsUpdate = true;
  pts.material.opacity = el < UNMAKE_MS ? 1 : Math.max(0, 1 - (el - UNMAKE_MS) / 1500);
  pts.material.color.setHex(inkLook().spark?.hex ?? 0xc070ff);              // his death's sparkles in the look's ink too
  if (u >= 1 && n.parent) {                                                  // the flesh is gone: the skeleton falls into a heap
    scene.remove(n); setAlpha(sk, 1);
    for (const m of (sk.userData.mats || []) as MobMat[]) m.uniforms.uEmissive.value = 0.45;
    bones.start(sk, game.S ? game.S.pos[1] + 0.5 : sk.position.x, game.S ? game.S.pos[0] + 0.5 : sk.position.z, now, { colors: [0xc890ff, 0x6a20c0], more: 3 });
    sound.kill?.(sk.position.x, sk.position.z, "skeleton");
  }
  if (el > UNMAKE_MS + 1500) { scene.remove(pts); pts.geometry.dispose(); pts.material.dispose(); unmake = null; }
}
export function endUnmake() {
  if (!unmake) return;
  scene.remove(unmake.n); scene.remove(unmake.sk); scene.remove(unmake.pts); unmake = null;
}
export function victoryNudge() {                                                    // you're on the move: the words go sooner
  if (!$("victory")!.classList.contains("on") || $("victory")!.classList.contains("fade") || performance.now() - victoryT < 1200) return;
  clearTimeout(victoryFade); victoryFade = setTimeout(() => $("victory")!.classList.add("fade"), 500);
}
export function pixTex(w: number, h: number, paint: (g: CanvasRenderingContext2D, w: number, h: number) => void) { const cv = document.createElement("canvas"); cv.width = w; cv.height = h; paint(cv.getContext("2d")!, w, h); const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; return t; }
// the way in (Pete: a tombstone stood in front of the portal and you couldn't get in): the tombstones in front of it, its width
// across and two tiles out, crumble to dust as it opens and are gone, the Graveyard's floor in their place. In the game, really gone
// (the engine's map, js/local.ts "portal-way"); in a replay, gone from the drawing only (world.cleared): a recording ends before you
// come this near the portal (portalCut), so the two never differ where it matters
const GRAVE_IDS = new Set([B.GRAVE, B.GRAVE2, B.GRAVE3]);
function clearWay(s: GameState, cells: Pos[]) {
  if (!cells.length) return;
  const now = performance.now();
  for (const [r, c] of cells) bursts.rock("smooth_stone", r, c, 0.9, now);
  if (REPLAY) {
    world.cleared ??= new Set();
    for (const [r, c] of cells) world.cleared.add(r * s.size[1] + c);
    if (world.lastS && world.lastProp) world.build(world.lastProp, world.lastS);
  } else if (net.local) api("/api/portal-way", { cells }).then(apply).catch(() => {});
}
export function openPortal(s: GameState) {
  if (victory.portal) scene.remove(victory.portal);
  // always the same place (Pete): behind the Necromancer, the way his back faced, toward the far wall but standing out from it; its
  // face toward where he stood. (A model at rotation.y = 0 faces +z, south: behind him is then north)
  const nb = victory.bossAt || [s.size[0] >> 1, s.size[1] >> 1], nr = nb[0] + 0.5, nc = nb[1] + 0.5;   // (a reload: he stood mid-arena)
  const dx = -Math.sin(victory.bossYaw), dz = -Math.cos(victory.bossYaw);
  const at = (r: number, c: number) => r < 0 || c < 0 || r >= s.size[0] || c >= s.size[1] ? B.OOB : s.map[r * s.size[1] + c];
  const wall = (b: number) => b === B.WALL || b === B.WALL_MOSS || b === B.DARKNESS || b === B.OOB;
  const tile = (i: number, side = 0): Pos => [Math.floor(nr + dz * i - dx * side), Math.floor(nc + dx * i + dz * side)];   // i along the line, side across it
  let k = 0;                                                                 // march to the first wall
  for (let i = 1; i < 40; i++) { if (wall(at(...tile(i)))) break; k = i; }
  // then stand it out from the wall (Pete: not half in it; room to walk round behind): the farthest floor tile at least 3 short of
  // the wall whose arch, two tiles either side, is clear of the wall, with floor behind it
  let pick = 0;
  for (let i = k - 3; i >= 1; i--) {
    const clear = [-2, -1, 1, 2].every((sd) => !wall(at(...tile(i, sd)))) && [1, 2].every((j) => !wall(at(...tile(i + j))));
    if (at(...tile(i)) === B.PATH && clear) { pick = i; break; }
  }
  const pi = pick || Math.max(0, k - 3);
  const portalAt = victory.portalAt = tile(pi);
  portalTiles = [-1, 0, 1].map((sd) => tile(pi, sd));                       // (the opening is 2 wide, the pillars half on the tiles beside it)
  clearWay(s, [1, 2].flatMap((i) => [-1, 0, 1].map((sd) => tile(pi - i, sd))).filter(([r, c]) => GRAVE_IDS.has(at(r, c))));   // (3 across, 2 out)
  victory.portalNear = portalDist(s);
  const x = portalAt[1] + 0.5, z = portalAt[0] + 0.5;                        // on that tile: step onto it and you're through
  const portal = victory.portal = new THREE.Group();
  portal.position.set(x, 0, z); portal.rotation.y = Math.atan2(-dx, -dz);    // its face toward where he stood
  // ancient black bricks (Pete): four courses of offset bricks, each its own near-black (some a little brown, some a little blue),
  // worn, chipped and cracked, in dark mortar, with a purple gem set here and there that glows (bright: the bloom takes it). Each
  // block of the arch gets its own pattern
  const brick = () => pixTex(16, 16, (g) => {
    for (let row = 0; row < 4; row++) {
      const off = row % 2 ? 4 : 0;
      for (let bx = -1; bx < 3; bx++) {
        const v = 34 + Math.random() * 28, tr = Math.random() * 6 - 2, tb = Math.random() * 8 - 2;   // (the Graveyard's walls: the same, textures.ts gwall)
        for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
          const px = bx * 8 + off + i, py = row * 4 + j;
          if (px < 0 || px > 15) continue;
          const mortar = i === 7 || j === 3, wear = Math.random() * 8 - 4, chip = Math.random() < 0.06 ? -10 : 0;
          const k = mortar ? 12 + Math.random() * 6 : v + wear + chip;
          g.fillStyle = `rgb(${Math.max(0, k + tr) | 0},${Math.max(0, k) | 0},${Math.max(0, k + tb) | 0})`; g.fillRect(px, py, 1, 1);
        }
      }
    }
    for (let c = Math.random() < 0.5 ? 1 : 0; c > 0; c--) {                   // a crack
      let cx2 = (Math.random() * 16) | 0, cy2 = 0;
      g.fillStyle = "rgb(1,1,2)";
      while (cy2 < 16) { g.fillRect(cx2, cy2, 1, 1); cy2++; cx2 = Math.max(0, Math.min(15, cx2 + ((Math.random() * 3) | 0) - 1)); if (Math.random() < 0.15) break; }
    }
    gemsAt = [];
    for (let n2 = Math.random() < 0.6 ? 1 + ((Math.random() * 2) | 0) : 0; n2 > 0; n2--) {   // green gem flecks (their glow: gemTex)
      const gx = 1 + ((Math.random() * 13) | 0), gy = 1 + ((Math.random() * 13) | 0);
      gemsAt.push([gx, gy]);
      g.fillStyle = "rgb(15,60,25)"; g.fillRect(gx - 1, gy, 3, 1); g.fillRect(gx, gy - 1, 1, 3);
    }
  });
  // the same block's gems alone on black, drawn additive over it: they glow by themselves in the dark, the stone doesn't
  let gemsAt: [number, number][] = [];
  const gems: THREE.Mesh[] = [];
  const gemTex = () => pixTex(16, 16, (g) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, 16, 16);
    for (const [gx, gy] of gemsAt) { g.fillStyle = "rgb(30,210,80)"; g.fillRect(gx - 1, gy, 3, 1); g.fillRect(gx, gy - 1, 1, 3); g.fillStyle = "rgb(200,255,210)"; g.fillRect(gx, gy, 1, 1); }   // (Pete: green, not purple)
  });
  const box = new THREE.BoxGeometry(1, 1, 1);
  // the stones don't glow (Pete): they're lit, like the rest of the world, and the portal's green light (shading.ts uPortalL) spills
  // onto them, brightest on the faces turned to its opening. Only the gems shine by themselves
  for (let cx = -1.5; cx <= 1.5; cx++) for (let cy = 0.5; cy <= 4.5; cy++)   // the archway: four wide, five tall, open to the ground (Pete: no sill to step over)
    if (Math.abs(cx) === 1.5 || cy === 4.5) {
      const bm = makeMaterial("mob", { color: 0xffffff, map: brick() }); bm.defines.STILL = "";   // (phosphor: plain green stone, not a creature's glow)
      const b = new THREE.Mesh(box, bm); b.position.set(cx, cy, 0); portal.add(b);
      if (gemsAt.length) { const gm = new THREE.Mesh(box, new THREE.MeshBasicMaterial({ map: gemTex(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false })); gm.position.copy(b.position); gm.scale.setScalar(1.002); portal.add(gm); gems.push(gm); }
    }
  const cv = document.createElement("canvas"); cv.width = 96; cv.height = 192;   // (green phosphor code falls through it: victoryFx)
  const sheet = new THREE.CanvasTexture(cv); sheet.magFilter = sheet.minFilter = THREE.NearestFilter;
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(2, 4), new THREE.MeshBasicMaterial({ map: sheet, color: new THREE.Color(1.3, 4.5, 1.7), toneMapped: false, transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false }));   // (past white: the bloom makes the characters glow)
  veil.position.set(0, 2, 0); veil.userData.cv = cv; veil.userData.tex = sheet;
  // the haze: a sheet parallel to the arch, never turned to the camera (a camera-facing sprite cut through the pillars at an angle
  // and lit triangles on them: Pete)
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, map: pixTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 2, 32, 32, 32); r.addColorStop(0, "rgba(150,255,170,0.9)"); r.addColorStop(0.45, "rgba(40,230,90,0.4)"); r.addColorStop(1, "rgba(20,160,60,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  // the haze round it: behind the arch as you see it (victoryFx keeps it on the far side), so the stones stand dark against it and
  // their own skins carry the light on them
  glow.position.set(0, 2.4, -1.2); glow.scale.set(7.5, 8, 1);
  // its light on the ground in front: a pool of teal and green spilling toward you
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), new THREE.MeshBasicMaterial({ map: pixTex(64, 64, (g) => { const r = g.createRadialGradient(32, 20, 2, 32, 26, 32); r.addColorStop(0, "rgba(110,255,140,0.55)"); r.addColorStop(0.5, "rgba(40,200,80,0.22)"); r.addColorStop(1, "rgba(20,120,40,0)"); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.set(0, 0.03, 2.6);
  portal.add(veil, glow, pool); portal.userData.veil = veil; portal.userData.glow = glow; portal.userData.pool = pool;
  portal.userData.gems = gems; veil.userData.mat = veil.material;
  portal.scale.setScalar(0.01);
  scene.add(portal);
  portalT = performance.now();
  world.greenTorches(portalT + 900);                                         // once it has risen, the room's torches turn green (Pete)
  sound.whoosh?.("magic", x, z);
}
export async function enterPortal(step = false) {                                 // step: you walked onto it (else the bot's, a click)
  if (!victory.portal || victory.entering || REPLAY) return;                               // (a replay never goes through: the recording ends first)
  victory.entering = true;
  local.portalCut?.(step);                                                 // no spoilers: a recording ends before the portal (local.ts)
  // (Pete) all of it in the real simulation's look (SIM_LOOK, phosphor): as you walk on into the portal's face the world turns to it,
  // then you fall down a tunnel that is real geometry (startTunnel) drawn by that same look; out of it into the new Overworld, still
  // in it, which a moment later fades back into the look you had
  const was = flat.picture ? "original" : pickedLook().id;
  const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
  sound.whoosh?.("magic");
  if (was === "original" && net.local) { sound.portalRide?.(0.25, TUNNEL_MS / 1000); return enterPortal2D(wait); }   // Craftax's own 2D look: its own pixel tunnel (Pete)
  sound.portalRide?.(DIVE_MS / 1000, TUNNEL_MS / 1000);                     // digitized and sent (Pete)
  if (was !== SIM_LOOK) setLook(SIM_LOOK, true);
  portalDive = { t0: performance.now(), from: null };                      // the camera walks on into the portal's face
  await wait(DIVE_MS);
  portalDive = null;
  const t0 = performance.now();
  startTunnel();
  setTimeout(() => simCaption(["The simulation", "contains", "infinite worlds."], TUNNEL_MS - 400), 200);
  try { apply(await api("/api/reset", { seed: (Math.random() * 2 ** 31) | 0 })); } catch (e) { flash((e as Error).message); }
  clearEntities(); scene.remove(victory.portal!); victory.portal = null; victory.portalAt = null; victory.victorySeed = null; victory.sparks = null; shared.uPortalL.value.w = 0;
  endUnmake(); world.resetGreen();
  $("victory")!.classList.remove("on", "going", "fade");
  await wait(Math.max(0, TUNNEL_MS - (performance.now() - t0)));
  endTunnel();
  tunnelState.spawnDrop = { t0: performance.now() };                                    // out of the tunnel: dropped from the sky onto your spawn (Pete)
  victory.entering = false;
  play();
  simCaption("A new world...", 4400 + FADE_MS + 1200, "12%");   // (up in the sky: Pete)
  // in it 2 s longer than it was (Pete): the drop's 1.5 s, about 3 s on the ground, then back to colour
  if (was !== SIM_LOOK) setTimeout(() => { if (lookState.skin) leaveSkin(was); $("pcap")?.classList.add("white"); }, 4400);   // the line turns white with the world
}
