// The ruins' tiles: the old colleges' honey-colored building stone (ashlar, rusticated courses, columns, tall windows: the shared
// building stone, plugins/shared/stone.ts) and the same stone weathered, cracked and mossed, with a rubble top.
// Each tile is painted with the same random numbers as in the original game (its seed below), so the pixels are the same.
import { S, hex, noise, px, rnd, specks, type Painter } from "craftax-3d/plugin";
import { HONEY_STONE, STONE_OUTLINES, line, seeded, stoneSet, type TileSet } from "../shared/stone";

export type { TileSet };

type G = CanvasRenderingContext2D;
// the ruins: ashlar weathered, cracked and mossed; a rubble top with grass coming through
const RUIN = hex("#b89a66"), MOSS = hex("#5d7a34");
const crack = (g: G) => { let x = (rnd() * S) | 0; for (let y = 0; y < S; y++) { px(g, x, y, RUIN, -48); if (rnd() < 0.4) x = Math.max(0, Math.min(S - 1, x + (rnd() < 0.5 ? -1 : 1))); } };
const wall: Painter = (g) => { noise(g, RUIN, 12); line(g, RUIN, -30, 0, 0, S, 1); line(g, RUIN, -30, 0, 8, S, 1); line(g, RUIN, -30, 6, 0, 1, 8); line(g, RUIN, -30, 11, 8, 1, 8); crack(g); specks(g, MOSS, 4, 2); };
const wall2: Painter = (g) => { noise(g, hex("#a68b5c"), 14); for (const y of [0, 5, 10]) line(g, RUIN, -34, 0, y, S, 1); crack(g); specks(g, MOSS, 7, 2); };
const top: Painter = (g) => { noise(g, hex("#9c8458"), 16); specks(g, hex("#6b5a3e"), 6, 3); specks(g, MOSS, 6, 2); specks(g, hex("#6ea33a"), 4, 1); };

// the honey stone the ruins stand in, by kind, with its place in the original's run (the kinds' order in stoneSet)
const honey = new Map(stoneSet("", ...HONEY_STONE).map(([kind, fn], k) => [kind, { fn, k }]));
const fromHoney = (kind: string) => { const { fn, k } = honey.get(kind)!; return kind in STONE_OUTLINES ? { paint: seeded(k, fn), outline: STONE_OUTLINES[kind] } : { paint: seeded(k, fn) }; };

/** The Ruins theme's tiles. */
// a stone you placed: freshly cut ashlar in the ruins' cream stone, two courses, clean and unweathered; its top a single dressed slab
const CUT = hex("#d2b98a");
const cut: Painter = (g) => {
  noise(g, CUT, 7);
  for (const y of [0, 8]) line(g, CUT, -36, 0, y, S, 1);
  for (const [x, y] of [[0, 0], [8, 0], [4, 8], [12, 8]]) line(g, CUT, -36, x, y, 1, 8);
  for (const [x, y, w] of [[1, 1, 7], [9, 1, 7], [0, 9, 4], [5, 9, 7], [13, 9, 3]]) line(g, CUT, 18, x, y, w, 1);   // (each block's lit top edge)
};
const cutLines: Painter = (g) => { g.beginPath(); g.moveTo(0, 32); g.lineTo(64, 32); for (const [x, y0, y1] of [[32, 0, 32], [16, 32, 64], [48, 32, 64]]) { g.moveTo(x, y0); g.lineTo(x, y1); } g.stroke(); };
const cutTop: Painter = (g) => { noise(g, CUT, 6); line(g, CUT, -30, 0, 0, S, 1); line(g, CUT, -30, 0, 0, 1, S); line(g, CUT, 16, 1, 1, S - 2, 1); };
const cutTopLines: Painter = (g) => g.strokeRect(2, 2, 60, 60);

export const RUINS_TILES: TileSet = {
  ruin_cut: { paint: seeded(40, cut), outline: cutLines }, ruin_cut_top: { paint: seeded(41, cutTop), outline: cutTopLines },
  ruin_ashlar: fromHoney("ashlar"), ruin_rustic: fromHoney("rustic"), ruin_column: fromHoney("column"),
  ruin_win_lo: fromHoney("win_lo"), ruin_win_hi: fromHoney("win_hi"),
  ruin_wall: { paint: seeded(16, wall) }, ruin_wall2: { paint: seeded(17, wall2) }, ruin_top: { paint: seeded(18, top) },
};
