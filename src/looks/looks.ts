// The looks' state and switches: the look picked (it stays picked in every view), which render is on (the line frame or color), the
// skin over it (phosphor), a renderer's post pass over it (a plugin look's), the fade between two; what each look's ink sets (the
// outline pass, the HUD's icons, the pixel font); the hooks every look may have; the 2D view.
import "../input/aim";
import * as THREE from "three";
import { shared } from "../../js/shading";
import { pixelRedraw, setPixelLook } from "../../js/pixeltitle";
import { $ } from "../core/shared";
import { bloom, outlinePass } from "./shared/outline-pass";
import { flat, game } from "../core/game";
import { hudInk } from "../resources/items/icons";
import { drawn, look, looks, plainLook, viewOf } from "./registry";
import type { Look, LookView } from "./types";

/** One side of a fade: the render's lines, and the renderer whose post pass (or scale) is over it. */
export interface Side { lines: boolean; post: LookView | null }
// this module's state that other modules set (one module can't assign another's let): pick, lines, fade, skin, post
export interface LookState {
  /** The look picked (M, the buttons; saved): it stays picked in every view, drawn as its renderer there says (registry.ts drawn). */
  pick: string;
  /** The render draws the line frame (surface ids, outlined by the outline pass), not color: laser, and phosphor over it (M). */
  lines: boolean;
  /** A fade between two renders under way: when it started, and the render it comes from (null: none). */
  fade: { t0: number; from: Side } | null;
  /** The skin over the line frame, in its own ink (phosphor), or none. It lingers through a fade out to color, then goes. */
  skin: Look | null;
  /** The renderer with a post pass or a render scale over the render (a plugin look's: noir, pixel), or none (the built-ins). */
  post: LookView | null;
}
export const lookState = {} as LookState;
lookState.pick = "color"; lookState.lines = false; lookState.skin = null; lookState.post = null;
// the look a post renderer draws as (one plugin may fill another look's spot), if the render is that look's
const postLook = (lines: boolean, r: LookView | null) => { const L = r && look(r.look); return L && !L.lines === !lines ? L : null; };
/** The look whose ink is on: the skin, else the plain look of the render (laser's frame, or color: a post renderer's look over it). */
export const inkLook = (): Look => lookState.skin ?? postLook(lookState.lines, lookState.post) ?? plainLook(lookState.lines);
/** The built-in look the render draws: a skin only while its render is on (fading out of it is color already), else the plain look of
 *  the render (a theme's weather draws for this one). */
export const renderLook = (): Look => { const s = lookState.skin; return s && s.lines === lookState.lines ? s : plainLook(lookState.lines); };
/** The look picked, as saved and shown on the buttons: in the classic view the pick; in 3D the look on screen (the opening's phosphor
 *  over a color pick), which is the pick whenever the screen shows what the pick draws (a look with no 3D renderer draws color). */
