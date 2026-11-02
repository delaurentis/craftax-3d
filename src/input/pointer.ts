// Mouse input: hold to act, drinking, clicks, looking and turning, the 3/4 orbit.
import { opt } from "../ui/screens/options";
import { HOTBAR } from "../../js/hud";
import { $ } from "../core/shared";
import { canvas } from "../render/scene";
import { world } from "../render/arm";
import { flat, game, keys } from "../core/game";
import { aim, aimState } from "./aim";
import { drinkable } from "./targets";
import { pathing } from "./pathing";
import { botDriving, capOn, grab, locked, noCapture, noLock, playing, screens } from "../ui/screens/screen";

/** A press (mouse) or finger (touch) that may turn into a hold: its timer, and held once it did. */
export interface Holdable { holdT?: ReturnType<typeof setTimeout>; held?: boolean }
/** A mouse press on the view, uncaptured: its button and where. */
export interface Press extends Holdable { button: number; x: number; y: number }
// this module's state that other modules set (one module can't assign another's let): yawGoal, drinkSpam, pitchGoal, press, holding
export interface PointerState {
  /** The heading and tilt the view eases to (null: none). */
  yawGoal: number | null;
  pitchGoal: number | null;
  /** Spam on, water clicked: drink till full. */
  drinkSpam: boolean;
  press: Press | null;
  /** Hold to target: a target held now. */
  holding: boolean;
}
export const pointerState = {} as PointerState;
const input = (id: string) => $(id) as HTMLInputElement;

