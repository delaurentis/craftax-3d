// The memory strip's slot: panels down both sides of the classic 2D view (index.html #mem-l, #mem-r), painted by a plugin's memory
// view (src/core/plugins.ts, "memoryView": a crystal's memory, say). The game owns only the two canvases: when they show, where they
// sit (centered in the letterbox on each side) and the Y toggle. With no view listed (the open game) they never show and Y does nothing.
import { listed, type MemoryView } from "../core/plugins";
import { $, common } from "../core/shared";
import type { GameState } from "../core/types";

/** True when a plugin brings a memory view (the Y toggle means something). */
export const hasMemoryView = (): boolean => listed("memoryView").length > 0;

/** The view the toggle names: the newest one listed. */
export const memoryLabel = (): string => { const v = listed("memoryView"); return v.length ? v[v.length - 1].label : "Memory strip"; };

/** Every new state (apply.ts): a new world clears the views, then each sees the state. */
export function memoryUpdate(prev: GameState | null, s: GameState): void {
  const views = listed("memoryView");
  if (!views.length) return;
  if (!prev || prev.seed !== s.seed) for (const v of views) v.clear();
  for (const v of views) v.update(s as unknown as Record<string, unknown>);
}

/** The player turned the strip off: the views forget what they hold. */
export function memoryClear(): void { for (const v of listed("memoryView")) v.clear(); }

const MIN_ROOM = 48;                                                   // the narrowest letterbox a strip goes in (CSS px)

// the newest view with something to show
const pick = (): MemoryView | null => [...listed("memoryView")].reverse().find((v) => v.active()) ?? null;

/** Every frame (camera.ts). shown: the classic view's 2D art is up; gap: the letterbox's width on each side; red: the laser frame. */
export function memoryFrame(shown: boolean, gap: number, red: boolean, now: number): void {
  const room = Math.max(0, gap);
  // (no room beside the image, as beside a split crystal's double-width frame: no strip, rather than one over the picture)
  const v = shown && common.memOn && room >= MIN_ROOM && hasMemoryView() ? pick() : null;
  const L = $("mem-l") as HTMLCanvasElement, R = $("mem-r") as HTMLCanvasElement;
  L.style.display = R.style.display = v ? "block" : "none";              // (block: the stylesheet hides .mem by default)
  if (!v || now - common.lastMemDraw <= 50) return;
  common.lastMemDraw = now;
  const H = innerHeight;
  v.draw(L, R, { width: room - 12, height: Math.max(48, H - 24), red }, now);
  for (const [cv, side] of [[L, "left"], [R, "right"]] as const) {
    cv.style.top = `${Math.round((H - cv.height) / 2)}px`;
    cv.style[side] = `${Math.max(4, Math.round((room - cv.width) / 2))}px`;
  }
}
