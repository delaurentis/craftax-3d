// A set piece raised into the world you're in, and taken away again (I, on a page that asks: src/scenes/active.ts raisable): the
// scene's place() run on the floor you stand on as it is now, its blocks written into the engine (js/local.ts POST /api/scene), the
// tiles they replaced kept with the world (localStorage, by world) so taking it away puts them back. Both are one recorded op,
// { k: "blocks" }: the creatures moved aside, then the blocks written, so a replay (and the site's verifier) plays it the same.
// How it arrives on screen, in stages, is src/scenes/rise.ts: it sees the map change, whatever made it.
//
// Taking it away puts back only the tiles still as it left them (a block you mined or placed on the square since stays yours), and
// never solid ground onto a creature or onto you. A scene world made with its set piece (?scene=<id>, no record of what it
// replaced) is taken back to its seed's own ground: the floor made again from the seed on a scratch copy.
import { raisable } from "./active";
import { writeBlocks } from "./place";
import type { CraftaxEngine, CraftaxGame, EngineOp, EngineState, Mob } from "../core/types";
import type { GeneratedLevel, SetPieces, Tile } from "../themes/types";

/** [row, column, block]; a move: [row, column, to row, to column]. */
export type BlockCell = [number, number, number];
export type BlocksOp = Extract<EngineOp, { k: "blocks" }>;
/** What js/local.ts lends this: the engine, the world, its storage, the recorder. */
export interface RaiseHost {
  cx(): CraftaxEngine; game(): CraftaxGame; flags(): number; seed(): number; world(): string;
  get(k: string): string | null; set(k: string, v: string): void; op(o: EngineOp): void;
}
/** What happened, for the page's message. */
export interface Raised { id: string; label: string; on: boolean; n: number }
/** Kept per world: the scene, its floor, and each tile [row, column, the block before, the block written]. */
interface Kept { id: string; level: number; cells: [number, number, number, number][] }

const GRASS = 2, SAND = 6, PATH = 7;
const standable = (b: number) => b === GRASS || b === SAND || b === PATH;
const keyOf = (h: RaiseHost) => "raised:" + h.world();
const tileOf = (s: EngineState, item: number): Tile | null => { const i = s.items.indexOf(item); return i < 0 ? null : [(i / s.size[1]) | 0, i % s.size[1]]; };
const mobsOf = (s: EngineState) => [...s.melee, ...s.ranged, ...s.passive] as Mob[];
function levelOf(s: EngineState, seed: number): GeneratedLevel {
  return { level: s.level, seed, size: [s.size[0], s.size[1]], map: Object.freeze([...s.map]), items: Object.freeze([...s.items]),
    ladderDown: tileOf(s, 2) ?? tileOf(s, 4), ladderUp: tileOf(s, 3), creatures: Object.freeze(mobsOf(s).map((m) => ({ kind: m.kind, pos: [m.pos[0], m.pos[1]] as Tile }))),
    spawn: [s.pos[0], s.pos[1]] };                                 // (where you stand: the creatures stepping aside keep off it)
}
/** The op played: the creatures moved aside, then the blocks written (js/local.ts applyOp, and a replay's). */
export function applyBlocks(game: CraftaxGame, o: BlocksOp): void {
  for (const [r, c, r2, c2] of o.moves ?? []) game.moveMob?.(o.level, r, c, r2, c2);
  writeBlocks(game, o.cells.map(([r, c, block]) => ({ r, c, block })), o.level);
}
const read = (h: RaiseHost): Kept | null => { try { return JSON.parse(h.get(keyOf(h)) || "null"); } catch { return null; } };

/** I: the set piece that is up taken away, else the first this page lets you raise put up (or the one named). Throws a message. */
export function toggle(h: RaiseHost, id?: string): Raised {
  const scenes = raisable(), game = h.game(), s = game.state();
  if (!scenes.length) throw new Error("no scene to raise on this page (?build=<id>)");
  const view = levelOf(s, h.seed());
  const up = scenes.find((sc) => { try { return !!sc.recognize(view); } catch { return false; } });
  if (up) return lower(h, up, view);
  const sc = (id && scenes.find((x) => x.id === id)) || scenes[0];
  return raise(h, sc, view);
}

