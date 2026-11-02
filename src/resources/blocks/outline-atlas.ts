// The outline atlas: line drawings at 4× the tile size, one channel, in the atlas's layout. The laser look inks them red
// and phosphor green (shading.ts); outlineIconURL draws a tile's drawing as a HUD icon in either ink.
import * as THREE from "three";
import { COLS, OUTLINE_ROWS, NAMES, R, ROWS, px, rnd } from "./paint";
import { STONE_VARIANTS } from "./painters/terrain";
import { SEWER_WET } from "./painters/realms";
import type { Painter } from "./paint";

/** A point on a 64 × 64 line drawing. */
type Pt = [number, number];

// ---------- outline art details ----------
// Line drawings for the line looks at 4× the texture resolution, in the atlas's tile layout, so the shader reads them at the same uv:
// cracks in stone, the lumps and gems of each ore, the planks and tools of the crafting table, the furnace's mouth, a chest's lid.
export const LS = 64, lcanvas = document.createElement("canvas");
lcanvas.width = LS * COLS; lcanvas.height = LS * OUTLINE_ROWS;   // (only the first 16 rows: the tiles after them, the floors, have no outline art, Pete)
export const OUTLINE: Record<string, Painter | undefined> = {};
export const lpoly = (g: CanvasRenderingContext2D, pts: Pt[], close = true) => { g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); if (close) g.closePath(); g.stroke(); };
export function crack(g: CanvasRenderingContext2D, x: number, y: number, a: number, n: number) {                                  // a jagged walk, now and then forking
  const pts: Pt[] = [[x, y]];
  for (let i = 0; i < n; i++) {
    a += (rnd() - 0.5) * 1.3; x += Math.cos(a) * 6; y += Math.sin(a) * 6;
    pts.push([x, y]);
    if (rnd() < 0.18) crack(g, x, y, a + (rnd() < 0.5 ? 1 : -1) * 0.9, 2 + Math.floor(rnd() * 3));
  }
  lpoly(g, pts, false);
}
export const cracks = (g: CanvasRenderingContext2D, n: number) => { for (let i = 0; i < n; i++) crack(g, 6 + rnd() * 52, 6 + rnd() * 52, rnd() * 6.3, 4 + Math.floor(rnd() * 4)); };
export function lump(g: CanvasRenderingContext2D, cx: number, cy: number, r: number, k = 7) {                             // an irregular rounded outline
  const pts: Pt[] = [];
  for (let i = 0; i < k; i++) { const a = (i / k) * Math.PI * 2, rr = r * (0.7 + rnd() * 0.5); pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]); }
  lpoly(g, pts);
}
export function scatter(n: number, margin: number, minGap: number, draw: (x: number, y: number) => void) {                      // n spots that keep apart
  const at: Pt[] = [];
  for (let tries = 0; at.length < n && tries < 200; tries++) {
    const x = margin + rnd() * (LS - 2 * margin), y = margin + rnd() * (LS - 2 * margin);
    if (at.every(([px, py]) => Math.hypot(px - x, py - y) > minGap)) { at.push([x, y]); draw(x, y); }
  }
}
export const gem = (g: CanvasRenderingContext2D, x: number, y: number, r: number, sides: number) => {                             // a cut gem: an outline and one facet line across it
  const pts: Pt[] = [];
  for (let i = 0; i < sides; i++) { const a = (i / sides) * Math.PI * 2 + Math.PI / 2; pts.push([x + Math.cos(a) * r * (sides === 4 ? 0.75 : 1), y + Math.sin(a) * r]); }
  lpoly(g, pts);
  lpoly(g, [[x - r * 0.55, y - r * 0.15], [x + r * 0.55, y - r * 0.15]], false);
};
export const frame = (g: CanvasRenderingContext2D, m: number) => g.strokeRect(m, m, LS - 2 * m, LS - 2 * m);
export const plankLines = (g: CanvasRenderingContext2D) => { for (let y = 16; y < LS; y += 16) lpoly(g, [[0, y], [LS, y]], false); for (let r = 0; r < 4; r++) lpoly(g, [[((r * 27) % 52) + 6, r * 16 + 2], [((r * 27) % 52) + 6, r * 16 + 14]], false); };

