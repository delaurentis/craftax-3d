// Building stone shared by the example plugins (a helper, not a plugin): the old colleges' honey-colored stone, ashlar, rusticated
// courses, columns, tall windows and arches, cornices and balustrades, each with its laser drawing. The Ruins theme stands its broken
// walls in it (plugins/ruins/tiles.ts) and the University scene pack builds the Radcliffe Camera and its campus from it
// (plugins/university/tiles.ts), in this honey stone and a cream one. Each tile is painted with the same random numbers as in the
// original game (seeded below), so the pixels are the same.
import { R, S, hex, noise, px, rgb, rnd, type Painter, type RGB } from "craftax-3d/plugin";

type G = CanvasRenderingContext2D;
export type TileSet = Record<string, { paint: Painter; outline?: Painter }>;
export const line = (g: G, c: RGB, k: number, x: number, y: number, w: number, h: number) => { g.fillStyle = rgb(c, k); g.fillRect(x, y, w, h); };

/** The honey stone's colors (the real Radcliffe Camera's), and its darker joints. */
export const HONEY_STONE: [RGB, RGB] = [hex("#cfae74"), hex("#9c7c48")];

/** One set of building stone, each tile named pre + its kind (ashlar, rustic, window, win_lo, win_hi, arch_lo, arch_hi, column,
 *  cornice, balustrade), in that order. */
export function stoneSet(pre: string, HONEY: RGB, HONEY_D: RGB): [string, Painter][] {
  const out: [string, Painter][] = [], def = (name: string, fn: Painter) => { out.push([pre + name, fn]); };
  const DARK = hex("#211c17"), GLASS = hex("#2b3540");
  def("ashlar", (g) => { noise(g, HONEY, 8); line(g, HONEY_D, 10, 0, 0, S, 1); line(g, HONEY_D, 10, 0, 8, S, 1); line(g, HONEY_D, 10, 5, 0, 1, 8); line(g, HONEY_D, 10, 12, 8, 1, 8); });
  const rustic = (g: G) => { noise(g, HONEY, 10); for (const y of [0, 5, 10]) { line(g, HONEY_D, -16, 0, y, S, 1); line(g, HONEY, 16, 0, y + 1, S, 1); } };
  def("rustic", rustic);
  def("window", (g) => {                                               // a round-headed window with glazing bars and a sill (the drum's)
    noise(g, HONEY, 8);
    for (let y = 2; y < 14; y++) for (let x = 4; x < 12; x++) if (y >= 6 || Math.hypot(x - 7.5, y - 6) <= 3.6) px(g, x, y, (x === 7 || x === 8 || y === 9) ? hex("#8a7450") : GLASS, (rnd() - 0.5) * 10);
    line(g, HONEY, 20, 3, 14, 10, 1);
  });
  // the tall windows and the arches, two blocks high: the lower block and the round-headed upper one
  const glazed = (g: G, x: number, y: number) => px(g, x, y, (x === 7 || x === 8 || y % 5 === 0) ? hex("#8a7450") : GLASS, (rnd() - 0.5) * 10);
  def("win_lo", (g) => { noise(g, HONEY, 8); for (let y = 0; y < 13; y++) for (let x = 4; x < 12; x++) glazed(g, x, y); line(g, HONEY, 22, 3, 13, 10, 2); });
  def("win_hi", (g) => { noise(g, HONEY, 8); for (let y = 4; y < S; y++) for (let x = 4; x < 12; x++) if (y >= 8 || Math.hypot(x - 7.5, y - 8) <= 4) glazed(g, x, y); line(g, HONEY, 22, 7, 2, 2, 2); });
  const gate = (g: G, x: number, y: number) => px(g, x, y, (x % 3 === 0 || y === 6) ? hex("#3a342c") : DARK, (rnd() - 0.5) * 8);
  def("arch_lo", (g) => { rustic(g); for (let y = 0; y < S; y++) for (let x = 3; x < 13; x++) gate(g, x, y); });
  def("arch_hi", (g) => { rustic(g); for (let y = 3; y < S; y++) for (let x = 3; x < 13; x++) if (y >= 8 || Math.hypot(x - 7.5, y - 8) <= 5) gate(g, x, y); line(g, HONEY, 22, 7, 1, 2, 3); });
  def("column", (g) => { noise(g, HONEY, 6); for (let x = 1; x < S; x += 3) { line(g, HONEY_D, 6, x, 0, 1, S); line(g, HONEY, 16, x + 1, 0, 1, S); } });
  def("cornice", (g) => {                                              // a moulding: a shadowed band, a row of dentils, a lit lip
    noise(g, HONEY, 8); line(g, HONEY_D, -10, 0, 0, S, 2); line(g, HONEY, 22, 0, 2, S, 1);
    for (let x = 0; x < S; x += 3) line(g, HONEY_D, -4, x, 5, 1, 3);
    line(g, HONEY, 18, 0, 13, S, 1); line(g, HONEY_D, -14, 0, 15, S, 1);
  });
  def("balustrade", (g) => {                                           // a rail top and bottom, balusters between with dark gaps
    noise(g, HONEY, 8);
    // two vase-shaped balusters to a block (four looked like a comb): a body four wide, narrowing to a neck at the top and foot
    for (let y = 2; y < 12; y++) for (let x = 0; x < S; x++) { const u = x % 8, neck = y < 4 || y > 9; if (neck ? u < 3 || u > 4 : u < 2 || u > 5) px(g, x, y, DARK, 6); }
    line(g, HONEY, 18, 0, 0, S, 1); line(g, HONEY_D, -8, 0, 12, S, 1);
  });
  return out;
}

