// The winter tiles for the overworld: snow lying on the ground, the rock and the treetops, with a hint of what is under it where that
// matters to the game (a path's joints, sand along the shore, the table's planks); snow along the top of the grass's and the rock's
// sides (no green showing: snow over grass is all snow); and the standard water, grass and leaves a little colder. Lying snow, the shore, the path and dug-out dirt each come in several variants
// a tile picks by its position (theme.ts), with no marks bold enough to show a pattern repeating across a field. A tile drawn over a
// standard one (the rock's sides, the table) starts from that tile's own pixels and its laser drawing, so the rock keeps its cracks.
import { hex, noise, px, R, rnd, S, SAND, SNOW, STONE, STONE_VARIANTS, standardOutline, standardTile, type Painter, type RGB } from "craftax-3d/plugin";

type G = CanvasRenderingContext2D;
export type TileSet = Record<string, { paint: Painter; outline?: Painter }>;
export const SHADE = hex("#c9d6e3");
const SPARK = hex("#ffffff"), DIRT = hex("#866043");

// a standard tile as the game paints it (its own random numbers), and its laser drawing
export const standard = standardTile, standardLines = standardOutline;
/** A painter with its own random numbers (k: any number of this plugin's own), so each variant differs and stays the same. */
export const seeded = (k: number, fn: Painter): Painter => (g) => { R.seed = 1 + (900 + k) * 7919; fn(g); };
/** A standard tile with its colors multiplied by [r, g, b] (see-through pixels stay see-through). */
export const tint = (name: string, k: [number, number, number]): Painter => (g) => {
  standard(name)(g);
  const im = g.getImageData(0, 0, S, S), d = im.data;
  for (let i = 0; i < d.length; i += 4) for (let j = 0; j < 3; j++) d[i + j] = Math.min(255, d[i + j] * k[j]);
  g.putImageData(im, 0, 0);
};

// a soft field over the tile: a few round blobs (centers anywhere, some past the edge), 0 … about 1
function field(blobs: number, r0: number, r1: number): (x: number, y: number) => number {
  const b = Array.from({ length: blobs }, () => [rnd() * 20 - 2, rnd() * 20 - 2, r0 + rnd() * (r1 - r0)]);
  return (x, y) => b.reduce((m, [bx, by, br]) => Math.max(m, 1 - Math.hypot(x - bx, y - by) / br), 0);
}
// lying snow: fine grain and a faint drift shading, no lines or spots that would read as a pattern; a glint or two
export function snow(g: G): void {
  const drift = field(3, 4, 9);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(g, x, y, SNOW, (rnd() - 0.5) * 7 - 5 * drift(x, y));
  for (let i = 0; i < 2; i++) if (rnd() < 0.7) px(g, (rnd() * S) | 0, (rnd() * S) | 0, SPARK);
}
// the shore: sand with snow drifted over it in patches, their edges ragged, a few flakes on the bare sand
function snowySand(g: G): void {
  const cover = field(2 + ((rnd() * 3) | 0), 3, 8);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = cover(x, y) + (rnd() - 0.5) * 0.45;
    if (v > 0.32) px(g, x, y, v < 0.42 ? SHADE : SNOW, (rnd() - 0.5) * 8);
    else px(g, x, y, SAND, (rnd() - 0.5) * 22 + (v > 0.2 ? 10 : 0));
    if (v <= 0.32 && rnd() < 0.05) px(g, x, y, SNOW, -6);
  }
}
// bare dirt (a dug-out floor): its own dark earth, snow drifted over it in patches as on the shore, a few flakes between
const snowyDirt = (base: string): Painter => (g) => {
  standard(base)(g);
  R.seed = 1 + (940 + base.length + Number(base.slice(-1))) * 7919;
  const cover = field(2 + ((rnd() * 3) | 0), 3, 7);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const v = cover(x, y) + (rnd() - 0.5) * 0.45;
    if (v > 0.36) px(g, x, y, v < 0.46 ? SHADE : SNOW, (rnd() - 0.5) * 8);
    else if (rnd() < 0.04) px(g, x, y, SNOW, -10);
  }
};
// a path: trodden snow, grey-blue and uneven, the paving's joints only here and there through it
function snowyPath(g: G): void {
  const worn = field(3, 3, 7);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(g, x, y, hex("#d4dde6"), (rnd() - 0.5) * 9 - 8 * worn(x, y));
  const joint = (x: number, y: number) => { if (rnd() < 0.45) px(g, x, y, hex("#b4bec8"), (rnd() - 0.5) * 8); };
  for (let i = 0; i < S; i++) { joint(i, 0); joint(0, i); joint(i, 8); if (i < 8) { joint(8, i); joint(4, i + 8); } }
}
// snow along a side's top, `deep` (2) to 4 pixels deep, or thin (1: 1-2 pixels, broken here and there)
function lip(g: G, under?: RGB, deep = 2): void {
  for (let x = 0; x < S; x++) {
    if (deep < 2 && rnd() < 0.2) continue;
    const d = deep + ((rnd() * (deep < 2 ? 1.6 : 2.2)) | 0) + (deep > 1 && rnd() < 0.12 ? 1 : 0);
    for (let y = 0; y < d; y++) px(g, x, y, y === d - 1 ? SHADE : SNOW, (rnd() - 0.5) * 10);
    if (under) px(g, x, d, under, (rnd() - 0.5) * 24);
  }
}
const lipLine: Painter = (g) => { g.beginPath(); g.moveTo(0, 11); for (let x = 8; x <= 64; x += 8) g.lineTo(x, 9 + ((x * 7) % 5)); g.stroke(); };
// snow over a tile, thick at its edges and thinning toward its middle (k: how much of the tile it covers)
function dust(g: G, k: number): void {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const edge = Math.min(x, y, S - 1 - x, S - 1 - y);
    if (rnd() < k * (edge < 2 ? 1.6 : 0.8 - edge * 0.06)) px(g, x, y, SNOW, (rnd() - 0.5) * 12);
  }
}

