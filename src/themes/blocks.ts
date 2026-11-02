// What the world's build asks of the themes, tile by tile (src/world/build.ts, terrain.ts): a solid block's height (the theme
// being left and the one coming in, eased by the tile's progress), the tile each face draws under both, and the extra geometry
// the tile's theme decorates it with. Each theme's heights are worked out once per map and kept (a wave builds chunks again
// several times a second).
import { B, SOLID, TALL } from "../world/blocks";
import { makeDraw } from "./draw";
import { COLS, NAMES, ROWS } from "../resources/blocks/paint";
import { onScreen, themeAt, tileP } from "./state";
import type { Geo, Remap } from "../world/geo";
import type { BlockAt, CrownBox, Theme } from "./types";
import { placeCrown, type CrownTpl } from "./crowns";

/** The parts of the World these read (src/world/core.ts). */
interface MapView { H: number; W: number; level: number; map: number[]; key: string | null; placed?: Set<number>; stdH: Float32Array }
const solid = (b: number) => b in SOLID || TALL.has(b);
const at = (w: MapView, r: number, c: number, height: number): BlockAt => {
  const b = w.map[r * w.W + c];
  return { block: b, r, c, level: w.level, height, placed: b === B.STONE && !w.level && !!w.placed?.has(r * w.W + c), floor: w };
};
// a theme's hook, guarded: one that throws is told once (per theme and hook) and that tile drawn as the standard one, so a theme's bug
// never stops a chunk from being built
const failed = new Set<string>();
function guard<T>(t: Theme, hook: string, fn: () => T, fallback: T): T {
  try { return fn(); } catch (e) {
    if (!failed.has(t.id + hook)) { failed.add(t.id + hook); console.error(`[craftax-3d] theme "${t.id}": its ${hook}() failed (drawn as the standard)`, e); }
    return fallback;
  }
}
// a theme's heights for the map now (NaN: the standard one), kept per theme until the map changes
const kept = new Map<string, { key: string; h: Float32Array }>();
function heightsOf(t: Theme, w: MapView, std: Float32Array): Float32Array {
  const key = `${w.key}|${w.level}|${w.placed?.size ?? 0}`, k = kept.get(t.id);
  if (k && k.key === key && k.h.length === std.length) return k.h;
  const h = new Float32Array(std.length).fill(NaN);
  for (let i = 0; i < std.length; i++) {
    if (!solid(w.map[i])) continue;
    const v = guard(t, "shape", () => t.shape!(at(w, (i / w.W) | 0, i % w.W, std[i]))?.height, undefined);
    if (v !== undefined && Number.isFinite(v)) h[i] = Math.max(0.05, v);
  }
  kept.set(t.id, { key, h });
  return h;
}
/** The heights to draw: the standard ones (std), each solid block's eased from the old theme's to the new one's by its progress. */
export function themeHeights(w: MapView, std: Float32Array): Float32Array {
  const { from, to } = onScreen;
  shapeRun.ends = null;
  if (!from?.shape && !to?.shape) return std;
  const hf = from?.shape ? heightsOf(from, w, std) : null, ht = to?.shape ? heightsOf(to, w, std) : null;
  const moving = from !== to && !!onScreen.p, out = new Float32Array(std), A = new Float32Array(std), Bh = new Float32Array(std);
  for (let i = 0; i < std.length; i++) {
    const a = hf && !Number.isNaN(hf[i]) ? hf[i] : std[i], b = ht && !Number.isNaN(ht[i]) ? ht[i] : std[i];
    A[i] = a; Bh[i] = b;
    if (a !== std[i] || b !== std[i]) out[i] = moving ? Math.max(a, b) : b;
  }
  if (moving) shapeRun.ends = { a: A, b: Bh };
  return out;
}
/** A switch moving stones (themeHeights): each column's height under the old theme (a) and the new (b), while it runs; the world
 *  builds each at the taller (the card scales it to its height now: transition.ts) and hides a side only behind a neighbour as tall
 *  the whole way (low). */
