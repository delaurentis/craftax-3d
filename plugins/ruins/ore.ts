// The ruins' ore: each kind its own unmistakable piece of the old buildings, in color and in its laser drawing, on the side it
// shows on and on its block's top, so you can find it.
//   coal      a pile of logs burned black, long cold: alligator-cracked char with brown wood in the cracks, log ends with rings, ash
//   iron      a hunk of rusted scrap, the whole block: dented riveted plates, a bent beam or a pipe, flaking rust, bare scratches
//   diamond   a cut gem set in a carved stone panel
//   sapphire  a fragment of a pointed stained-glass window, blue panes in lead
//   ruby      a fragment of a round rose window, red panes between its spokes
import { hex, noise, px, R, rgb, rnd, S, specks, type Painter, type RGB } from "craftax-3d/plugin";
import type { TileSet } from "./tiles";

type G = CanvasRenderingContext2D;
const RUIN = hex("#b89a66"), RUBBLE = hex("#9c8458"), MOSS = hex("#5d7a34"), LEAD = hex("#2a2622");
const line = (g: G, c: RGB, k: number, x: number, y: number, w: number, h: number) => { g.fillStyle = rgb(c, k); g.fillRect(x, y, w, h); };
const wall = (g: G) => { noise(g, RUIN, 10); line(g, RUIN, -30, 0, 0, S, 1); specks(g, MOSS, 2, 2); };
const top = (g: G) => { noise(g, RUBBLE, 14); specks(g, hex("#6b5a3e"), 4, 2); specks(g, MOSS, 3, 2); };
const inBox = (x: number, y: number, x0: number, y0: number, x1: number, y1: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;

// ---------- coal: a pile of burned logs ----------
// the whole block a heap of logs burned black, long cold: their char cracked deep into squares (alligatored), a little brown wood
// still showing in the cracks and at their edges, the logs' ends with their growth rings, grey ash between them
const CHAR = hex("#17130f"), CHAR_L = hex("#2f2721"), WOOD = hex("#6b4424"), WOOD_D = hex("#4a2e18"), ASH = hex("#7a756e");
// charred wood along its grain: blocks of char split by cracks, brown showing in some of the cracks (across: grain runs left-right)
function charred(g: G, x0: number, y0: number, w: number, h: number, across: boolean): void {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const a = across ? x : y, b = across ? y - y0 : x - x0, crack = a % 4 === ((b * 3) >> 2) % 4 || b === 0 || b === (across ? h : w) - 1;
    px(g, x, y, crack ? (rnd() < 0.3 ? WOOD : CHAR) : rnd() < 0.15 ? CHAR : CHAR_L, (rnd() - 0.5) * 14);
  }
}
// a log's end: rings in char and brown, a crack from the heart
function logEnd(g: G, cx: number, cy: number, r: number): void {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) for (let x = Math.floor(cx - r); x <= cx + r; x++) {
    const d = Math.hypot(x - cx, y - cy);
    if (d > r || x < 0 || y < 0 || x >= S || y >= S) continue;
    const ring = Math.round(d * 1.4) % 2 === 0;
    px(g, x, y, d > r - 1 ? CHAR : ring ? (d < r - 1.5 ? WOOD_D : CHAR_L) : (d < 1.2 ? WOOD : CHAR_L), (rnd() - 0.5) * 12);
  }
  for (let k = 1; k < r; k++) px(g, Math.round(cx + k * 0.7), Math.round(cy - k * 0.5), CHAR, -14);
}
const ash = (g: G, n: number) => { for (let i = 0; i < n; i++) px(g, (rnd() * S) | 0, (rnd() * S) | 0, ASH, (rnd() - 0.5) * 24); };
const coalSide: Painter = (g) => {
  charred(g, 0, 0, S, S, true);                                                // (the gaps: logs behind, seen along their grain)
  for (const [cx, cy, r] of [[3.5, 3.5, 3.5], [11.5, 3.5, 3.5], [7.5, 9.5, 3.5], [3, 13.5, 3], [12.5, 13.5, 3]]) logEnd(g, cx, cy, r);
  ash(g, 6);
};
const coalSideLines: Painter = (g) => {
  for (const [cx, cy, r] of [[14, 14, 13], [46, 14, 13], [30, 38, 13], [12, 54, 11], [50, 54, 11]]) for (const k of [1, 0.5]) { g.beginPath(); g.arc(cx, cy, r * k, 0, Math.PI * 2); g.stroke(); }
};
const coalTop: Painter = (g) => {
  for (const y0 of [0, 5, 10]) charred(g, 0, y0, S, y0 === 10 ? 6 : 5, true);   // logs lying across, side by side
  for (const y of [4, 9]) for (let x = 0; x < S; x++) px(g, x, y, rnd() < 0.4 ? ASH : CHAR, (rnd() - 0.5) * 16);   // ash between them
  ash(g, 5);
};
const coalTopLines: Painter = (g) => {
  g.beginPath(); for (const y of [0, 20, 40, 64]) { g.moveTo(0, y); g.lineTo(64, y); } g.stroke();
  g.beginPath(); for (const [y0, x] of [[0, 14], [0, 42], [20, 28], [20, 52], [40, 10], [40, 36]]) { g.moveTo(x, y0 + 4); g.lineTo(x + 3, y0 + 16); } g.stroke();   // (cracks)
};

