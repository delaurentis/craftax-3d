// Trees' crowns as boxes (Theme.crown): a theme's own crown drawn (a face buried in its other boxes left out, swaying in the wind more
// toward its top), the standard crowns as boxes too, and, while a switch's wave runs, each tree's old crown morphing into its new one:
// both crowns' boxes sorted by height and then by how far out from the trunk they are, paired in that order, each pair one box
// whose corners go from the old box's to the new one's as the wave passes its tile (eased in and out, src/render/shading/shaders.ts)
// while its tiles crossfade. A box with no partner shrinks into, or grows out of, the box its nearest paired neighbour becomes.
import { CROWN_Y, Geo, Q, crownCubes, faceId } from "../world/geo";
import { onScreen } from "./state";
import type { Vec3 } from "../world/blocks";
import type { LeafCell } from "../world/core";
import type { CrownBox } from "./types";

const FACES = ["top", "bottom", "pz", "nz", "px", "nx"] as const;
type F = (typeof FACES)[number];
const NORMAL: Record<F, Vec3> = { top: [0, 1, 0], bottom: [0, -1, 0], pz: [0, 0, 1], nz: [0, 0, -1], px: [1, 0, 0], nx: [-1, 0, 0] };
// a face's corners, in the order geo.face() draws them
function corners(f: F, b: CrownBox): Vec3[] {
  const { x0, y0, z0, x1, y1, z1 } = b;
  switch (f) {
    case "top": return [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]];
    case "bottom": return [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]];
    case "pz": return [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    case "nz": return [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]];
    case "px": return [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]];
    default: return [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]];
  }
}
const tileOf = (f: F, b: CrownBox) => (f === "top" ? b.top : f === "bottom" ? b.bottom : b.side);
const frac = (v: number) => ((v % 1) + 1) % 1;
// the part of its tile a face shows, so a small box keeps full-size pixels (a side: the tile's top part, where a snow lip is)
function subOf(f: F, b: CrownBox): number[] {
  const w = Math.min(1, b.x1 - b.x0), h = Math.min(1, b.y1 - b.y0), d = Math.min(1, b.z1 - b.z0);
  if (f === "top" || f === "bottom") return [Math.min(frac(b.x0), 1 - w), Math.min(frac(b.z0), 1 - d), w, d];
  const [a, s] = f === "pz" || f === "nz" ? [b.x0, w] : [b.z0, d];
  return [Math.min(frac(a), 1 - s), 0, s, h];
}
// is this face hidden inside the crown: every bit of it inside another box, or against one that goes on past it (Pete: a palm's
// fronds are rows of overlapping slabs, and the faces buried in the next slab were drawn too). Exact: the face's rectangle, less
// the part of it each neighbouring box covers there (only boxes that are solid on its outer side), must come to nothing
const E = 1e-6;
type Rect = [number, number, number, number];                          // u0, u1, v0, v1: the face's two other axes
const lo = (b: CrownBox, a: number) => (a === 0 ? b.x0 : a === 1 ? b.y0 : b.z0), hi = (b: CrownBox, a: number) => (a === 0 ? b.x1 : a === 1 ? b.y1 : b.z1);
const AXIS: Record<F, [number, number]> = { px: [0, 1], nx: [0, -1], top: [1, 1], bottom: [1, -1], pz: [2, 1], nz: [2, -1] };
function cut(rest: Rect[], r: Rect): Rect[] {
  const out: Rect[] = [];
  for (const q of rest) {
    if (r[0] >= q[1] - E || r[1] <= q[0] + E || r[2] >= q[3] - E || r[3] <= q[2] + E) { out.push(q); continue; }
    if (r[0] > q[0] + E) out.push([q[0], r[0], q[2], q[3]]);
    if (r[1] < q[1] - E) out.push([r[1], q[1], q[2], q[3]]);
    const u0 = Math.max(q[0], r[0]), u1 = Math.min(q[1], r[1]);
    if (r[2] > q[2] + E) out.push([u0, u1, q[2], r[2]]);
    if (r[3] < q[3] - E) out.push([u0, u1, r[3], q[3]]);
  }
  return out;
}
function hidden(f: F, b: CrownBox, near: readonly CrownBox[]): boolean {
  const [a, s] = AXIS[f], p = s > 0 ? hi(b, a) : lo(b, a), ua = a === 0 ? 1 : 0, va = a === 2 ? 1 : 2;
  let rest: Rect[] = [[lo(b, ua), hi(b, ua), lo(b, va), hi(b, va)]];
  for (const c of near) {
    if (c === b) continue;
    if (s > 0 ? !(lo(c, a) <= p + E && hi(c, a) > p + E) : !(hi(c, a) >= p - E && lo(c, a) < p - E)) continue;   // solid past the face
    rest = cut(rest, [lo(c, ua), hi(c, ua), lo(c, va), hi(c, va)]);
    if (!rest.length) return true;
  }
  return false;
}
// each box's neighbours: the boxes it touches or overlaps (only they can hide its faces)
function neighbours(all: readonly CrownBox[]): CrownBox[][] {
  return all.map((b) => all.filter((c) => c !== b && c.x0 <= b.x1 + E && c.x1 >= b.x0 - E && c.y0 <= b.y1 + E && c.y1 >= b.y0 - E && c.z0 <= b.z1 + E && c.z1 >= b.z0 - E));
}
// how much a corner sways: none at the crown's foot, a leaf's sway at its top
function swayer(boxes: readonly CrownBox[]): (y: number) => number {
  const lo = Math.min(...boxes.map((b) => b.y0)), hi = Math.max(...boxes.map((b) => b.y1));
  return (y) => Math.min(1, Math.max(0, (y - lo) / Math.max(0.01, hi - lo)) * 1.1);
}

