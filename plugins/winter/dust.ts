// A light dusting of snow: a tile's own picture with a few flecks and a thin patch or two on it, most of it showing through. The
// overworld's ore tops get it (so the ore stays easy to see), and its thinnest-snowed rock (theme.ts). Each is the standard tile under the flecks, with its own laser drawing.
import { px, rnd, S, SNOW, STONE_VARIANTS } from "craftax-3d/plugin";
import { SHADE, standard, standardLines, type TileSet } from "./tiles";

type G = CanvasRenderingContext2D;
// flecks, more of them toward the edges and corners (where snow settles), and a couple of thin patches of two or three pixels
function flecks(g: G, n: number, patches: number): void {
  for (let i = 0; i < n; i++) {
    const x = (rnd() * S) | 0, y = (rnd() * S) | 0, edge = Math.min(x, y, S - 1 - x, S - 1 - y);
    if (edge > 3 && rnd() < 0.5) continue;
    px(g, x, y, SNOW, (rnd() - 0.5) * 14);
  }
  for (let i = 0; i < patches; i++) {
    const x = (rnd() * (S - 3)) | 0, y = (rnd() * (S - 1)) | 0;
    for (let k = 0; k < 2 + ((rnd() * 2) | 0); k++) px(g, x + k, y, k ? SNOW : SHADE, (rnd() - 0.5) * 10);
  }
}

/** The ores' tops, dusted. */
export const ORE_DUST = ["coal_ore", "iron_ore", "diamond_ore", "sapphire_ore", "ruby_ore"];
/** The overworld's rock, its thinnest snow (next to coal and iron, and here and there). */
export const ROCK_DUST = STONE_VARIANTS;
const dusted = (names: string[], n: number, patches: number): TileSet =>
  Object.fromEntries(names.map((base) => ["dust_" + base, { paint: (g: G) => { standard(base)(g); flecks(g, n, patches); }, outline: standardLines(base) }]));

export const DUST_TILES: TileSet = dusted([...ORE_DUST, ...ROCK_DUST], 14, 2);