/** A tile painted with the original game's random numbers: it held the Oxford tiles at atlas places 267 … 298 and seeded each tile
 *  by its place (1 + place × 7919); k: the tile's place in that run. */
export const seeded = (k: number, fn: Painter): Painter => (g) => { R.seed = 1 + (267 + k) * 7919; fn(g); };

// line drawings for laser and phosphor (64 × 64, white lines on black) for the stone with a shape worth tracing; the plain stone has
// none and draws as the standard laser surfaces do
export const arch = (g: G, x0: number, x1: number, top: number) => { const r = (x1 - x0) / 2; g.beginPath(); g.moveTo(x0, 64); g.lineTo(x0, top + r); g.arc(x0 + r, top + r, r, Math.PI, 0); g.lineTo(x1, 64); g.stroke(); };
/** The stone's line drawings, by kind. */
export const STONE_OUTLINES: Record<string, Painter> = {
  window: (g) => { arch(g, 16, 48, 8); g.beginPath(); g.moveTo(32, 20); g.lineTo(32, 56); g.moveTo(16, 38); g.lineTo(48, 38); g.moveTo(12, 58); g.lineTo(52, 58); g.stroke(); },
  win_lo: (g) => { g.beginPath(); g.moveTo(16, 0); g.lineTo(16, 52); g.lineTo(48, 52); g.lineTo(48, 0); g.moveTo(32, 0); g.lineTo(32, 52); g.moveTo(16, 22); g.lineTo(48, 22); g.stroke(); },
  win_hi: (g) => { arch(g, 16, 48, 16); g.beginPath(); g.moveTo(32, 30); g.lineTo(32, 64); g.moveTo(16, 42); g.lineTo(48, 42); g.stroke(); },
  arch_lo: (g) => { g.beginPath(); g.moveTo(12, 0); g.lineTo(12, 64); g.moveTo(52, 0); g.lineTo(52, 64); g.stroke(); },
  arch_hi: (g) => arch(g, 12, 52, 12),
  column: (g) => { g.beginPath(); for (const x of [8, 20, 32, 44, 56]) { g.moveTo(x, 0); g.lineTo(x, 64); } g.stroke(); },
  balustrade: (g) => { g.beginPath(); g.moveTo(0, 6); g.lineTo(64, 6); g.moveTo(0, 48); g.lineTo(64, 48); g.stroke(); for (const x of [16, 48]) { g.beginPath(); g.ellipse(x, 28, 7, 14, 0, 0, Math.PI * 2); g.stroke(); } },
};

