// The world's geometry kit (js/world.ts): Geo (one mesh's vertices, laser ids and corner AO), face() and its boxes, the water grid, the
// overhead views' leaf crowns, and the green flame's texture. geoState.realm: the realm whose rock face() swaps in (set by each build).
import * as THREE from "three";
import { STONE_VARIANTS, uv } from "../../js/textures";
import { FLAT_TRUNK, LIQUID_TOP, NORMAL, UP } from "./blocks";
import { themes } from "../themes/state";
import type { Tex, Vec3 } from "./blocks";
import type { Face } from "../themes/types";

/** A face's 4 corners, counter-clockwise from outside, bottom-left first. */
export type Quad = [Vec3, Vec3, Vec3, Vec3];
/** The texture square to draw: [a, b, k] (or [a, b, k, height]), as fractions of the texture. */
export type Sub = number[];
/** How solid the cell at a point is (0..1), for corner occlusion. */
export type Occ = (x: number, y: number, z: number) => number;
/** A theme switching (src/themes/blocks.ts): the tiles the theme being left and the one coming in draw for a face, [from, to]. */
export type Remap = (tex: string, face: Face, row: number) => [string, string];
// a tile's uv rectangle, or the square of it that sub picks: [u0, v0, u1, v1]
function subUv(tex: string, sub: Sub | null): [number, number, number, number] {
  const [u0, v0, u1, v1] = uv(tex);
  if (!sub) return [u0, v0, u1, v1];
  const du = u1 - u0, dv = v1 - v0, kv = sub[3] ?? sub[2];
  return [u0 + du * sub[0], v0 + dv * sub[1], u0 + du * (sub[0] + sub[2]), v0 + dv * (sub[1] + kv)];
}

// a water surface [x0,x1]×[z0,z1] cut into step-sized cells, so the shader's swell has vertices to move
export function waterGrid(geo: Geo, x0: number, z0: number, x1: number, z1: number, step: number, light: number, y = LIQUID_TOP): void {
  for (let z = z0; z < z1 - 1e-6; z += step) for (let x = x0; x < x1 - 1e-6; x += step) {
    const xb = Math.min(x1, x + step), zb = Math.min(z1, z + step);
    geo.quad([[x, y, zb], [xb, y, zb], [xb, y, z], [x, y, z]], "water", light, UP);
  }
}
export function box(o: Geo, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tex: Tex, L: number): void { for (const f of ["top", "bottom", "pz", "nz", "px", "nx"]) face(o, f, x0, y0, z0, x1, y1, z1, tex, L); }
// a box of pixels (P = 1/16 block): sub picks one texel of tex for all its faces; wave: how far its top (or, whole: all of it) sways
export function pixBox(geo: Geo, x: number, y: number, z: number, w: number, h: number, d: number, tex: Tex, sub: Sub | null, L: number, wave: number, whole = false): void {
  const top = [wave, wave, wave, wave], side = whole ? top : [0, 0, wave, wave];
  for (const f of ["pz", "nz", "px", "nx"]) face(geo, f, x, y, z, x + w, y + h, z + d, tex, L, side, sub);
  face(geo, "top", x, y, z, x + w, y + h, z + d, tex, L, top, sub);
  if (whole) face(geo, "bottom", x, y, z, x + w, y + h, z + d, tex, L, top, sub);
}

// outline art's surface id: the piece (id), the block row of a tall side (row) and the face direction (dir), mixed to 24 bits so the
// float attribute holds it exactly (the shader hashes it again with integer ops; sin() of big floats is unreliable on GPUs)
export function faceId(id: number, row: number, dir: number): number {
  let a = ((id * 8 + dir) | 0) ^ Math.imul(row + 1, 0x9e3779b1);
  a = Math.imul(a ^ (a >>> 16), 0x7feb352d);
  a = Math.imul(a ^ (a >>> 15), 0x846ca68b);
  return (a ^ (a >>> 16)) >>> 8;
}

