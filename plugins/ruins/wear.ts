// More kinds of weathered stone for the ruins' plain rock, so a stretch of ruin doesn't repeat: cracks of several shapes (one
// forking, one running across, a spalled corner), heavy moss, stone bleached pale, a smoke stain, and rubble tops with more moss or
// cracked flags. The smoke stain is a soft grey-brown haze spreading up the stone, nothing like the coal hearth (ore.ts: a dark
// opening, black lumps, embers), so plain rock never reads as coal. The cracked ones have their cracks in laser too.
import { hex, noise, px, R, rnd, S, specks, type Painter, type RGB } from "craftax-3d/plugin";
import type { TileSet } from "./tiles";

type G = CanvasRenderingContext2D;
const RUIN = hex("#b89a66"), MOSS = hex("#5d7a34"), MOSS_L = hex("#6ea33a"), SMOKE = hex("#77706a");
const courses = (g: G, base: RGB) => { noise(g, base, 12); for (let x = 0; x < S; x++) { px(g, x, 0, base, -30); px(g, x, 8, base, -30); } for (let y = 0; y < 8; y++) { px(g, 6, y, base, -30); px(g, 11, y + 8, base, -30); } };
// a crack: a jagged walk from (x, y), dir: its general slope across (0 straight down)
function crack(g: G, x: number, y: number, dir: number, n: number): void {
  for (let i = 0; i < n && x >= 0 && x < S && y >= 0 && y < S; i++) {
    px(g, x | 0, y | 0, RUIN, -52);
    if (rnd() < 0.5) px(g, (x | 0) + 1, y | 0, RUIN, 14);                              // (its lit lip)
    y += 1; x += dir + (rnd() < 0.35 ? (rnd() < 0.5 ? -1 : 1) : 0);
  }
}
// its laser drawing: the same kind of walk at 4×
function crackLine(g: G, x: number, y: number, dir: number, n: number): void {
  g.beginPath(); g.moveTo(x, y);
  for (let i = 0; i < n; i++) { y += 6; x += dir * 6 + (rnd() - 0.5) * 8; g.lineTo(x, y); }
  g.stroke();
}

const forked: Painter = (g) => { courses(g, RUIN); const x = 5 + ((rnd() * 6) | 0); crack(g, x, 0, 0, 8); crack(g, x, 8, -1, 8); crack(g, x, 8, 1, 8); specks(g, MOSS, 3, 2); };
const forkedLines: Painter = (g) => { crackLine(g, 32, 0, 0, 5); crackLine(g, 32, 30, -1, 6); crackLine(g, 32, 30, 1, 6); };
const across: Painter = (g) => {                                                   // a crack running across, heavy moss along its foot
  courses(g, hex("#ae915f"));
  for (let x = 0, y = 4 + ((rnd() * 4) | 0); x < S; x++) { px(g, x, y, RUIN, -52); if (rnd() < 0.4) y = Math.max(2, Math.min(13, y + (rnd() < 0.5 ? -1 : 1))); }
  for (let x = 0; x < S; x++) for (let y = S - 1 - ((rnd() * 4) | 0); y < S; y++) px(g, x, y, rnd() < 0.6 ? MOSS : MOSS_L, (rnd() - 0.5) * 24);
  specks(g, MOSS, 8, 2);
};
const acrossLines: Painter = (g) => { g.beginPath(); g.moveTo(0, 26); for (let x = 8; x <= 64; x += 8) g.lineTo(x, 22 + rnd() * 12); g.stroke(); };
const spalled: Painter = (g) => {                                                  // a corner broken off, the stone pitted
  courses(g, hex("#c4a878"));
  for (let y = 0; y < 6; y++) for (let x = S - 6 + y; x < S; x++) px(g, x, y, RUIN, -40 + (rnd() - 0.5) * 10);   // the break, in shadow
  for (let i = 0; i < 14; i++) px(g, (rnd() * S) | 0, (rnd() * S) | 0, RUIN, -34);
  crack(g, 3 + ((rnd() * 4) | 0), 4, 0, 10);
};
const spalledLines: Painter = (g) => { g.beginPath(); g.moveTo(40, 0); g.lineTo(64, 24); g.stroke(); crackLine(g, 20, 16, 0, 7); };
const pale: Painter = (g) => { courses(g, hex("#cdb48a")); specks(g, hex("#e2d2b0"), 6, 2); specks(g, MOSS, 2, 1); };   // bleached by the weather
const smoke: Painter = (g) => {                                                    // a smoke stain: a soft haze, darkest high up
  courses(g, RUIN);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const k = (1 - y / S) * 0.65 * Math.exp(-((x - 8) ** 2) / 30);
    if (rnd() < k) px(g, x, y, SMOKE, (rnd() - 0.5) * 16);
  }
};
const mossTop: Painter = (g) => { noise(g, hex("#8d7a52"), 14); specks(g, MOSS, 14, 2); specks(g, MOSS_L, 8, 1); };
const flagsTop: Painter = (g) => {                                                 // cracked flagstones
  noise(g, hex("#a99068"), 10);
  for (let i = 0; i < S; i++) { px(g, i, 7, RUIN, -40); px(g, 9, i, RUIN, -40); }
  crack(g, 3, 0, 0, 7); specks(g, MOSS, 3, 1);
};
const flagsLines: Painter = (g) => { g.beginPath(); g.moveTo(0, 30); g.lineTo(64, 30); g.moveTo(38, 0); g.lineTo(38, 64); g.stroke(); crackLine(g, 12, 0, 0, 4); };

const fresh = (k: number, fn: Painter): Painter => (g) => { R.seed = 1 + (420 + k) * 7919; fn(g); };
/** The weathered stone's tiles: sides ruin_wall3 … ruin_wall6 and ruin_soot, tops ruin_top2 and ruin_top3. */
export const WEAR_TILES: TileSet = {
  ruin_wall3: { paint: fresh(0, forked), outline: forkedLines },
  ruin_wall4: { paint: fresh(1, across), outline: acrossLines },
  ruin_wall5: { paint: fresh(2, spalled), outline: spalledLines },
  ruin_wall6: { paint: fresh(3, pale) },
  ruin_soot: { paint: fresh(4, smoke) },
  ruin_top2: { paint: fresh(5, mossTop) },
  ruin_top3: { paint: fresh(6, flagsTop), outline: flagsLines },
};