// ---------- iron: a hunk of rusted scrap ----------
// the whole block is junk metal, no stone: dented riveted plates, a bent beam across them, rust flaking orange and brown with dark
// pits, a few bright scratches of bare metal
const RUST = hex("#a8521f"), RUST_L = hex("#c9702e"), RUST_D = hex("#6e3416"), PIT = hex("#3a1c0e"), BARE = hex("#9a9a96"), BOLT = hex("#4a3426");
const corroded = (g: G) => {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const k = rnd(); px(g, x, y, k < 0.45 ? RUST : k < 0.75 ? RUST_D : k < 0.92 ? RUST_L : PIT, (rnd() - 0.5) * 16); }
  for (let i = 0; i < 5; i++) { const x = (rnd() * 15) | 0, y = (rnd() * 15) | 0; px(g, x, y, PIT); if (rnd() < 0.5) px(g, x + 1, y, PIT, 10); }   // pits
};
const scratch = (g: G, x: number, y: number, n: number) => { for (let i = 0; i < n; i++) px(g, x + i, y + (i >> 1), BARE, (rnd() - 0.5) * 20); };
// the plates: seams where they overlap (a dark line, a lit lip), rivets along them
function plates(g: G, seamsX: number[], seamsY: number[]): void {
  for (const x of seamsX) for (let y = 0; y < S; y++) { px(g, x, y, PIT, 4); px(g, x + 1, y, RUST_L, 10); }
  for (const y of seamsY) for (let x = 0; x < S; x++) { px(g, x, y, PIT, 4); px(g, x, y + 1, RUST_L, 10); }
  for (const x of seamsX) for (let y = 2; y < S; y += 4) { px(g, x - 1, y, BOLT); px(g, x - 1, y - 1, RUST_L, 30); }
  for (const y of seamsY) for (let x = 2; x < S; x += 4) { px(g, x, y - 1, BOLT); px(g, x - 1, y - 1, RUST_L, 30); }
}
const ironSide: Painter = (g) => {
  corroded(g);
  plates(g, [9], [5]);
  for (let x = 0; x < S; x++) { const y = 10 + (x > 6 ? Math.min(3, (x - 6) >> 1) : 0); px(g, x, y, RUST_D, -14); px(g, x, y + 1, RUST, 8); px(g, x, y + 2, PIT); }   // a bent beam
  for (let x = 2; x < 6; x++) px(g, x, 2, RUST_D, -20);                              // a dent's shadow
  scratch(g, 11, 2, 3); scratch(g, 2, 13, 2);
};
const ironSideLines: Painter = (g) => {
  g.strokeRect(2, 2, 60, 60);
  g.beginPath(); g.moveTo(38, 2); g.lineTo(38, 62); g.moveTo(2, 22); g.lineTo(62, 22); g.stroke();                       // the plates
  g.beginPath(); g.moveTo(2, 42); g.lineTo(26, 42); g.lineTo(62, 54); g.moveTo(2, 50); g.lineTo(26, 50); g.lineTo(62, 62); g.stroke();   // the bent beam
  for (const [x, y] of [[34, 10], [34, 34], [10, 18], [26, 18], [50, 18]]) g.strokeRect(x - 1.5, y - 1.5, 3, 3);              // rivets
};
const ironTop: Painter = (g) => {
  corroded(g);
  plates(g, [6], [10]);
  for (let y = 0; y < S; y++) { const x = 12 + (y > 8 ? -1 : 0); px(g, x, y, RUST_D, -12); px(g, x + 1, y, BARE, -30); }   // a pipe lying across
  scratch(g, 1, 3, 4); scratch(g, 8, 13, 3);
};
const ironTopLines: Painter = (g) => {
  g.strokeRect(2, 2, 60, 60);
  g.beginPath(); g.moveTo(26, 2); g.lineTo(26, 62); g.moveTo(2, 42); g.lineTo(62, 42); g.stroke();
  g.beginPath(); g.moveTo(48, 2); g.lineTo(48, 34); g.lineTo(44, 40); g.lineTo(44, 62); g.stroke();                       // the pipe
  for (const [x, y] of [[22, 8], [22, 24], [10, 38], [42, 38]]) g.strokeRect(x - 1.5, y - 1.5, 3, 3);
};

