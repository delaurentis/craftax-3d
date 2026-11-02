// A scene's set pieces written into a new world (js/local.ts calls placeSetPieces right after the engine makes it). Each floor is
// read as generated, from a scratch copy of the game taken to that floor (its map, items, creatures and where you arrive), and handed
// to the active scene's place(); its writes go into the engine's own snapshot, so from then on they are the game: saved, recorded,
// replayed, with no flag of their own. The world keeps the player's seed: a floor the scene can't use is simply left as it is.
//
// The snapshot is the engine's state as bytes (craftax-wasm's State: map, item_map, light_map, [9][H][W] bytes each, then mob_bits,
// spawn_land, spawn_grave, spawn_water, [9][H] uint64 each). The maps are found by matching the overworld's own bytes, no offset
// assumed; the spawn masks are kept as the engine keeps them (refresh_spawn_cell), and checked against the overworld first: an engine
// laid out otherwise is left alone.
import { activeScene } from "./active";
import type { CraftaxEngine, CraftaxGame, EngineState, Mob } from "../core/types";
import type { GeneratedLevel, Placement, Tile } from "../themes/types";

const GRASS = 2, WATER = 3, PATH = 7, FIRE_GRASS = 25, ICE_GRASS = 26, LEVELS = 9;
const landy = (b: number) => b === GRASS || b === PATH || b === FIRE_GRASS || b === ICE_GRASS;
const tileOf = (s: EngineState, item: number): Tile | null => { const i = s.items.indexOf(item); return i < 0 ? null : [(i / s.size[1]) | 0, i % s.size[1]]; };
const creaturesOf = (s: EngineState) => ([...s.melee, ...s.ranged, ...s.passive] as Mob[]).map((m) => ({ kind: m.kind, pos: [m.pos[0], m.pos[1]] as Tile }));

/** Each floor of the game as generated, read from a scratch copy (the game itself is left as it is). */
function readLevels(engine: CraftaxEngine, game: CraftaxGame, seed: number, flags: number): GeneratedLevel[] {
  const scratch = engine.newGame(flags), out: GeneratedLevel[] = [];
  try {
    const snap = game.save();
    for (let level = 0; level < LEVELS; level++) {
      scratch.load(snap);
      if (level) scratch.teleport(level);
      const s = scratch.state();
      if (s.level !== level) break;
      out.push({ level, seed, size: [s.size[0], s.size[1]], map: Object.freeze([...s.map]), items: Object.freeze([...s.items]),
        ladderDown: tileOf(s, 2) ?? tileOf(s, 4), ladderUp: tileOf(s, 3), creatures: Object.freeze(creaturesOf(s)), spawn: [s.pos[0], s.pos[1]] });
    }
  } finally { scratch.free(); }
  return out;
}

/** The active scene's set pieces, written into the world the engine just made from `seed`. True if anything was written. */
export function placeSetPieces(engine: CraftaxEngine, game: CraftaxGame, seed: number, flags: number): boolean {
  const scene = activeScene();
  if (!scene) return false;
  const levels = readLevels(engine, game, seed, flags), plans: [GeneratedLevel, Placement][] = [];
  for (const lv of levels) {
    let p: Placement | null = null;
    try { p = scene.place(lv); } catch (e) { console.error(`[craftax-3d] scene "${scene.id}" failed to place on floor ${lv.level}`, e); }
    if (p?.writes?.length) plans.push([lv, p]);
  }
  if (!plans.length) return false;
  const moved = new Set<string>();                                  // creatures moved aside first (the engine's moveMob)
  for (const [lv, p] of plans) for (const m of p.moves ?? []) {
    if (!game.moveMob) { console.warn(`[craftax-3d] scene "${scene.id}": this engine build can't move creatures; tiles under them keep their blocks`); break; }
    if (game.moveMob(lv.level, m.from[0], m.from[1], m.to[0], m.to[1])) moved.add(lv.level + ":" + m.from);
  }
  const snap = snapshot(game, 0, levels[0].map);
  if (!snap) return false;
  for (const [lv, p] of plans) {
    const busy = new Set(lv.creatures.filter((m) => !moved.has(lv.level + ":" + m.pos)).map((m) => m.pos[0] * snap.W + m.pos[1]));
    for (const { r, c, block } of p.writes!) {
      if (r < 0 || c < 0 || r >= snap.H || c >= snap.W || busy.has(r * snap.W + c) || snap.mob(lv.level, r, c)) continue;
      if (lv.items[r * snap.W + c]) continue;                       // (never over a ladder or a torch: the scene picks around them)
      snap.write(lv.level, r, c, block);
    }
  }
  game.load(snap.bytes);
  return true;
}