// unlocked, a press only becomes a click (DO / use) if the mouse barely moved before it was released; otherwise it was a look drag
// Hold to target (Settings): a press held still for a moment on the view locks what it was on. While held, you walk to it and hit it
// (as Move and Spam allow) and follow it if it moves; the pointer may wander, the target stays; letting go ends it
export const HOLD_MS = 250;
// never on a touch screen: a finger is down and dragging to look all the time (Pete), so there the option is hidden and off
export const holdOn = () => opt.hold && !document.body.classList.contains("touch");
pointerState.holding = false;
export function holdLater(p: Holdable, x: number, y: number, shift: boolean) {
  p.holdT = setTimeout(() => {
    if (!playing()) return;
    p.held = true; pointerState.holding = true;
    aimState.pointer = { x: (x / innerWidth) * 2 - 1, y: 1 - (y / innerHeight) * 2 };
    game.doQueued = game.clickQueued = true; game.shiftClick = shift;                    // the press acts now, on what it is on
  }, HOLD_MS);
}
export function letGoHold(p: Holdable | null) {                                                     // letting go ends a hold; true: it was one (so no click now)
  if (drinkHold) { drinkHold = false; pathing.pending = null; if (!pointerState.holding) return !p || !!p.held; }
  if (!pointerState.holding) return false;
  pointerState.holding = false; pathing.pending = null;
  return !p || !!p.held;
}
// holding on water (mouse or finger, held still, whatever the options): you drink, and keep drinking while it is held; a shore
// you are not at is walked to first (as Move allows)
export let drinkHold = false; pointerState.drinkSpam = false;                                  // drinkSpam: Spam on, water clicked: drink till full
export function onWaterAt(x: number, y: number) {
  aimState.pointer = { x: (x / innerWidth) * 2 - 1, y: 1 - (y / innerHeight) * 2 };
  const h = aim();
  return !!(h && !h.mob && drinkable(world.at(h.r, h.c))) && !HOTBAR[game.hud.sel].place;   // a block in hand: water is where it goes, not a drink
}
export function drinkLater(p: Holdable, x: number, y: number) {
  p.holdT = setTimeout(() => {
    if (!playing()) return;
    p.held = true; drinkHold = true;
    aimState.pointer = { x: (x / innerWidth) * 2 - 1, y: 1 - (y / innerHeight) * 2 };
    game.doQueued = game.clickQueued = true; game.shiftClick = false;
  }, HOLD_MS);
}
pointerState.press = null;
canvas.addEventListener("mousedown", (e) => {
  if (!playing()) return;
  if (!locked() && capOn() && !noLock && !botDriving() && !noCapture()) { screens.altFreed = false; grab(); return; }   // captured but let go (Alt): this click only grabs
  if (!locked()) {
    pointerState.press = { button: e.button, x: e.clientX, y: e.clientY };
    if (e.button === 0 && onWaterAt(e.clientX, e.clientY)) drinkLater(pointerState.press, e.clientX, e.clientY);
    else if (holdOn() && e.button === 0) holdLater(pointerState.press, e.clientX, e.clientY, e.shiftKey);
    return;
  }
  if (e.button !== 0 && e.button !== 2) return;
  game.rightClick = e.button === 2;                                             // right: place a block, whatever is held (Pete)
  if (flat.mode === 2 && !game.rightClick) { game.doHeld = game.spaceQueued = game.spaceHeld = true; return; }   // captured in 3/4 the middle of the screen is you: a click is Space
  game.doQueued = game.clickQueued = true; game.shiftClick = e.shiftKey;
  if (holdOn() && e.button === 0) pointerState.holding = true;                         // captured: no drag to tell apart, the hold starts at once
  if (e.button === 0 && !HOTBAR[game.hud.sel].place) { const h = aim(); if (h && !h.mob && drinkable(world.at(h.r, h.c))) drinkHold = true; }
  game.doHeld = e.button === 0 && !!HOTBAR[game.hud.sel].hand;                       // holding repeats hits with the hand only
});
addEventListener("mouseup", (ev) => {
  const e = ev as MouseEvent;
  if (e.button === 0) game.doHeld = false;
  if ((e.button === 0 || e.button === 2) && game.spaceHeld && !keys.has("Space") && !keys.has("Enter") && !keys.has("NumpadEnter")) game.doHeld = game.spaceHeld = false;   // a 3/4 captured click let go
  if (e.button === 0 && letGoHold(pointerState.press)) { pointerState.press = null; return; }
  if (pointerState.press) clearTimeout(pointerState.press.holdT);
  if (pointerState.press && pointerState.press.button === e.button && (e.button === 0 || e.button === 2) && playing() && Math.hypot(e.clientX - pointerState.press.x, e.clientY - pointerState.press.y) < 6)
    { game.doQueued = game.clickQueued = true; game.shiftClick = e.shiftKey; game.rightClick = e.button === 2; }
  pointerState.press = null;
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
export const turn = (dx: number, dy: number) => { if (flat.on) return; pointerState.yawGoal = pointerState.pitchGoal = null; game.yaw -= dx; game.pitch = Math.max(-1.55, Math.min(1.55, game.pitch - dy)); };
// arrow keys: held, they turn the view smoothly; tapped, 3D turns a quarter (left / right), tilts a step down (down: it used to turn
// you about, and a short press while looking down spun you round, Pete) or a step up and squares up to the nearest cardinal (up);
// in 2D and 3/4 the arrows walk, exactly like WASD
export const TAP_MS = 180, arrowT: Record<string, number> = {}, TILT = 0.4;
pointerState.yawGoal = null; pointerState.pitchGoal = null;
export function arrowTap(code: string) {
  if (!playing() || !game.S) return;
  if (flat.on) return;                                                      // overhead, the arrows walk like WASD (moveAction)
  const base = pointerState.yawGoal ?? game.yaw, snap = Math.round(base / (Math.PI / 2)) * (Math.PI / 2);
  if (code === "ArrowUp" || code === "ArrowDown") pointerState.pitchGoal = Math.max(-1.55, Math.min(1.55, (pointerState.pitchGoal ?? game.pitch) + (code === "ArrowUp" ? TILT : -TILT)));
  if (code !== "ArrowDown") pointerState.yawGoal = code === "ArrowLeft" ? snap + Math.PI / 2 : code === "ArrowRight" ? snap - Math.PI / 2 : snap;
  pathing.pending = null;
}
// Bird's-eye (Settings → Gameplay → Bird's-eye, Pete): how fast the mouse or a drag swings the 3/4 camera round you, 25 % to 300 %;
// Invert tilt; the camera's distance, 60 % to 160 %; and whether it swings round a tree that hides you. All remembered
export const birdPref = (k: string, lo: number, hi: number) => { try { const v = Number(localStorage.getItem("craftax3d." + k)); return v >= lo && v <= hi ? v / 100 : 1; } catch { return 1; } };
export let orbitSpeed = birdPref("orbitspeed", 25, 300), birdDist = birdPref("birddist", 60, 160);
export let orbitInvert = (() => { try { return localStorage.getItem("craftax3d.orbitinvert") === "1"; } catch { return false; } })();
export let birdSwing = (() => { try { return localStorage.getItem("craftax3d.birdswing") !== "0"; } catch { return true; } })();
export function orbitBy(dx: number, dy: number) {
  flat.orbit -= dx * orbitSpeed; flat.orbitGoal = null;
  flat.el = Math.max(0.3, Math.min(1.35, flat.el + dy * orbitSpeed * (orbitInvert ? -1 : 1)));
}
for (const [id, k, get, put] of [["orbitspeed", "orbitspeed", () => orbitSpeed, (v: number) => (orbitSpeed = v)], ["birddist", "birddist", () => birdDist, (v: number) => (birdDist = v)]] as const) {
  const set = (pc: number) => { input("opt-" + id).value = String(pc); $(id + "-v")!.textContent = String(pc); };
  set(Math.round(get() * 100));
  $("opt-" + id)!.oninput = (e) => { const t = e.target as HTMLInputElement; put(+t.value / 100); set(+t.value); try { localStorage.setItem("craftax3d." + k, t.value); } catch {} };
}
input("opt-orbitinvert").checked = orbitInvert;
$("opt-orbitinvert")!.onchange = (e) => { orbitInvert = (e.target as HTMLInputElement).checked; try { localStorage.setItem("craftax3d.orbitinvert", orbitInvert ? "1" : "0"); } catch {} };
input("opt-birdswing").checked = birdSwing;
$("opt-birdswing")!.onchange = (e) => { birdSwing = (e.target as HTMLInputElement).checked; try { localStorage.setItem("craftax3d.birdswing", birdSwing ? "1" : "0"); } catch {} };
// Mouse speed and Invert mouse (Settings → Gameplay → 1st person, Pete): how fast a captured mouse turns the view, 25 % to 300 % of the
// usual; inverted, pushing the mouse forward looks down (a drag too); both remembered, Invert off for a new player
export let mouseSpeed = (() => { try { const v = Number(localStorage.getItem("craftax3d.mousespeed")); return v >= 25 && v <= 300 ? v / 100 : 1; } catch { return 1; } })();
export let mouseInvert = (() => { try { return localStorage.getItem("craftax3d.mouseinvert") === "1"; } catch { return false; } })();
{
  const set = (pc: number) => { input("opt-mousespeed").value = String(pc); $("mousespeed-v")!.textContent = String(pc); };
  set(Math.round(mouseSpeed * 100));
  $("opt-mousespeed")!.oninput = (e) => { const t = e.target as HTMLInputElement; mouseSpeed = +t.value / 100; set(+t.value); try { localStorage.setItem("craftax3d.mousespeed", t.value); } catch {} };
  input("opt-mouseinvert").checked = mouseInvert;
  $("opt-mouseinvert")!.onchange = (e) => { mouseInvert = (e.target as HTMLInputElement).checked; try { localStorage.setItem("craftax3d.mouseinvert", mouseInvert ? "1" : "0"); } catch {} };
}
addEventListener("mousemove", (ev) => {
  const e = ev as MouseEvent;
  if (pointerState.press && !pointerState.press.held && Math.hypot(e.clientX - pointerState.press.x, e.clientY - pointerState.press.y) >= 6) clearTimeout(pointerState.press.holdT);   // a drag: looking, not holding
  aimState.pointer = { x: (e.clientX / innerWidth) * 2 - 1, y: 1 - (e.clientY / innerHeight) * 2 };
  aimState.pointerMoveT = performance.now();
  if (!playing()) return;
  if (locked() && flat.mode === 2) {                                        // captured in 3/4: the mouse swings the camera round you
    orbitBy(e.movementX * 0.004, e.movementY * 0.003);
  } else if (locked()) turn(e.movementX * 0.0025 * mouseSpeed, e.movementY * 0.0025 * mouseSpeed * (mouseInvert ? -1 : 1));   // Settings: Mouse speed, Invert mouse
  else if (e.buttons && flat.mode === 2) {                                  // 3/4: drag orbits the camera around you, and tilts it
    orbitBy(e.movementX * 0.008, e.movementY * 0.006);
  } else if (e.buttons) turn(e.movementX * 0.005, e.movementY * 0.005 * (mouseInvert ? -1 : 1));
});
addEventListener("wheel", (e) => { if (playing()) game.hud.select(game.hud.sel + Math.sign((e as WheelEvent).deltaY), false, true); });
