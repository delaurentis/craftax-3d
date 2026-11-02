// The world mesh and the effect objects, the first-person arm, the tool in hand and the potion bottle (tools drawn from their icons as
// voxels).
import { grass3d } from "./quality";
import * as THREE from "three";
import { World } from "../../js/world";
import { ENCH_MATS, FINE_TEX } from "../../js/models";
import { toolPixels } from "../../js/hud";
import { makeMaterial } from "../../js/shading";
import { Felling, Dying, Bursts, Bones } from "../../js/fell";
import { camera, scene } from "./scene";
import { game } from "../core/game";
import { shockwave } from "../looks/looks";

// this module's state that other modules set (one module can't assign another's let): aimTile, aimOn
export interface ArmState {
  /** The lit square under the mouse: its fade, and [column, row, top, bottom]. */
  aimOn: number;
  aimTile: number[];
}
export const armState = {} as ArmState;
/** An icon pixel (hud toolPixels): [its letter, its colour], or null for none. */
export type ToolPx = [string, string] | null;
/** The tool in hand and the bottle: a group whose userData lists its materials (mats) and, for a sword, its glow shells. */
type PartGroup = THREE.Group & { userData: { mats: THREE.ShaderMaterial[]; glows?: THREE.Mesh[] } };

export const world = new World(scene);
world.setGrass3d(grass3d);                                                   // (3D grass off: no blades, no flowers built, no grass shader code)
export const felling = new Felling(scene, world, camera), dying = new Dying(scene, camera), bursts = new Bursts(scene, world, camera), bones = new Bones(scene);
felling.onLand = (tree: THREE.Object3D) => shockwave(new THREE.Box3().setFromObject(tree).getCenter(new THREE.Vector3()), 1.2, tree);   // a felled tree hits the ground: its outline ripples out
armState.aimOn = 0; armState.aimTile = [0, 0, 0, -10];                                    // the lit square under the mouse: fade, [column, row, top, bottom]

// first-person arm, swung on every DO
export const arm = new THREE.Group();
// (Pete: the hand looked lame, then like a pole with no hand, the sleeve rolled up, then: no cuff, the sleeve a bit loose of the hand)
// a blocky arm in the player's own colours: a plain sleeve a little wider than the hand, hanging just over the wrist
export const armMat = makeMaterial("mob", { color: 0xe0b090, map: FINE_TEX }), sleeve = makeMaterial("mob", { color: 0x3a7ab0, map: FINE_TEX }),
  knuckle = makeMaterial("mob", { color: 0xcc9878, map: FINE_TEX });
