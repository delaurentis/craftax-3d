// The buttons' wiring: tooltips, the phone's swipe cover, the top bar and looks bar, card docks, the opening view and look.
import { botDriving, capOn, letGo, play, saveCapture, screens, setCap, syncCapture } from "../screens/screen";
import * as tele from "../../../js/telemetry";
import { pixelButton } from "../../../js/pixeltitle";
import { net } from "../../../js/net";
import { $, common } from "../../core/shared";
import { canvas, scene } from "../../render/scene";
import { api, flat, game, mobs, shots } from "../../core/game";
import { apply } from "../../core/apply";
import { enterPortal, victory, victoryNudge } from "../../effects/victory";
import { inkLook, lookState } from "../../looks/looks";
import { look as lookById, looks } from "../../looks/registry";
import { savedLook, setLook, setView, syncLooks, views } from "../../views/views";
import { flash } from "./hint";
import { hasMemoryView, memoryClear, memoryLabel } from "../../views/memory";
import { toggleAuto } from "../screens/worlds";
import { openPanel } from "../screens/panel";
import { phoneMedia } from "../side";

// tooltips for the icon buttons (data-tip): shown at once, above the button or below it near the top, clamped inside the window
export const tipEl = document.createElement("div");
tipEl.className = "tip"; document.body.append(tipEl);
export let tipFor: HTMLElement | null = null;
export function showTip(b: HTMLElement) {
  tipFor = b; tipEl.textContent = b.dataset.tip ?? null; tipEl.style.display = "block";
  const r = b.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight, below = r.top < h + 16;
  tipEl.style.left = Math.max(6, Math.min(innerWidth - w - 6, r.left + r.width / 2 - w / 2)) + "px";
  tipEl.style.top = (below ? r.bottom + 8 : r.top - h - 8) + "px";
}
document.addEventListener("pointerover", (e) => {
  if (e.pointerType !== "mouse") return;                                    // a tap is not a hover: no tip left stuck on a phone
  const t = e.target as Element, b = t.closest && t.closest<HTMLElement>("button[data-tip]");
  if (b) showTip(b); else if (tipFor) { tipFor = null; tipEl.style.display = "none"; }
});
document.addEventListener("pointerdown", (e) => { if (e.pointerType !== "mouse" && tipFor) { tipFor = null; tipEl.style.display = "none"; } }, true);
document.addEventListener("click", () => { if (tipFor) { if (tipFor.isConnected) showTip(tipFor); else { tipFor = null; tipEl.style.display = "none"; } } });   // its text may change
// a phone on its side: Safari keeps its bars until the page scrolls, so the page is a little taller than the screen (html.tall) and a
// "swipe up" cover asks for the one scroll that folds them. It goes (html.full) once the window has grown (the bars folded), the
// page has scrolled at all, or a swipe on the cover has ended, whatever the browser did with it (Pete's iPhone kept the cover up:
// none of the first two was seen). Turning the phone asks again
export const SIDEWAYS = matchMedia("(pointer: coarse) and (orientation: landscape) and (max-height: 520px)");   // (a phone only, not a tablet on its side: src/ui/side.ts)
export let sideH = 0, maxH = 0, swiped = false;                                   // sideH: the window's height when the cover went up; maxH: its tallest
if ("scrollRestoration" in history) history.scrollRestoration = "manual";   // a reload starts at the top, with room to swipe
export function sideways() {
  const root = document.documentElement, on = SIDEWAYS.matches;
  if (!on) { sideH = maxH = 0; swiped = false; }
  else if (!sideH) sideH = maxH = innerHeight;
  maxH = Math.max(maxH, innerHeight);
  // the bars came back (after a death, a menu, a tap at the edge): back to the top and the cover again, so a swipe can fold them
  if (on && maxH > sideH + 20 && innerHeight < maxH - 20) { swiped = false; sideH = maxH = innerHeight; scrollTo(0, 0); }
  root.classList.toggle("tall", on);
  // the window as tall as the phone's screen (its short side, sideways): the browser's bars are already folded away
  const scr = window.screen;
  const scrolled = (scrollY || document.scrollingElement?.scrollTop || 0) > 0;
  root.classList.toggle("full", on && (swiped || scrolled || innerHeight > sideH + 20 || innerHeight >= Math.min(scr.width, scr.height) - 8));
}
for (const ev of ["resize", "scroll"]) addEventListener(ev, sideways, { passive: true });
addEventListener("orientationchange", () => { sideH = 0; swiped = false; setTimeout(sideways, 300); });
visualViewport?.addEventListener("resize", sideways);
SIDEWAYS.addEventListener?.("change", () => { sideH = 0; swiped = false; sideways(); });
// the pause menu's Full screen (a phone on its side): real fullscreen where the browser has it (Android), else the swipe-up cover
// again, the page back at the top so the swipe has room (after a reload, a death, or the bars coming back)
// the … beside the hotbar: the inventory and crafting screen, as E (Pete); again closes it
// the start and death menus' buttons in the flat pixel font (Pete)
document.querySelectorAll<HTMLElement>("#start button.mc, #dead button.mc, #dead-seed").forEach((b) => pixelButton(b));   // (and the death screen's seed line)
canvas.addEventListener("pointerdown", () => { if (victory.portal && game.S && game.S.done && $("victory")!.classList.contains("on")) enterPortal(); });   // a game that ended at the win (a server's): a click or tap goes through
addEventListener("pointermove", () => victoryNudge());
$("btn-inv")!.onclick = (e) => { e.stopPropagation(); if (!game.S) return; if (screens.screen === "panel") play(); else openPanel(null); };
$("btn-top-full")!.onclick = (e) => {                                     // the top bar's full-screen button (a phone on its side)
  (e.currentTarget as HTMLElement).blur();
  const el = document.documentElement;
  const cover = () => { swiped = false; sideH = maxH = 0; scrollTo(0, 0); sideways(); el.classList.remove("full"); };   // the swipe-up cover, the page at the top
  // real fullscreen where the browser has it (Android); refused or not taken (an iPhone's Safari: Pete, it did nothing), the cover
  if (el.requestFullscreen) { el.requestFullscreen().then(() => { if (!document.fullscreenElement) cover(); }, cover); return; }
  cover();
};
$("swipe")!.addEventListener("touchend", () => setTimeout(() => { swiped = true; sideways(); }, 350), { passive: true });   // after the scroll settles
sideways();
// a bot's model loading (agent.ts says when it starts and ends): a plain "Loading…" under the top bar, with a shimmering bar
addEventListener("cx-model-progress", (ev) => {
  const d = (ev as CustomEvent<{ done?: boolean }>).detail, el = $("mload")! as HTMLElement & { hideT?: ReturnType<typeof setTimeout> };
  clearTimeout(el.hideT);
  if (d.done) { el.hideT = setTimeout(() => (el.style.display = "none"), 300); return; }
  el.querySelector("span")!.textContent = "Loading weights…";              // one message, not two (Pete: the toast said it as well)
  el.style.display = "block";
});
// phones: the status plaque folds the stats, achievements and armour away; a tap opens them (index.html's phone layout)
export const PHONE = phoneMedia("(max-width: 720px), (max-height: 520px)");
$("info")!.addEventListener("click", (e) => {
  if (!PHONE.matches || !(e.target as Element).closest(".plaque")) return;
  const open = $("info")!.classList.toggle("open");
  document.body.classList.toggle("hud-open", open);
  document.documentElement.style.setProperty("--gear-y", $("info")!.getBoundingClientRect().height + 12 + "px");
});
$("btn-play")!.onclick = play;
$("btn-capture")!.onclick = (e) => {
  (e.currentTarget as HTMLElement).blur();
  setCap(!capOn()); syncCapture(); saveCapture();
  if (!capOn()) { letGo(); return; }
  if (botDriving()) { flash("The bot is playing: take over (P) and the mouse is captured"); return; }
  if (screens.screen !== null && screens.screen !== "start") return;
  play();                                                                    // from the pause menu too: back to the game, captured
  flash("Mouse captured: hold Alt to click, Esc lets go");
};
syncCapture();
$("panel")!.addEventListener("click", (e) => { if (e.target === e.currentTarget || (e.target as Element).closest(".x")) play(); });   // a click beside the inventory, or its X, closes it
document.querySelectorAll<HTMLElement>("#seg-view button").forEach((b) => (b.onclick = (e) => {
  setView(b.dataset.view === "classic" ? 1 : +b.dataset.view!);
  (e.currentTarget as HTMLElement).blur();
}));
// the looks bar: a button for each look, in M's order. The built-ins' are in index.html (the replay page reads them there); a plugin
// look's is made from its icon, with its css put on the page (again after the player's own plugins load: js/main.ts)
export function lookButtons() {
  const bar = $("seg-art")!;
  let prev: HTMLElement | null = null;
  for (const L of looks()) {
    let b = bar.querySelector<HTMLElement>(`button[data-art="${CSS.escape(L.id)}"]`);
    if (!b) {
      b = document.createElement("button"); b.dataset.art = L.id; b.innerHTML = L.icon ?? "";
      b.dataset.tip = L.label + " Mode"; b.setAttribute("aria-label", b.dataset.tip);
      if (L.css) { const st = document.createElement("style"); st.dataset.look = L.id; st.textContent = L.css; document.head.append(st); }
      if (prev) prev.after(b); else bar.prepend(b);
    }
    if (!b.onclick) b.onclick = (e) => { setLook(b!.dataset.art!); (e.currentTarget as HTMLElement).blur(); };
    prev = b;
  }
}
lookButtons();
// touch: button rows as a hand of cards, like the hotbar (hud.ts; Pete): a finger on them, slid along, pulls the one under it out a
// little, away from the screen edge it sits on (pop), a little bigger on an opaque card (index.html .dock); let go and that one is pressed
export function cardDock(box: HTMLElement, pop: (b: HTMLButtonElement) => string) {
  let id: number | null = null;
  const pull = (x: number, y: number) => {
    const bs = [...box.querySelectorAll("button")].filter((b) => b.offsetParent);
    let best: HTMLButtonElement | null = null, bd = 1e9;
    for (const b of bs) {                                                   // where it sits in the layout, not where it's pulled to (or easing back)
      const o = b.offsetParent!.getBoundingClientRect(), d = Math.hypot(x - (o.left + b.offsetLeft + b.offsetWidth / 2), y - (o.top + b.offsetTop + b.offsetHeight / 2));
      if (d < bd) { bd = d; best = b; }
    }
    for (const b of bs) {
      const on = b === best;
      b.style.transform = on ? pop(b) : "";
      b.style.zIndex = on ? "30" : "";
      b.classList.toggle("dock", on);
    }
    return best;
  };
  const drop = () => { box.classList.remove("docking"); for (const b of box.querySelectorAll("button")) { b.style.transform = b.style.zIndex = ""; b.classList.remove("dock"); } };
  box.addEventListener("pointerdown", (e) => {
    if (e.pointerType !== "touch") return;                                // on a button or in the margin round them (index.html, Pete)
    e.preventDefault();
    id = e.pointerId; try { box.setPointerCapture(e.pointerId); } catch {}
    box.classList.add("docking"); pull(e.clientX, e.clientY);
  });
  box.addEventListener("pointermove", (e) => { if (e.pointerId === id) pull(e.clientX, e.clientY); });
  const up = (e: PointerEvent) => {
    if (e.pointerId !== id) return;
    id = null;
    const b = e.type === "pointerup" ? pull(e.clientX, e.clientY) : null;
    drop();
    lifted = performance.now(); ours = true; b?.click(); ours = false;
  };
  box.addEventListener("pointerup", up); box.addEventListener("pointercancel", up);
  // the browser's own click for that same tap, after ours: dropped, so one tap is one press (Pete: the theme button stepped through
  // two themes); a finger has to lift and press again for the next
  let lifted = -1e9, ours = false;
  box.addEventListener("click", (e) => { if (!ours && performance.now() - lifted < 800) { e.stopPropagation(); e.preventDefault(); } }, true);
}
// the view and look buttons: sideways from the phone's column at the left edge, up from a row (Pete: a little lift, still in the dock)
cardDock($("looks")!, (b) => (getComputedStyle($("looks")!).flexDirection === "column"
  ? `translateX(${b.offsetWidth * 0.5 + 6}px) scale(1.3)` : `translateY(${-(b.offsetHeight * 0.5 + 6)}px) scale(1.3)`));