// ---------- diamond: a cut gem in a carved panel ----------
const GEM = hex("#5decf5"), GEM_D = hex("#2aa8b8");
function gem(g: G, cx: number, cy: number, r: number): void {
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.abs(x - cx) + Math.abs(y - cy);
    if (d > r) continue;
    px(g, x, y, d === r ? GEM_D : x < cx && y < cy ? hex("#c8fbff") : x >= cx && y >= cy ? GEM_D : GEM, (rnd() - 0.5) * 10);
  }
  px(g, Math.floor(cx) - 1, Math.floor(cy) - 1, hex("#ffffff"));
}
const diamondSide: Painter = (g) => {
  wall(g);
  for (let y = 2; y < 14; y++) for (let x = 2; x < 14; x++) px(g, x, y, RUIN, inBox(x, y, 3, 3, 12, 12) ? -14 : 22);   // the carved panel: a raised frame, a sunk field
  gem(g, 7.5, 7.5, 4);
};
const gemLines = (r: number): Painter => (g) => {
  g.beginPath(); g.moveTo(32, 32 - r); g.lineTo(32 + r, 32); g.lineTo(32, 32 + r); g.lineTo(32 - r, 32); g.closePath();
  g.moveTo(32 - r / 2, 32 - r / 2); g.lineTo(32 + r / 2, 32 + r / 2); g.moveTo(32 + r / 2, 32 - r / 2); g.lineTo(32 - r / 2, 32 + r / 2); g.stroke();
};
const diamondSideLines: Painter = (g) => { g.strokeRect(8, 8, 48, 48); gemLines(18)(g); };
const diamondTop: Painter = (g) => { top(g); for (let y = 4; y < 12; y++) for (let x = 4; x < 12; x++) px(g, x, y, RUIN, 10); gem(g, 7.5, 7.5, 3); };
const diamondTopLines: Painter = (g) => { g.strokeRect(16, 16, 32, 32); gemLines(13)(g); };

