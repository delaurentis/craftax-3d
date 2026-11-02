// Reach, the target box and glow on what you aim at, and each frame's aim (updateAim).
import { dirTo, lookDir } from "../input/targets";
import * as THREE from "three";
import { CEIL, B, isSolid } from "../../js/world";
import { shared } from "../../js/shading";
import { REPLAY } from "../../js/local";
import { player as replayer } from "../../js/record";
import { $, DIRV } from "../core/shared";
import { canvas, renderer, scene } from "./scene";
import { outlinePass } from "../looks/shared/outline-pass";
import { armState, world } from "./arm";
import { flat, game, mobs } from "../core/game";
import { IDLE_AIM_MS, aim, aimState } from "../input/aim";
import { inkLook, lookState } from "../looks/looks";
import { USE } from "../input/pathing";
import { TREE_B, isTouch } from "../input/intent";
import { locked, playing } from "../ui/screens/screen";
import { opt, options, showCross } from "../ui/screens/options";
import { hitState } from "../effects/hits";
import type { AimHit } from "../world/shapes";
import type { Entity } from "../core/game";

/** The target box's outline: a mesh of 12 edge quads (makeLines). */
export type Lines = THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;

// this module's state that other modules set (one module can't assign another's let): reachBlocks
export interface Targeting {
  /** Target reach in first person, blocks (Settings → Gameplay); REACH_ANY: any distance. */
  reachBlocks: number;
}
export const targeting = {} as Targeting;

