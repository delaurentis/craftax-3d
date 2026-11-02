// The painting kit every block texture shares: the 16 × 16 tile, the seeded random numbers, pixel and noise
// helpers, the base colors, and def(), which registers a painter (its order is the atlas order).

/** A colour as [r, g, b], 0-255. */
export type RGB = number[];
/** A tile painter: draws one 16 × 16 tile onto g. */
export type Painter = (g: CanvasRenderingContext2D) => void;

export const S = 16, COLS = 16, ROWS = 32, OUTLINE_ROWS = 16;                                // (32 rows: 16 ran out once the floors came, Pete)
export const NAMES: string[] = [];
export const painters: Record<string, Painter> = {};
export const canvas = document.createElement("canvas");
canvas.width = S * COLS; canvas.height = S * ROWS;
export const ctx = canvas.getContext("2d")!;

export const R = { seed: 1 };                                                 // the painters' random seed (R.seed = n before a tile)
export const rnd = () => ((R.seed = (R.seed * 16807) % 2147483647) / 2147483647);
export const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
export const rgb = (c: RGB, k = 0) => `rgb(${clamp(c[0] + k)},${clamp(c[1] + k)},${clamp(c[2] + k)})`;
export const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

export function px(g: CanvasRenderingContext2D, x: number, y: number, c: RGB, k = 0) { g.fillStyle = rgb(c, k); g.fillRect(x, y, 1, 1); }
export function noise(g: CanvasRenderingContext2D, base: RGB, amp: number) { for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) px(g, x, y, base, (rnd() - 0.5) * 2 * amp); }
export function specks(g: CanvasRenderingContext2D, col: RGB, n: number, size = 2) {
  for (let i = 0; i < n; i++) {
    const x = Math.floor(rnd() * (S - size)), y = Math.floor(rnd() * (S - size));
    for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) if (rnd() < 0.8) px(g, x + dx, y + dy, col, (rnd() - 0.5) * 30);
  }
}
export function bricks(g: CanvasRenderingContext2D, base: RGB, mortar: RGB, amp = 14) {
  noise(g, base, amp);
  g.fillStyle = rgb(mortar);
  for (let y = 0; y < S; y += 4) g.fillRect(0, y, S, 1);
  for (let row = 0; row < 4; row++) for (let x = (row % 2) * 4; x < S; x += 8) g.fillRect(x, row * 4, 1, 4);
}
export function planks(g: CanvasRenderingContext2D, base: RGB) {
  noise(g, base, 10);
  g.fillStyle = rgb(base, -40);
  for (let y = 3; y < S; y += 4) g.fillRect(0, y, S, 1);
  for (let row = 0; row < 4; row++) g.fillRect(((row * 7) % 13) + 1, row * 4, 1, 3);
}
export function logSide(g: CanvasRenderingContext2D, bark: RGB) {
  for (let x = 0; x < S; x++) { const k = (rnd() - 0.5) * 30; for (let y = 0; y < S; y++) px(g, x, y, bark, k + (rnd() - 0.5) * 12 + (x % 4 === 0 ? -25 : 0)); }
}
export function logTop(g: CanvasRenderingContext2D, bark: RGB, wood: RGB) {
  noise(g, wood, 8);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const r = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (r > 6.5) px(g, x, y, bark, (rnd() - 0.5) * 20); else if (Math.round(r) % 3 === 0) px(g, x, y, wood, -30);
  }
}
export function leaves(g: CanvasRenderingContext2D, base: RGB, holes = 0.12) {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (rnd() < holes) continue;
    px(g, x, y, base, (rnd() - 0.5) * 60);
  }
}
export function sideOver(g: CanvasRenderingContext2D, dirt: RGB, top: RGB, depth = 3) {
  noise(g, dirt, 16);
  for (let x = 0; x < S; x++) { const d = depth + Math.floor(rnd() * 2.2); for (let y = 0; y < d; y++) px(g, x, y, top, (rnd() - 0.5) * 30); }
}
export function sprite(g: CanvasRenderingContext2D, fn: Painter) { g.clearRect(0, 0, S, S); fn(g); }

export const def = (name: string, fn: Painter) => { NAMES.push(name); painters[name] = fn; };

export const GRASS = hex("#5f9f35"), DIRT = hex("#866043"), STONE = hex("#7f7f7f"), SAND = hex("#dbd3a0"), BARK = hex("#5a4428"),
  WOOD = hex("#b08c56"), PLANK = hex("#9c7a48"), WATER = hex("#2f5fd8"), LAVA = hex("#e8601a"), PATH = hex("#6a6a6a"),
  NETHER = hex("#7a2f2a"), SNOW = hex("#e8f2f8"), ICE = hex("#9ec4f0"), OBSID = hex("#1d1428"), GRAVEL = hex("#857e78");
