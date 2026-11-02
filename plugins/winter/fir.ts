// Winter's trees: each overworld tree's crown is a fir instead of the standard one, built the same blocky way but taller, narrowing
// to a point: a ring of needles round the trunk's top, a full layer, a cross, then a column and a point above the standard crown. Eight
// of them (firPick; each tree wears one, turned by its tile), each with a corner or two missing, sometimes one more layer, a slight
// lean up top, its own point and snow lying unevenly. Snow shows from every side: on the tops, a ragged lip and clumps on the sides, a thin rim standing proud of
// each layer's edge (seen from below too), frost on the undersides' edges. Drawn in whole blocks (half blocks over the overhead
// views' short stub) like the standard crown, it sways in the wind as the standard leaves do, more toward its top. Laser and
// phosphor outline its layers.
import { hex, noise, px, rnd, S, SNOW, type CrownBox, type TreeAt } from "craftax-3d/plugin";
import { SHADE, seeded, snow, type TileSet } from "./tiles";

type G = CanvasRenderingContext2D;
const NEEDLES = hex("#24502c"), NEEDLES_L = hex("#3b7a3c"), NEEDLES_D = hex("#163a1e");
const needles = (g: G) => { noise(g, NEEDLES, 14); for (let i = 0; i < 26; i++) px(g, (rnd() * S) | 0, (rnd() * S) | 0, NEEDLES_L, (rnd() - 0.5) * 20); };
/** How many variants the tiers' sides and tops have (fir_side_0 …, fir_top_0 …). */
const KINDS = 3;

export const FIR_TILES: TileSet = {
  // a layer's side: needles, a ragged snow lip along its top (deep, thin, or broken), and clumps of snow clinging lower down
  ...Object.fromEntries(Array.from({ length: KINDS }, (_, v) => [`fir_side_${v}`, { paint: seeded(40 + v, (g: G) => {
    needles(g);
    for (let x = 0; x < S; x++) {
      const d = v === 1 ? 2 + ((rnd() * 2) | 0) : 2 + ((rnd() * 3) | 0) + (rnd() < 0.15 ? 1 : 0);
      if (v === 2 && rnd() < 0.25) continue;                              // (broken: needles showing)
      for (let y = 0; y < d; y++) px(g, x, y, y === d - 1 ? SHADE : SNOW, (rnd() - 0.5) * 10);
    }
    for (let i = 0; i < 3 + v; i++) {                                    // clumps: a few pixels of snow resting on the needles
      const x = (rnd() * (S - 3)) | 0, y = 5 + ((rnd() * 9) | 0);
      for (let k = 0; k < 2 + ((rnd() * 2) | 0); k++) px(g, x + k, y, SNOW, (rnd() - 0.5) * 12);
      if (rnd() < 0.6) px(g, x + 1, y + 1, SHADE, 0);
    }
  }) }])),
  // a tier's top: snow, needles showing at its edge; thinner on some, in patches on others
  ...Object.fromEntries(Array.from({ length: KINDS }, (_, v) => [`fir_top_${v}`, { paint: seeded(50 + v, (g: G) => {
    snow(g);
    const n = [12, 30, 60][v];
    for (let i = 0; i < n; i++) {
      const x = (rnd() * S) | 0, y = (rnd() * S) | 0;
      if (Math.min(x, y, S - 1 - x, S - 1 - y) < 2 + v) { px(g, x, y, NEEDLES_L, (rnd() - 0.5) * 16); if (v === 2 && rnd() < 0.5) px(g, Math.min(S - 1, x + 1), y, NEEDLES, 0); }
    }
  }) }])),
  // a layer's side where the next layer rests on it: needles only, no snow in the joint
  fir_side_bare: { paint: seeded(45, (g: G) => needles(g)) },
  // a layer's underside: dark needles, frosted pale toward its edges
  fir_under: { paint: seeded(42, (g: G) => {
    noise(g, NEEDLES_D, 10);
    for (let i = 0; i < 10; i++) px(g, (rnd() * S) | 0, (rnd() * S) | 0, NEEDLES, 0);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (Math.min(x, y, S - 1 - x, S - 1 - y) < 2 && rnd() < 0.45) px(g, x, y, SHADE, (rnd() - 0.5) * 20 - 20);
  }) },
};

// one layer of the fir: n × n pieces `cell` across from (x0, z0), some left out, from ya to yb, its snow's kinds
interface Layer { x0: number; z0: number; n: number; cell: number; ya: number; yb: number; gone: Set<number>; side: string; top: string }
const has = (l: Layer, i: number, j: number) => i >= 0 && j >= 0 && i < l.n && j < l.n && !l.gone.has(i * l.n + j);
// does a piece of layer l sit on (x, z) (the layer resting right on top of another: no snow in the joint between them)
const sitsOn = (l: Layer | undefined, yb: number, x: number, z: number) => !!l && Math.abs(l.ya - yb) < 1e-6 && has(l, Math.floor((x - l.x0) / l.cell), Math.floor((z - l.z0) / l.cell));

