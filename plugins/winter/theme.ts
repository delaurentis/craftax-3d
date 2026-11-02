// The Winter theme: snow lying deep on the overworld (the ground, the rock, more or less of it, the table) and falling from a pale
// overcast sky; the trees firs, snow on their layers (fir.ts), a drift round a few lone ones (drift.ts); no grass standing up through
// it; the water a little colder; the cows reindeer, by name and sound too (reindeer.ts, sounds.ts), the zombies in torn flannel
// shirts (zombie.ts). Only how the world is drawn and heard: snow on a path or the shore still shows which it is (a path's joints,
// sand through the snow), and ore and the things you made keep their own tops under a light dusting (dust.ts), the rock round coal
// and iron only lightly snowed on. Only the overworld: every floor below is drawn as standard, and no flakes fall there. Near lava (two tiles, corners too) the heat has melted the snow on the ground: the standard look there, but every tree is still a fir, snow on it too (Pete: only firs in winter). The trees and creatures
// change shape, so it sweeps in as a wave from where you stand, each tree's crown and each creature morphing into its winter one.
import { B, ORE, STONE_VARIANTS, type BlockAt, type Theme } from "craftax-3d/plugin";
import { VARIANTS, WINTER_TILES, tint } from "./tiles";
import { DUST_TILES, ORE_DUST } from "./dust";
import { FIR_TILES, firCrown, firPick } from "./fir";
import { drift } from "./drift";
import { snowfall } from "./snow";
import { reindeer } from "./reindeer";
import { zombie } from "./zombie";
import { REINDEER_SOUNDS } from "./sounds";

const hash = (a: number, b: number, k = 0) => (Math.imul(Math.imul(a, 73856093) ^ Math.imul(b, 19349663) ^ Math.imul(k + 7, 83492791), 2654435761) >>> 0) / 4294967296;
const ROCK = new Set(STONE_VARIANTS), ORE_TOPS = new Set(ORE_DUST);
// a face's top tile, by the tile it has (lying snow, the shore and the path: one of their variants, by the tile's position)
const TOPS: Record<string, string> = {
  leaves: "snow_leaves", table_top: "snow_table", planks: "snow_planks", placed_stone: "snow_placed", chest_top: "snow_chest",
};
const pick = (name: keyof typeof VARIANTS, at: BlockAt) => `${name}_${Math.floor(hash(at.r, at.c, 3) * VARIANTS[name])}`;
const rock = (at: BlockAt) => (at.block === B.STONE && !at.placed) || ORE.has(at.block);

// near lava: every tile within MELT of a lava tile (corners too), worked out once per map
const MELT = 2;
const melted = new WeakMap<readonly number[], Uint8Array>();
function warm(map: readonly number[], W: number, H: number): Uint8Array {
  let m = melted.get(map);
  if (m) return m;
  m = new Uint8Array(W * H);
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
    if (map[r * W + c] !== B.LAVA) continue;
    for (let rr = Math.max(0, r - MELT); rr <= Math.min(H - 1, r + MELT); rr++) for (let cc = Math.max(0, c - MELT); cc <= Math.min(W - 1, c + MELT); cc++) m[rr * W + cc] = 1;
  }
  melted.set(map, m);
  return m;
}
// how much snow lies on a rock tile: 0 deep, 1 in patches, 2 a dusting; next to coal or iron (corners too) never deep, mostly a dusting
function cover(at: BlockAt): number {
  const f = at.floor, k = hash(at.r, at.c, 7);
  let ore = false;
  if (f) for (let r = at.r - 1; r <= at.r + 1 && !ore; r++) for (let c = at.c - 1; c <= at.c + 1; c++) {
    const b = r >= 0 && c >= 0 && r < f.H && c < f.W ? f.map[r * f.W + c] : -1;
    if (b === B.COAL || b === B.IRON) { ore = true; break; }
  }
  return ore ? (k < 0.6 ? 2 : 1) : k < 0.5 ? 0 : k < 0.8 ? 1 : 2;
}
const hot = (at: BlockAt) => !!at.floor && warm(at.floor.map, at.floor.W, at.floor.H)[at.r * at.floor.W + at.c] === 1;