/** A crown drawn as it stands. id: its first outline piece (a box's piece adds to it). dx, dz: moved by (a felled tree's, round 0).
 *  rec: each face drawn, its box's piece and which face it is (a prebuilt crown's, for stampCrown). */
export function drawCrown(geo: Geo, boxes: readonly CrownBox[], light: number, id: number, dx = 0, dz = 0, rec: number[] | null = null): void {
  if (!boxes.length) return;
  const sway = swayer(boxes), id0 = geo.id, near = neighbours(boxes);
  boxes.forEach((b0, bi) => {
    const b = { ...b0, x0: b0.x0 + dx, x1: b0.x1 + dx, z0: b0.z0 + dz, z1: b0.z1 + dz };
    geo.id = id + (b.piece ?? 0);
    for (const f of FACES) {
      if (hidden(f, b0, near[bi])) continue;
      rec?.push(b.piece ?? 0);
      const c = corners(f, b);
      geo.quad(c, tileOf(f, b), f === "bottom" ? light * 0.85 : light, NORMAL[f], null, c.map((q) => sway(q[1])), false, subOf(f, b));
    }
  });
  geo.id = id0;
}

const centre = (b: CrownBox): Vec3 => [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2];
const nearest = (b: CrownBox, list: readonly CrownBox[]) => {
  const [x, y, z] = centre(b);
  let k = 0, best = Infinity;
  list.forEach((c, i) => { const [a, bb, cc] = centre(c), d = (a - x) ** 2 + (bb - y) ** 2 + (cc - z) ** 2; if (d < best) { best = d; k = i; } });
  return k;
};
/** The old crown's boxes paired with the new one's (see the top). */
export function pairCrowns(A: readonly CrownBox[], B: readonly CrownBox[], cx: number, cz: number): [CrownBox, CrownBox][] {
  const key = (b: CrownBox) => { const [x, y, z] = centre(b); return [y, Math.hypot(x - cx, z - cz)]; };
  const sort = (l: readonly CrownBox[]) => [...l].sort((p, q) => { const a = key(p), b = key(q); return a[0] - b[0] || a[1] - b[1]; });
  const a = sort(A), b = sort(B), n = Math.min(a.length, b.length), out: [CrownBox, CrownBox][] = [];
  if (!n) return out;
  for (let i = 0; i < n; i++) out.push([a[i], b[i]]);
  const pa = a.slice(0, n), pb = b.slice(0, n);
  for (let i = n; i < a.length; i++) out.push([a[i], b[nearest(a[i], pa)]]);   // shrinks into what its nearest neighbour becomes
  for (let i = n; i < b.length; i++) out.push([a[nearest(b[i], pb)], b[i]]);   // grows out of what its nearest neighbour was
  return out;
}
/** A crown morphing: each pair one box from the old to the new (its tiles crossfading); the Geo's morph targets switched on. */
export function drawMorph(geo: Geo, A: readonly CrownBox[], B: readonly CrownBox[], cx: number, cz: number, light: number, id: number): void {
  const pairs = pairCrowns(A, B, cx, cz);
  if (!pairs.length) return;
  const sway = swayer(B), id0 = geo.id, remap0 = geo.remap;
  geo.mo ??= [];
  for (const [a, b] of pairs) {
    geo.id = id + (b.piece ?? 0);
    for (const f of FACES) {
      const ca = corners(f, a), cb = corners(f, b), ta = tileOf(f, a), tb = tileOf(f, b);
      geo.remap = () => [ta, tb]; geo.morphTo = cb;
      geo.quad(ca, tb, f === "bottom" ? light * 0.85 : light, NORMAL[f], null, cb.map((q) => sway(q[1])), false, subOf(f, b));
    }
  }
  geo.morphTo = null; geo.remap = remap0; geo.id = id0;
}