// you or the bot, at the top: the finger comes from below, so it only grows, in place (Pete)
cardDock($("seg-who")!, () => "scale(1.35)");
tele.setContext(() => ({ mode: net.local ? "local" : "server", view: tele.viewName(flat.mode),
  look: flat.picture ? ["color", "original", "crystal"][flat.picture] : inkLook().id }));
// the game opens in the view and look you last played in (Pete); a first visit: the 3/4 view, in color (Pete, 2026-10-19). A look no
// plugin here has (any more) opens in color; one from the player's own plugins, which load later, is put back once they have
// (js/main.ts: again, when it's there now)
export function restoreLook() {
  const L = savedLook(), look = lookById(L?.look) ? L!.look! : "color", view = ([0, 1, 2] as (number | undefined)[]).includes(L?.view) ? L!.view! : 2;
  views.lookRestoring = true;
  if (view === 1) { setView(1); setLook(look, true); }                     // (into the classic view first: no line fade on the way)
  else { setLook(look, true); setView(view); }
  game.third = !!L?.third;
  views.lookRestoring = false;
}
/** The saved look, now known, isn't the one on: a plugin added it since the page opened. */
export const lookUnrestored = () => { const id = savedLook()?.look; return !!id && !!lookById(id) && id !== lookState.pick; };
restoreLook();
flat.t = flat.k = flat.mode === 0 ? 0 : 1;                                       // already there, the trees at its size, not swinging over from first person (Pete)
document.querySelectorAll<HTMLElement>("#seg-who button").forEach((b) => (b.onclick = async (e) => {
  (e.currentTarget as HTMLElement).blur();
  if ((b.dataset.who === "bot") !== (game.S && game.S.world && game.S.world.control === "bot")) { await toggleAuto(); syncLooks(); }
}));
syncLooks();
export function toggleMemory() {                                                   // Y: the memory strip beside the 2D view (no button: Pete)
  if (!hasMemoryView()) return;                                                    // (no plugin draws one: nothing to switch; the saved choice stays)
  common.memOn = !common.memOn;
  try { localStorage.setItem("craftax3d.memory", common.memOn ? "1" : "0"); } catch {}
  if (!common.memOn) memoryClear();
  flash(memoryLabel() + (common.memOn ? " on" : " off"));
}
$("btn-new")!.onclick = async () => {
  if (game.S && game.S.world && !game.S.world.you) { net.world = null; history.replaceState(null, "", location.pathname + (net.base ? "?server=" + encodeURIComponent(net.base) : "")); }
  apply(await api("/api/reset", { seed: (Math.random() * 2 ** 31) | 0 })); clearEntities(); play();
};
export function clearEntities() { for (const m of [mobs, shots]) { for (const [, e] of m) scene.remove(e.model); m.clear(); } }