/** How many variants lying snow, the shore, the path and the rock's top have (snow_0 …, snow_sand_0 …, snow_path_0 …, snow_rock_0 …). */
export const VARIANTS = { snow: 6, snow_sand: 6, snow_path: 4, snow_rock: 5, snow_rock_patchy: 4, snow_dirt: 4 };
const variants = (name: keyof typeof VARIANTS, k0: number, fn: Painter, outline?: Painter): TileSet =>
  Object.fromEntries(Array.from({ length: VARIANTS[name] }, (_, i) => [`${name}_${i}`, { paint: seeded(k0 + i, fn), outline }]));

export const WINTER_TILES: TileSet = {
  ...variants("snow", 0, snow),
  ...variants("snow_sand", 10, snowySand),
  ...variants("snow_path", 20, snowyPath, standardLines("path")),
  // dug-out dirt (Pete: a bit of snow on it, like the shore), over each of the dirt floor's four
  ...Object.fromEntries(Array.from({ length: VARIANTS.snow_dirt }, (_, i) => [`snow_dirt_${i}`, { paint: snowyDirt(`floor_dirt${i}`), outline: standardLines(`floor_dirt${i}`) }])),
  // rock under snow: now and then a pale grey stone showing through
  ...variants("snow_rock", 60, (g) => { snow(g); for (let i = 0, n = (rnd() * 4) | 0; i < n; i++) { const x = (rnd() * 15) | 0, y = (rnd() * 15) | 0; px(g, x, y, STONE, 30); if (rnd() < 0.4) px(g, x + 1, y, STONE, 45); } }),
  snow_grass_side: { paint: seeded(31, (g) => { noise(g, DIRT, 16); lip(g); }), outline: lipLine },
  snow_leaves: { paint: seeded(32, (g) => { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { if (rnd() < 0.1) continue; const green = rnd() < 0.22; px(g, x, y, green ? hex("#2f6326") : SNOW, (rnd() - 0.5) * (green ? 40 : 14)); } }) },
  // the table, a wooden block, a stone you placed, a chest's lid: their own tile under a dusting, their own laser drawing
  ...Object.fromEntries([["snow_table", "table_top"], ["snow_planks", "planks"], ["snow_placed", "placed_stone"], ["snow_chest", "chest_top"]].map(([n, base]) =>
    [n, { paint: (g: G) => { standard(base)(g); dust(g, 0.45); }, outline: standardLines(base) }])),
  // rock with snow lying in patches, grey between them
  ...variants("snow_rock_patchy", 70, (g) => {
    const cover = field(2 + ((rnd() * 3) | 0), 3, 8);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const v = cover(x, y) + (rnd() - 0.5) * 0.4;
      px(g, x, y, v > 0.3 ? (v < 0.4 ? SHADE : SNOW) : STONE, (rnd() - 0.5) * (v > 0.3 ? 8 : 26));
    }
  }),
  // the rock's sides, the top block: each stone variant with snow along its top, deep or thin
  ...Object.fromEntries(STONE_VARIANTS.flatMap((v) => [["snow_lip_" + v, 2], ["snow_lip_thin_" + v, 1]].map(([n, d]) => [n, {
    paint: (g: G) => { standard(v)(g); lip(g, undefined, d as number); },
    outline: (g: G) => { standardLines(v)(g); lipLine(g); },
  }]))),
};
