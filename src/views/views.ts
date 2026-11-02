// Switching views (first person, classic 2D, 3/4) and looks (src/looks/registry.ts: M's order), remembered; the look picked drawn in
// the view you're in (its renderer there: registry.ts drawn); the classic view's picture.
import "../ui/snapshots";
import { drawOriginal } from "../../js/art2d";
import { REPLAY } from "../../js/local";
import * as tele from "../../js/telemetry";
import { net } from "../../js/net";
import { flat, game } from "../core/game";
import { portalDive, victory } from "../effects/victory";
import { tunnel2DOn } from "../effects/tunnel";
import { FADE_MS, lookState, pickedLook, setLines, setPost, setSkin, side, view2d } from "../looks/looks";
import { builtInView, drawn, look, looks, plainLook, skinOf, viewOf } from "../looks/registry";
import type { Look, LookView } from "../looks/types";
import { renderState } from "../looks/render";
import { pathing } from "../input/pathing";
import { flash } from "../ui/hud/hint";
import {
  botDriving, capOn, grab, letGo, locked, noCapture, playing, screens, syncCapture, unlockPointer, useClickView,
} from "../ui/screens/screen";
import { retryPhos } from "../ui/screens/worlds";
import { syncHands } from "../ui/screens/options";
import { pointerState } from "../input/pointer";
import { besidePage } from "../page-url";
import { onScreen } from "../themes/state";

// this module's state that other modules set (one module can't assign another's let): lookRestoring, phosOff, fallDrawn
export interface Views {
  /** The saved look is being put back (no saving meanwhile). */
  lookRestoring: boolean;
  /** setLook: a skin (phosphor) waiting to go once its fade is done (a token; picking again bumps it). */
  phosOff: number;
  /** When a 2D tree fall was last redrawn (performance.now()). */
  fallDrawn: number;
}
export const views = {} as Views;
/** A tree felled in the 2D view: its tile, when, and which way it falls (1 east, -1 west). */
export interface Fall2D { r: number; c: number; t0: number; dir: number }
/** The view and look you play in, as saved (LOOK_KEY). */
export interface ViewLook { view: number; look: string; third: boolean }

