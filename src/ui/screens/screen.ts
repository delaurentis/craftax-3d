// Screens and pointer capture: show a screen, pause and play, the mouse captured or free.
import { flash } from "../hud/hint";
import { GOD } from "../../../js/local";
import * as tele from "../../../js/telemetry";
import { net } from "../../../js/net";
import { $ } from "../../core/shared";
import { canvas } from "../../render/scene";
import { api, flat, game } from "../../core/game";
import { apply } from "../../core/apply";
import { backdropReveal, renderState } from "../../looks/render";
import { snaps } from "../snapshots";
import { helpRows } from "./help";
import { opt } from "./options";
import type { ClickPrefs } from "./options";
import { leaveResearchRoute, routeTab } from "../../../js/research";

// this module's state that other modules set (one module can't assign another's let): hadLock, screen, clickPer, altFreed
export interface Screens {
  /** The screen up ("start", "dead", "panel", "help", "research", "settings", "servers", "worlds", "saves"), null while you play. */
  screen: string | null;
  /** The pointer was locked (Esc letting it go pauses). */
  hadLock: boolean;
  /** Each view's click choices: [0] first person, [2] bird's-eye (set with the Settings code, options.ts). */
  clickPer: Record<number, ClickPrefs> | null;
  /** Alt freed the cursor while you play. */
  altFreed: boolean;
}
export const screens = {} as Screens;