OUTLINE.stone = (g) => cracks(g, 3);
// ---- more rock: each stone variant its own kind of break
export const hole = (g: CanvasRenderingContext2D, pts: Pt[]) => { g.save(); g.fillStyle = "#000"; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.closePath(); g.fill(); g.restore(); lpoly(g, pts); };
export const wavy = (g: CanvasRenderingContext2D, y: number, amp: number, step = 8) => { const pts: Pt[] = []; for (let x = 0; x <= LS; x += step) pts.push([x, y + (x % LS ? (rnd() - 0.5) * amp : 0)]); lpoly(g, pts, false); };
OUTLINE.stone_fissure = (g) => { crack(g, 20 + rnd() * 24, 0, Math.PI / 2 + (rnd() - 0.5) * 0.4, 11); cracks(g, 1); };   // one long split, top to bottom
OUTLINE.stone_star = (g) => {                                      // a star of cracks from one struck point
  const x = 22 + rnd() * 20, y = 22 + rnd() * 20, n = 4 + Math.floor(rnd() * 2);
  for (let i = 0; i < n; i++) crack(g, x, y, (i / n) * Math.PI * 2 + rnd() * 0.6, 2 + Math.floor(rnd() * 3));
};
OUTLINE.stone_strata = (g) => { for (const y of [14 + rnd() * 6, 34 + rnd() * 6, 52 + rnd() * 4]) if (rnd() < 0.85) wavy(g, y, 5); };   // rock in layers
OUTLINE.stone_pebbles = (g) => { scatter(3, 12, 22, (x, y) => lump(g, x, y, 6 + rnd() * 4, 8)); cracks(g, 1); };   // stones set in the rock
OUTLINE.stone_chip = (g) => {                                      // a corner broken off, a crack running on from the break
  const c = Math.floor(rnd() * 4), [x0, y0] = ([[0, 0], [64, 0], [64, 64], [0, 64]] as Pt[])[c], sx = x0 ? -1 : 1, sy = y0 ? -1 : 1;
  const a = 14 + rnd() * 8, b = 14 + rnd() * 8;
  hole(g, [[x0, y0], [x0 + sx * a, y0], [x0 + sx * a * 0.6, y0 + sy * b * 0.45], [x0 + sx * a * 0.35, y0 + sy * b * 0.7], [x0, y0 + sy * b]]);
  crack(g, x0 + sx * a * 0.6, y0 + sy * b * 0.45, Math.atan2(sy, sx), 4);
};
OUTLINE.stone_arcs = (g) => {                                      // shell-like fracture: nested arcs round one point
  const x = 14 + rnd() * 36, y = 14 + rnd() * 36, a = rnd() * 6.3;
  for (const r of [7, 13, 19]) { g.beginPath(); g.arc(x, y, r + rnd() * 2, a, a + 1.6 + rnd() * 0.8); g.stroke(); }
};
OUTLINE.stone_fine = (g) => { for (let i = 0; i < 6; i++) crack(g, 6 + rnd() * 52, 6 + rnd() * 52, rnd() * 6.3, 1 + Math.floor(rnd() * 2)); };   // hairlines
OUTLINE.stone_split = (g) => { crack(g, 0, 18 + rnd() * 28, (rnd() - 0.5) * 0.5, 11); lump(g, 44 + rnd() * 8, 14 + rnd() * 6, 5, 6); };   // a seam across, a pebble

