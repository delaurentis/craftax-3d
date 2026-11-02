// Tropical's tiles and which faces wear them: palm fronds, bark and coconuts; beaches fading into the grass over four tiles; red clay
// for the bare dirt and volcanic rock for the rock, ore, floor and placed stone, on the overworld only (caves and dungeons keep the
// standard ones). Tiles are added to the atlas in order, so the ones it must have come first.
import * as THREE from "three";
import { STONE_VARIANTS, type BlockAt, type Face, type Painter, type ThemeTile } from "craftax-3d/plugin";

export const S = 16;                                                     // a tile's pixels
type G = CanvasRenderingContext2D;

// ---- a little seeded randomness: the same tree, creature or tile looks the same every time ----
export const rng = (seed: number) => { let h = (seed ^ 0x5bd1e995) >>> 0; return () => ((h = (Math.imul(h ^ (h >>> 15), 0x2c1b3c6d) + 0x9e3779b9) >>> 0) / 4294967296); };
const shade = (hex: number, k: number) => "#" + new THREE.Color(hex).multiplyScalar(k).getHexString();
const speckle = (g: G, hex: number, seed: number, spread = 0.18) => {
  const R = rng(seed);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { g.fillStyle = shade(hex, 1 - spread / 2 + R() * spread); g.fillRect(x, y, 1, 1); }
};

// ---- fronds, their undersides, bark, coconuts ----
// leaflets: a few darker flecks, no stripe (the tile doesn't turn with the frond, so a midrib only lined up on fronds along one axis)
const frond: Painter = (g) => {
  speckle(g, 0x4f9a2e, 11);
  const R = rng(16);
  g.fillStyle = "#3a7a24"; for (let i = 0; i < 18; i++) g.fillRect((R() * S) | 0, (R() * S) | 0, 2, 1);
};
// grey-brown, ridged across at uneven heights, each ridge lit below
export const palmBark: Painter = (g) => {
  speckle(g, 0xb09474, 13, 0.12);
  for (const [y, x0, x1] of [[1, 0, 16], [4, 0, 11], [6, 5, 16], [10, 0, 16], [13, 0, 7], [14, 9, 16]]) {
    g.fillStyle = "#6e5840"; g.fillRect(x0, y, x1 - x0, 1);
    g.fillStyle = "#ccb290"; g.fillRect(x0, y + 1, x1 - x0, 1);
  }
};
// the cut end: rings
export const barkTop: Painter = (g) => { speckle(g, 0xa08668, 15, 0.12); g.fillStyle = "#6c5640"; g.fillRect(4, 4, 8, 1); g.fillRect(4, 11, 8, 1); g.fillRect(4, 4, 1, 8); g.fillRect(11, 4, 1, 8); };

export const TROPICAL_TILES: Record<string, ThemeTile> = {
  palm_frond: { paint: frond },
  palm_frond_under: { paint: (g) => speckle(g, 0x3a7424, 12) },
  palm_bark: { paint: palmBark },
  coconut: { paint: (g) => { speckle(g, 0x5a3a1c, 14, 0.3); g.fillStyle = "#3a2410"; g.fillRect(5, 5, 2, 2); g.fillRect(9, 5, 2, 2); g.fillRect(7, 9, 2, 2); } },
};