// ---------- screens and input ----------
screens.screen = routeTab() ? "research" : "start";   // Research's own pages start on it
export function show(id: string | null) {
  screens.screen = id; tele.screen(id);
  if (id !== "research") leaveResearchRoute();
  if (id === "start" && game.S) $("btn-play")!.textContent = game.S.timestep > 0 && !(game.S.world && !game.S.world.you) ? "Continue" : "Play";   // a world under way
  if (id === "help") helpRows();
  for (const s of ["start", "dead", "panel", "help", "research", "settings", "servers", "worlds", "saves"]) $(s)!.classList.toggle("on", s === id);
  menuPause(id !== null);
  // the top bar's pause button turns into play while a menu is up (and resumes the game)
  const b = $("btn-top-menu"), menu = id !== null && id !== "dead";
  if (b && b.dataset.state !== String(menu)) {
    b.dataset.state = String(menu);
    b.innerHTML = menu ? PLAY_ICON : PAUSE_ICON;
    b.dataset.tip = menu ? "Resume (Esc)" : "Pause menu (Esc)"; b.setAttribute("aria-label", b.dataset.tip);
  }
}
export const PAUSE_ICON = '<svg viewBox="0 0 20 20" width="20" height="20" shape-rendering="crispEdges" aria-hidden="true"><rect x="5" y="4" width="3" height="12" fill="#fff"/><rect x="12" y="4" width="3" height="12" fill="#fff"/></svg>';
export const PLAY_ICON = '<svg viewBox="0 0 20 20" width="20" height="20" shape-rendering="crispEdges" aria-hidden="true"><path d="M6 3h2v2h2v2h2v2h2v2h-2v2h-2v2H8v2H6z" fill="#fff"/></svg>';
setTimeout(() => show(screens.screen), 0);                                          // the page opens on the start menu: play icon from the start
// a menu pauses the world: your own steps stop with the game loop; a bot playing your world is paused too, and resumed on the way
// back (a pause you set yourself on the bot panel stays as it is)
export let botPausedByMenu = false;
export function menuPause(on: boolean) {
  if (on && screens.screen !== "dead") snaps.thumbWanted = true;                         // pausing saves the world, picture and all (grabThumb)
  const w = game.S && game.S.world;
  if (!w || !w.you || w.control !== "bot") { if (!on) botPausedByMenu = false; return; }
  if (on && !w.paused && !botPausedByMenu) { botPausedByMenu = true; api("/api/pace", { paused: true }).then(apply).catch(() => {}); }
  else if (!on && botPausedByMenu) { botPausedByMenu = false; api("/api/pace", { paused: false }).then(apply).catch(() => {}); }
}
// pointer lock when the browser grants it; without it (Shellcaster, embedded panes) drag to look, arrow keys turn, a click still acts
export const DEBUG = /[?&]debug/.test(location.search) || GOD;                   // ?debug: window.cx for tests (?god brings the warp, L, too)
export const locked = () => document.pointerLockElement === canvas;
export const playing = () => screens.screen === null;
screens.hadLock = false;
// the cursor stays free (no lock) while the bot drives: you watch, drag to look and click its panel; Alt frees it while you play,
// and a click on the view takes it back (the page has on-screen buttons to reach)
export const botDriving = () => !!(game.S && game.S.world && game.S.world.you && game.S.world.control === "bot");
screens.altFreed = false; export let noLock = false;                                     // noLock: this page can't lock (Shellcaster): drag to look
// the Capture mouse button (top bar, always there) and the Controls page's switch: the mouse is only captured once you turn it on,
// and that choice is remembered across reloads; Alt frees it for a moment (a click on the view takes it back); Esc pauses, and
// coming back to the game captures it again. Off, you drag to look and a click acts.
// Per view (Pete): first person and 3/4 each remember their own choice (the 3/4 off for a new player, a cursor to click the ground
// with); the 2D view never captures. capOn() is the view you're in; Settings' icons switch either
export const cap: Record<0 | 2, boolean> = (() => { try { return { 0: localStorage.getItem("craftax3d.capture") !== "0", 2: localStorage.getItem("craftax3d.capture2") === "1" }; } catch { return { 0: true, 2: false }; } })();
export const capView = () => (flat.mode === 2 ? 2 : 0);
export const capOn = () => cap[capView()];
export const setCap = (v: boolean) => { cap[capView()] = v; };
screens.clickPer = null;                                                        // (the per-view click settings: set with the Settings code)
export function useClickView() { if (screens.clickPer) Object.assign(opt, screens.clickPer[flat.mode === 0 ? 0 : 2]); }
export let viewIconSync: (() => void)[] = [];                                                      // (the Settings capture boxes: syncCapture updates them)
export function syncCapture() {
  const b = $("btn-capture"); if (!b) return;
  b.classList.toggle("on", capOn());
  b.dataset.tip = capOn() ? "Mouse captured: hold Alt to click, Esc pauses" : "Capture mouse";
  b.setAttribute("aria-label", b.dataset.tip);
  const c = $("opt-capture") as HTMLInputElement | null; if (c) c.checked = capOn();
  viewIconSync.forEach((f) => f());                                       // and Settings: 1st person, Bird's-eye
}
export const saveCapture = () => { try { localStorage.setItem("craftax3d.capture", cap[0] ? "1" : "0"); localStorage.setItem("craftax3d.capture2", cap[2] ? "1" : "0"); } catch {} };
export let grabByHand = false;                                                   // a lock asked for in a click: if that fails, the page can't
// refused (a page that can't capture, like Shellcaster's pane): the button goes back off at once rather than staying on, unused
export function lockRefused() {
  if (grabByHand) noLock = true;
  if (cap[0] || cap[2]) { cap[0] = cap[2] = false; syncCapture(); if (getComputedStyle($("touch")!).display === "none") flash("This page can't capture the mouse: drag to look (open it in its own browser tab to capture)"); }   // (not with the touch controls up: no mouse there, Pete)
}
document.addEventListener("pointerlockerror", lockRefused);
// the mouse can be captured in first person and 3/4 (it orbits the camera there); the flat 2D view is always played with the cursor
export const noCapture = () => flat.on && flat.mode !== 2;
export function grab(byHand = true) { grabByHand = byHand; try { if (!canvas.requestPointerLock) return lockRefused(); const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(lockRefused); } catch { lockRefused(); } }
// let the mouse go; iPhone Safari has no pointer lock at all (document.exitPointerLock is missing there: calling it threw on death)
export function unlockPointer() { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); }
export function letGo() { if (locked()) { screens.hadLock = false; unlockPointer(); } }
// ?ending (with ?god, local.ts): as you press Play, the Graveyard, three steps south of the necromancer, facing him, his minions dead,
// no summoning, one hit left and open to it (debug/boss); the last blow is yours (Pete): his death, VICTORY, the portal, the tunnel
export let endingDue = /[?&]ending\b/.test(location.search) && GOD;
export async function ending() {
  try { apply(await api("/api/debug/boss", { hits: 7 })); flash("One hit left: walk up and strike"); }
  catch (e) { flash("Ending failed: " + (e as Error).message); }
}
export function play() {
  backdropReveal();                                                         // Play: no waiting on the still
  show(null);
  renderState.introOrbit = false;                                                       // the opening's slow circling stops for good
  if (endingDue && net.local) { endingDue = false; ending(); }
  if (noCapture() || botDriving() || !capOn()) return;                   // the 2D view is played with the cursor; so is watching the bot
  grab();
}
export function pause() { if (locked()) unlockPointer(); show("start"); }

document.addEventListener("pointerlockchange", () => {
  if (locked()) { screens.hadLock = true; return; }
  if (screens.hadLock && screens.screen === null) show("start");                          // Esc released the lock: pause (capture stays on: back in, captured)
  screens.hadLock = false;
});
