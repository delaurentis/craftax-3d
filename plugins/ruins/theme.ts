// The Ruins theme: the overworld's rock and ore (stone, coal, iron, diamond, sapphire, ruby) drawn as the ruins of old college
// buildings, under a soft grey sky. Drawn only: in the game it is rock and ore as before, mined it gives the same, and a stone you
// placed is drawn as freshly cut ashlar (its icon too). Ruin on the lines of an old building's walls (a 6-tile grid) stands as broken wall 2-4 blocks high,
// ashlar with now and then a window or a column; the rest is rubble a block high, weathered stone of many kinds (wear.ts). Ore
// stays easy to find: each kind is its own piece of the old buildings, on the block it shows on and on its block's top (ore.ts).
// It sweeps in as a wave from where you stand, each tile's rock turning to stone and easing to the ruin's height as the wave reaches
// it (back again the same way).
import { B, ORE, type BlockAt, type Theme } from "craftax-3d/plugin";
import { RUINS_TILES } from "./tiles";
import { ORE_NAMES, ORE_TILES } from "./ore";
import { WEAR_TILES } from "./wear";

const hash = (a: number, b: number, k = 0) => (Math.imul(Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(k + 7, 83492791), 2654435761) >>> 0) / 4294967296;
const ruined = (at: BlockAt) => at.level === 0 && ((at.block === B.STONE && !at.placed) || ORE.has(at.block));
const onWall = (r: number, c: number) => r % 6 === 0 || c % 6 === 0;
/** The ruin's height on (r, c): broken wall 2-4 blocks on the old walls' lines, rubble 1 elsewhere. */
const ruinHeight = (r: number, c: number) => (onWall(r, c) ? 2 + Math.floor(hash(r, c, 2) * 3) : 1);

// a side's tile, block by block up the ruin (row 0 the bottom block)
const RUBBLE = ["ruin_wall", "ruin_wall", "ruin_wall2", "ruin_wall2", "ruin_wall3", "ruin_wall4", "ruin_wall5", "ruin_wall6", "ruin_soot"];
const TOPS = ["ruin_top", "ruin_top", "ruin_top2", "ruin_top3"];
function ruinSide(r: number, c: number, row: number): string {
  const k = hash(r, c, 10 + row), h = ruinHeight(r, c);
  if (!onWall(r, c)) return RUBBLE[Math.floor(k * RUBBLE.length)];
  if (row >= 1 && k < 0.18) return row === h - 1 ? "ruin_win_hi" : "ruin_win_lo";
  if (k < 0.3) return "ruin_column";
  return row === 0 ? "ruin_rustic" : k < 0.6 ? "ruin_wall" : k < 0.68 ? "ruin_wall3" : k < 0.74 ? "ruin_soot" : "ruin_ashlar";
}
// an ore block's top: its own (whichever block of the column shows the ore)
const ORE_TOP: Record<number, string> = { [B.COAL]: "ruin_coal_top", [B.IRON]: "ruin_iron_top", [B.DIAMOND]: "ruin_diamond_top", [B.SAPPHIRE]: "ruin_sapphire_top", [B.RUBY]: "ruin_ruby_top" };

export const ruinsTheme: Theme = {
  id: "ruins",
  label: "Ruins",
  icon: '<svg viewBox="0 0 20 20" width="16" height="16" shape-rendering="crispEdges" aria-hidden="true"><path d="M2 18V5h2V3h3v5h2v2h3V8h2v3h2v2h2v5z" fill="#c8a670"/><path d="M2 9h5v1H2zM2 14h16v1H2zM7 10h1v4H7zM4 15h1v3H4zM11 15h1v3h-1zM15 15h1v3h-1zM12 11h1v3h-1z" fill="#7a5c3a"/><path d="M14 10h2v1h-2zM4 4h2v1H4z" fill="#6f8f3a"/></svg>',   // (a broken wall in the Ruins' honey stone, on the replay page's keyframes; Pete: warmer)
  tiles: { ...RUINS_TILES, ...ORE_TILES, ...WEAR_TILES },
  shape: (at) => (ruined(at) ? { height: ruinHeight(at.r, at.c) } : undefined),
  tile(name, at, face, row) {
    if (at.level === 0 && at.placed) return face === "top" ? "ruin_cut_top" : "ruin_cut";   // (a stone you placed: freshly cut ashlar)
    if (!ruined(at)) return undefined;
    if (face === "side") return ORE_NAMES[name] ?? ruinSide(at.r, at.c, row);
    return ORE_TOP[at.block] ?? TOPS[Math.floor(hash(at.r, at.c, 5) * TOPS.length)];
  },
  icons: { stone: "ruin_cut" },                                      // (the stone in your hotbar: as you'd build with it)
  sky: { tint: [0.95, 0.95, 0.99], sun: 0.92, fog: [28, 125] },
  transition: { kind: "wave", duration: 700, speed: 25 },            // (a tile every 40 ms outward, each easing over 0.7 s)
};