export const winterTheme: Theme = {
  id: "winter",
  label: "Winter",
  icon: '<svg viewBox="0 0 20 20" width="16" height="16" shape-rendering="crispEdges" aria-hidden="true"><path d="M9 1h2v18H9zM1 9h18v2H1zM4 4h2v2H4zM6 6h2v2H6zM12 12h2v2h-2zM14 14h2v2h-2zM14 4h2v2h-2zM12 6h2v2h-2zM6 12h2v2H6zM4 14h2v2H4z" fill="#d8eeff"/><path d="M7 2h2v1H7zM11 2h2v1h-2zM7 17h2v1H7zM11 17h2v1h-2zM2 7h1v2H2zM2 11h1v2H2zM17 7h1v2h-1zM17 11h1v2h-1z" fill="#7cc0f0"/></svg>',   // (a snowflake, on the replay page's keyframes)
  tiles: { ...WINTER_TILES, ...DUST_TILES, ...FIR_TILES },
  paint: {
    water: tint("water", [0.8, 0.9, 1.0]),
    leaves: tint("leaves", [0.78, 0.9, 0.9]),
  },
  tile(name, at, face, row) {
    if (hot(at)) return undefined;
    if (at.level !== 0) return undefined;                               // (Pete: the overworld only; every floor below as standard)
    if (face === "top") {
      if (at.block === B.WATER || at.block === B.LAVA) return undefined;   // (the sand under the water)
      if (ROCK.has(name)) { const k = cover(at); return k === 0 ? pick("snow_rock", at) : k === 1 ? pick("snow_rock_patchy", at) : "dust_" + name; }
      if (ORE_TOPS.has(name)) return "dust_" + name;
      if (name.startsWith("grass_top")) return pick("snow", at);
      if (name === "sand") return pick("snow_sand", at);
      if (name === "path") return pick("snow_path", at);
      if (name.startsWith("floor_dirt")) return pick("snow_dirt", at);   // (Pete: dug-out dirt gets a little snow too; near lava, none: hot() above)
      return TOPS[name];
    }
    if (face !== "side") return undefined;
    if (name === "grass_side") return "snow_grass_side";
    // the rock's top block: snow along its top, deep or thin as on its top (an ore block keeps its own tile)
    if (rock(at) && ROCK.has(name) && row === Math.ceil(at.height - 1e-6) - 1) { const k = cover(at); return k === 0 ? "snow_lip_" + name : k === 1 ? "snow_lip_thin_" + name : undefined; }
    return undefined;
  },
  crown: (at) => (at.level === 0 && at.block === B.TREE ? firCrown(at) : undefined),
  crownPick: (at) => { if (at.level !== 0 || at.block !== B.TREE) return undefined; const p = firPick(at.r, at.c); return { key: String(p.variant), turn: p.turn }; },
  decorate: (at, d) => drift(at, d, (r, c) => !hot({ ...at, r, c })),
  bits: { leaves: [0x24502c, 0xdde6ee], grass: [0xffffff, 0xe6edf4, 0xd2dde8, 0xc2cfdc] },   // (a felled fir: needles and snow; hit ground: snow)
  creatures: { cow: { model: reindeer }, zombie: { model: zombie } },   // (reindeer.ts, zombie.ts)
  names: { cow: "reindeer" },
  sounds: REINDEER_SOUNDS,                                           // (quiet deer sounds, not the cow's moo: sounds.ts)                                        // (the cows are reindeer: in what the player reads too)
  grass: { height: 0 },                                              // (no grass: under the snow)
  sky: { tint: [0.88, 0.94, 1.08], sun: 0.8, fog: [22, 105] },
  weather: snowfall,
};
