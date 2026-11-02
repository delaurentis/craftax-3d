// Touch input: looking, the pad, Use and Sleep.
import { drinkLater, letGoHold, onWaterAt, orbitBy, turn } from "./pointer";
import { HOTBAR } from "../../js/hud";
import { $ } from "../core/shared";
import { canvas } from "../render/scene";
import { flat, game, keys } from "../core/game";
import { aimState } from "./aim";
import { playing, screens } from "../ui/screens/screen";
import type { Holdable } from "./pointer";

/** The finger on the view: its pointer, where it is and where it went down, and whether it has moved (a drag, not a tap). */
export interface LookTouch extends Holdable { id: number; x: number; y: number; x0: number; y0: number; moved: boolean }

// ---------- touch screens: the pad (left thumb) walks, Use (right thumb) is Space, one finger dragged on
// the view looks (3/4: orbits), and a tap on the view acts where it lands, like a click
export const touchOn = () => document.body.classList.add("touch");
// no zoom on a phone: iOS Safari ignores user-scalable=no, so pinches (gesture*) and a quick second tap are stopped here
for (const ev of ["gesturestart", "gesturechange"]) document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
export let lastTouchEnd = 0;
document.addEventListener("touchend", (e) => {
  const now = performance.now();
  if (now - lastTouchEnd < 350 && !(e.target as Element).closest("input, select, textarea, a")) e.preventDefault();   // a double tap: no zoom
  lastTouchEnd = now;
}, { passive: false });
document.addEventListener("dblclick", (e) => e.preventDefault(), { passive: false });
// and no selection or long-press menu anywhere but the text fields (iOS can start one despite user-select)
export const typing = (t: EventTarget | null) => (t as Element).closest && (t as Element).closest("input, textarea, select, [contenteditable]");
document.addEventListener("selectstart", (e) => { if (!typing(e.target)) e.preventDefault(); });
document.addEventListener("contextmenu", (e) => { if (!typing(e.target)) e.preventDefault(); });
// a touch screen: its pointer coarse (a tablet or a foldable too, Pete: wider than the phone layout; a mouse or trackpad attached can't
// hide them). Watched, so a browser's device mode switched on shows them too
const COARSE = matchMedia("(pointer: coarse)");
if (COARSE.matches || /[?&]touch\b/.test(location.search)) touchOn();   // (?touch: the touch controls on any screen, to try a tablet's layout in a resized window)
COARSE.addEventListener("change", () => { if (COARSE.matches) touchOn(); });
addEventListener("pointerdown", (e) => { if ((e as PointerEvent).pointerType === "touch") touchOn(); }, { capture: true });
export const capture = (el: Element, e: PointerEvent) => { try { el.setPointerCapture(e.pointerId); } catch {} };   // keeps the finger's moves coming to el
export let lookTouch: LookTouch | null = null;                                                       // the finger on the view: {id, x, y, x0, y0, moved}
canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType !== "touch" || lookTouch) return;
  e.preventDefault();                                                       // no mouse events follow (they would be a second click)
  lookTouch = { id: e.pointerId, x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, moved: false };
  aimState.tapT = 0;                                                        // (the last tap's target stops lighting: targeting.ts)
  capture(canvas, e);
  if (playing() && !nearControls(e.clientX, e.clientY) && onWaterAt(e.clientX, e.clientY)) drinkLater(lookTouch, e.clientX, e.clientY);
});
canvas.addEventListener("pointermove", (e) => {
  const t = lookTouch;
  if (!t || e.pointerId !== t.id) return;
  const dx = e.clientX - t.x, dy = e.clientY - t.y;
  t.x = e.clientX; t.y = e.clientY;
  if (!t.moved && Math.hypot(t.x - t.x0, t.y - t.y0) < 10) return;           // a tap may wobble a little
  if (t.held) return;                                                       // holding a target: the finger may slide, the target stays
  clearTimeout(t.holdT);
  t.moved = true;
  if (!playing()) return;
  if (flat.mode === 2) orbitBy(dx * 0.008, dy * 0.006);
  else turn(dx * 0.006, dy * 0.006);
});
// a tap that just misses the pad, Use, Zzz or the hotbar (Pete) is a missed press, not a tap on the world (it would walk you there): 32 px around them
export const NEAR_PX = 32;
export function nearControls(x: number, y: number) {
  for (const id of ["tpad", "tuse", "tsleep", "hotrow"]) {
    const r = $(id)!.getBoundingClientRect();
    if (r.width && x > r.left - NEAR_PX && x < r.right + NEAR_PX && y > r.top - NEAR_PX && y < r.bottom + NEAR_PX) return true;
  }
  return false;
}
export const lookUp = (e: PointerEvent) => {
  const t = lookTouch;
  if (!t || e.pointerId !== t.id) return;
  lookTouch = null;
  if (letGoHold(t)) return;
  clearTimeout(t.holdT);
  if (e.type === "pointerup" && !t.moved && playing() && !nearControls(t.x0, t.y0)) {
    aimState.pointer = { x: (t.x0 / innerWidth) * 2 - 1, y: 1 - (t.y0 / innerHeight) * 2 };
    game.doQueued = game.clickQueued = true; game.shiftClick = false; aimState.tapT = performance.now();
  }
};
canvas.addEventListener("pointerup", lookUp); canvas.addEventListener("pointercancel", lookUp);
// dead, in bird's-eye: a drag on the death screen's backdrop (not its buttons or the gravestone) still orbits the camera round your
// grave, mouse or finger (Pete); the screen sits over the view, so it takes the drag itself
export let deadDrag: { id: number; x: number; y: number } | null = null;
$("dead")!.addEventListener("pointerdown", (e) => {
  if (screens.screen !== "dead" || flat.mode !== 2 || (e.target as Element).closest("button, a, input, select, .tomb")) return;
  deadDrag = { id: e.pointerId, x: e.clientX, y: e.clientY }; capture($("dead")!, e);
});
$("dead")!.addEventListener("pointermove", (e) => {
  if (!deadDrag || e.pointerId !== deadDrag.id || flat.mode !== 2) return;
  const dx = e.clientX - deadDrag.x, dy = e.clientY - deadDrag.y;
  deadDrag.x = e.clientX; deadDrag.y = e.clientY;
  orbitBy(dx * 0.008, dy * 0.006);
});
for (const ev of ["pointerup", "pointercancel"]) $("dead")!.addEventListener(ev, (e) => { if (deadDrag && (e as PointerEvent).pointerId === deadDrag.id) deadDrag = null; });
// the pad: one finger, slid between the arrows like a d-pad; it holds W/A/S/D for moveAction
export const tpad = $("tpad")!, PAD = ["KeyW", "KeyA", "KeyS", "KeyD"];
export let padTouch: number | null = null;
// One-handed portrait mode (body.unified, Pete): each arrow's outer key turns you that way and Uses there (Space + the move key on a
// keyboard): whatever is in the way is hit, then you step on. A thumb slides between an arrow and its outer key
export let padDig = false;
export function digSet(on: boolean) {
  if (on === padDig) return;
  padDig = on;
  if (on) { game.doHeld = game.spaceHeld = true; } else if (padUse === null && !tuse.classList.contains("on")) game.doHeld = game.spaceHeld = false;   // (Use still held: it stays)
}
export function padAt(e: PointerEvent) {
  const r = tpad.getBoundingClientRect(), x = e.clientX - r.left - r.width / 2, y = e.clientY - r.top - r.height / 2;
  const k = Math.hypot(x, y) < r.width * 0.12 ? null : Math.abs(x) > Math.abs(y) ? (x > 0 ? "KeyD" : "KeyA") : y > 0 ? "KeyS" : "KeyW";
  const outer = tpad.querySelector<HTMLElement>(".dig")!.offsetWidth;                    // 0 unless the outer keys show (one-handed mode)
  const dig = !!k && outer > 0 && Math.max(Math.abs(x), Math.abs(y)) > r.width / 2 - outer - 1;
  const ahead = !!k && document.body.classList.contains("autodig") && !!HOTBAR[game.hud.sel].hand;   // Arrows act ahead: a tool in hand
  for (const p of PAD) if (p !== k) keys.delete(p);
  if (k) keys.add(k);
  for (const el of tpad.querySelectorAll<HTMLElement>("[data-k]")) el.classList.toggle("on", el.dataset.k === k && !dig);
  for (const el of tpad.querySelectorAll<HTMLElement>("[data-d]")) el.classList.toggle("on", el.dataset.d === k && dig);
  digSet(dig || ahead);
}
export let padUse: number | null = null;                                                          // the finger on the pad's middle Use (landscape)
tpad.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  const mid = (e.target as Element).closest(".use-mid");
  if (mid) { if (padUse === null && useDown()) { padUse = e.pointerId; capture(tpad, e); mid.classList.add("on"); } return; }
  if (padTouch !== null) return; padTouch = e.pointerId; padT = performance.now(); capture(tpad, e); padAt(e);
});
tpad.addEventListener("pointermove", (e) => { if (e.pointerId === padTouch) padAt(e); });
export let padT = 0;                                                               // when the pad was pressed
export const padUp = (e: PointerEvent) => {
  if (e.pointerId === padUse) { padUse = null; useUp(); tpad.querySelector(".use-mid")!.classList.remove("on"); return; }
  if (e.pointerId !== padTouch) return;
  padTouch = null;
  const release = () => {                                                    // a quick tap still steps: held until a tick has sent a move
    if (padTouch !== null) return;
    if (game.lastSend < padT && performance.now() - padT < 800) { setTimeout(release, 30); return; }
    for (const p of PAD) keys.delete(p);
    for (const el of tpad.querySelectorAll("[data-k], [data-d]")) el.classList.remove("on");
    digSet(false);
  };
  release();
};
tpad.addEventListener("pointerup", padUp); tpad.addEventListener("pointercancel", padUp);
// Use: Space, held — the selected tool on what is in front of you (hits repeat while held; drinks; opens a table)
export const tuse = $("tuse")!;
export function useDown() {                                                       // Use pressed (the button, or the pad's middle)
  if (!playing()) return false;
  game.doHeld = game.spaceHeld = game.spaceQueued = true;
  return true;
}
tuse.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (!useDown()) return;
  capture(tuse, e); tuse.classList.add("on");
});
export const useUp = () => { game.doHeld = game.spaceHeld = padDig; tuse.classList.remove("on"); };   // (a thumb still on Dig: it keeps hitting)
tuse.addEventListener("pointerup", useUp); tuse.addEventListener("pointercancel", useUp);
// Sleep: held for a second (a bar fills across it), a press of its own: Use holds its finger, so sliding down from Use never lands here
export const tsleep = $("tsleep")!, SLEEP_HOLD_MS = 1000;
export let sleepHold: ReturnType<typeof setTimeout> | 0 = 0;
tsleep.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (!playing() || !game.S || game.S.sleeping || sleepHold) return;
  // a tap sleeps, except in the two-handed layout on a phone held upright, where Zzz sits by the thumb: there it's a hold (Pete)
  if (document.body.classList.contains("unified") || !matchMedia("(max-width: 720px) and (orientation: portrait)").matches) { game.hud.onSleep?.(); return; }
  capture(tsleep, e);
  tsleep.classList.add("hold");
  sleepHold = setTimeout(() => { sleepHold = 0; tsleep.classList.remove("hold"); game.hud.onSleep?.(); }, SLEEP_HOLD_MS);
});
export let sleepAsk: ReturnType<typeof setTimeout> | 0 = 0;
export const sleepUp = () => {                                                       // let go early: no sleep, and it says to hold it (Pete)
  if (sleepHold) { tsleep.classList.add("asking"); clearTimeout(sleepAsk); sleepAsk = setTimeout(() => tsleep.classList.remove("asking"), 2000); }
  clearTimeout(sleepHold); sleepHold = 0; tsleep.classList.remove("hold");
};
tsleep.addEventListener("pointerup", sleepUp); tsleep.addEventListener("pointercancel", sleepUp);