/** Is a switch running that changes trees' crowns (each tree's crown morphs as the wave passes it)? */
export const crownsMorphing = (): boolean => onScreen.from !== onScreen.to && !!onScreen.p && !!(onScreen.from?.crown || onScreen.to?.crown);
/** A switch that changed only crowns ends without building the world again (Pete: choppy): its morphing crowns stay, drawn at their
 *  new shape (uCrownSwap on, every tile's progress 1), until a build replaces them; on, the next switch builds the world first. */
export const crownsLeft = { on: false };
/** The standard full-size crown's boxes: its leaf cells. */
export const standardCrown = (cells: readonly LeafCell[]): CrownBox[] =>
  cells.map(([rr, cc, dy, tex]) => ({ x0: cc, y0: dy, z0: rr, x1: cc + 1, y1: dy + 1, z1: rr + 1, top: tex, side: tex, bottom: tex }));
/** The overhead views' standard little crown's boxes (geo.ts addCrown). */
export const standardTop = (r: number, c: number, seed: number, tex: string): CrownBox[] =>
  crownCubes(seed).map(([x, y, z]) => ({ x0: c + x * Q, y0: CROWN_Y + y * Q, z0: r + z * Q, x1: c + (x + 1) * Q, y1: CROWN_Y + (y + 1) * Q, z1: r + (z + 1) * Q, top: tex, side: tex, bottom: tex, piece: y >= 3 ? 1 : 0 }));

// ---- prebuilt crowns (Theme.crownPick; blocks.ts keeps them): drawn once, centred on the trunk, then copied into each chunk for
// every tree that wears one, turned and moved into place, with that tree's own outline ids. A palm took ~1.5-5 ms to draw; a copy
// takes a few hundredths of that
/** A prebuilt crown: its boxes centred on the trunk (x, z round 0; y as built), and, once a chunk first wants it, drawn. */
export interface CrownTpl { boxes: CrownBox[]; geo: { g: Geo; piece: number[] } | null }
const turnXZ = (x: number, z: number, turn: number): [number, number] => { for (let k = 0; k < turn; k++) [x, z] = [-z, x]; return [x, z]; };
/** A prebuilt crown's boxes, turned by quarter turns and set on the trunk at (cx, cz). */
export function placeCrown(boxes: readonly CrownBox[], turn: number, cx: number, cz: number): CrownBox[] {
  return boxes.map((b) => {
    let { x0, x1, z0, z1 } = b;
    for (let k = 0; k < turn; k++) [x0, x1, z0, z1] = [-z1, -z0, x0, x1];
    return { ...b, x0: x0 + cx, x1: x1 + cx, z0: z0 + cz, z1: z1 + cz };
  });
}
/** A prebuilt crown copied into geo: turned, on the trunk at (cx, cz), lit by light, its outline pieces from id (as drawCrown). */
export function stampCrown(geo: Geo, tpl: CrownTpl, turn: number, cx: number, cz: number, light: number, id: number): void {
  if (!tpl.geo) {
    const g = new Geo(null), piece: number[] = [];
    g.tree = [0, 0];
    drawCrown(g, tpl.boxes, 1, 0, 0, 0, piece);
    tpl.geo = { g, piece };
  }
  const { g, piece } = tpl.geo, nv = g.p.length / 3, n0 = geo.p.length / 3, tree = geo.tree ?? [cx, cz];
  for (let v = 0; v < nv; v++) {
    const [x, z] = turnXZ(g.p[v * 3], g.p[v * 3 + 2], turn), [nx, nz] = turnXZ(g.n[v * 3], g.n[v * 3 + 2], turn);
    geo.p.push(x + cx, g.p[v * 3 + 1], z + cz);
    geo.mo?.push(x + cx, g.p[v * 3 + 1], z + cz);
    geo.n.push(nx, g.n[v * 3 + 1], nz);
    geo.u.push(g.u[v * 2], g.u[v * 2 + 1]);
    if (g.uf.length) geo.uf.push(g.uf[v * 2], g.uf[v * 2 + 1]);
    geo.vis.push(g.vis[v] * light); geo.ao.push(g.ao[v]); geo.w.push(g.w[v]);
    geo.trees.push(tree[0], tree[1]); geo.grows.push(geo.grow);
  }
  for (let q = 0; q < nv / 4; q++) {                                    // (each face its own outline id, by its piece and turned direction)
    const ny = geo.n[(n0 + q * 4) * 3 + 1], nx = geo.n[(n0 + q * 4) * 3], nz = geo.n[(n0 + q * 4) * 3 + 2];
    const dir = geo.noDir ? 7 : ny > 0.5 ? 0 : ny < -0.5 ? 1 : nx > 0.5 ? 2 : nx < -0.5 ? 3 : nz > 0.5 ? 4 : nz < -0.5 ? 5 : 6;
    const fid = faceId(id + piece[q], geo.row, dir), far = geo.farId == null ? fid : faceId(geo.farId, 0, 7);
    geo.ids.push(fid, fid, fid, fid); geo.fars.push(far, far, far, far);
  }
  for (const i of g.i) geo.i.push(i + n0);
}