// ---- dungeon walls: the bricks themselves (rows of 16, joints staggered), each variant's damage or growth drawn on them
export const wallLines = (g: CanvasRenderingContext2D, wob = 0) => {
  for (const y of [16, 32, 48]) wob ? wavy(g, y, wob) : lpoly(g, [[0, y], [LS, y]], false);
  for (let r = 0; r < 4; r++) for (const x of r % 2 ? [16, 48] : [32]) lpoly(g, [[x + (rnd() - 0.5) * wob, r * 16], [x + (rnd() - 0.5) * wob, r * 16 + 16]], false);
};
// a brick's box: row 0-3, k 0/1 (odd rows: k 0 is the middle brick)
export const bx = (row: number, k: number) => { const x0 = row % 2 ? 16 + k * 32 : k * 32; return [x0, row * 16, x0 + 32, row * 16 + 16]; };
export const jag = (n: number, a: number, b: number) => Array.from({ length: n }, (_, i) => a + (b - a) * (i + 1) / (n + 1) + (rnd() - 0.5) * 4);
export function wbite(g: CanvasRenderingContext2D, row: number, k: number, cx: number, cy: number) {                               // a jagged bite out of a brick's corner
  const [x0, y0, x1, y1] = bx(row, k), X = cx ? x1 : x0, Y = cy ? y1 : y0, sx = cx ? -1 : 1, sy = cy ? -1 : 1, w = 10 + rnd() * 8, h = 8 + rnd() * 5;
  hole(g, [[X, Y], [X + sx * w, Y], [X + sx * w * 0.7, Y + sy * h * 0.5], [X + sx * w * 0.45, Y + sy * h * 0.55], [X + sx * w * 0.3, Y + sy * h], [X, Y + sy * h]]);
}
export function whalf(g: CanvasRenderingContext2D, row: number, k: number, side: number) {                                 // half a brick gone, the break ragged
  const [x0, y0, x1, y1] = bx(row, k), m = (x0 + x1) / 2, ys = [y0, ...jag(3, y0, y1), y1];
  const edge = ys.map((y): Pt => [m + (rnd() - 0.5) * 7, y]);
  hole(g, side ? [[x1, y0], ...edge, [x1, y1]] : [[x0, y0], ...edge, [x0, y1]]);
}
export function wcrack(g: CanvasRenderingContext2D, row: number, k: number) { const [x0, y0, x1] = bx(row, k); crack(g, x0 + 8 + rnd() * 16, y0, Math.PI / 2 + (rnd() - 0.5) * 0.8, 3); }
export function wspall(g: CanvasRenderingContext2D, row: number, k: number) { const [x0, y0, x1, y1] = bx(row, k); lump(g, (x0 + x1) / 2 + (rnd() - 0.5) * 6, (y0 + y1) / 2, 6 + rnd() * 2, 7); }
export function wchips(g: CanvasRenderingContext2D, n: number) {                                          // little corners knocked off where bricks meet
  for (let i = 0; i < n; i++) { const r = Math.floor(rnd() * 4), k = Math.floor(rnd() * 2), [x0, y0] = bx(r, k), x = x0 + (rnd() < 0.5 ? 0 : 32), y = y0 + (rnd() < 0.5 ? 0 : 16);
    const sx = x > x0 ? -1 : 1, sy = y > y0 ? -1 : 1; hole(g, [[x, y], [x + sx * 5, y], [x, y + sy * 4]]); }
}
export const tuft = (g: CanvasRenderingContext2D, x: number, y: number) => lpoly(g, [[x - 4, y], [x - 2, y - 4], [x, y], [x + 2, y - 5], [x + 4, y]], false);   // a little tuft of moss
export function wvines(g: CanvasRenderingContext2D) {
  for (const x0 of [10 + rnd() * 8, 34 + rnd() * 8, 54 + rnd() * 6]) {
    const len = 24 + rnd() * 34, pts: Pt[] = []; let x = x0;
    for (let y = 0; y <= len; y += 6) { pts.push([x, y]); if (rnd() < 0.5) lpoly(g, [[x, y], [x + (rnd() < 0.5 ? -4 : 4), y + 3]], false); x += (rnd() - 0.5) * 4; }
    lpoly(g, pts, false);
  }
}
OUTLINE.wall = (g) => wallLines(g);
for (const n of ["gwall", "gwall2", "gwall_crack", "gwall_worn", "gwall_moss"]) OUTLINE[n] = (g) => wallLines(g);
OUTLINE.wall_moss = (g) => { wallLines(g); scatter(4, 6, 14, (x, y) => tuft(g, x, y)); };
OUTLINE.wall_worn = (g) => { wallLines(g); wchips(g, 5); };
OUTLINE.wall_cracked = (g) => { wallLines(g); crack(g, 14 + rnd() * 30, 0, Math.PI / 2, 10); };
OUTLINE.wall_moss2 = (g) => { wallLines(g); for (let x = 6; x < 64; x += 9 + rnd() * 5) tuft(g, x, 62 - rnd() * 8); };
OUTLINE.wall_vines = (g) => { wallLines(g); wvines(g); };
OUTLINE.wall_mossy = (g) => { wallLines(g); for (const y of [16, 32, 48]) for (let x = 4; x < 64; x += 12 + rnd() * 10) tuft(g, x, y + 1); };
OUTLINE.wall_bite = (g) => { wallLines(g); wbite(g, 1, 0, 1, 0); wbite(g, 2, 1, 0, 1); };
OUTLINE.wall_bite2 = (g) => { wallLines(g); wbite(g, 0, 0, 0, 1); wbite(g, 3, 0, 1, 1); };
OUTLINE.wall_half = (g) => { wallLines(g); whalf(g, 2, 0, 1); wbite(g, 0, 1, 1, 0); };
OUTLINE.wall_half2 = (g) => { wallLines(g); whalf(g, 1, 0, 0); wchips(g, 2); };
OUTLINE.wall_crack2 = (g) => { wallLines(g); wcrack(g, 0, 1); wcrack(g, 2, 0); };
OUTLINE.wall_crack3 = (g) => { wallLines(g); wcrack(g, 1, 0); wcrack(g, 3, 1); wbite(g, 3, 1, 0, 0); };
OUTLINE.wall_spall = (g) => { wallLines(g); wspall(g, 1, 0); wspall(g, 3, 0); };
OUTLINE.wall_spall2 = (g) => { wallLines(g); wspall(g, 0, 0); wspall(g, 2, 1); wcrack(g, 2, 1); };
OUTLINE.wall_crumble = (g) => { wallLines(g, 4); wchips(g, 4); };
OUTLINE.wall_ruin = (g) => { wallLines(g, 3); whalf(g, 1, 0, 1); wbite(g, 2, 1, 0, 0); wbite(g, 3, 0, 1, 0); wcrack(g, 0, 0); };
OUTLINE.coal_ore = (g) => { cracks(g, 1); scatter(5, 10, 16, (x, y) => lump(g, x, y, 6 + rnd() * 2, 6)); };
OUTLINE.iron_ore = (g) => { cracks(g, 1); scatter(6, 8, 13, (x, y) => lump(g, x, y, 4 + rnd() * 1.5, 8)); };
OUTLINE.diamond_ore = (g) => { cracks(g, 1); scatter(4, 11, 18, (x, y) => gem(g, x, y, 8, 4)); };
OUTLINE.sapphire_ore = (g) => { cracks(g, 1); scatter(4, 11, 18, (x, y) => gem(g, x, y, 7, 6)); };
OUTLINE.ruby_ore = (g) => { cracks(g, 1); scatter(4, 11, 18, (x, y) => gem(g, x, y, 7, 6)); };
OUTLINE.table_top = (g) => {
  frame(g, 4); lpoly(g, [[32, 4], [32, 60]], false); lpoly(g, [[4, 32], [60, 32]], false);
  for (const [x, y] of [[12, 12], [40, 18], [16, 44], [44, 46]]) lpoly(g, [[x, y], [x + 10, y]], false);   // grain
};
OUTLINE.table_side = (g) => {
  lpoly(g, [[0, 12], [64, 12]], false);
  lpoly(g, [[16, 24], [16, 54]], false); g.strokeRect(8, 20, 16, 8);                        // hammer
  lpoly(g, [[44, 20], [44, 56]], false);                                                  // saw: grip, blade, teeth
  g.strokeRect(38, 20, 12, 6);
  lpoly(g, [[34, 28], [54, 28], [54, 56], [34, 56]], false);
  lpoly(g, [[34, 56], [36, 60], [38, 56], [40, 60], [42, 56], [44, 60], [46, 56], [48, 60], [50, 56], [52, 60], [54, 56]], false);
};
OUTLINE.furnace_front = (g) => {
  frame(g, 2); g.strokeRect(12, 12, 40, 10);                                              // the vent
  g.strokeRect(12, 32, 40, 22); for (let x = 20; x < 52; x += 8) lpoly(g, [[x, 32], [x, 54]], false);   // the mouth and its grate
  lpoly(g, [[16, 50], [22, 42], [28, 50], [34, 40], [40, 50], [46, 44], [48, 50]], false);   // flames
};
OUTLINE.furnace_side = (g) => { frame(g, 2); lpoly(g, [[2, 10], [62, 10]], false); };
OUTLINE.furnace_top = (g) => { frame(g, 2); frame(g, 14); };
OUTLINE.planks = (g) => plankLines(g);
OUTLINE.placed_stone = (g) => {                                    // stone you placed: its two courses of bricks, joints staggered
  lpoly(g, [[0, 32], [64, 32]], false);
  for (const [x, y0, y1] of [[32, 0, 32], [16, 32, 64], [48, 32, 64]]) lpoly(g, [[x, y0], [x, y1]], false);
};
export const bark = (g: CanvasRenderingContext2D) => {                                              // the ends sit on the same x, so lines join from block to block
  for (const x of [12, 32, 52]) { const pts: Pt[] = []; for (let y = 0; y <= 64; y += 8) pts.push([x + (y % 64 ? (rnd() - 0.5) * 3 : 0), y]); lpoly(g, pts, false); }
};
OUTLINE.log_side = bark;                                           // trunks: vertical bark lines only
OUTLINE.fire_log_side = OUTLINE.fire_log_side2 = OUTLINE.fire_log_side3 = bark;
OUTLINE.chest_side = (g) => { frame(g, 3); lpoly(g, [[3, 24], [61, 24]], false); };   // the frame and the lid's seam, no plank rows
OUTLINE.chest_front = (g) => { OUTLINE.chest_side!(g); g.strokeRect(28, 18, 8, 14); };
OUTLINE.chest_top = (g) => { frame(g, 3); g.strokeRect(9, 9, 46, 46); };            // the lid: a frame and its rim, no plank rows