function raise(h: RaiseHost, sc: SetPieces, lv: GeneratedLevel): Raised {
  const game = h.game(), [, W] = lv.size, at = (r: number, c: number) => r * W + c;
  let p = null;
  try { p = sc.place(lv); } catch (e) { console.error(`[craftax-3d] scene "${sc.id}" failed to place`, e); }
  if (!p?.writes?.length) throw new Error(`${sc.label} can't stand on this floor`);
  const me = at(lv.spawn[0], lv.spawn[1]), mine = p.writes.find((w) => at(w.r, w.c) === me);
  if (mine && !standable(mine.block)) throw new Error(`Step out of the way: ${sc.label} goes up where you stand`);
  const moves: [number, number, number, number][] = [];
  for (const m of p.moves ?? []) if (game.moveMob?.(lv.level, m.from[0], m.from[1], m.to[0], m.to[1])) moves.push([m.from[0], m.from[1], m.to[0], m.to[1]]);
  const now = game.state(), busy = new Set(mobsOf(now).filter((m) => now.level === lv.level).map((m) => at(m.pos[0], m.pos[1])));
  const cells = p.writes.filter((w) => !lv.items[at(w.r, w.c)] && !busy.has(at(w.r, w.c)) && lv.map[at(w.r, w.c)] !== w.block)
    .map((w): BlockCell => [w.r, w.c, w.block]);
  const o: BlocksOp = { k: "blocks", level: lv.level, cells, ...(moves.length ? { moves } : {}) };
  applyBlocks(game, o); h.op(o);
  const kept: Kept = { id: sc.id, level: lv.level, cells: cells.map(([r, c, b]) => [r, c, lv.map[at(r, c)], b]) };
  h.set(keyOf(h), JSON.stringify(kept));
  return { id: sc.id, label: sc.label, on: true, n: cells.length };
}

function lower(h: RaiseHost, sc: SetPieces, lv: GeneratedLevel): Raised {
  const game = h.game(), [, W] = lv.size, at = (r: number, c: number) => r * W + c;
  const k = read(h), kept = k && k.id === sc.id && k.level === lv.level ? k.cells : fromSeed(h, sc, lv.level);
  if (!kept) throw new Error(`${sc.label} was made with this world: its ground can't be found again`);
  const s = game.state(), busy = new Set(mobsOf(s).map((m) => at(m.pos[0], m.pos[1]))), me = at(s.pos[0], s.pos[1]);
  const cells = kept.filter(([r, c, was, wrote]) => lv.map[at(r, c)] === wrote && was !== wrote && !busy.has(at(r, c)) && (at(r, c) !== me || standable(was)))
    .map(([r, c, was]): BlockCell => [r, c, was]);
  const o: BlocksOp = { k: "blocks", level: lv.level, cells };
  applyBlocks(game, o); h.op(o);
  h.set(keyOf(h), "");
  return { id: sc.id, label: sc.label, on: false, n: cells.length };
}

/** A scene world's set piece, with no record of what it replaced: what place() would write on the floor as the seed makes it, and
 *  the seed's own block under each. */
function fromSeed(h: RaiseHost, sc: SetPieces, level: number): [number, number, number, number][] | null {
  const scratch = h.cx().newGame(h.flags());
  try {
    scratch.reset(h.seed());
    if (level) scratch.teleport(level);
    const s = scratch.state();
    if (s.level !== level) return null;
    const lv = levelOf(s, h.seed()), p = sc.place(lv), W = s.size[1];
    return p?.writes?.map((w) => [w.r, w.c, lv.map[w.r * W + w.c], w.block]) ?? null;
  } catch { return null; } finally { scratch.free(); }
}
