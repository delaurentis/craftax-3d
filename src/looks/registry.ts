// The looks in M's order (color, phosphor, laser, then the plugins' by their order; Shift+M back), found by id; their renderers per
// view (each look's own, the plugins' "lookView"s) and which one draws a look in a view; the plain look of each render, a look's skin,
// and the look the game's own story wears (the opening, Try Again, the portal).
import type { Look, LookView, ViewId } from "./types";
import { listed } from "../core/plugins";
import { color, colorView } from "./color";
import { phosphor, phosphorView } from "./phosphor";
import { laser, laserView } from "./laser";

const BUILT_IN: Look[] = [color, phosphor, laser], VIEWS: LookView[] = [colorView, phosphorView, laserView];
/** Every look, in M's order (a plugin's without an order after the built-ins, as added). */
export const looks = (): Look[] => {
  const all = [...BUILT_IN, ...listed("look")];
  return all.map((L, i) => ({ L, k: L.order ?? 1000 + i })).sort((a, b) => a.k - b.k).map((o) => o.L);
};
export const look = (id: string | null | undefined): Look | undefined => looks().find((L) => L.id === id);
/** The plain look of a render: the line frame's (laser) or color's. A skin is drawn over the first. */
export const plainLook = (lines: boolean): Look => BUILT_IN.find((L) => !L.over && L.lines === lines)!;
/** The skin a look puts on (itself, if it is one), or none. */
export const skinOf = (id: string | null | undefined): Look | null => { const L = look(id); return L?.over ? L : null; };
/** The simulation's own look (Pete): a new world's first moments, Try Again, through the portal and the tunnel. */
export const SIM_LOOK = "phosphor";
/** A view's id from flat.mode (0 first person, 1 the classic 2D game, 2 bird's-eye). */
export const viewOf = (mode: number): ViewId => (mode === 1 ? "classic" : mode === 2 ? "overhead" : "first");
/** One of the built-in looks' own renderers (the line frame and color: render.ts draws them without a post pass). */
export const builtInView = (r: LookView | null) => !!r && VIEWS.includes(r);
// the newest renderer listed for a look in a view (a plugin's over the look's own)
const own = (id: string, v: ViewId): LookView | undefined => [...VIEWS, ...listed("lookView")].reverse().find((r) => r.look === id && r.views.includes(v));
/** Which look draws L in view v, and with what: its own renderer; a skin's plain line look's (phosphor with laser's classic picture);
 *  else color's, as color (r null: color has none there either, the classic view's original art). */
export function drawn(L: Look, v: ViewId): { as: Look; r: LookView | null } {
  const r = own(L.id, v) ?? (L.over ? own(plainLook(L.lines).id, v) : undefined);
  if (r) return { as: L, r };
  return { as: color, r: own(color.id, v) ?? null };
}
