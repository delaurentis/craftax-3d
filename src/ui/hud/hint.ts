// Flashed messages, the sealed-door hint, and the hint line.
import "../../input/intent";
import { ITEM } from "../../../js/world";
import { $ } from "../../core/shared";
import { game } from "../../core/game";
import { PHONE } from "./buttons";
import type { GameState } from "../../core/types";

// this module's state that other modules set (one module can't assign another's let): flashT, sealGlowT, sealGlowAt
export interface Hints {
  /** When the flashed message went up (performance.now()). */
  flashT: number;
  /** A sealed ladder's grate glowing: since when, and at which tile (row * width + column; -1 none). */
  sealGlowT: number;
  sealGlowAt: number;
}
export const hints = {} as Hints;

// ---------- hints ----------
hints.flashT = 0; export let flashMsg = "", flashFor = 1800;
// on a phone (PHONE, below) the asides in brackets are dropped (Pete: the pixel font is wide), "Loading the bot (~70 MB the first time)…" → "Loading the bot…"
export let shakeAt = 0;
export function shakeSlot() {                                                       // the hotbar slot in hand shakes (at most every 0.6 s)
  if (performance.now() - shakeAt < 600) return;
  shakeAt = performance.now();
  const el = document.querySelectorAll("#hotbar .slot")[game.hud.sel];
  if (el) { el.classList.remove("nope"); void (el as HTMLElement).offsetWidth; el.classList.add("nope"); }
}
export function flash(m: string) {
  if (PHONE.matches && /^\+\d+ /.test(m)) return;                       // a phone (Pete: too much): no "+1 stone", "+4 food"; the hotbar shows it
  flashMsg = PHONE.matches ? m.replace(/\s*\([^)]*\)/g, "") : m; hints.flashT = performance.now(); flashFor = Math.min(9000, 1800 + 45 * Math.max(0, flashMsg.length - 40)); }   // long ones stay long enough to read
// a sealed ladder down (Craftax: 8 monsters killed on a floor open it): trying it, the low-need pop-up says how many are left (Pete)
// (the engine never sends LADDER_DOWN_BLOCKED: a ladder down is sealed while this floor's kills are short; the overworld starts at 10)
export const sealLeft = (s: GameState) => Math.max(0, 8 - s.monsters_killed);
export const isSealed = (s: GameState, it: number) => it === ITEM.LADDER_DOWN_BLOCKED || (it === ITEM.LADDER_DOWN && s.monsters_killed < 8);
export let sealedT = 0; hints.sealGlowT = -1e9; hints.sealGlowAt = -1;
export function sealed(r = game.S!.pos[0], c = game.S!.pos[1]) {
  const n = sealLeft(game.S!), now = performance.now();
  hints.sealGlowT = now; hints.sealGlowAt = r * game.S!.size[1] + c;                           // (that ladder's grate glows: sealFx)
  if (now - sealedT < 2500) return;                                          // (once while it's up)
  sealedT = now;
  game.hud.need("skull", "Ladder sealed", `Defeat ${n} more ${n === 1 ? "monster" : "monsters"} to open it`);
}
export function hint(s: GameState) {
  const it = s.items[s.pos[0] * s.size[1] + s.pos[1]];
  let m = "";
  if (s.sleeping) m = "Sleeping… (you wake when rested)";
  else if (s.resting) m = "Resting…";
  else if (isSealed(s, it)) m = `Ladder sealed: defeat ${sealLeft(s)} more ${sealLeft(s) === 1 ? "monster" : "monsters"} on this floor`;
  else if (it === ITEM.LADDER_DOWN) m = "Press Space to climb down";
  else if (it === ITEM.LADDER_UP) m = "Press Space to climb up";
  if (performance.now() - hints.flashT < flashFor) m = flashMsg;
  $("hint")!.textContent = m;
}
