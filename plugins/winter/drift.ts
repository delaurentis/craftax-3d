// The snow drifted round the trees (Winter's decorate), round a few trees standing on their own (none in a forest): two low
// levels, joined where two stand close: an outer one over every tile next to the tree (corners too), and a higher inner one a block
// round its trunk, a little lower again right at the trunk. Drawn in half-tile pieces with the plain snow tile, one outline piece
// for all of it in laser and phosphor.
import { B, type BlockAt, type Draw } from "craftax-3d/plugin";

const OUTER = 0.07, INNER = 0.14, DIP = 0.09;
const GROUND = new Set([B.GRASS, B.SAND, B.TREE]);
type Floor = NonNullable<BlockAt["floor"]>;
type Cold = (r: number, c: number) => boolean;
const isTree = (f: Floor, r: number, c: number) => r >= 0 && c >= 0 && r < f.H && c < f.W && f.map[r * f.W + c] === B.TREE;
const hash = (a: number, b: number) => (Math.imul(Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ 0x27d4eb2d, 2654435761) >>> 0) / 4294967296;
// a tree with a drift round it: about one in six, standing on its own (at most one other tree within two tiles: none in a forest)
function tree(f: Floor, r: number, c: number): boolean {
  if (!isTree(f, r, c) || hash(r, c) > 0.18) return false;
  let near = 0;
  for (let rr = r - 2; rr <= r + 2; rr++) for (let cc = c - 2; cc <= c + 2; cc++) if ((rr !== r || cc !== c) && isTree(f, rr, cc)) near++;
  return near <= 1;
}

// the drift's height at (x, z) (world units: x the column, z the row)
function heightAt(f: Floor, x: number, z: number, cold: Cold): number {
  const r = Math.floor(z), c = Math.floor(x);
  if (r < 0 || c < 0 || r >= f.H || c >= f.W || !GROUND.has(f.map[r * f.W + c]) || !cold(r, c)) return 0;
  let h = 0;
  for (let rr = r - 1; rr <= r + 1; rr++) for (let cc = c - 1; cc <= c + 1; cc++) {
    if (!tree(f, rr, cc)) continue;
    h = Math.max(h, Math.abs(x - cc - 0.5) < 1 && Math.abs(z - rr - 0.5) < 1 ? INNER : OUTER);
  }
  return h;
}
/** The drift on one tile: its four half-tile pieces' tops, and their sides where the next piece is lower. */
export function drift(at: BlockAt, d: Draw, cold: Cold): void {
  const f = at.floor;
  if (!f || at.level !== 0) return;
  const h = (x: number, z: number) => heightAt(f, x, z, cold), P = 0.5;
  let any = false;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    const x = at.c + i * P, z = at.r + j * P, y = h(x + P / 2, z + P / 2);
    if (!y) continue;
    if (!any) { d.piece(5); any = true; }                             // (all the drifts one piece)
    const sub = [i * P, j * P, P];
    if (tree(f, at.r, at.c)) {                                         // round the trunk: the quarter of the piece at the trunk a little lower
      const qx = i ? x : x + P / 2, qz = j ? z : z + P / 2, q = P / 2;
      for (let ii = 0; ii < 2; ii++) for (let jj = 0; jj < 2; jj++) {
        const sx = x + ii * q, sz = z + jj * q, low = sx === qx && sz === qz;
        d.face("top", sx, 0, sz, sx + q, low ? DIP : y, sz + q, "snow_0", 1, [sub[0] + ii * q, sub[1] + jj * q, q]);
      }
      const wsub = [0, 0, q, y - DIP];                                 // the dip's two walls, facing in
      if (i) d.face("nx", qx + q, DIP, qz, qx + q + 0.01, y, qz + q, "snow_0", 1, wsub); else d.face("px", qx - 0.01, DIP, qz, qx, y, qz + q, "snow_0", 1, wsub);
      if (j) d.face("nz", qx, DIP, qz + q, qx + q, y, qz + q + 0.01, "snow_0", 1, wsub); else d.face("pz", qx, DIP, qz - 0.01, qx + q, y, qz, "snow_0", 1, wsub);
    } else d.face("top", x, 0, z, x + P, y, z + P, "snow_0", 1, sub);
    for (const [fc, dx, dz] of [["pz", 0, 1], ["nz", 0, -1], ["px", 1, 0], ["nx", -1, 0]] as const) {
      const n = h(x + P / 2 + dx * P, z + P / 2 + dz * P);
      if (n < y) d.face(fc, x, n, z, x + P, y, z + P, "snow_0", 1, [sub[0], 0, P, y - n]);
    }
  }
  if (any) d.piece(-1);
}