export const shapeRun = { ends: null as { a: Float32Array; b: Float32Array } | null };
export const shapeLow = (i: number, h: number): number => (shapeRun.ends ? Math.min(shapeRun.ends.a[i], shapeRun.ends.b[i]) : h);
/** Where the old and the new theme's heights differ: the tiles a wave has to build again as it passes. */
export function shapeChanges(w: MapView, std: Float32Array): Uint8Array | null {
  const { from, to } = onScreen;
  if (from === to || (!from?.shape && !to?.shape)) return null;
  const hf = from?.shape ? heightsOf(from, w, std) : null, ht = to?.shape ? heightsOf(to, w, std) : null, out = new Uint8Array(std.length);
  for (let i = 0; i < std.length; i++) {
    const a = hf && !Number.isNaN(hf[i]) ? hf[i] : std[i], b = ht && !Number.isNaN(ht[i]) ? ht[i] : std[i];
    out[i] = a !== b ? 1 : 0;
  }
  return out;
}
// a theme's pick, if the atlas has it; a name it doesn't have is told once and drawn as the standard tile (a theme's slip must never
// stop the game from starting)
let index: Map<string, number> | null = null;
const told = new Set<string>();
function known(t: Theme | null, name: string | undefined, std: string): string {
  if (name === undefined || name === std) return std;
  if (!index || index.size !== NAMES.length) index = new Map(NAMES.map((n, i) => [n, i]));
  const i = index.get(name);
  if (i !== undefined && i < COLS * ROWS) return name;
  if (!told.has(name)) { told.add(name); console.warn(`[craftax-3d] theme "${t?.id}" picks the tile "${name}", which ${i === undefined ? "isn't one (add it under tiles)" : "didn't fit in the atlas"}: drawn as "${std}"`); }
  return std;
}
/** A tile's faces' tiles under the old and the new theme (null: neither picks tiles: as given). */
export function themeRemap(w: MapView, r: number, c: number): Remap | null {
  const { from, to } = onScreen;
  if (!from?.tile && !to?.tile) return null;
  const a = at(w, r, c, w.stdH[r * w.W + c] ?? 0);
  return (tex, f, row) => {
    const pick = (th: Theme | null) => (th?.tile ? guard(th, "tile", () => th.tile!(tex, a, f, row), undefined) : undefined);
    const t = known(to, pick(to), tex);
    return [from === to ? t : known(from, pick(from), tex), t];
  };
}
/** The tile's extra geometry, from the theme it shows now (the old one until the wave has half passed). */
/** Whether the grass on (r, c) grows 3D blades under the theme on screen (Theme.grassAt; a theme's bug: it does). */
export function themeGrass(w: MapView, r: number, c: number): boolean {
  const t = onScreen.to;
  if (!t?.grassAt) return true;
  return guard(t, "grassAt", () => t.grassAt!(at(w, r, c, w.stdH[r * w.W + c] ?? 0)) !== false, true);
}
export function themeDecorate(w: MapView, geo: Geo, r: number, c: number, top: number): void {
  const t = themeAt(r, c);
  if (!t?.decorate) return;
  const id0 = geo.id;
  guard(t, "decorate", () => t.decorate!({ ...at(w, r, c, w.stdH[r * w.W + c] ?? 0), top }, makeDraw(geo, r, c, r + 1, c + 1, 110)), undefined);
  geo.id = id0;
}
/** A theme's own crown for the tree on (r, c): its boxes (null: the standard crown). t: the theme (the one the tile shows now). */
export function themeCrown(w: MapView, r: number, c: number, trunk: number, light: number, overhead = false, t: Theme | null = themeAt(r, c)): CrownBox[] | null {
  if (!t?.crown) return null;
  const p = crownPicked(w, r, c, trunk, light, overhead, t);
  if (p) return placeCrown(p.tpl.boxes, p.turn, c + 0.5, r + 0.5);
  return guard(t, "crown", () => t.crown!({ ...at(w, r, c, w.stdH[r * w.W + c] ?? 0), trunk, light, overhead }), undefined) ?? null;
}
// the prebuilt crowns (Theme.crownPick), for the session: by theme, key, view and trunk height, centred on the trunk (crowns.ts
// stamps them into a chunk without drawing them again)
const crownTpls = new Map<string, CrownTpl>();
/** The prebuilt crown the tree on (r, c) wears, and its turn (null: none: the theme's crown() or the standard). */
export function crownPicked(w: MapView, r: number, c: number, trunk: number, light: number, overhead: boolean, t: Theme | null = themeAt(r, c)): { tpl: CrownTpl; turn: number } | null {
  if (!t?.crown || !t.crownPick) return null;
  const a = { ...at(w, r, c, w.stdH[r * w.W + c] ?? 0), trunk, light, overhead };
  const p = guard(t, "crownPick", () => t.crownPick!(a), undefined);
  if (!p) return null;
  const k = `${t.id}|${p.key}|${overhead ? 1 : 0}|${trunk}`;
  let tpl = crownTpls.get(k);
  if (!tpl) {
    const raw = guard(t, "crown", () => t.crown!(a), undefined);
    if (!raw) return null;
    tpl = { boxes: raw.map((b) => ({ ...b, x0: b.x0 - (c + 0.5), x1: b.x1 - (c + 0.5), z0: b.z0 - (r + 0.5), z1: b.z1 - (r + 0.5) })), geo: null };
    crownTpls.set(k, tpl);
  }
  return { tpl, turn: (((p.turn ?? 0) % 4) + 4) % 4 };
}
/** Does either theme decorate or draw its own crowns (a wave must build the tiles again as it passes)? */
export const decorates = (): boolean => !!(onScreen.from?.decorate || onScreen.to?.decorate || onScreen.from?.crown || onScreen.to?.crown);
/** The tile a block on (r, c) shows on its sides under the theme on screen there (a block just broken: its flying pieces look as it
 *  did). map: the floor as it was, with the block still in it; name: its standard side tile; height: how tall it stood; placed: a
 *  stone the player placed. */
export function themedSide(map: readonly number[], W: number, H: number, level: number, r: number, c: number, name: string, height: number, placed = false): string {
  const t = themeAt(r, c);
  if (!t?.tile) return name;
  const b = map[r * W + c], a: BlockAt = { block: b, r, c, level, height, placed, floor: { map, W, H } };
  return known(t, guard(t, "tile", () => t.tile!(name, a, "side", Math.max(0, Math.ceil(height - 1e-6) - 1)), undefined), name);
}