/** The engine's snapshot opened for writing blocks: found by matching one floor's map (`level`, as `map`), its spawn masks checked
 *  against the overworld. Null when the engine is laid out otherwise (hands off). write() keeps the masks as the engine keeps them;
 *  game.load(bytes) puts it back. */
function snapshot(game: CraftaxGame, level: number, map: readonly number[]) {
  const s0 = game.state(), [H, W] = s0.size, N = H * W, bytes = game.save();
  let M = -1;
  outer: for (let i = 0; i + N <= bytes.length; i += 8) {
    for (let k = 0; k < N; k++) if (bytes[i + k] !== map[k]) continue outer;
    M = i - level * N; break;
  }
  if (M < 0) { console.warn("[craftax-3d] the engine's map wasn't found in its snapshot; left as it is"); return null; }
  const L = N * LEVELS, mobs = M + 3 * L, R8 = LEVELS * H * 8, land = mobs + R8, grave = land + R8, water = grave + R8;
  if (water + R8 > bytes.length || H > 64 || W > 64) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const row = (base: number, lv: number, r: number) => base + (lv * H + r) * 8;
  const bit = (base: number, lv: number, r: number, c: number) => (dv.getBigUint64(row(base, lv, r), true) >> BigInt(c)) & 1n;
  const set = (base: number, lv: number, r: number, c: number, on: boolean) => {
    const at = row(base, lv, r), v = dv.getBigUint64(at, true), m = 1n << BigInt(c);
    dv.setBigUint64(at, on ? v | m : v & ~m, true);
  };
  for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {          // the masks must read as expected on the overworld, else hands off
    const b = bytes[M + r * W + c];
    if (bit(land, 0, r, c) !== (landy(b) ? 1n : 0n) || bit(water, 0, r, c) !== (b === WATER ? 1n : 0n)) {
      console.warn("[craftax-3d] the engine's snapshot isn't laid out as expected; left as it is"); return null;
    }
  }
  return {
    bytes, H, W,
    mob: (lv: number, r: number, c: number) => bit(mobs, lv, r, c) === 1n,
    write(lv: number, r: number, c: number, block: number) {
      bytes[M + lv * N + r * W + c] = block;
      set(land, lv, r, c, landy(block)); set(grave, lv, r, c, false); set(water, lv, r, c, block === WATER);
    },
  };
}

/** Blocks written into the game where it is now (its floor on screen): the engine's own state, as a set piece writes. A tile with a
 *  creature on it is left. True if anything was written. */
export function writeBlocks(game: CraftaxGame, writes: readonly { r: number; c: number; block: number }[]): boolean {
  const s = game.state(), snap = snapshot(game, s.level, s.map);
  if (!snap) return false;
  let n = 0;
  for (const { r, c, block } of writes) if (r >= 0 && c >= 0 && r < snap.H && c < snap.W && !snap.mob(s.level, r, c)) { snap.write(s.level, r, c, block); n++; }
  if (n) game.load(snap.bytes);
  return n > 0;
}

/** The way into the victory portal (src/effects/victory.ts openPortal): the tombstones on these tiles of the Graveyard cleared to its
 *  floor, in the engine. Only once the Necromancer is beaten, only tombstones. Not a recorded op: a recording ends before you come this
 *  near the portal (local.ts portalCut) and a replay clears them in its drawing only, so a recording and its replay stay one game. */
export function clearWay(game: CraftaxGame, cells: readonly number[][]): boolean {
  const f = game.state(), W = f.size[1], GRAVE = [33, 34, 35];
  if (!f.achievements.includes(49) || f.level !== 8) return false;
  const graves = cells.filter(([r, c]) => GRAVE.includes(f.map[r * W + c]));
  return graves.length > 0 && writeBlocks(game, graves.map(([r, c]) => ({ r, c, block: PATH })));
}