// the tree's own random numbers, from its tile
function rng(r: number, c: number): () => number {
  let h = (Math.imul(r, 73856093) ^ Math.imul(c, 19349663) ^ 0x5bd1e995) >>> 0;
  return () => ((h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0) / 4294967296);
}
interface Spec { n: number; cell: number; dx: number; dz: number; y: number; h: number; gone: number[]; kind: number }
const CORNERS = [0, 2, 6, 8];                                          // (of a 3 × 3 layer)
// the layers, in blocks of the full-size tree, from the crown's base (the trunk's top less one, as the standard crown)
function layers(variant: number): Spec[] {
  const R = rng(variant, 977), kind = () => Math.floor(R() * KINDS), lx = R() < 0.5 ? 0 : R() < 0.5 ? -1 : 1, lz = R() < 0.5 ? 0 : R() < 0.5 ? -1 : 1;
  const some = (k: number) => CORNERS.filter(() => R() < k);
  const out: Spec[] = [
    { n: 3, cell: 1, dx: 0, dz: 0, y: 0, h: 1, gone: [4, ...some(0.18)], kind: kind() },           // round the trunk's top
    { n: 3, cell: 1, dx: 0, dz: 0, y: 1, h: 1, gone: some(0.15), kind: kind() },                   // the full layer
  ];
  let y = 2;
  const crosses = R() < 0.4 ? 2 : 1;                                     // (some trees a layer taller)
  for (let i = 0; i < crosses; i++, y++) out.push({ n: 3, cell: 1, dx: 0, dz: 0, y, h: 1, gone: CORNERS.filter(() => R() < 0.85), kind: kind() });
  out.push({ n: 1, cell: 1, dx: lx * 0.25, dz: lz * 0.25, y, h: 1, gone: [], kind: kind() });  // the column, leaning a little
  y++;
  const tall = R(), point = tall < 0.35 ? 0.5 : tall < 0.75 ? 1 : 0.75;                           // the point: half a block across
  out.push({ n: 1, cell: 0.5, dx: lx * 0.5, dz: lz * 0.5, y, h: point, gone: [], kind: kind() });
  return out;
}

/** Which of the FIRS prebuilt firs the tree on (r, c) wears, and its quarter turns (Pete: eight, reused; Theme.crownPick: the game
 *  draws each once and copies it to every tree wearing it, turned, so the forest still varies). */
export const FIRS = 8;
export function firPick(r: number, c: number): { variant: number; turn: number } {
  const R = rng(r * 7 + 3, c * 13 + 5);
  return { variant: Math.floor(R() * FIRS), turn: Math.floor(R() * 4) };
}

/** The fir that stands in for a tree's crown (the trunk is the standard one), as boxes: a piece of needles each, and along each open
 *  side the snow rim; half size over the overhead views' short stub. */
export function firCrown(at: TreeAt): CrownBox[] {
  const k = at.overhead ? 0.5 : 1, cx = at.c + 0.5, cz = at.r + 0.5, base = at.trunk - (at.overhead ? 0.75 : 1);
  const RIM = 0.06 * k, RIM_H = 0.1 * k, out: CrownBox[] = [];
  const all: Layer[] = layers(firPick(at.r, at.c).variant).map((s) => {
    const cell = s.cell * k, w = s.n * cell;
    return { x0: cx - w / 2 + s.dx * k, z0: cz - w / 2 + s.dz * k, n: s.n, cell, ya: base + s.y * k, yb: base + (s.y + s.h) * k, gone: new Set(s.gone), side: `fir_side_${s.kind}`, top: `fir_top_${s.kind}` };
  });
  all.forEach((l, li) => {
    const piece = Math.min(7, li);                                       // (each layer outlined on its own)
    for (let i = 0; i < l.n; i++) for (let j = 0; j < l.n; j++) {
      if (!has(l, i, j)) continue;
      const x = l.x0 + i * l.cell, z = l.z0 + j * l.cell, x1 = x + l.cell, z1 = z + l.cell;
      // snow only on what's open to the sky: a piece with the next layer resting on it has no lip on its sides and no rim
      const covered = sitsOn(all[li + 1], l.yb, x + l.cell / 2, z + l.cell / 2);
      out.push({ x0: x, y0: l.ya, z0: z, x1, y1: l.yb, z1, top: l.top, side: covered ? "fir_side_bare" : l.side, bottom: "fir_under", piece });
      if (covered) continue;
      for (const [di, dj] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {       // the snow rim along each open side, proud of it
        if (has(l, i + di, j + dj)) continue;
        out.push({
          x0: di > 0 ? x1 : di < 0 ? x - RIM : x, x1: di > 0 ? x1 + RIM : di < 0 ? x : x1,
          z0: dj > 0 ? z1 : dj < 0 ? z - RIM : z, z1: dj > 0 ? z1 + RIM : dj < 0 ? z : z1,
          y0: l.yb - RIM_H, y1: l.yb + 0.01 * k, top: "snow_0", side: "snow_0", bottom: "snow_0", piece,
        });
      }
    }
  });
  return out;
}