{
  const g = lcanvas.getContext("2d")!;
  g.fillStyle = "#000"; g.fillRect(0, 0, lcanvas.width, lcanvas.height);
  g.strokeStyle = "#fff"; g.lineWidth = 2.4; g.lineJoin = g.lineCap = "round";
  for (const realm of ["fire", "ice", "troll"]) for (const n of STONE_VARIANTS) OUTLINE[realm + "_" + n] ??= OUTLINE[n];   // the realms' rock: stone's cracks
  OUTLINE.troll_mossy ??= OUTLINE.stone; OUTLINE.troll_mossy2 ??= OUTLINE.stone;
  OUTLINE.wall_slime ??= OUTLINE.wall_mossy; OUTLINE.wall_overgrown ??= OUTLINE.wall_moss2;   // the Sewers' walls and floor: their nearest kin's lines
  for (const n of ["sewer_floor", "sewer_floor1", "sewer_floor2"]) OUTLINE[n] ??= OUTLINE.path;
  for (const n of SEWER_WET) for (const k of [0, 1]) OUTLINE[n + "_wet" + k] ??= OUTLINE[n];
  for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) OUTLINE[`vdoor_${col}${row}`] ??= (g) => {   // the door's circle and wheel, in pieces
    g.save(); g.translate(-col * 64, -(2 - row) * 64);
    for (const r of [84, 40, 32]) { g.beginPath(); g.arc(96, 96, r, 0, Math.PI * 2); g.stroke(); }
    g.strokeRect(6, 6, 180, 180); g.restore();
  };
  for (let w = 2; w <= 4; w++) for (let col = 0; col < w; col++) for (let row = 0; row < 3; row++) OUTLINE[`pcul_${w}_${col}${row}`] ??= (g) => {   // the arch and the bars
    g.save(); g.translate(-col * 64, -(2 - row) * 64);
    g.beginPath(); g.ellipse(w * 32, 64, w * 32, 40, 0, Math.PI, 0); g.stroke();
    for (let x = 6; x < w * 64; x += 16) { g.beginPath(); g.moveTo(x, 64); g.lineTo(x, 184); g.stroke(); }
    g.restore();
  };
  for (const n of ["vault_iron", "vault_iron1", "vault_iron2"]) OUTLINE[n] ??= (g) => { g.strokeRect(1, 1, 62, 62); for (const [x, y] of [[12, 12], [50, 12], [12, 50], [50, 50]]) g.strokeRect(x - 1, y - 1, 2, 2); };   // a plate and its rivets
  NAMES.forEach((name, i) => {
    const draw = OUTLINE[name];
    if (!draw || i >= COLS * OUTLINE_ROWS) return;
    R.seed = 7 + i * 104729;
    g.save();
    g.translate((i % COLS) * LS, Math.floor(i / COLS) * LS);
    g.beginPath(); g.rect(name.endsWith("log_side") ? 0 : 1, 0, LS - (name.endsWith("log_side") ? 0 : 2), LS); g.clip();   // keep each drawing in its tile
    draw(g);
    g.restore();
  });
}
// on the GPU as one channel (Pete: the shader reads only red): a quarter of the memory of the RGBA canvas, the same look. Rows
// flipped here as a canvas upload would (flipY), so its v runs as the colour atlas's does
export const outlineAtlas = (() => {
  const W = lcanvas.width, H = lcanvas.height, src = lcanvas.getContext("2d")!.getImageData(0, 0, W, H).data, red = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) { const o = (H - 1 - y) * W, i0 = y * W * 4; for (let x = 0; x < W; x++) red[o + x] = src[i0 + x * 4]; }
  const t = new THREE.DataTexture(red, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  t.unpackAlignment = 1; t.generateMipmaps = true; t.needsUpdate = true;
  return t;
})();
export const OUTLINE_V = ROWS / OUTLINE_ROWS;                              // the outline map's v scale against the colour atlas (shading.ts)
outlineAtlas.magFilter = THREE.LinearFilter;
outlineAtlas.minFilter = THREE.LinearMipmapLinearFilter;

