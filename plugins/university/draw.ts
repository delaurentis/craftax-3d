// Drawing a model (model.ts) turned to the side its set piece stands on, and the placement steps both scenes share: the side
// to build on (the first whose ground is clear of the ladders) and where the creatures standing there step aside to.
import { orient, type Draw, type GeneratedLevel, type Oriented, type Side, type Tile } from "craftax-3d/plugin";
import type { Model } from "./model";

const STEP: Record<string, [number, number, number]> = { top: [0, 1, 0], bottom: [0, -1, 0], pz: [0, 0, 1], nz: [0, 0, -1], px: [1, 0, 0], nx: [-1, 0, 0] };
const SIDE5 = ["top", "pz", "nz", "px", "nx"];
/** One box of a model, its visible faces, the local tile it starts in [row, column], and its laser piece. */
interface Part { lt: Tile; box: [number, number, number, number, number, number]; tex: string; faces: string[]; piece: number; sub?: number[] }

// a model's parts, worked out once: every block its own laser piece with its hidden faces left out (and no bottom on the ground),
// the half blocks the same, each extra a piece of its own
const partsOf = new WeakMap<Model, Part[]>();
function parts(m: Model): Part[] {
  let out = partsOf.get(m);
  if (out) return out;
  out = [];
  for (const [k, tex] of m.cells) {
    const [x, y, z] = k.split(",").map(Number);
    const faces = Object.keys(STEP).filter((f) => { const [dx, dy, dz] = STEP[f]; return !m.cells.has(`${x + dx},${y + dy},${z + dz}`) && !(f === "bottom" && y === 0); });
    if (faces.length) out.push({ lt: [z, x], box: [x, y, z, x + 1, y + 1, z + 1], tex, faces, piece: (((y * 211 + z + 100) * 251 + x + 100) >>> 0) % 1300000 });
  }
  for (const [k, tex] of m.fine) {                                    // the half-size blocks: half of the tile each, so pixels stay full size
    const [X, Y, Z] = k.split(",").map(Number), x = X / 2, y = Y / 2, z = Z / 2;
    const faces = Object.keys(STEP).filter((f) => { const [dx, dy, dz] = STEP[f]; return !m.fine.has(`${X + dx},${Y + dy},${Z + dz}`); });
    if (faces.length) out.push({ lt: [Math.floor(z), Math.floor(x)], box: [x, y, z, x + 0.5, y + 0.5, z + 0.5], tex, faces, piece: 1300000 + ((((Y * 211 + Z + 300) * 251 + X + 300) >>> 0) % 1300000), sub: [(X & 1) * 0.5, (Y & 1) * 0.5, 0.5] });
  }
  m.extras.forEach(([x0, y0, z0, x1, y1, z1, tex], k) => out!.push({ lt: [Math.floor(z0), Math.floor(x0)], box: [x0, y0, z0, x1, y1, z1], tex, faces: SIDE5, piece: 2600000 + k }));
  partsOf.set(m, out);
  return out;
}

/** Draws the parts of m whose tile (on the map, turned by o) passes `keep`. */
export function drawModel(m: Model, o: Oriented, d: Draw, keep: (r: number, c: number) => boolean): void {
  const t = o.draw(d);
  for (const p of parts(m)) {
    const [r, c] = o.tile(p.lt[0], p.lt[1]);
    if (!keep(r, c)) continue;
    t.piece(p.piece);
    const [x0, y0, z0, x1, y1, z1] = p.box;
    for (const f of p.faces) t.face(f, x0, y0, z0, x1, y1, z1, p.tex, 1, p.sub);
  }
  t.piece(-1);
}
/** Is (x, y, z) (world voxel) one of m's blocks? */
export const solidIn = (m: Model, o: Oriented) => (x: number, y: number, z: number) => { const [lr, lc] = o.local(z, x); return m.cells.has(`${lc},${y},${lr}`); };
/** The parts of m in a chunk (map tiles d.r0 … d.c1), and those past the map's edge. */
export const inChunk = (d: Draw) => (r: number, c: number) => r >= d.r0 && r < d.r1 && c >= d.c0 && c < d.c1;
export const offMap = (H: number, W: number) => (r: number, c: number) => r < 0 || c < 0 || r >= H || c >= W;

const LADDERS = new Set([2, 3, 4]);                                    // the items layer's ladders (down, up, down sealed)
/** The first side (north, east, west, south) whose local tiles `area(lr, lc)` hold no ladder, with those tiles on the map. */
export function clearSide(lv: GeneratedLevel, area: (lr: number, lc: number, o: Oriented) => boolean): { o: Oriented; cells: Tile[] } | null {
  const [H, W] = lv.size;
  for (const side of ["north", "east", "west", "south"] as Side[]) {
    const o = orient(side, H, W), cells: Tile[] = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { const [lr, lc] = o.local(r, c); if (area(lr, lc, o)) cells.push([r, c]); }
    if (!cells.some(([r, c]) => LADDERS.has(lv.items[r * W + c]))) return { o, cells };
  }
  return null;
}

const GRASS = 2, SAND = 6, PATH = 7, WATER = 3;
const groundOf = (b: number) => (b === WATER ? 1 : b === GRASS || b === SAND || b === PATH ? 0 : -1);
/** Each creature standing on `cells` steps to the nearest tile off them on the same kind of ground (land or water), free of other
 *  creatures, items and the spawn. The engine checks each step by the creature's own rule (CraftaxGame.moveMob). */
export function stepAside(lv: GeneratedLevel, cells: readonly Tile[]): { from: Tile; to: Tile }[] {
  const [H, W] = lv.size, inside = new Set(cells.map(([r, c]) => r * W + c)), taken = new Set(lv.creatures.map((m) => m.pos[0] * W + m.pos[1]));
  taken.add(lv.spawn[0] * W + lv.spawn[1]);
  const moves: { from: Tile; to: Tile }[] = [];
  for (const m of lv.creatures) {
    const [r, c] = m.pos;
    if (!inside.has(r * W + c)) continue;
    const kind = groundOf(lv.map[r * W + c]);
    find: for (let d = 1; d < Math.max(H, W); d++) for (let dr = -d; dr <= d; dr++) for (let dc = -d; dc <= d; dc++) {
      if (Math.abs(dr) !== d && Math.abs(dc) !== d) continue;
      const rr = r + dr, cc = c + dc, j = rr * W + cc;
      if (rr < 0 || cc < 0 || rr >= H || cc >= W || inside.has(j) || taken.has(j) || lv.items[j] || groundOf(lv.map[j]) !== kind || kind < 0) continue;
      taken.add(j); moves.push({ from: [r, c], to: [rr, cc] });
      break find;
    }
  }
  return moves;
}
