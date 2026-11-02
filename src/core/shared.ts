// What every part shares: the sound, the memory strip's switch, the DOM lookup, Craftax's action ids and directions, the eye height.
import { Sound } from "../../js/sound";
import type { Pos } from "./types";

// this module's state that other modules set (one module can't assign another's let): memOn, lastMemDraw
export interface Common {
  /** The bot's memory strip shown (Y; remembered), when a plugin brings one (src/views/memory.ts). */
  memOn: boolean;
  /** When the memory strip was last drawn (performance.now()). */
  lastMemDraw: number;
}
export const common = {} as Common;

export const sound = new Sound();
common.memOn = (() => { try { return localStorage.getItem("craftax3d.memory") !== "0"; } catch { return true; } })(); common.lastMemDraw = 0;

export const $ = (id: string): HTMLElement | null => document.getElementById(id);
export const A = { NOOP: 0, LEFT: 1, RIGHT: 2, UP: 3, DOWN: 4, DO: 5, SLEEP: 6, PLACE_STONE: 7, REST: 17, DESCEND: 18, ASCEND: 19 };
export const DIRV: Record<number, Pos> = { 1: [0, -1], 2: [0, 1], 3: [-1, 0], 4: [1, 0] };                 // Craftax direction → [dRow, dCol]
export const EYE = 1.62;