// Target reach (Settings → Gameplay → 1st person, Pete; was "1st person reach"): in first person, how many blocks off a clicked target (or the crosshair's, for
// Space) may be and still be walked to, a diagonal neighbour 1 like the tiles in front and beside; past it a click only swings.
// 1 to 10, or any distance (the slider's end); 2 for a new player; remembered. Third person, 2D and 3/4: any distance, as before
export const REACH_ANY = 11;
targeting.reachBlocks = (() => { try { const v = +localStorage.getItem("craftax3d.reach")!; return v >= 1 && v <= REACH_ANY ? v : 2; } catch { return 2; } })();
export const beyondReach = (r: number, c: number): boolean => !game.third && !flat.on && flat.t === 0 && targeting.reachBlocks < REACH_ANY && Math.max(Math.abs(r - game.S!.pos[0]), Math.abs(c - game.S!.pos[1])) > targeting.reachBlocks;
// Target highlight (Settings → Gameplay → 1st person and Bird's-eye, Pete; Off for a new player, remembered): in first person and bird's-eye 3/4, what you'd
// act on: what the click (or the crosshair) is on if it's within 1st person reach (next to you only, with Move to target on click off),
// else what stands in the tile in front, which Space hits. "box": a white outline round it; "glow" (the usual): it just gets brighter (a
// block: a faint shell of light). (An old saved "1" was the box; the yellow glow, and an old "red", are gone: they glow.)
// Each view its own (Pete: in the 1st person and Bird's-eye tabs): boxModes[0] first person, [2] bird's-eye; boxMode is the one in use
// this frame (targetBox). (Before, one style for both, with a switch per view: each view starts from that.)
export const boxModes: Record<number, string> = (() => {
  // "off" is Spotlight (Pete): just the hover's lit square, no box. A new player: a box in first person, Spotlight in bird's-eye;
  // Glow and the yellow glow are gone (a saved one takes its view's default)
  const DEF: Record<number, string> = { 0: "rboxfill", 2: "off" };                                  // (1st person: the red filled box for a new player, Pete)
  const ok = (v: string | null, view: number) => (v === "1" ? "box" : v === "gbox" ? "gboxfill" : ["box", "boxfill", "gboxfill", "rboxfill", "off"].includes(v!) ? v! : DEF[view]);   // (the plain green box is gone, Pete)
  try {
    const base = localStorage.getItem("craftax3d.targetbox"), was = localStorage.getItem("craftax3d.targetviews"), b2 = localStorage.getItem("craftax3d.targetbox2");
    const inV = (v: string) => was == null || was.split(",").includes(v);
    const out = { 0: inV("0") ? ok(base, 0) : "off", 2: b2 != null ? ok(b2, 2) : inV("2") ? ok(base, 2) : "off" };
    // (an old "which views" list overrode the 1st person choice on every load, Pete: it cleared his green box; now read once, then gone)
    if (was != null) { localStorage.setItem("craftax3d.targetbox", out[0]); localStorage.setItem("craftax3d.targetbox2", out[2]); localStorage.removeItem("craftax3d.targetviews"); }
    return out;
  } catch { return { ...DEF }; }
})();
export let boxMode = "off";
export const glowShell = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false }));
glowShell.visible = false; glowShell.renderOrder = 5; scene.add(glowShell);
export let glowMats: [THREE.ShaderMaterial, number][] = [], aimedMats: THREE.ShaderMaterial[] = [];                                                          // the lit mob's materials and their own emissive, put back next frame
// its 12 edges as smooth lines (Pete: anti-aliased; the scene itself has none, for the blocks' crisp pixels): each edge a quad made
// wide on screen in the vertex shader, its alpha falling off over the last pixel either side; an end behind the eye is pulled up to
// just in front of it first, so a box you stand against still draws
export const makeLines = (): Lines => {
  const E = [[0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1], [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0],
    [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1], [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]];
  const a: number[] = [], b: number[] = [], side: number[] = [], end: number[] = [], idx: number[] = [];
  E.forEach((e, i) => {
    for (const [t, sd] of [[0, -1], [0, 1], [1, -1], [1, 1]]) { a.push(e[0] - 0.5, e[1] - 0.5, e[2] - 0.5); b.push(e[3] - 0.5, e[4] - 0.5, e[5] - 0.5); side.push(sd); end.push(t); }
    const o = i * 4; idx.push(o, o + 1, o + 2, o + 2, o + 1, o + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(a, 3)); g.setAttribute("other", new THREE.Float32BufferAttribute(b, 3));
  g.setAttribute("side", new THREE.Float32BufferAttribute(side, 1)); g.setAttribute("endT", new THREE.Float32BufferAttribute(end, 1));
  g.setIndex(idx);
  const m = new THREE.ShaderMaterial({
    uniforms: { uRes: { value: new THREE.Vector2(1, 1) }, uW: { value: 2 }, uCol: { value: new THREE.Color(0xffffff) }, uA: { value: 0.85 } },   // uA: not quite opaque (Pete: 80-90 %)
    vertexShader: `attribute vec3 other; attribute float side, endT; uniform vec2 uRes; uniform float uW; varying float vD;
      void main() {
        vec4 p = modelViewMatrix * vec4(position, 1.0), q = modelViewMatrix * vec4(other, 1.0);
        float n = -0.06;                                               // in front of the near plane (0.05)
        if (p.z > n) p = mix(p, q, (p.z - n) / (p.z - q.z));
        if (q.z > n) q = mix(q, p, (q.z - n) / (q.z - p.z));
        p.xyz *= 0.994; q.xyz *= 0.994;                                // drawn a hair toward the eye: it wins over the faces it sits on
        vec4 cp = projectionMatrix * p, cq = projectionMatrix * q, c = endT < 0.5 ? cp : cq;
        vec2 sp = cp.xy / cp.w * uRes * 0.5, sq = cq.xy / cq.w * uRes * 0.5, d = normalize(sq - sp + 1e-6), nrm = vec2(-d.y, d.x);
        float h = uW * 0.5 + 1.0;                                     // half the width, and a pixel to fade over
        c.xy += nrm * side * h / (uRes * 0.5) * c.w;
        vD = side * h; gl_Position = c;
      }`,
    fragmentShader: `uniform float uW, uA; uniform vec3 uCol; varying float vD;
      void main() { float a = 1.0 - smoothstep(uW * 0.5 - 0.5, uW * 0.5 + 0.5, abs(vD)); if (a <= 0.0) discard; gl_FragColor = vec4(uCol, a * uA); }`,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,            // (a quad's winding flips with the edge's direction on screen)
  });
  const l = new THREE.Mesh(g, m); l.frustumCulled = false; l.visible = false; l.renderOrder = 5; scene.add(l);
  return l;
};
// the target's, and a floor tile's: the square of ground under the mouse that the spotlight lights, outlined flat on it (Pete)
export const boxLines = makeLines(), floorLines = makeLines();
export const GREEN_BOX = () => inkLook().aim?.green ?? 0x60ff80;
// the red tint is laid over what it covers, so in the dark it would stand out far more than by day (Pete: less red at night): it fades
// with the light there, the daylight above ground, a tile's own light below, down to 30 % of its day strength in the dark
export const redLight = (r: number, c: number): number => { const l = game.S && game.S.level > 0 ? world.lightAt(r, c) : game.S?.daylight ?? 1; return 0.3 + 0.7 * Math.max(0, Math.min(1, l)); };
// the coloured box's colour: green, or red (Pete); a look may have its own (laser, a red world: a pale pink, so it still stands out)
export const BOX_COL = () => (boxMode[0] === "r" ? inkLook().aim?.red ?? 0xff4a3a : GREEN_BOX());                 // the green target box; in phosphor greenish white, so it stands out from the green (Pete)
// a filled box style on open ground (Pete: it read as just an outline): the tile glows inside its outline, white or green, pulsing
export const floorFill = new THREE.Mesh(new THREE.PlaneGeometry(0.96, 0.96), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.2, depthWrite: false, blending: THREE.AdditiveBlending }));
floorFill.rotation.x = -Math.PI / 2; floorFill.renderOrder = 5; floorFill.visible = false; scene.add(floorFill);
export function placeLines(l: Lines, x0: number, yb: number, z0: number, x1: number, yt: number, z1: number, col: number): void {
  l.scale.set(x1 - x0, Math.max(1e-4, yt - yb), z1 - z0); l.position.set((x0 + x1) / 2, (yb + yt) / 2, (z0 + z1) / 2);
  const u = l.material.uniforms, pr = renderer.getPixelRatio();
  const every = inkLook().aim?.every;
  if (every !== undefined && /box/.test(boxMode)) col = every;                      // phosphor: every box style (white, green, red) the same greenish white (Pete)
  u.uCol.value.set(col); u.uRes.value.set(innerWidth * pr, innerHeight * pr); u.uW.value = 2 * pr;   // 2 CSS px wide
  u.uA.value = boxMode === "boxfill" ? 0.68 : 0.85;                        // (the white filled box: its lines at 80 % of before, Pete)
  l.visible = true;
}
export const mobBox = new THREE.Box3(), TINT_YELLOW = new THREE.Color(0xffd24a);
// a block drawn as a stack of cubes (Craftax's one block, drawn tall on a hill): which cube the aim is on, 0 at the bottom; -1 if one
export const cubeOf = (hit: AimHit, h: number): number => (h > 1 && hit.y != null && !hit.floor && !hit.mob ? Math.max(0, Math.min(h - 1, Math.floor(hit.y! - 1e-3))) : -1);
// a tile diagonally next to you (corner to corner): first person reaches it with a step to the side (Pete)
export const diagTo = (r: number, c: number): boolean => !!game.S && Math.abs(r - game.S.pos[0]) === 1 && Math.abs(c - game.S.pos[1]) === 1;
export const mobOn = (r: number, c: number): [string, Entity] | undefined => [...mobs.entries()].find(([, e]) => Math.floor(e.to.z) === r && Math.floor(e.to.x) === c);
export const actable = (b: number): boolean => isSolid(b) || USE.has(b);
export function targetBox(hit: AimHit | null): void {
  for (const [m, em] of glowMats) m.uniforms.uEmissive.value = em;        // (its colour animate() puts back itself, every frame)
  glowMats = [];
  let r: number | undefined, c: number | undefined, mob: Entity | null | undefined = null;
  const fp = !game.third && !flat.on && flat.t === 0, quarter = flat.on && flat.mode === 2 && flat.t === 1;   // first person, or settled in bird's-eye 3/4
  boxMode = REPLAY ? "off" : fp ? boxModes[0] : quarter ? boxModes[2] : "off";   // (each view's own style; a replay: none, Pete, it isn't anyone aiming)
  if (boxMode !== "off" && game.S && !game.S.done && playing() && (fp || quarter)) {
    const ok = hit && (hit.mob || (!hit.floor && actable(world.at(hit.r, hit.c)))) && (opt.move ? !beyondReach(hit.r, hit.c) : dirTo(hit.r, hit.c));
    if (ok) { r = hit.r; c = hit.c; mob = hit.mob ? mobs.get(hit.key!) : null; }
    else {
      const d = lookDir(), fr = game.S.pos[0] + DIRV[d][0], fc = game.S.pos[1] + DIRV[d][1], m = mobOn(fr, fc);
      if (m) { r = fr; c = fc; mob = m[1]; } else if (actable(world.at(fr, fc))) { r = fr; c = fc; }
    }
  }
  boxLines.visible = glowShell.visible = floorLines.visible = floorFill.visible = false;
  // a box style on and the mouse (or crosshair) on open ground: that tile outlined on the ground as well as lit
  if (/box/.test(boxMode) && game.S && !game.S.done && playing() && (fp || quarter) && hit && hit.floor && !hit.mob && !hit.ceil
      && !(hit.r === game.S.pos[0] && hit.c === game.S.pos[1]) && world.at(hit.r, hit.c) !== B.LAVA   // (water too, Pete)
      && !beyondReach(hit.r, hit.c) && !(fp && !dirTo(hit.r, hit.c) && !diagTo(hit.r, hit.c))) {   // (first person: the tiles round you a click can reach, a diagonal one a step away)
    const gr = boxMode[0] === "g" || boxMode[0] === "r";
    placeLines(floorLines, hit.c + 0.02, 0.03, hit.r + 0.02, hit.c + 0.98, 0.03, hit.r + 0.98, gr ? BOX_COL() : 0xffffff);
    if (/fill/.test(boxMode) && !lookState.lines) {                                    // (water: filled across its top, level with the outline, not down on its bottom, Pete)
      floorFill.material.color.set(gr ? BOX_COL() : 0xffffff);
      // red (Pete: on bright sand it washed out): laid over the ground as a tint, not added to it, and stronger on sand
      const red = boxMode[0] === "r", bl = red ? THREE.NormalBlending : THREE.AdditiveBlending;
      if (floorFill.material.blending !== bl) { floorFill.material.blending = bl; floorFill.material.needsUpdate = true; }
      floorFill.material.opacity = (red ? (world.at(hit.r, hit.c) === B.SAND ? 0.42 : 0.32) * redLight(hit.r, hit.c) : gr ? 0.26 : 0.16) * (0.85 + 0.15 * Math.sin(performance.now() / 160));
      floorFill.position.set(hit.c + 0.5, world.at(hit.r, hit.c) === B.WATER ? 0.03 : 0.035 - world.dipAt(hit.c + 0.5, hit.r + 0.5), hit.r + 0.5); floorFill.visible = true;
    }
  }
  if (r === undefined) return;
  // the modes (Pete): outline only (box, gbox); outline with a faint fill inside (boxfill, gboxfill); glows (glow, yellow); g: green
  const yel = boxMode === "yellow", green = (boxMode[0] === "g" && boxMode !== "glow") || boxMode[0] === "r", pulse = 0.85 + 0.15 * Math.sin(performance.now() / 160);
  const lines = /box/.test(boxMode), fill = /fill/.test(boxMode), lit = boxMode === "glow" || yel;
  const model = mob ? mob.model : r !== undefined && c !== undefined ? world.propAt(r, c) : null;   // (a creature, or a block drawn as one: the Necromancer)
  if (model && (lit || (fill && lookState.lines))) {                                   // (laser, phosphor and a filled box: it brightens itself, its shape kept)                                          // a mob lights up itself: brighter, or in yellow light
    for (const m of (model.userData.mats || []) as THREE.ShaderMaterial[]) {
      const u = m.uniforms; if (!u.uColor || !u.uEmissive) continue;
      glowMats.push([m, u.uEmissive.value]);
      if (yel) u.uColor.value.lerp(TINT_YELLOW, 0.4);
      u.uEmissive.value += (yel ? 0.5 : 0.45) * pulse;
    }
  }                                                                        // and the shell of light round it too (Pete: a white cow lit up brighter didn't show)
  let x0!: number, y0 = 0, z0!: number, x1!: number, y1!: number, z1!: number;
  if (mob) { const bb = mobBox.setFromObject(mob.model); x0 = bb.min.x; x1 = bb.max.x; z0 = bb.min.z; z1 = bb.max.z; y0 = Math.max(0, bb.min.y); y1 = bb.max.y; }   // round the model as drawn: a cow its own size, not a zombie's
  else if (TREE_B.has(world.at(r, c!)) && world.flat) [x0, y0, z0, x1, y1, z1] = world.flatTreeBox(r, c!);   // bird's-eye: the little tree as drawn
  else if (TREE_B.has(world.at(r, c!))) { x0 = c! + 0.2; x1 = c! + 0.8; z0 = r + 0.2; z1 = r + 0.8; y1 = world.trunkH(r, c!); }   // a tree: its trunk
  if (mob) {}                                                              // (its box as drawn, above: not the tile's)
  else if (TREE_B.has(world.at(r, c!))) { const w = 0.05; x0 -= w; x1 += w; z0 -= w; z1 += w; y1 += 0.02; }   // room for the wind's sway (shading.ts WIND: 0.045 across, 0.018 up)
  else if (world.propBox(r, c!)) {                                         // a block drawn as a model (the Necromancer): round all of him
    const bb = world.propBox(r, c!)!; x0 = Math.min(c!, bb.min.x); x1 = Math.max(c! + 1, bb.max.x); z0 = Math.min(r, bb.min.z); z1 = Math.max(r + 1, bb.max.z); y1 = bb.max.y;
  } else {
    x0 = c!; x1 = c! + 1; z0 = r; z1 = r + 1; y1 = Math.min(3, Math.max(1, world.height(r, c!) || 1));
    const k = hit && hit.r === r && hit.c === c ? cubeOf(hit, y1) : -1;
    if (k >= 0) { y0 = k; y1 = k + 1; }                                      // a tall stack: the cube pointed at (Pete), not the whole stack
  }
  // (not in laser or phosphor, Pete: their outline pass reads a blended shell as one solid surface, and a zombie up close lost his shape)
  if ((lit || fill) && !lookState.lines) {                                            // a soft shell of light just outside it, or (fill) a faint glow filling the box
    const e = fill ? 0.012 : mob ? 0.06 : 0.03;
    glowShell.scale.set(x1 - x0 + 2 * e, y1 - y0 + 2 * e, z1 - z0 + 2 * e); glowShell.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
    glowShell.material.color.set(green ? BOX_COL() : yel ? 0xffd040 : 0xffffff);
    // red (Pete: on a white cow it barely showed): laid over as a tint, not added, a little stronger on a creature
    const red = boxMode[0] === "r", bl = red ? THREE.NormalBlending : THREE.AdditiveBlending;
    if (glowShell.material.blending !== bl) { glowShell.material.blending = bl; glowShell.material.needsUpdate = true; }
    glowShell.material.opacity = (red ? (mob ? 0.3 : 0.22) * redLight(r, c!) : fill ? 0.1 : yel ? 0.26 : mob ? 0.22 : 0.16) * pulse;
    glowShell.visible = true;
  }
  if (!lines) return;
  const e = 0.025;                                                           // just outside the faces (Pete: a tree's edge fought it), and the shader pulls it closer still
  const yb = y0 < 0.02 ? 0.035 : y0 - e, yt = y1 + e;                      // on the ground: its bottom just above it, the whole bottom edge in sight (Pete)
  placeLines(boxLines, x0 - e, yb, z0 - e, x1 + e, yt, z1 + e, green ? BOX_COL() : 0xffffff);
}
// a tap on a touch screen (Pete): what it landed on stays lit, not whatever passes under the finger's spot as the camera follows you
// there (it lit for a frame, then went): for TAP_LIT_MS after the tap, walking to it or not (Pete). Above you (3/4, overhead) a
// finger doesn't hover, so nothing else lights there: the spot it last lifted from is no aim
const TAP_LIT_MS = 1000;
let tapHit: AimHit | null = null, tapSeen = 0;
function tapped(hit: AimHit | null): AimHit | null {
  if (!isTouch()) { tapHit = null; return hit; }
  if (!aimState.tapT) { tapHit = null; return flat.t > 0 ? null : hit; }
  if (aimState.tapT !== tapSeen) { tapSeen = aimState.tapT; tapHit = hit; }   // the frame after the tap: the camera hasn't moved yet
  if (performance.now() - aimState.tapT > TAP_LIT_MS) { aimState.tapT = 0; tapHit = null; return flat.t > 0 ? null : hit; }
  if (tapHit?.mob && tapHit.key && !mobs.has(tapHit.key)) { aimState.tapT = 0; tapHit = null; return null; }   // (gone: killed)
  return tapHit;
}
// frame(), the aim: the cursor, the crosshair, the lit square or creature under the mouse and the target box
export function updateAim(p: THREE.Vector3): void {
  // a soft spotlight on whatever the mouse is on (next to you it is acted on at once, farther off a click walks you there first).
  // Without pointer lock the mouse cursor aims, so the centre crosshair goes.
  const free = !locked();
  if (free !== hitState.cursorFree) { hitState.cursorFree = free; canvas.style.cursor = free ? "crosshair" : ""; }
  const crossOn = showCross && flat.t === 0;                                  // first person only, unless Settings turns it off (Pete)                     // first person only (captured in 3/4 the middle is you)                      // Settings: a touch screen may keep it, in first person
  if (crossOn !== options.crossShown) { options.crossShown = crossOn; $("cross")!.style.display = crossOn ? "" : "none"; }
  // 3D, 3/4 and the 2D overhead of the 3D world all aim (and light the square) in the 3D world; Original art has its own highlight
  // a touch screen in first person: what the crosshair is on, as Use acts there (the last finger down on the view, a look drag's
  // start, is no hover: aimed at, it put the box a block off the crosshair, Pete on a phone held sideways); a tap still acts where it lands
  const touchCross = isTouch() && !game.third && !flat.on && flat.t === 0;
  let hit: AimHit | null = !REPLAY && playing() && (flat.t === 0 || (flat.t === 1 && (flat.mode === 2 ? flat.k === 1 : flat.mode === 1 && !flat.picture))) ? aim(touchCross) : null;
  hit = tapped(hit);
  // (first person: only within 1st person reach, Pete; and bare ground only right in front of you, the one tile a click can hit
  // from where you stand: a click never walks you to the ground)
  const fpGround = !game.third && !flat.on && flat.t === 0 && hit && hit.floor && !hit.mob && !dirTo(hit.r, hit.c) && !diagTo(hit.r, hit.c);   // (water too, Pete: only the tile you can drink from; and the diagonal ones, a step away)
  // overhead with a free cursor (Pete): once the mouse has sat still 3 s, nothing under it lights until it moves again
  const idleAim = flat.t > 0 && !locked() && !isTouch() && aimState.pointerMoveT && performance.now() - aimState.pointerMoveT > IDLE_AIM_MS;   // (a touch screen: tapped() above)
  const want = hit && (hit.r !== game.S!.pos[0] || hit.c !== game.S!.pos[1]) && !beyondReach(hit.r, hit.c) && !fpGround && !idleAim ? 1 : 0;
  // a mob or a ladder lights up itself, not the ground or block it stands on: a mob in a box round where it is drawn (it may be
  // between tiles), above the floor; a ladder up above the floor too (a pit's ladder keeps the whole pit lit)
  const mobAt = want && hit!.mob && mobs.get(hit!.key!);
  const propAimed = want && !hit!.mob ? world.propAt(hit!.r, hit!.c) : null;   // a block drawn as a model (the Necromancer): lit as a creature is
  // a bird's-eye tree: its tile's square of ground (the target, as before) and the trunk lit as a tile is, and with them the whole
  // crown as drawn, which pokes past its tile (Pete: only its foot lit), though not the ground round it: a second box (uAimB)
  const tb = want && !hit!.mob && world.flat && TREE_B.has(world.at(hit!.r, hit!.c)) ? world.flatTreeBox(hit!.r, hit!.c) : null;
  shared.uAimB.value.set(0, 0, -1, -1);
  if (tb) { armState.aimTile = [hit!.c, hit!.r, tb[4] + 0.05, -10]; shared.uAimB.value.set(tb[0] - 0.02, tb[2] - 0.02, tb[3] + 0.02, tb[5] + 0.02); shared.uAimBY.value.set(0.0, tb[4] + 0.05); }
  else if (want) armState.aimTile = mobAt || propAimed ? [0, 0, -20, -10]                             // a creature: no column of light (a cow is longer than its tile, Pete); it glows itself, below
    : [hit!.c, hit!.r, hit!.mob ? 2.4 : hit!.ladder ? CEIL + 0.05 : TREE_B.has(world.at(hit!.r, hit!.c)) && flat.t === 0 ? 6.05 : hit!.floor ? 0.05 : Math.min(3, Math.max(1, world.height(hit!.r, hit!.c) || 1)) + 0.05,
      hit!.ladder && !hit!.floor ? 0.03 : -10];
  if (want && !mobAt && !propAimed && !tb && !TREE_B.has(world.at(hit!.r, hit!.c))) {        // a tall stack: only the cube pointed at lights up
    const h = Math.min(3, Math.max(1, world.height(hit!.r, hit!.c) || 1)), k = cubeOf(hit!, h);
    if (k >= 0) { armState.aimTile[2] = k + 1.05; armState.aimTile[3] = k > 0 ? k - 0.02 : -10; }
  }
  armState.aimOn += (want - armState.aimOn) * 0.35;
  targetBox(idleAim ? null : hit);
  // the green target box (Pete): the floor's lit square green as well, not white
  const glow = !!inkLook().aim?.glow;
  if (glow) shared.uAimTint.value.set(1, 1, 1);
  else if (boxMode === "gboxfill") shared.uAimTint.value.set(0.35, 1.6, 0.5); else if (boxMode === "rboxfill") shared.uAimTint.value.set(1.6, 0.4, 0.35); else shared.uAimTint.value.set(1, 1, 1);
  outlinePass.uniforms.uAimGlow.value = glow ? 1 : 0;                   // (any box style, and the spotlight too, Pete: in every view)   // phosphor: its target glows whitish green, brighter all through                                          // (the box and a creature's glow too)
  // the creature under the mouse lights up itself, the whole of it as drawn (Pete: a lit column caught part of a cow, and a zombie or
  // skeleton barely showed): its own colour added, which shows in the dark too; put back next frame with the target's (glowMats)
  for (const m of aimedMats) m.uniforms.uAimed.value = 0;
  aimedMats = [];
  const aimedModel = mobAt ? mobAt.model : propAimed;
  if (aimedModel) for (const m of (aimedModel.userData.mats || []) as THREE.ShaderMaterial[]) {
    const u = m.uniforms;
    if (u.uAimed) { u.uAimed.value = 1; aimedMats.push(m); }                // (laser, phosphor: marked as the aimed square is)
    if (!u.uEmissive || glowMats.some(([g]) => g === m)) continue;
    glowMats.push([m, u.uEmissive.value]); u.uEmissive.value += 0.35;
  }
  // the square lights up relative to the light already on it (shading.ts), so night needs no special case
  if (REPLAY) { const ra = replayer.aim as number[] | 0 | null; if (ra) { armState.aimTile = ra.slice(0, 4); armState.aimOn = ra[4]; } }   // the lit square as it was recorded   // (aim: [x, z, top, lo, on] or 0, record.ts CAM)
  shared.uAim.value.set(armState.aimTile[0], armState.aimTile[1], armState.aimTile[2], armState.aimOn < 0.01 ? 0 : armState.aimOn);
  shared.uAimLo.value = armState.aimTile[3] ?? -10;
  shared.uAimSz.value.set(armState.aimTile[4] ?? 1, armState.aimTile[5] ?? 1);
  shared.uAimGain.value = want && !hit!.mob && TREE_B.has(world.at(hit!.r, hit!.c)) ? 2.6 : 1;   // a tree lit more strongly (Pete)
}
