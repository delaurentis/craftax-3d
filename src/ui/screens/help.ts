// The help screen and the clicks that close a menu.
import "../../replay/recording";
import { $ } from "../../core/shared";
import { flat, game } from "../../core/game";
import { capOn, letGo, play, saveCapture, screens, setCap, show, syncCapture } from "./screen";
import { settings } from "./settings";
import { arrowTurn } from "./options";

/** A Settings field a Controls tab mirrors: a checkbox, or a menu. */
type Field = HTMLInputElement | HTMLSelectElement;

// any other button outside the menus (who plays, the view, the art) closes an open menu and goes back to the game
for (const id of ["topbar", "looks"]) $(id)!.addEventListener("click", (e) => {
  const b = (e.target as Element).closest("button");
  if (!b || b.id === "btn-top-menu" || b.id === "btn-top-settings" || b.id === "btn-shot" || b.id === "btn-rec") return;
  if (screens.screen !== null && screens.screen !== "dead") play();
});
$("btn-help-close")!.onclick = () => show("start");
// the Controls page as the view you're in has the keys (Pete): in first and third person the arrows look round; overhead (2D, bird's-eye)
// they walk, and Shift with them turns you on the spot; or, with Settings' "Turn without moving: Arrow keys", they only turn
export function helpRows() {
  const over = flat.mode !== 0, turnOnly = over && arrowTurn === "arrows";
  $("help-arrows")!.textContent = !over ? "look around" : turnOnly ? "turn without stepping" : "walk (Shift: turn)";
}
// Controls → Settings (Pete: no copies of the switches here, they differ by view): Gameplay, on the tab for the view you're in; its
// close comes back to the controls
$("btn-help-settings")!.onclick = () => {
  settings.settingsFromHelp = true; show("settings");
  document.querySelector<HTMLElement>('#settings-tabs [data-tab="play"]')?.click();
  document.querySelector<HTMLElement>(`#play-tabs [data-sub="${flat.mode === 0 ? (game.third ? "bump" : "fp") : "bird"}"]`)?.click();
};

$("btn-help-x")!.onclick = () => show("start");
$("help")!.onclick = (e) => { if (e.target === e.currentTarget) show("start"); };   // a click off the window closes it
// the Controls page's tabs (Keyboard, Mouse, Touch: each with its switches), as Research's; on a touch screen it opens on Touch
// (Move, Spam and Hold in Controls: the view you're in)
// (Move and Hold there: Settings' Move to target dropdown of that view; Spam: its Spam target)
export const mirrorOf = (id: string) => { const v = flat.mode === 0 ? 0 : 2; return <Field>$(id === "opt-spam" ? "opt-spam" + v : id === "opt-move" || id === "opt-hold" ? "opt-target" + v : id); };
export const mirrorOn = (id: string, o: Field) => (id === "opt-move" ? o.value !== "never" : id === "opt-hold" ? o.value === "hold" : id === "opt-spam" ? o.value === "on" : (o as HTMLInputElement).checked);
export function syncMirrors() { document.querySelectorAll<HTMLInputElement>("#help [data-mirror]").forEach((m) => { const o = mirrorOf(m.dataset.mirror!); if (m.tagName === "SELECT") m.value = o.value; else m.checked = mirrorOn(m.dataset.mirror!, o); }); }   // as Settings has them now
export function helpTab(t: string) {
  document.querySelectorAll<HTMLElement>("#help-tabs .tab").forEach((b) => { b.classList.toggle("on", b.dataset.tab === t); b.setAttribute("aria-selected", String(b.dataset.tab === t)); });
  document.querySelectorAll<HTMLElement>("#help .hpage").forEach((p) => (p.hidden = p.dataset.page !== t));
  syncMirrors();
}
document.querySelectorAll<HTMLElement>("#help-tabs .tab").forEach((b) => (b.onclick = (e) => { (e.currentTarget as HTMLElement).blur(); helpTab(b.dataset.tab!); }));
helpTab(document.body.classList.contains("touch") ? "touch" : "keys");
// the tabs' switches are Settings' own, mirrored: a change here changes them (and runs their handlers)
document.querySelectorAll<HTMLInputElement>("#help [data-mirror]").forEach((m) => (m.onchange = () => {
  const id = m.dataset.mirror!, o = mirrorOf(id);
  if (m.tagName === "SELECT") o.value = m.value;
  else if (id === "opt-move") o.value = m.checked ? (o.value === "never" ? "click" : o.value) : "never";
  else if (id === "opt-hold") o.value = m.checked ? "hold" : o.value === "never" ? "never" : "click";
  else if (id === "opt-spam") o.value = m.checked ? "on" : "off";
  else (o as HTMLInputElement).checked = m.checked;
  o.onchange?.({ target: o } as unknown as Event);   // (the handlers read only e.target)
}));
$("opt-capture") && ($("opt-capture")!.onchange = (e) => { setCap((e.target as HTMLInputElement).checked); syncCapture(); saveCapture(); if (!capOn()) letGo(); });
