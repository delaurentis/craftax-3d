// Which scene is on (?scene=<id>, else a set-pieces plugin marked default), the saves it keeps apart, and the set piece in the floor
// being drawn: every installed scene's recognize() is asked, whatever the page, so a save, a recording or a replay of a scene's
// world shows its set piece with no flag of its own.
import { listed } from "../core/plugins";
import type { Placement, SetPieces } from "../themes/types";

const asked = (location.search.match(/[?&]scene=([\w-]+)/) || [])[1] || null;
/** The scene new worlds are made in (null: the standard game). */
export function activeScene(): SetPieces | null {
  const all = listed("setPieces");
  if (asked) return all.find((s) => s.id === asked) ?? null;
  return [...all].reverse().find((s) => s.default) ?? null;
}
/** The storage prefix and database name for this page's worlds: a scene keeps its own, apart from the player's real ones. */
export const sceneStore = (): { ns: string; db: string } | null => {
  const s = activeScene();
  return s ? { ns: `craftax3d.scene.${s.id}.`, db: `craftax3d-scene-${s.id}` } : null;
};
/** The floor the world is drawing, as a set piece's recognize() reads it. */
export interface FloorView { level: number; seed: number; size: readonly [number, number]; map: readonly number[]; items: readonly number[] }
let last: { key: string; p: Placement | null } = { key: "", p: null };
/** The set piece in this floor (null: none), worked out once per map. key: anything that changes with the map (the world's key). */
export function placementFor(f: FloorView, key: string): Placement | null {
  if (key === last.key) return last.p;
  let p: Placement | null = null;
  const find = (item: number) => { const i = f.items.indexOf(item); return i < 0 ? null : [(i / f.size[1]) | 0, i % f.size[1]] as const; };
  const view = { level: f.level, seed: f.seed, size: f.size, map: f.map, items: f.items, ladderDown: find(2) ?? find(4), ladderUp: find(3) };
  for (const s of listed("setPieces")) {
    try { p = s.recognize(view); } catch (e) { console.error(`[craftax-3d] scene "${s.id}" failed to recognize its world`, e); }
    if (p) break;
  }
  last = { key, p };
  return p;
}