// ---- red clay (Pete): the bare dirt floor on the overworld (the game's floor_dirt0..3) as packed earth with red clay in it: a muted
// red-brown (Pete: the first, bright and smooth, read as lava) in grainy static, every pixel its own shade, nothing lighter than the
// earth (Pete: pale grains and pebbles read as granite), a few dark clods and the odd crack, four ways
for (let v = 0; v < 4; v++) TROPICAL_TILES["clay_" + v] = { paint: (g) => {
  speckle(g, v % 2 ? 0x5e3a2c : 0x653e31, 60 + v, 0.5);                  // (Pete: a little darker again)
  const R = rng(70 + v);
  for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(30,16,10,${(0.15 + R() * 0.3).toFixed(2)})`; g.fillRect((R() * S) | 0, (R() * S) | 0, 1, 1); }   // static, darker
  g.fillStyle = "#3e2519";
  for (let i = 0; i < 4 + v; i++) g.fillRect((R() * 15) | 0, (R() * 15) | 0, 1 + ((R() * 2) | 0), 1);   // clods
  if (v === 2) { g.fillStyle = "#34201a"; let x = 3; for (let y = 2; y < 13; y++) { g.fillRect(x, y, 1, 1); if (R() < 0.4) x += R() < 0.5 ? -1 : 1; } }   // a crack
} };
const CLAY = /^floor_dirt(\d)$/;

// ---- volcanic rock (Pete): the overworld's rock and ore about 36 % darker and a little warmer (20 %, then 20 % more), as copies of
// the game's own tiles (from + tint); the stone you place and the path too, first (copies the atlas has room for); and the stone floor
// mined rock leaves (floor_a_* and floor_b_*: the rock patterns in a floor grey) drawn with the volcanic rock itself, the same tone
// exactly (FLOOR: no tiles of its own)
const ROCK = ["placed_stone", "path", ...STONE_VARIANTS, "coal_ore", "iron_ore", "diamond_ore", "sapphire_ore", "ruby_ore"];
const FLOOR = /^floor_[ab]_(stone\w*)$/;
const VOLCANIC = 0xb49d90;                                               // (×0.70 red, ×0.62 green, ×0.56 blue)
for (const n of ROCK) TROPICAL_TILES["volcanic_" + n] = { from: n, tint: VOLCANIC };
const isRock = new Set(ROCK);

// ---- beach grass: the grass within four tiles of sand (corners too) a mix of sand and grass, grassier each tile out; each ring in
// three variants so it doesn't repeat. About 20 % grass, 50 %, 60 %, 85 % (Pete): tufts 21, 67, 90, 187 (grass covers about 1 - e^(-n/96))
const RINGS = [21, 67, 90, 187];
const beach = (v: number, tufts: number): ThemeTile => ({ paint: (g) => {
  speckle(g, 0xdbd3a0, 30 + v, 0.12);                                    // the game's sand
  const R = rng(40 + v), GR = ["#5f9f35", "#4f8f2c", "#6faf40"];
  for (let i = 0; i < tufts; i++) {                                      // tufts of grass, two or three pixels each
    const x = (R() * S) | 0, y = (R() * S) | 0;
    g.fillStyle = GR[(R() * 3) | 0];
    g.fillRect(x, y, 1, 1); g.fillRect((x + 1) % S, y, 1, 1); if (R() < 0.6) g.fillRect(x, (y + 1) % S, 1, 1);
  }
} });
for (let v = 0; v < 3; v++) RINGS.forEach((n, i) => (TROPICAL_TILES["beach" + (i + 1) + "_" + v] = beach(v, n)));

/** How far the nearest sand is from this tile, in tiles (corners count): 1 to 4, or 0 for further. */
export function sandRing(at: BlockAt): number {
  const f = at.floor;
  if (!f) return 0;
  let ring = 0;
  for (let dr = -4; dr <= 4; dr++) for (let dc = -4; dc <= 4; dc++) {
    const r = at.r + dr, c = at.c + dc;
    if ((dr || dc) && r >= 0 && c >= 0 && r < f.H && c < f.W && f.map[r * f.W + c] === 13) {   // (13: Craftax's sand)
      const d = Math.max(Math.abs(dr), Math.abs(dc));
      if (d === 1) return 1;
      ring = ring ? Math.min(ring, d) : d;
    }
  }
  return ring;
}

/** Theme.tile: on the overworld, rock, floor and placed stone volcanic, dirt clay, and grass near sand (the grass under a tree too,
 *  Pete) beach. (2: grass, 5: a tree on grass) */
export function tropicalTile(name: string, at: BlockAt, face: Face): string | undefined {
  if (at.level !== 0) return undefined;
  if (isRock.has(name)) return "volcanic_" + name;
  const fl = FLOOR.exec(name);
  if (fl) return "volcanic_" + fl[1];
  const cl = CLAY.exec(name);
  if (cl) return "clay_" + cl[1];
  if (face !== "top" || (at.block !== 2 && at.block !== 5) || !name.startsWith("grass_top")) return undefined;
  const ring = sandRing(at);
  return ring ? "beach" + ring + "_" + ((at.r * 7 + at.c * 13) % 3) : undefined;
}