// the sleeve runs on back past the view's edge (Pete: at a wide Field of view its end showed, a floating arm): its front where it was
export const sleeveMesh = new THREE.Mesh(new THREE.BoxGeometry(0.152, 0.152, 1.2), sleeve); sleeveMesh.position.z = 0.46;
// the hand a fist round the haft (Pete: not lines on a block, then: fingers can't curl all the way round): the palm and back of the
// hand, four fingers across the far side of the haft, their backs down the right, their tips curling only partway back on the left
// (a slit of haft shows between them and the palm), in two skin tones so each reads; the thumb along the top left
export const armMesh = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.125, 0.08), armMat); armMesh.position.z = -0.165;   // the palm and back of the hand
export const knuckles = new THREE.Group();
export const handBox = (w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); knuckles.add(b); };
for (let i = 0; i < 4; i++) {
  const m = i % 2 ? knuckle : armMat, y = -0.047 + i * 0.031;
  handBox(0.13, 0.031, 0.035, m, 0, y, -0.2625);                            // across the far side
  handBox(0.035, 0.031, 0.04, m, 0.0475, y, -0.225);                        // the back of the finger, right of the haft
  handBox(0.03, 0.031, 0.017, m, -0.05, y, -0.2365);                        // the tip, curled partway back on the left
}
handBox(0.035, 0.032, 0.075, armMat, -0.052, 0.046, -0.205);                // the thumb along the top left, over the tips
// with nothing held, the hand is just a block, no fingers (Pete: not the grip with its hole filled in, nor a fist with fingertips)
export const fist = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.125, 0.075), armMat); fist.position.z = -0.2425;
export const tool = new THREE.Group() as PartGroup; tool.position.set(0, 0, -0.225);           // through the middle of the fist
arm.add(sleeveMesh, armMesh, knuckles, fist, tool);
arm.position.set(0.3, -0.3, -0.42); arm.rotation.set(0.25, 0.15, 0); arm.scale.setScalar(0.55);
camera.add(arm);
// the tool in your hand: the Hand, Pickaxe or Sword slot selected, at the tier you own, in first person and in the player model's right
// hand (seen in third person, 2D and 3/4). ench: the sword's enchantment (1 fire, 2 ice) makes the blade glow
export let playerTool: PartGroup | null = null;
export function setTool(kind: string, tier: number | undefined, ench = 0): void {
  tool.clear();
  fist.visible = kind === "hand" || !tier; knuckles.visible = !fist.visible;
  buildTool(tool, kind, tier, ench);
  if (!game.player) return;
  const u = game.player.userData, hand = u.arms[1];
  if (playerTool) { const old = playerTool; hand.remove(old); u.mats = u.mats.filter((m: THREE.ShaderMaterial) => !old.userData.mats.includes(m)); }
  playerTool = new THREE.Group() as PartGroup;
  buildTool(playerTool, kind, tier, ench);
  playerTool.position.set(0, -0.72, 0.04); playerTool.rotation.x = Math.PI / 2; playerTool.scale.setScalar(0.9);   // gripped, pointing forward
  hand.add(playerTool);
  u.mats.push(...playerTool.userData.mats);
  for (const m of playerTool.userData.mats) m.uniforms.uBoost.value = 1;   // phosphor: part of the player                                // lit and hurt-flashed with the model
}
// a potion drunk (Pete): a little glass bottle of its colour in the left hand, raised to the mouth and tipped back, head back, for
// DRINK_MS; in first person the bottle comes up from below the view and tips toward you
export const DRINK_MS = 1400;
export let drinkFx: { t0: number; b3: PartGroup | null; b1: PartGroup } | null = null;
export function bottle(col: THREE.ColorRepresentation): PartGroup {
  const g = new THREE.Group() as PartGroup; g.userData.mats = [];
  const mat = (c: THREE.ColorRepresentation, glow?: boolean) => { const m = makeMaterial(glow ? "mobGlow" : "mob", { color: c }); m.userData.base = new THREE.Color(c); m.userData.glow = !!glow; m.uniforms.uBoost.value = 1; g.userData.mats.push(m); return m; };
  const box = (w: number, h: number, d: number, m: THREE.Material, y: number) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.y = y; g.add(b); };
  const liquid = mat(new THREE.Color(col).getHex(), true), glass = mat(0xd8e8f0), cork = mat(0x8a6038);
  box(0.15, 0.15, 0.15, liquid, 0); box(0.17, 0.03, 0.17, glass, -0.085); box(0.06, 0.07, 0.06, glass, 0.11); box(0.07, 0.04, 0.07, cork, 0.165);
  return g;
}
export function startDrink(col: THREE.ColorRepresentation): void {
  endDrink();
  const u = game.player && game.player.userData, b3 = bottle(col), b1 = bottle(col);
  if (u) { b3.position.set(0, -0.72, 0.06); b3.rotation.x = Math.PI / 2; b3.scale.setScalar(1.7); u.arms[0].add(b3); u.mats.push(...b3.userData.mats); }
  b1.scale.setScalar(0.9); camera.add(b1);
  drinkFx = { t0: performance.now(), b3: u ? b3 : null, b1 };
}
export function endDrink(): void {
  if (!drinkFx) return;
  const fx = drinkFx;
  const u = game.player && game.player.userData;
  if (fx.b3 && u) { const b3 = fx.b3; b3.parent?.remove(b3); u.mats = u.mats.filter((m: THREE.ShaderMaterial) => !b3.userData.mats.includes(m)); u.head.rotation.x = 0; }
  camera.remove(fx.b1);
  drinkFx = null;
}
export function buildTool(g: PartGroup, kind: string, tier: number | undefined, ench: number): void {
  g.userData.mats = [];
  if (kind === "hand" || !tier) return;
  const mat = (c: THREE.ColorRepresentation, glow?: boolean) => { const m = makeMaterial(glow ? "mobGlow" : "mob", { color: c }); m.userData.base = new THREE.Color(c); m.userData.glow = !!glow; g.userData.mats.push(m); return m; };
  // the pickaxe and sword held at an angle (Pete: the old boxes looked segmented): the icon's own pixels (hud.ts toolPixels),
  // doubled and smoothed (Pete: its pixels looked bigger than the world's) so each is four finer cubes, one icon pixel deep; the grip at
  // the hand, the head up. An enchanted sword glows purple round its blade (below). No dark outline: that is the icon's alone (Pete),
  // in the hand the cubes' own light and shade give the edges
  const px = fine(bridged(toolPixels(kind, tier))), P = 0.034, byCol = new Map<string, [number, number][]>(), blade: [number, number][] = [];
  // the grip (icon pixel) in the fist, on the haft's middle line: the pickaxe partway up its haft so the end shows below the fist (Pete),
  // the sword's short hilt whole in the hand under the guard
  const [gx, gy] = kind === "sword" ? [2.75, 12.75] : [4.25, 10.25];
  px.forEach((row, y) => row.forEach((c, x) => {
    if (!c || c[0] === "o") return;
    const key = c[1], at: [number, number] = [(x / 2 - 0.25 - gx) * P, (gy - y / 2 + 0.25) * P];
    if (!byCol.has(key)) byCol.set(key, []);
    byCol.get(key)!.push(at);
    if (kind === "sword" && ench && "hHd".includes(c[0])) blade.push(at);
  }));
  const v = new THREE.Group(); v.rotation.z = Math.PI / 4; g.add(v);       // the icon's diagonal stood upright: the head up
  for (const [key, at] of byCol) v.add(new THREE.Mesh(voxels(at, P / 2, P), mat(new THREE.Color(key).getHex())));
  // enchanted (Pete: the blade its own metal, diamond cyan, the enchantment a purple glow like the armour's): the armour's four shells
  // round the blade, upright once the icon is stood up, each a little wider and fainter
  const glows: THREE.Mesh[] = g.userData.glows = [];
  if (blade.length) {
    const k = Math.SQRT1_2, xs = blade.map(([x, y]) => k * (x - y)), ys = blade.map(([x, y]) => k * (x + y)), e = P / 4;
    const x0 = Math.min(...xs) - e, x1 = Math.max(...xs) + e, y0 = Math.min(...ys) - e, y1 = Math.max(...ys) + e;
    ENCH_MATS.forEach((m, i) => {
      const pad = [0.012, 0.028, 0.048, 0.075][i], sh = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 2 * pad, y1 - y0 + 2 * pad, P + 2 * pad), m);
      sh.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0); g.add(sh); glows.push(sh);
    });
  }
}
// with the outline gone, an outline pixel between two of the tool's own (left and right, or above and below) is filled, so the parts the
// icon's outline joined still touch (Pete: the sword's guard and hilt stood apart from its blade): the guard's wood first, then the haft's
export function bridged(px: ToolPx[][]): ToolPx[][] {
  const n = px.length, at = (x: number, y: number) => (y >= 0 && y < n && x >= 0 && x < n ? px[y][x] : null), solid = (c: ToolPx) => c && c[0] !== "o";
  return px.map((row, y) => row.map((c, x) => {
    if (!c || c[0] !== "o") return c;
    const pairs = [[at(x - 1, y), at(x + 1, y)], [at(x, y - 1), at(x, y + 1)]].filter(([a, b]) => solid(a) && solid(b));
    if (!pairs.length) return c;
    const near = pairs.flat() as [string, string][];   // (each one solid: the filter above)
    return near.find((q) => q[0] === "G") || near.find((q) => "sS".includes(q[0])) || near[0];
  }));
}
// an icon's pixels at twice the resolution: Scale2x (each pixel four, a corner taking its neighbours' value where two of them agree, so
// the steps of a diagonal halve), then the dark outline thinned to the one sub-pixel that touches the tool
export function fine(px: ToolPx[][]): ToolPx[][] {
  const n = px.length, at = (g: ToolPx[][], x: number, y: number) => (y >= 0 && y < g.length && x >= 0 && x < g.length ? g[y][x] : null), same = (a: ToolPx, b: ToolPx) => (a && a[0]) === (b && b[0]);
  const big: ToolPx[][] = Array.from({ length: 2 * n }, () => Array<ToolPx>(2 * n).fill(null));
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const p = px[y][x], A = at(px, x, y - 1), B = at(px, x + 1, y), C = at(px, x - 1, y), D = at(px, x, y + 1);
    big[2 * y][2 * x] = same(C, A) && !same(C, D) && !same(A, B) ? A : p;
    big[2 * y][2 * x + 1] = same(A, B) && !same(A, C) && !same(B, D) ? B : p;
    big[2 * y + 1][2 * x] = same(D, C) && !same(D, B) && !same(C, A) ? C : p;
    big[2 * y + 1][2 * x + 1] = same(B, D) && !same(B, A) && !same(D, C) ? D : p;
  }
  const inside = (c: ToolPx) => c && c[0] !== "o";
  return big.map((row, y) => row.map((c, x) => (c && c[0] === "o" && ![[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => inside(at(big, x + dx, y + dy))) ? null : c)));
}
// many small cubes of side P (depth D) at [x, y] (z 0) as one geometry, so a tool is a handful of meshes, not hundreds
export const VOX = new THREE.BoxGeometry(1, 1, 1);
export function voxels(at: [number, number][], P: number, D = P): THREE.BufferGeometry {
  const pos = VOX.attributes.position.array as Float32Array, nor = VOX.attributes.normal.array as Float32Array, uv = VOX.attributes.uv.array as Float32Array, idx = VOX.index!.array, n = pos.length / 3;
  const P3 = new Float32Array(at.length * n * 3), N3 = new Float32Array(at.length * n * 3), U2 = new Float32Array(at.length * n * 2), I = new Uint32Array(at.length * idx.length);
  at.forEach(([x, y], k) => {
    for (let i = 0; i < n; i++) {
      P3.set([pos[i * 3] * P + x, pos[i * 3 + 1] * P + y, pos[i * 3 + 2] * D], (k * n + i) * 3);
      N3.set(nor.subarray(i * 3, i * 3 + 3), (k * n + i) * 3); U2.set(uv.subarray(i * 2, i * 2 + 2), (k * n + i) * 2);
    }
    for (let i = 0; i < idx.length; i++) I[k * idx.length + i] = idx[i] + k * n;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(P3, 3)); geo.setAttribute("normal", new THREE.BufferAttribute(N3, 3)); geo.setAttribute("uv", new THREE.BufferAttribute(U2, 2));
  geo.setIndex(new THREE.BufferAttribute(I, 1));
  return geo;
}