// the HUD's outline icon for a block: its outline drawing in the ink (laser red, or phosphor green), inside a square (a block is a cube),
// bold enough to read at 32 px
export const licons: Record<string, string> = {};
export const hasOutlineArt = (name: string) => !!OUTLINE[name];
// icons drawn for the HUD itself (64 × 64, white on black) where a block's face drawing is too small to read
export const OUTLINE_ICON: Record<string, Painter | undefined> = {
  table_side: (g) => {                                         // a table on two legs, a hammer and a saw lying on it
    g.strokeRect(6, 30, 52, 9); g.strokeRect(11, 39, 8, 20); g.strokeRect(45, 39, 8, 20);
    g.strokeRect(10, 13, 9, 13); lpoly(g, [[19, 19], [31, 25]], false); lpoly(g, [[19, 21], [30, 27]], false);     // hammer: head, handle
    lpoly(g, [[34, 26], [36, 13], [55, 22], [55, 26]], true); g.strokeRect(48, 14, 9, 8);                        // saw: blade, grip
    lpoly(g, [[36, 26], [38, 29], [40, 26], [42, 29], [44, 26], [46, 29], [48, 26], [50, 29], [52, 26]], false);  // teeth
  },
};
export function outlineIconURL(name: string, ink = "#ff2a18") {
  const key = name + ink;
  if (licons[key]) return licons[key];
  const [ir, ig, ib] = [1, 3, 5].map((i) => parseInt(ink.slice(i, i + 2), 16));
  const i = NAMES.indexOf(name), N = 32;
  const c = document.createElement("canvas"); c.width = c.height = N;
  const g = c.getContext("2d")!, icon = OUTLINE_ICON[name];
  if (icon) {
    const t = document.createElement("canvas"); t.width = t.height = LS;
    const tg = t.getContext("2d")!; tg.fillStyle = "#000"; tg.fillRect(0, 0, LS, LS);
    tg.strokeStyle = "#fff"; tg.lineWidth = 3.2; tg.lineJoin = tg.lineCap = "round";
    icon(tg);
    g.drawImage(t, 0, 0, LS, LS, 0, 0, N, N);
  } else g.drawImage(lcanvas, (i % COLS) * LS, Math.floor(i / COLS) * LS, LS, LS, 3, 3, N - 6, N - 6);
  const im = g.getImageData(0, 0, N, N), d = im.data;
  for (let p = 0; p < d.length; p += 4) { const a = Math.min(255, d[p] * 2.4); d[p] = ir; d[p + 1] = ig; d[p + 2] = ib; d[p + 3] = a; }
  g.putImageData(im, 0, 0);
  if (!icon) { g.strokeStyle = ink; g.lineWidth = 2; g.strokeRect(2, 2, N - 4, N - 4); }
  return (licons[key] = c.toDataURL());
}