export class Geo {
  declare occ: Occ | null | undefined;
  /** Outline art: the piece now, and the block row of a tall side. */
  declare id: number;
  declare row: number;
  declare ids: number[];
  /** The tree (its trunk [x, z]) the faces now belong to, and the far piece id. */
  declare tree: [number, number] | null;
  declare farId: number | null;
  declare trees: number[];
  declare fars: number[];
  /** How far the faces now grow in (a sapling). */
  declare grow: number;
  declare grows: number[];
  declare p: number[];
  declare u: number[];
  declare n: number[];
  declare vis: number[];
  declare ao: number[];
  declare w: number[];
  declare i: number[];
  /** Outline art: the faces now draw no direction lines; tall sides are not cut into pieces by row. */
  declare noDir?: boolean;
  declare noRows?: boolean;
  /** With a theme installed: the old theme's uvs (aUvFrom), and the faces' tiles under each theme now (null: as given). */
  declare uf: number[];
  declare remap: Remap | null;
  /** Morph targets (a theme's crown changing shape, src/themes/crowns.ts): null unless switched on for this Geo, and then where each
   *  corner of the next quad goes (morphTo; null: where it is). */
  declare mo: number[] | null;
  declare morphTo: Vec3[] | null;
  /** The block row (from the ground) of the face being drawn, for a theme's tile pick (face() sets it). */
  declare rowAt: number;
  // tree / farId: outline art's level of detail. Far from the camera a tree (its trunk position) is one piece, outlined as a whole
  constructor(occ?: Occ | null) { this.occ = occ; this.id = 0; this.row = 0; this.ids = []; this.tree = null; this.farId = null; this.trees = []; this.fars = []; this.grow = 0; this.grows = []; this.p = []; this.u = []; this.n = []; this.vis = []; this.ao = []; this.w = []; this.i = []; this.uf = []; this.remap = null; this.rowAt = 0; this.mo = null; this.morphTo = null; }
  // v: 4 corners counter-clockwise from outside, bottom-left first; ao / wave: per corner (default 1 / 0)
  // sub: [a, b, k] draws only the k-wide square of the texture at (a, b) (fractions), so small blocks keep full-size pixels
  quad(v: Vec3[], tex: string, vis: number, nrm: Vec3, ao: number[] | null = null, wave: number[] | null = null, flipU = false, sub: Sub | null = null): void {
    const n = this.p.length / 3;
    let from = tex;
    if (this.remap) [from, tex] = this.remap(tex, nrm[1] > 0.5 ? "top" : nrm[1] < -0.5 ? "bottom" : "side", this.rowAt);
    const [u0, v0, u1, v1] = subUv(tex, sub);
    for (const q of v) this.p.push(q[0], q[1], q[2]);
    if (this.mo) for (let k = 0; k < 4; k++) { const q = this.morphTo ? this.morphTo[k] : v[k]; this.mo.push(q[0], q[1], q[2]); }
    const us = flipU ? [u1, u0, u0, u1] : [u0, u1, u1, u0];
    this.u.push(us[0], v0, us[1], v0, us[2], v1, us[3], v1);
    if (geoState.themed) {
      const [a0, b0, a1, b1] = from === tex ? [u0, v0, u1, v1] : subUv(from, sub), fs = flipU ? [a1, a0, a0, a1] : [a0, a1, a1, a0];
      this.uf.push(fs[0], b0, fs[1], b0, fs[2], b1, fs[3], b1);
    }
    const fid = faceId(this.id, this.row, this.noDir ? 7 : (nrm[1] > 0.5 ? 0 : nrm[1] < -0.5 ? 1 : nrm[0] > 0.5 ? 2 : nrm[0] < -0.5 ? 3 : nrm[2] > 0.5 ? 4 : nrm[2] < -0.5 ? 5 : 6));
    const far = this.farId == null ? fid : faceId(this.farId, 0, 7), tx = this.tree ? this.tree[0] : -1e4, tz = this.tree ? this.tree[1] : -1e4;
    for (let k = 0; k < 4; k++) { this.ids.push(fid); this.fars.push(far); this.trees.push(tx, tz); this.grows.push(this.grow); this.n.push(...nrm); this.vis.push(vis); this.ao.push(ao ? ao[k] : 1); this.w.push(wave ? wave[k] : 0); }
    if (ao && ao[0] + ao[2] < ao[1] + ao[3]) this.i.push(n + 1, n + 2, n + 3, n + 1, n + 3, n);    // split along the brighter diagonal
    else this.i.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  // Corner occlusion: the two side cells and the corner cell in front of each vertex
  cornerAO(v: Vec3[], nrm: Vec3): number[] {
    const m = [0, 1, 2].map((k) => (v[0][k] + v[1][k] + v[2][k] + v[3][k]) / 4);
    const axes = [0, 1, 2].filter((k) => !nrm[k]);
    const o = m.map((x, k) => x + nrm[k] * 0.5);
    return v.map((q) => {
      const d = axes.map((k) => Math.sign(q[k] - m[k]) || 1);
      const at = (a: number, b: number) => { const p = o.slice(); p[axes[0]] += a; p[axes[1]] += b; return this.occ!(p[0], p[1], p[2]); };
      const s1 = at(d[0], 0), s2 = at(0, d[1]), c = s1 > 0.9 && s2 > 0.9 ? 1 : at(d[0], d[1]);
      return 1 - 0.19 * (s1 + s2 + c);
    });
  }
  mesh(mat: THREE.Material): THREE.Mesh {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(this.u, 2));
    if (this.uf.length) g.setAttribute("aUvFrom", new THREE.Float32BufferAttribute(this.uf, 2));
    if (this.mo?.length) g.setAttribute("aMorph", new THREE.Float32BufferAttribute(this.mo, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute("aVis", new THREE.Float32BufferAttribute(this.vis, 1));
    g.setAttribute("aAO", new THREE.Float32BufferAttribute(this.ao, 1));
    g.setAttribute("aWave", new THREE.Float32BufferAttribute(this.w, 1));
    g.setAttribute("aId", new THREE.Float32BufferAttribute(this.ids, 1));
    g.setAttribute("aIdFar", new THREE.Float32BufferAttribute(this.fars, 1));
    g.setAttribute("aTree", new THREE.Float32BufferAttribute(this.trees, 2));
    g.setAttribute("aGrow", new THREE.Float32BufferAttribute(this.grows, 1));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    return new THREE.Mesh(g, mat);
  }
}

// one face of the box [x0,x1]×[y0,y1]×[z0,z1]; tall sides are cut into unit rows so textures tile like blocks
// tex: a texture name, or a function of the block row's height (a tall side whose blocks each look different: dungeon walls)
// the fire and ice realms build their rock walls from their own stone (textures.ts): set per build
// themed: a theme is installed, so faces carry the old theme's uvs too (aUvFrom, for the blend while one switches)
export const geoState = { realm: "", get themed() { return themes().length > 0; } };
export const STONE_SET = new Set(STONE_VARIANTS);
export function face(geo: Geo, f: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tex: Tex, light: number, wave: number[] | null = null, sub: Sub | null = null): void {
  if (geoState.realm) {                                                      // (tex may pick per block row: a function of the row's height)
    const pick = typeof tex === "function" ? tex : null, r = geoState.realm;
    if (pick) tex = (y: number) => { const t = pick(y); return STONE_SET.has(t) ? r + t : t; };
    else if (typeof tex === "string" && STONE_SET.has(tex)) tex = geoState.realm + tex;
  }
  const s = light, N = NORMAL[f], texAt = typeof tex === "function" ? tex : () => tex;
  let rowSub = sub, rowY = y1 - 1;
  const q = (v: Vec3[]) => { geo.rowAt = Math.max(0, Math.floor(rowY + 1e-6)); geo.quad(v, texAt(rowY), s, N, geo.occ ? geo.cornerAO(v, N) : null, wave, false, rowSub); geo.rowAt = 0; };
  if (f === "top") return q([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]]);
  if (f === "bottom") return q([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]]);
  for (let ya = y0; ya < y1 - 1e-6; ya = Math.min(y1, ya + 1)) {
    const yb = Math.min(y1, ya + 1);
    rowY = ya;
    rowSub = sub || (yb - ya < 0.999 ? [0, 0, 1, yb - ya] : null);   // a part-height row shows that slice of the texture, not all of it squashed
    if (!geo.noRows) geo.row = 1 + Math.floor(ya + 2.001);   // outline art: each block of a tall side (a cliff) is its own piece
    if (f === "pz") q([[x0, ya, z1], [x1, ya, z1], [x1, yb, z1], [x0, yb, z1]]);
    else if (f === "nz") q([[x1, ya, z0], [x0, ya, z0], [x0, yb, z0], [x1, yb, z0]]);
    else if (f === "px") q([[x1, ya, z1], [x1, ya, z0], [x1, yb, z0], [x1, yb, z1]]);
    else if (f === "nx") q([[x0, ya, z0], [x0, ya, z1], [x0, yb, z1], [x0, yb, z0]]);
  }
  geo.row = 0;
}
export const NB: [string, number, number][] = [["pz", 1, 0], ["nz", -1, 0], ["px", 0, 1], ["nx", 0, -1]];   // face, dRow, dCol
export const FACE_STEP: Record<string, Vec3> = { top: [0, 1, 0], bottom: [0, -1, 0], pz: [0, 0, 1], nz: [0, 0, -1], px: [1, 0, 0], nx: [-1, 0, 0] };   // [dx, dy, dz]