export let frameN = 0;
// trees felled in the 2D view (art2d.ts fall2D): four frames of falling over FALL2D_MS, then gone; the frame loop redraws while any fall
export const FALL2D_MS = 600, FALL2D_K = [0.3, 0.6, 0.85, 1];
export let falls2D: Fall2D[] = []; views.fallDrawn = 0;
// the picture the look picked draws itself in the classic view (laser's, the crystal plugin's: what the crystal sees; phosphor borrows
// it), or none: Craftax's original art (or a theme's own). Only without a server (with one, the server draws the classic view)
export const classicPicture = (id = lookState.pick) => { const L = look(id), r = net.local && L ? drawn(L, "classic").r : null; return r?.draw ? r : null; };
export function refresh2D() {
  if (flat.mode !== 1 || !flat.picture || tunnel2DOn) return;               // (the portal's 2D tunnel owns the picture while it runs)
  if (net.local) {                                                          // no server: Craftax's own art, drawn here (art2d.ts)
    if (!game.S) return;
    if (flat.picture === 2) { classicPicture()?.draw!(game.S as unknown as Record<string, unknown>, view2d, refresh2D); return; }   // (the plugin API takes the state as an open record)
    if (flat.picture !== 1) return;
    if (onScreen.to?.classic?.(game.S as unknown as Record<string, unknown>, view2d, refresh2D)) return;   // (a theme's own 2D picture, if it has one)
    const now2 = performance.now();
    // four frames, as pixel art animates (Pete): tipping, further, nearly down, flat; then gone at once, no fade
    falls2D = falls2D.filter((f) => now2 - f.t0 < FALL2D_MS);
    const falls = falls2D.map((f) => ({ r: f.r, c: f.c, dir: f.dir, k: FALL2D_K[Math.min(3, Math.floor((now2 - f.t0) / (FALL2D_MS / 4)))], fade: 0 }));
    const fx = { portal: victory.portal && victory.portalAt ? victory.portalAt : null, t: now2, falls };   // the victory portal and felled trees, in its own 2D look
    const url = drawOriginal(game.S, besidePage("craftax-art/").href, refresh2D, true, fx);   // web/craftax-art/ wherever the page sits; the map only (Pete: its inventory rows are ugly and cover the HUD)
    if (url) view2d.src = url;
    return;
  }
  const im = new Image(), pic = flat.picture;
  im.onload = () => {                                                        // swap when loaded: no flash
    if (flat.picture !== pic) return;
    if (pic !== 2) {                                                        // the original art: its map only, not the inventory rows under it
      const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = Math.min(im.naturalHeight, 9 * 16);
      c.getContext("2d")!.drawImage(im, 0, 0); view2d.src = c.toDataURL(); return;
    }
    // the laser frame's memory column (right) and row (bottom) are placeholder bits: blank them; the memory shows beside the view
    const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext("2d")!; g.drawImage(im, 0, 0); g.fillStyle = "rgb(8,6,6)";
    g.fillRect(176, 0, c.width - 176, c.height); g.fillRect(0, 176, 176, c.height - 176);
    view2d.src = c.toDataURL();
  };
  im.crossOrigin = "anonymous";                                             // another server's frame must not taint the canvas
  im.src = net.base + "/api/frame.png?" + net.query() + "&" + (pic === 2 ? "art=red&" : "") + "n=" + ++frameN;
}
// the two button rows: the view point (classic 2D, 3D, 3/4) and the art (the looks, M). The look picked stays picked in every view;
// each view draws it as its renderer there says (the classic view: a picture of its own, or Craftax's original art).
export const simpleLook = () => (flat.picture ? "original" : plainLook(lookState.lines).id);
export function setView(mode: number, quiet = false) {                       // quiet: no note (setLook's own)
  // out of the classic view: the look picked, cut in under the 2D image as it fades (Pete ec38: a fade from color showed the color
  // world on the way); into it: the world behind fades to color as the camera flies up, and a note names its picture; between the
  // 3D views, again only if the look draws differently in the other one (a plugin's renderer for one of them)
  const P = look(lookState.pick) ?? plainLook(false);
  if (mode !== 1 && flat.picture) in3D(P, mode, true);
  else if (mode === 1 && !flat.picture) { inClassic(); if (!quiet && !views.lookRestoring) flash(classicNote(P)); }
  else if (mode !== 1 && flat.mode !== 1 && mode !== flat.mode) {
    const a = drawn(P, viewOf(flat.mode)), b = drawn(P, viewOf(mode));
    if (a.as !== b.as || a.r !== b.r) in3D(P, mode, false);
  }
  if (mode !== flat.mode) {
    // into first person: look the way you face (Pete: from bird's-eye it looked out past the side of your head). Above, the body
    // turns with S.dir while the first-person look stays where it was left
    if (mode === 0 && game.S) { const t = ({ 1: Math.PI / 2, 2: -Math.PI / 2, 3: 0, 4: Math.PI } as Record<number, number>)[game.S.dir]; if (t !== undefined) { game.yaw += Math.atan2(Math.sin(t - game.yaw), Math.cos(t - game.yaw)); pointerState.yawGoal = null; } }
    flat.mode = mode; flat.on = mode !== 0; pathing.pending = null; syncHands();
    if (noCapture()) { screens.hadLock = false; if (locked()) unlockPointer(); }
    else if (capOn() && !locked() && !botDriving() && playing()) grab(false);   // 3/4 keeps (or takes back) the capture
    else if (!capOn() && locked()) letGo();                                // (this view's capture off: the cursor back)
    syncCapture(); useClickView();
  }
  refresh2D(); syncLooks(); saveLook();
}
// the view and look you play in, kept across a reload and a death (Pete): saved as you pick them, not while a passing phosphor (the
// opening, a retry, the portal) has the screen; the page opens in them
export const LOOK_KEY = "craftax3d.lookview";
views.lookRestoring = false;
// (the classic view in color or laser is saved as before, "original" or "crystal", so an older copy of the game reads it the same)
export const viewLookNow = (): ViewLook => {
  const L = pickedLook(), old = flat.picture ? ({ [plainLook(false).id]: "original", [plainLook(true).id]: "crystal" } as Record<string, string>)[L.id] : undefined;
  return { view: flat.mode, look: old ?? L.id, third: game.third };
};
export function saveLook() {
  if (views.lookRestoring || renderState.introOn || retryPhos || victory.entering || portalDive || REPLAY) return;   // (a replay's own camera is never your choice)
  try { localStorage.setItem(LOOK_KEY, JSON.stringify(viewLookNow())); } catch {}
}
// (saved before the rename as { view, art, third }: an old save's `art` is read as its look, so a player's look carries over; saved
// before the classic view kept the look: "original" and "crystal", the classic view in color and in laser)
export const savedLook = (): Partial<ViewLook> | null => {
  try {
    const o: unknown = JSON.parse(localStorage.getItem(LOOK_KEY)!);
    if (!o || typeof o !== "object") return null;
    const v = o as Partial<ViewLook> & { art?: string }, a = v.look ?? v.art;
    if (a === "original" || a === "crystal") return { view: 1, look: plainLook(a === "crystal").id, third: v.third };
    return { view: v.view, look: a, third: v.third };
  } catch { return null; }
};
views.phosOff = 0;                                                             // (setLook: a skin waiting to go once its fade is done)
// the renderer that goes over a 3D render as its post pass: a plugin's (the built-ins' are the render itself; one that draws its own
// picture is the classic view's)
const postOf = (r: LookView | null) => (r && !builtInView(r) && !r.draw ? r : null);
// the look L drawn in a 3D view (mode): as its renderer there says (registry.ts drawn: itself, or color), the skin, the lines and a
// post renderer (a plugin's) faded to from what's on, or cut (out of the classic view, under its image)
function in3D(L: Look, mode: number, cut: boolean) {
  const { as, r } = drawn(L, viewOf(mode)), from = side(), lines = r?.base ? r.base === "outline" : as.lines;
  // a skin to color fades straight from its ink (Pete: phosphor went green → red laser → color): the skin stays on through the line
  // fade and goes once it is done, as leaveSkin does; picking another look before then cancels it
  if (lookState.skin && lookState.lines && !lines) { const tok = ++views.phosOff; setTimeout(() => { if (tok === views.phosOff && !lookState.lines) { setSkin(null); syncLooks(); } }, FADE_MS + 30); }
  else { views.phosOff++; setSkin(skinOf(as.id)); }
  flat.picture = 0;
  setPost(postOf(r)); setLines(lines);
  if (cut) lookState.fade = null;
  else if (lookState.post !== from.post) lookState.fade = { t0: performance.now(), from };
}
// the classic view's dress: the world behind in color, no skin, no post renderer, and the picture the look picked draws there (2), or
// Craftax's original art (1)
function inClassic() {
  const from = side();
  views.phosOff++; setSkin(null); setPost(null); setLines(false);
  if (from.post) lookState.fade = { t0: performance.now(), from };
  flat.picture = classicPicture() ? 2 : 1;
}
// the note for a look picked in the classic view: its picture's name, or the original art's
const classicNote = (L: Look) => {
  const r = classicPicture(L.id);
  return r ? r.label ?? L.label : L === plainLook(false) ? "Craftax's original art" : `${L.label} Mode (Craftax's original art here)`;
};
// a look picked (M, its button, a replay, the page opening): it stays picked in every view. "original" and "crystal" (saves,
// recordings, the replay page) are the classic view in color and in laser
export function setLook(a: string, quiet = false) {                                         // quiet: no note (the page opening)
  if (renderState.introOn) { renderState.introOn = false; lookState.lines = false; }                          // a look picked during the opening's: from colour
  const classic = flat.picture > 0 || flat.mode === 1 || a === "original" || a === "crystal";
  if (a === "original" || a === "crystal") a = plainLook(a === "crystal").id;
  const L = look(a) ?? plainLook(false);
  lookState.pick = L.id;
  if (classic) { inClassic(); if (flat.mode !== 1) setView(1, true); }
  else in3D(L, flat.mode, false);
  if (!quiet) flash(classic ? classicNote(L) : L.label);
  refresh2D(); syncLooks();
  if (!quiet) saveLook();
}
// from a skin back to another look without passing through the plain line look (Pete: phosphor to color not via laser red): the fade
// runs while the scene still wears the skin, and the skin goes once it's over
export function leaveSkin(to: string) {
  const L = look(to);
  if (!L || L.lines !== false || flat.picture) { setLook(to, true); return; }
  const { r } = drawn(L, viewOf(flat.mode)), from = side();
  lookState.pick = L.id; setPost(postOf(r)); setLines(false);
  if (lookState.post !== from.post) lookState.fade = { t0: performance.now(), from };
  setTimeout(() => { setSkin(null); syncLooks(); }, FADE_MS + 30);
}
export function syncLooks() {
  tele.looks();
  const bot = !!(game.S && game.S.world && game.S.world.control === "bot");                // who plays: the human / robot head buttons
  document.querySelectorAll<HTMLElement>("#seg-who button").forEach((b) => b.classList.toggle("on", (b.dataset.who === "bot") === bot));
  // the views: first person, 3/4, and Craftax's classic 2D game (the original art, which takes the overhead view); the art: color or laser
  const classic = flat.picture > 0;
  document.querySelectorAll<HTMLElement>("#seg-view button").forEach((b) => b.classList.toggle("on", b.dataset.view === "classic" ? classic : !classic && +b.dataset.view! === flat.mode));
  // the art: the look picked, in every view (one button each, wherever you are)
  const art = pickedLook().id, all = looks();
  document.querySelectorAll<HTMLElement>("#seg-art button").forEach((b) => b.classList.toggle("on", b.dataset.art === art));
  // each look's tip names its key from here (Pete): the next one M, the one before Shift+M, the one you're in none
  const ids = all.map((L) => L.id), at = ids.indexOf(art), n = all.length;
  document.querySelectorAll<HTMLElement>("#seg-art button").forEach((b) => {
    const i = ids.indexOf(b.dataset.art!), key = i === (at + 1) % n ? " (M)" : i === (at + n - 1) % n ? " (Shift+M)" : "";
    const tip = look(b.dataset.art)?.label + " Mode" + key;
    if (b.dataset.tip !== tip) { b.dataset.tip = tip; b.setAttribute("aria-label", tip); }
  });
}
// M: the next look (color → phosphor → laser → a plugin's → color), in every view; Shift+M the one before (registry.ts looks). In the
// classic view a look draws its own picture there or Craftax's original art: laser's is what the crystal sees (laser + classic, in
// either order, Pete), with the crystal plugin
export function toggleLook(back = false) {
  const all = looks(), at = Math.max(0, all.indexOf(pickedLook()));
  setLook(all[(at + (back ? all.length - 1 : 1)) % all.length].id);
}