export const pickedLook = (): Look => {
  const P = look(lookState.pick) ?? plainLook(false);
  if (flat.picture) return P;
  const on = (lookState.skin && lookState.skin.lines === lookState.lines ? lookState.skin : null) ?? postLook(lookState.lines, lookState.post) ?? plainLook(lookState.lines);
  return drawn(P, viewOf(flat.mode)).as === on ? P : on;
};
// the page's classes (index.html body.color, body.laser, body.phosphor, a plugin look's; body.outline under every line look): the look
// the HUD and menus wear, from the last setLines, setSkin and setPost (the opening wears phosphor's render without them)
const page = { lines: false, skin: null as Look | null, post: null as Look | null };
/** The look the page's classes say: its skin, else the plain look of its lines (color's: a post renderer's look). */
export const domLook = (): Look => page.skin ?? (page.lines ? plainLook(true) : page.post ?? plainLook(false));
/** The page's line classes are on (setLines): not so in the opening, whose render alone has the lines. */
export const pageLines = () => page.lines;
const classes = (L: Look) => L.cls.split(/\s+/).filter(Boolean);
function pageClasses() {
  const on = new Set(classes(domLook())), bc = document.body.classList;
  for (const L of looks()) for (const c of classes(L)) bc.toggle(c, on.has(c));
  bc.toggle("outline", domLook().lines);
}
// ---------- Craftax's 2D view ----------
// The server renders Craftax's own pixel view (9 × 11 tiles around the player, the inventory under it) after every step. Switching
// flies the camera from your eyes to straight overhead, framed like that image, then fades the image in; switching back reverses it.
export const view2d = $("view2d") as HTMLImageElement, TOP_Q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0, "YXZ")), topPos = new THREE.Vector3();
export const QUARTER_Q = new THREE.Quaternion(), qEuler = new THREE.Euler(0, 0, 0, "YXZ"), qPos = new THREE.Vector3(), qQuat = new THREE.Quaternion();
// B cycles the 2D view's art: the overhead 3D world, Craftax's original art, or the red laser frame: the iconic binary frame
// ("icons, black ground", with its HUD band and memory strip), drawn by the server
export const ART = ["3D overhead", "Original art", "Red laser"];
// B fades between the looks over FADE_MS (both rendered each frame and mixed, so the moving world stays live; the GPU does double
// work only for those 0.7 s, so it isn't a setting)
export const FADE_MS = 700;
lookState.fade = null;
/** The render as it is now: one side of a fade. */
export const side = (): Side => ({ lines: lookState.lines, post: lookState.post });
// the line frame on or off (M, B): a fade between the renders, the page's classes (body.laser or the skin's, body.outline), the HUD's
// icons and the pixel labels too
export function setLines(on: boolean) {
  if (on === lookState.lines) return;
  lookState.fade = { t0: performance.now(), from: side() };
  lookState.lines = on;
  page.lines = on; pageClasses(); hudInk.ink = (lookState.skin ?? plainLook(true)).hud!; setPixelLook(domLook().pixel);
  game.hud?.setLines(on); pixelRedraw();                                   // the HUD goes to lines too (and the pixel labels to the ink)
}
// a skin on (phosphor) or off: its class (index.html body.phosphor, and body.outline), the HUD's drawn icons and the pixel titles in its
// ink, and the outline pass's (the scene writes its real light for it)
export function setSkin(L: Look | null) {
  const was = lookState.skin; lookState.skin = L;
  page.skin = L; pageClasses();
  hudInk.ink = (L ?? plainLook(true)).hud!; setPixelLook(domLook().pixel);
  if (L !== was) { game.hud?.setLines(hudInk.lines); pixelRedraw(); }
  passInk(L);
}
// the outline pass in a skin's ink, or the plain line look's: its color, code art or lines, the bloom's crowding axis
export function passInk(L: Look | null) {
  const p = (L ?? plainLook(true)).pass!, u = outlinePass.uniforms;
  u.uPhosphor.value = p.code ? 1 : 0; shared.uPhos.value = p.code ? 1 : 0;
  u.uInk.value.set(...p.ink);
  bloom.compositeMaterial.uniforms.bloomSatAxis.value.set(...p.satAxis);
}
// a renderer's post pass (and scale) over the render, or none; the page in its look's classes (render.ts draws it, and fades: views.ts)
export function setPost(r: LookView | null) {
  if (r === lookState.post) return;
  lookState.post = r; page.post = postLook(false, r); pageClasses(); setPixelLook(domLook().pixel);
}
// the looks' hooks: a hit's shockwave (the look in view's), each frame, a death (every look's)
export function shockwave(pos: THREE.Vector3 | null, strength = 1, model: THREE.Object3D | null = null) { inkLook().shock?.(pos, strength, model); }
export function lookFrame(now: number) { const on = inkLook(); for (const L of looks()) L.frame?.(now, L === on); lookState.post?.frame?.(now); }
export function lookDead() { for (const L of looks()) L.dead?.(); }