// ---------- sapphire: a pointed stained-glass window ----------
const BLUES = [hex("#2c50e8"), hex("#1d3bb0"), hex("#5a7cf0")];
const lancet = (x: number, y: number) => x >= 4 && x <= 11 && (y >= 7 || Math.hypot(x - 3.5, y - 7) <= 8 && Math.hypot(x - 11.5, y - 7) <= 8) && y >= 1;
const sapphireSide: Painter = (g) => {
  wall(g);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    if (!lancet(x, y)) continue;
    const lead = (x + y) % 4 === 0 || (x - y + 16) % 4 === 0;                       // diamond-pane leading
    px(g, x, y, lead ? LEAD : x > 8 && y > 11 ? hex("#14121a") : BLUES[(x * 3 + y * 5) % 3], (rnd() - 0.5) * 14);   // (a pane broken out, low right)
  }
};
const sapphireSideLines: Painter = (g) => {
  const arch = () => { g.beginPath(); g.moveTo(16, 64); g.lineTo(16, 28); g.quadraticCurveTo(16, 10, 32, 4); g.quadraticCurveTo(48, 10, 48, 28); g.lineTo(48, 64); };
  g.save(); arch(); g.clip();                                                       // the leading, inside the window only
  g.beginPath(); for (let k = -48; k < 64; k += 16) { g.moveTo(16, 28 + k); g.lineTo(48, 60 + k); g.moveTo(48, 28 + k); g.lineTo(16, 60 + k); } g.stroke();
  g.restore(); arch(); g.stroke();
};
// a top: broken panes lying in the rubble, each a little triangle of glass with its lead edge, one catching the light
const shards = (cols: RGB[]): Painter => (g) => {
  top(g);
  for (const [x, y] of [[2, 3], [9, 2], [5, 8], [11, 9], [3, 12]]) {
    const c = cols[(x + y) % cols.length];
    for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx <= dy; dx++) px(g, x + dx, y + dy, dy === 2 ? LEAD : c, (rnd() - 0.5) * 16);
  }
  px(g, 5, 9, hex("#ffffff")); px(g, 9, 3, hex("#ffffff"), -30);
};
const shardLines: Painter = (g) => { for (const [x, y] of [[20, 22], [40, 26], [28, 42], [44, 46]]) { g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 6, y + 5); g.lineTo(x - 6, y + 5); g.closePath(); g.stroke(); } };

// ---------- ruby: a round rose window ----------
const REDS = [hex("#e0203a"), hex("#a01428"), hex("#ff5a6a")];
const rubySide: Painter = (g) => {
  wall(g);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = x - 7.5, dy = y - 7.5, d = Math.hypot(dx, dy);
    if (d > 6.8) continue;
    const a = (Math.atan2(dy, dx) / (Math.PI / 4) + 8) % 1, spoke = a < 0.18 || a > 0.88;
    px(g, x, y, d > 5.8 ? RUIN : d < 1.6 ? hex("#f2c040") : spoke ? LEAD : REDS[((Math.atan2(dy, dx) + 4) * 1.3 | 0) % 3], (rnd() - 0.5) * 12);
  }
};
const rubySideLines: Painter = (g) => {
  for (const r of [26, 6]) { g.beginPath(); g.arc(32, 32, r, 0, Math.PI * 2); g.stroke(); }
  g.beginPath(); for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4; g.moveTo(32 + Math.cos(a) * 6, 32 + Math.sin(a) * 6); g.lineTo(32 + Math.cos(a) * 26, 32 + Math.sin(a) * 26); } g.stroke();
};
const rubyTopLines: Painter = (g) => { g.beginPath(); g.arc(32, 32, 14, 0, Math.PI * 2); g.stroke(); shardLines(g); };

// their own random numbers (places past the original's 32 Oxford tiles)
const fresh = (k: number, fn: Painter): Painter => (g) => { R.seed = 1 + (400 + k) * 7919; fn(g); };
/** The ores' tiles: ruin_<ore> for the side it shows on, ruin_<ore>_top for its block's top. */
export const ORE_TILES: TileSet = {
  ruin_coal: { paint: fresh(0, coalSide), outline: coalSideLines }, ruin_coal_top: { paint: fresh(1, coalTop), outline: coalTopLines },
  ruin_iron: { paint: fresh(2, ironSide), outline: ironSideLines }, ruin_iron_top: { paint: fresh(3, ironTop), outline: ironTopLines },
  ruin_diamond: { paint: fresh(4, diamondSide), outline: diamondSideLines }, ruin_diamond_top: { paint: fresh(5, diamondTop), outline: diamondTopLines },
  ruin_sapphire: { paint: fresh(6, sapphireSide), outline: sapphireSideLines }, ruin_sapphire_top: { paint: fresh(7, shards(BLUES)), outline: shardLines },
  ruin_ruby: { paint: fresh(8, rubySide), outline: rubySideLines }, ruin_ruby_top: { paint: fresh(9, shards(REDS)), outline: rubyTopLines },
};
/** The standard ore tiles, and the ruins' tile for each. */
export const ORE_NAMES: Record<string, string> = { coal_ore: "ruin_coal", iron_ore: "ruin_iron", diamond_ore: "ruin_diamond", sapphire_ore: "ruin_sapphire", ruby_ore: "ruin_ruby" };