// the overhead views' crown: a rounded clump of quarter-size leaf blocks over the stub trunk, a little different per tree (seeded by
// its tile), a few blocks poking past the tile edge so it reads as foliage, not a cube. [x, y, z] in quarter blocks from the tile corner
export const Q = 0.25, CROWN_Y = FLAT_TRUNK - 0.75, STUB_W = 0.33;   // the crown hides the stub's top; the stub is slimmer than a full trunk
export function crownCubes(seed: number): Vec3[] {
  let h = (seed * 2654435761) >>> 0;
  const rnd = () => ((h = (h * 1664525 + 1013904223) >>> 0) / 4294967296);
  const cubes: Vec3[] = [], cy = 2.4 + rnd() * 0.5, R = 2.9 + rnd() * 0.4;
  for (let y = 0; y <= 5; y++) for (let z = -1; z <= 4; z++) for (let x = -1; x <= 4; x++) {
    const d = ((x - 1.5) ** 2 + (z - 1.5) ** 2) / (R * R) + ((y - cy) / 2.7) ** 2;
    if (d < 0.82 + rnd() * 0.3) cubes.push([x, y, z]);
  }
  return cubes;
}
export function addCrown(geo: Geo, ox: number, oy: number, oz: number, seed: number, tex: Tex, L: number, wave?: number[] | null): void {           // ox, oz: the tile's corner; oy: the crown's base
  const cubes = crownCubes(seed), has = new Set(cubes.map((q) => q.join(","))), base = geo.id;
  geo.noDir = true;                                          // outline art: the little steps draw no lines
  for (const [x, y, z] of cubes) {
    geo.id = base + 1 + seed * 8 + (y >= 3 ? 1 : 0);         // outline art: the crown's outline and one ring round its middle
    const sub = [((x + 4) % 4) * Q, ((z + y + 4) % 4) * Q, Q];
    for (const f in FACE_STEP) {
      const [dx, dy, dz] = FACE_STEP[f];
      if (has.has(`${x + dx},${y + dy},${z + dz}`)) continue;
      face(geo, f, ox + x * Q, oy + y * Q, oz + z * Q, ox + (x + 1) * Q, oy + (y + 1) * Q, oz + (z + 1) * Q, tex, L, wave, sub);
    }
  }
  geo.id = base; geo.noDir = false;
}

// a turned torch's flame (Pete: a green version of the flame's own texture, not orange): the lava/flame pixels recoloured in phosphor
// greens, made once, scrolled upward as it burns
export let greenTex: THREE.CanvasTexture | null = null;
export function greenFlameTex(): THREE.CanvasTexture {
  if (greenTex) return greenTex;
  const cv = document.createElement("canvas"); cv.width = cv.height = 16;
  const g = cv.getContext("2d")!;
  for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
    const k = Math.random();
    g.fillStyle = k > 0.9 ? "#c8ffd8" : k > 0.65 ? "#4dff8a" : k > 0.3 ? "#16d65a" : "#0a8a36"; g.fillRect(i, j, 1, 1);
  }
  greenTex = new THREE.CanvasTexture(cv);
  greenTex.magFilter = greenTex.minFilter = THREE.NearestFilter; greenTex.wrapS = greenTex.wrapT = THREE.RepeatWrapping;
  return greenTex;
}
