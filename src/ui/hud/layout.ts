// Where the touch buttons sit, and what's near you (sea, lava, fountains, trees) for the sounds and the pad.
import { tpad, tsleep, tuse } from "../../input/touch";
import { B } from "../../../js/world";
import { $, sound } from "../../core/shared";
import { world } from "../../render/arm";
import { game } from "../../core/game";
import { PHONE } from "./buttons";
import type { GameState } from "../../core/types";
import type { FountainFx } from "../../world/core";
import { phoneMedia } from "../side";

// this module's state that other modules set (one module can't assign another's let): panelCraftT
export interface Layout {
  /** When you last acted from the E screen (performance.now()). */
  panelCraftT: number;
}
export const layout = {} as Layout;

// the touch-controls button: Zzz's mirror image (Pete), left for right and the same size: the small Zzz over the food with no pad (so
// the button sits over the hearts), the Zzz key beside the pad with it. On a narrow phone on its side Zzz is beside Use, where a
// mirror would land on the pad: there it stays under the top bar (index.html)
export function placePadsBtn() {
  const b = $("btn-pads")!, st = b.style;
  if (getComputedStyle(b).display === "none" || b.classList.contains("inrow")) return;   // (in the hotbar's row on its side: arrangeRow)
  // two-handed upright (the corner pad): where it sits with the controls hidden, small over the hearts (Pete: don't move it)
  const food = document.querySelector<HTMLElement>('.bar[data-k="food"]');
  if (PORTRAIT_PHONE.matches && !document.body.classList.contains("unified") && !document.body.classList.contains("nopad") && food && food.offsetParent) {
    const f = food.getBoundingClientRect();
    Object.assign(st, { right: "auto", top: "auto", left: `${innerWidth - f.right}px`, bottom: `${innerHeight - f.top + 6}px`, width: "44px", height: "28px" });
    return;
  }
  const z = document.body.classList.contains("nopad") && !LANDSCAPE_PAD.matches ? document.querySelector(".bar .zzz") : $("touch")!.offsetParent && tsleep;   // (on its side Zzz is the key, pad or not)
  const r = z && z.getBoundingClientRect();
  const besideUse = LANDSCAPE_PAD.matches && r && r.bottom < innerHeight - 30;   // (on its side, Zzz anywhere but the bottom row: the button keeps its own place)
  if (!r || !r.width || besideUse) { st.left = st.bottom = st.width = st.height = st.right = st.top = ""; return; }   // (the CSS place)
  st.right = st.top = "auto";
  st.left = `${innerWidth - r.right}px`; st.bottom = `${innerHeight - r.bottom}px`; st.width = `${r.width}px`; st.height = `${r.height}px`;
  // a big touch screen (a tablet, an open foldable: Pete) has the pad taller than Use, so the mirror would sit on its down arrow: under
  // the pad instead, a little way down from it and as tall as the view buttons (Pete), clear of those below it
  const pad = tpad.getBoundingClientRect(), x0 = innerWidth - r.right;
  if (pad.height && x0 < pad.right && x0 + r.width > pad.left && r.bottom > pad.top && r.top < pad.bottom) {
    const lk = $("looks")!.getBoundingClientRect(), h = lk.height || 32, top = Math.min(pad.bottom + 14, (lk.height ? lk.top : innerHeight) - 8 - h);
    st.height = `${h}px`; st.bottom = `${innerHeight - top - h}px`;
  }
}
// phones: the view buttons' column (#looks) centred in the room between the top-left plaque (and what it opens) and the pad's top;
// no pad below it (hidden, or on its side, where the pad is beside it): centred on the screen, still clear of the plaque (Pete)
export function placeLooks() {
  const l = $("looks")!, st = l.style;
  if (!PHONE.matches || !l.getClientRects().length) { st.top = st.transform = ""; return; }
  const pr = $("tpad")!.getBoundingClientRect(), pad = !LANDSCAPE_PAD.matches && pr.height > 0, gap = 6;
  const place = () => {
    let top = 0;
    for (const id of ["info", "gear", "res"]) { const e = $(id); if (e && e.getClientRects().length) top = Math.max(top, e.getBoundingClientRect().bottom); }   // (shown: fixed, so no offsetParent)
    // (Pete) a phone on its side (a short screen, not a tablet): one button's worth above the middle
    const h = l.getBoundingClientRect().height, up = SHORT_SIDE.matches ? l.querySelector("button")?.getBoundingClientRect().height ?? 0 : 0;
    const y = TABLET_UP.matches ? innerHeight / 3 - h : pad ? (top + pr.top - h) / 2 : (innerHeight - h) / 2 - up;   // (a tablet upright: in the top third, Pete)
    st.transform = "none"; st.top = `${Math.round(Math.max(top + gap, y))}px`;
  };
  l.classList.remove("short"); document.body.classList.remove("short-side"); place();
  // on its side, too short a screen for the whole column (Pete): never over the hearts or the hotbar; the theme and the looks
  // (color, phosphor, laser) go instead, and the floor's plaque at the top too (Pete)
  if (LANDSCAPE_PAD.matches) {
    const r = l.getBoundingClientRect(), below = [...document.querySelectorAll<HTMLElement>("#bars .bar, #hotrow, #btn-top-full.loose, #btn-pads")];
    if (below.some((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && b.left < r.right && b.right > r.left && b.top < r.bottom + gap; })) { l.classList.add("short"); document.body.classList.add("short-side"); place(); }
  }
}
// on its side, the full-screen button leaves the top bar for the bottom left, just before the touch-controls button and its size
// (Pete: up top it was out of reach); back in the top bar otherwise
export function placeFullBtn() {
  const f = $("btn-top-full")!, st = f.style, p = $("btn-pads")!, pr = p.getBoundingClientRect();
  if (f.classList.contains("inrow")) return;                                // (in the hotbar's row: arrangeRow)
  const on = LANDSCAPE_PAD.matches && getComputedStyle(p).display !== "none" && pr.width > 0;
  if (!on) { if (f.classList.contains("loose")) { f.classList.remove("loose"); st.cssText = ""; $("btn-shot")!.before(f); } return; }
  if (!f.classList.contains("loose")) { f.classList.add("loose"); document.body.appendChild(f); }
  Object.assign(st, { left: `${pr.left - 6 - pr.width}px`, top: `${pr.top}px`, width: `${pr.width}px`, height: `${pr.height}px` });
}
// a phone upright: the … (inventory) leaves the hotbar's row for the right side, just above Zzz and its size (Pete), so the hotbar
// gets the whole width; anywhere else it stays at the row's end
export const PORTRAIT_PHONE = matchMedia("(max-width: 720px) and (orientation: portrait)");
export function placeInvBtn() {
  const b = $("btn-inv")!, st = b.style;
  // the bot playing on a phone (its panel in the hotbar's place): the … on the right, just over the food (Pete), not alone under the bars
  const food = document.querySelector<HTMLElement>('.bar[data-k="food"]'), bp = $("botpanel")!, hb = $("hud-bottom")!;
  // (the panel opened on a phone: the hearts and food go above it, not under its brain, Pete)
  const lift = PHONE.matches && bp.style.display === "block" && !bp.classList.contains("folded") && !bp.classList.contains("big");
  hb.style.bottom = lift ? `${innerHeight - bp.getBoundingClientRect().top + 6}px` : "";
  if (PHONE.matches && bp.style.display === "block" && food && food.offsetParent) {
    const f = food.getBoundingClientRect();
    if (b.parentNode !== document.body) document.body.appendChild(b);
    b.classList.add("beside"); b.classList.remove("beside-zzz");
    Object.assign(st, { position: "fixed", zIndex: "6", top: "auto", left: `${f.right - 44}px`, bottom: `${innerHeight - f.top + 6}px`, width: "44px", height: "28px" });
    return;
  }
  const z = !PORTRAIT_PHONE.matches ? null : document.body.classList.contains("nopad") ? document.querySelector(".bar .zzz") : $("touch")!.offsetParent && tsleep;
  const r = z && z.getBoundingClientRect();
  // (out of the hotbar's row while placed: the row's transformed parent would make "fixed" relative to it)
  if (!r || !r.width || !$("hotbar")!.offsetParent) { if (st.position) { st.position = st.top = st.left = st.bottom = st.width = st.height = st.zIndex = ""; $("hotrow")!.appendChild(b); b.classList.remove("beside", "beside-zzz"); } return; }
  b.classList.toggle("beside", z === tsleep); b.classList.toggle("beside-zzz", z !== tsleep);   // dressed as the Zzz under it (Pete)
  if (b.parentNode !== document.body) document.body.appendChild(b);
  const gap = z === tsleep && document.body.classList.contains("unified") ? 2 : 6;   // (one-handed: the pad's own 2 px, so it lines up with the up arrow)
  Object.assign(st, { position: "fixed", zIndex: "6", top: "auto", left: `${r.left}px`, bottom: `${innerHeight - r.top + gap}px`, width: `${r.width}px`, height: `${r.height}px` });
}
const TABLET_UP = matchMedia("(orientation: portrait) and (min-width: 600px) and (min-height: 600px)");   // a tablet upright (src/ui/side.ts)
const SHORT_SIDE = matchMedia("(max-height: 520px) and (orientation: landscape)");   // a phone on its side, not a tablet (src/ui/side.ts)
export const LANDSCAPE_PAD = phoneMedia("(max-height: 520px) and (orientation: landscape)");   // index.html's phone-on-its-side layout
// one-handed portrait: Zzz is a key of the pad, the right arrow's size and on its row (Pete); the … and the touch-controls button
// follow it (placeInvBtn, placePadsBtn), so all three match the arrows
export function sizeSleepKey() {
  const one = PORTRAIT_PHONE.matches && document.body.classList.contains("unified") && !document.body.classList.contains("nopad");
  const k = one && tpad.querySelector('[data-k="KeyD"]')!.getBoundingClientRect();
  const outerKeys = !document.body.classList.contains("autodig");          // (the outer keys out: the right one is on that row, so Zzz keeps its corner)
  if (k && k.width) Object.assign(tsleep.style, { width: `${k.width}px`, height: `${k.height}px`, bottom: outerKeys ? "" : `${innerHeight - k.bottom}px` });
  else if (PORTRAIT_PHONE.matches) tsleep.style.width = tsleep.style.height = tsleep.style.bottom = "";
}
// the surf's loudness (sound.ambient, Pete): 1 standing by water (a lake, or the ocean past the map's edge), quickly less with every
// tile further, gone by 5; worked out again only when you move
export let seaKey = "", seaVal = 0;
export function seaNear(s: GameState) {
  const key = s.level + ":" + s.pos[0] + "," + s.pos[1];
  if (key === seaKey) return seaVal;
  seaKey = key;
  const [r0, c0] = s.pos, H = s.size[0], W = s.size[1];
  let d = Math.min(r0 + 1, c0 + 1, H - r0, W - c0);                         // the ocean beyond the map's edge
  for (let r = Math.max(0, r0 - 5); r <= Math.min(H - 1, r0 + 5); r++) for (let c = Math.max(0, c0 - 5); c <= Math.min(W - 1, c0 + 5); c++)
    if (world.at(r, c) === B.WATER) d = Math.min(d, Math.max(Math.abs(r - r0), Math.abs(c - c0)));
  return (seaVal = d <= 1 ? 1 : Math.max(0, Math.exp(-1.1 * (d - 1)) - 0.012));   // 1, .33, .11, .04, then nothing
}
// what a craft sounds like, by the action (sound.craft): wood a saw and a thock; stone tools two clanks; iron, diamond and armour the
// recorded clank. panelCraftT: when you last acted from the E screen (its payoff plays the sound, so the state-change check stays quiet)
export const CRAFT_KIND: Record<number, string> = { 11: "wood", 14: "wood", 25: "wood", 38: "wood", 12: "stone", 15: "stone", 13: "iron", 16: "iron", 20: "iron", 21: "iron", 22: "iron", 23: "iron" };
layout.panelCraftT = -1e9;
// how near lava is (sound.ambient, Pete: lava bubbling only near lava): 1 beside it, fading out by 6 tiles; again only when you move
export let lavaKey = "", lavaVal = 0;
export function lavaNear(s: GameState) {
  const key = s.level + ":" + s.pos[0] + "," + s.pos[1];
  if (key === lavaKey) return lavaVal;
  lavaKey = key;
  const [r0, c0] = s.pos, H = s.size[0], W = s.size[1];
  let d = 99;
  for (let r = Math.max(0, r0 - 6); r <= Math.min(H - 1, r0 + 6); r++) for (let c = Math.max(0, c0 - 6); c <= Math.min(W - 1, c0 + 6); c++)
    if (world.at(r, c) === B.LAVA) d = Math.min(d, Math.hypot(r - r0, c - c0));
  return (lavaVal = d <= 1.5 ? 1 : Math.max(0, Math.exp(-1.2 * (d - 1.5)) - 0.03));   // (Pete: fades faster: .3 a tile on, .09 at two, gone by four)
}
// the nearest fountain within 6 tiles of the camera, for its sound (sound.ambient): where it is, whether it is a spring (world.ts's
// fountain effects decide: a jet bubbling up, or drips from the ceiling), and how near (1 beside it, 0 at 6 tiles); else null
export function fountainNear(p: { x: number; z: number }) {
  let best: FountainFx | null = null, bd = 6;
  const items = world.fx && world.fx.built === world.fountains ? world.fx.items : [];   // this floor's, not a stale set
  for (const it of items) { const d = Math.hypot(it.f.x - p.x, it.f.z - p.z); if (d < bd) { bd = d; best = it; } }
  return best && { x: best.f.x, z: best.f.z, spring: best.spring, near: Math.min(1, 1 - (bd - 1.5) / 4.5) };
}
// the trees a gust can rustle (sound.ambient, Pete): every tree 2 to 8 tiles off, as [x, z] tile centres; again only when you move
export let treeKey = "", treeVal: [number, number][] = [];
export function treesNear(s: GameState) {
  const key = s.level + ":" + s.pos[0] + "," + s.pos[1];
  if (key === treeKey) return treeVal;
  treeKey = key; treeVal = [];
  const [r0, c0] = s.pos, H = s.size[0], W = s.size[1];
  for (let r = Math.max(0, r0 - 8); r <= Math.min(H - 1, r0 + 8); r++) for (let c = Math.max(0, c0 - 8); c <= Math.min(W - 1, c0 + 8); c++) {
    const b = world.at(r, c), d = Math.hypot(r - r0, c - c0);
    if ((b === B.TREE || b === B.FIRE_TREE) && d >= 2 && d <= 8) treeVal.push([c + 0.5, r + 0.5]);
  }
  return treeVal;
}
// on its side: full screen, touch controls, the hotbar, the … and Zzz as one row (Pete: all the hotbar's height). In the row, the
// row's own stretch makes them its height whatever the phone; measuring them into place went wrong on the phone (the page scrolled
// to fold the browser bars). Upright they go back to their own places
export function arrangeRow() {
  const row = $("hotrow")!, full = $("btn-top-full")!, pads = $("btn-pads")!, inv = $("btn-inv")!, bar = $("hotbar")!;
  if (LANDSCAPE_PAD.matches) {
    for (const el of [full, pads, tsleep]) if (!el.classList.contains("inrow")) { el.classList.add("inrow"); el.classList.remove("loose"); el.style.cssText = ""; }
    if (full.nextElementSibling !== pads || full.parentNode !== row) row.insertBefore(full, bar);
    if (pads.nextElementSibling !== bar) row.insertBefore(pads, bar);
    if (inv.parentNode === row && inv.previousElementSibling !== bar) bar.after(inv);
    const before = inv.parentNode === row ? inv : bar;
    if (tsleep.previousElementSibling !== before) before.after(tsleep);
  } else if (tsleep.classList.contains("inrow")) {
    for (const el of [full, pads, tsleep]) { el.classList.remove("inrow"); el.style.cssText = ""; }
    $("touch")!.appendChild(tsleep); $("touch")!.before(pads); $("btn-shot")!.before(full);
  }
}
setInterval(() => {                                                         // Use wears the selected slot's icon
  // (Zzz saying "Hold to sleep" grows for its words: the buttons that follow its size stay put meanwhile, Pete)
  if (!tsleep.classList.contains("asking")) { sizeSleepKey(); placePadsBtn(); placeFullBtn(); placeInvBtn(); arrangeRow(); } placeLooks();
  if (!$("touch")!.offsetParent) return;
  tsleep.classList.toggle("on", !!(game.S && game.S.sleeping));                                        // hidden (no phone layout, a menu up, the bot playing)
  // on its side, Zzz sits just right of the hotbar's … (the row's width varies with the screen, so it is measured, not guessed)
  // (no room there, a narrower phone: beside Use instead)
  if (LANDSCAPE_PAD.matches && !tsleep.classList.contains("inrow")) {
    const r = $("hotrow")!.getBoundingClientRect(), u = tuse.getBoundingClientRect();
    // the …'s own height and level (Pete: as tall as the row's other buttons, the hotbar's frame and all), square
    const inv = $("btn-inv")!.getBoundingClientRect();
    const h = Math.round(inv.height) || 56, wd = h, low = innerHeight - inv.bottom;
    if (r.right + 6 + wd <= innerWidth - 4) Object.assign(tsleep.style, { left: `${r.right + 6}px`, bottom: `${low}px`, width: `${wd}px`, height: `${h}px` });
    else if (u.width) Object.assign(tsleep.style, { left: `${u.left - 62}px`, bottom: `${innerHeight - u.bottom}px`, width: "", height: "" });   // (left of Use, level with its foot: clear of the food)
    else Object.assign(tsleep.style, { left: `${inv.right - wd}px`, bottom: `${innerHeight - Math.min(inv.top, $("bars")!.getBoundingClientRect().top) + 6}px`, width: `${wd}px`, height: `${h}px` });   // (no pad, no Use: over the … and the food)
  } else if (!tsleep.classList.contains("inrow")) tsleep.style.left = tsleep.style.bottom = tsleep.style.width = tsleep.style.height = "";
  const img = document.querySelector<HTMLImageElement>("#hotbar .slot.sel img"), mine = tuse.querySelector("img")!;
  if (!img) return;
  if (img.closest(".slot")!.classList.contains("off")) { mine.removeAttribute("src"); tpad.querySelector(".use-mid img")!.removeAttribute("src"); return; }   // a slot you have none of: blank
  if (mine.getAttribute("src") !== img.getAttribute("src")) mine.setAttribute("src", img.getAttribute("src")!);
  if (mine.className !== img.className) mine.className = img.className;
  const mid = tpad.querySelector(".use-mid img")!;                           // and the pad's middle Use
  if (mid.getAttribute("src") !== img.getAttribute("src")) mid.setAttribute("src", img.getAttribute("src")!);
}, 250);
for (const ev of ["keydown", "mousedown", "touchstart"]) addEventListener(ev, () => sound.unlock(), { capture: true });   // audio may start now
