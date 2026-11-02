// The replay page's side: the game's own view and look buttons and a theme menu for the keyframe you're on, the brain's size,
// stepping between keyframes, and what the HUD shows.
import { CAMERA, ICONS, LOOKS, VIEWS, addKey, endKey, renderKeys, sel, selectKey, themeOf } from "./keyframes";
import { GAME } from "../../../js/record";
import { $, fmt, keep, openState, sizeFrame } from "./open";
import type { Cam, CamKey } from "../../core/types";

const rec = () => openState.rec!, P = () => openState.P!;                  // (a recording is open wherever these run)

// ---------- the side: the keyframes, and the game's own view and look buttons for the one you're on ----------
// (index.html's #looks, read from the game page itself, so they are the same buttons as in the game: Pete; then, once the game is
// loaded in the frame, its live #looks, which has the plugin looks' buttons too: open.ts)
export function takeLooks(looks: Element | null) {
  if (!looks) return;
  $("side-looks")!.innerHTML = looks.innerHTML;
  // the same icons, small, for the keyframe list (Pete: icons, not words); a plugin look's name from its button's tip
  looks.querySelectorAll<HTMLElement>("[data-view]").forEach((b) => (ICONS["v" + b.dataset.view] = b.querySelector("svg")?.outerHTML || ""));
  looks.querySelectorAll<HTMLElement>("[data-art]").forEach((b) => {
    ICONS["a" + b.dataset.art] = b.querySelector("svg")?.outerHTML || "";
    LOOKS[b.dataset.art!] ??= (b.dataset.tip || b.dataset.art!).replace(/ Mode$/, "").toLowerCase();
  });
  renderKeys();                                                           // (lit by the next syncSide, once the recording is in)
}
fetch(new URL("index.html", GAME)).then((r) => r.text()).then((h) => takeLooks(new DOMParser().parseFromString(h, "text/html").getElementById("looks"))).catch(() => {});
export async function setLook(view: string | null | undefined, look: string | null | undefined) {
  if (!openState.P) return;
  if (!sel) await addKey(openState.P.t);
  const c = openState.P.camNow!();
  const mode = view === "classic" ? 1 : view == null ? (c.look === "original" || c.look === "crystal" ? 0 : c.mode) : +view;
  look = view === "classic" ? "original" : look ?? (c.look === "original" || c.look === "crystal" ? "color" : c.look);
  openState.P.look!(mode, look);
}
// the brain's size: on the keyframe you're setting, or a new one here
$("brainsize")!.onclick = async (e) => {
  const b = (e.target as Element).closest("button"); if (!b || !openState.P) return;
  if (!sel) await addKey(openState.P.t);
  const k = sel as CamKey | null;                                          // (addKey picked one)
  if (!k) return;
  k.brain = b.dataset.b; renderKeys(); keep(); openState.P.wake(); syncSide();
};
$("side-looks")!.onclick = (e) => {
  const b = (e.target as Element).closest("button"); if (!b) return;
  if (b.dataset.view !== undefined) setLook(b.dataset.view, null);
  else if (b.dataset.art) setLook(null, b.dataset.art);
};
// the theme menu (Pete: above View and look, always there once a theme is installed): Standard and the game's installed themes, showing
// the theme on screen; picking one sets it on the keyframe you're on, or a new one here (as the view, look and brain buttons do), with
// its transition, as T does. A keyframe's theme not installed here shows as Standard, its
// id kept until another is picked
const pick = $("theme-pick") as HTMLSelectElement;
function themeMenu(): boolean {
  const list = P().themeList?.() ?? [];
  if (pick.options.length !== list.length) pick.replaceChildren(...list.map((t) => Object.assign(document.createElement("option"), { value: t.id ?? "", textContent: t.label })));
  return list.length > 1;
}
pick.onchange = async () => {
  if (!openState.P) return;
  if (!sel) await addKey(openState.P.t);                                  // (as the view, look and brain buttons: a keyframe here)
  const k = sel as CamKey | null;
  if (!k) return;
  const id = pick.value || null;
  k.theme = id; renderKeys(); keep();
  P().setTheme?.(id);
};
function syncTheme(c: Cam) {                                                // (what's on screen: the keyframe being set, or the replay here)
  const box = $("side-theme")!;
  box.hidden = !themeMenu();
  if (box.hidden) return;
  const want = sel && sel.theme !== undefined ? sel.theme : c.theme ?? null, here = [...pick.options].some((o) => o.value === (want ?? ""));
  pick.value = here ? want ?? "" : "";
}
export function syncSide() {                                                 // (sync: what the replay shows now, or the keyframe you're on, lit)
  const c = P().camNow!(), classic = c.look === "original" || c.look === "crystal", b = P().brainAt(P().t);
  syncTheme(c);
  document.querySelectorAll<HTMLElement>("#brainsize [data-b]").forEach((x) => x.classList.toggle("on", x.dataset.b === b));
  document.querySelectorAll<HTMLElement>("#side-looks [data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === "classic" ? classic : !classic && +b.dataset.view! === c.mode));
  document.querySelectorAll<HTMLElement>("#side-looks [data-art]").forEach((b) => b.classList.toggle("on", !classic && b.dataset.art === c.look));
}
// the keyframes, listed: click one to go to it and set it; ◀ ▶ step between them
export function renderKeyList() {                                            // (the side's list: gone, Pete; the keyframe row shows them)
  const box = $("keylist"), keys: CamKey[] = openState.rec ? openState.rec.edits.keys : [];
  if (!box) return;
  if (!keys.length) { box.innerHTML = `<p class="hint">None yet: pick a view or look above, or click the row under the bar.</p>`; return; }
  box.innerHTML = "";
  for (const k of keys) {
    const r = document.createElement("div");
    r.className = "kr" + (k.fixed ? "" : " view") + (k === sel ? " sel" : "");
    const classic = k.look === "original" || k.look === "crystal";
    r.title = k.rec ? "the recorded camera" : `${VIEWS[k.mode!] ?? ""}${classic ? "" : ", " + (LOOKS[k.look!] ?? "")}${themeOf(k)}${k.fixed ? ", your camera" : ""}`;
    r.innerHTML = `<i></i><span>${fmt(k.t - (openState.P ? openState.P.start : 0))}</span>` + (k.rec ? "" : `<b class="ic">${ICONS[classic ? "vclassic" : "v" + k.mode] || ""}${classic ? "" : ICONS["a" + k.look] || ""}${CAMERA.replace("<svg", `<svg class="cam${k.fixed ? " on" : ""}"`)}</b>`);
    if (k !== keys[0] || k.t !== 0) {                                    // (the first keyframe always stays)
      const x = Object.assign(document.createElement("button"), { className: "x", textContent: "✕", title: "Delete this keyframe" });
      x.setAttribute("aria-label", "Delete this keyframe");
      x.onclick = (e) => { e.stopPropagation(); if (sel === k) endKey(); rec().edits.keys = rec().edits.keys.filter((y) => y !== k); renderKeys(); keep(); P().wake?.(); };
      r.append(x);
    } else r.title += " (the start: always here)";
    r.onclick = () => selectKey(k);
    box.append(r);
  }
}
export function stepKey(d: number) {
  const keys = rec().edits.keys; if (!keys.length) return;
  const t = sel ? sel.t : P().t;
  const k = d < 0 ? [...keys].reverse().find((x) => x.t < t - 1) : keys.find((x) => x.t > t + 1);
  if (k) selectKey(k);
}
// (Pete: by default only Health shows; a recording's own choices, once made, are kept with it)
export const SHOW_DEFAULT: Record<string, boolean> = { status: false, inv: false, bars: true, hotbar: false, ach: false, loot: false, msg: false };
export function showNow() {
  const sh = rec().edits.show;
  // none yet, or only the old all-on default (never chosen): today's default; a key added since (msg) takes its default
  if (!sh || ["status", "inv", "hotbar", "ach", "loot"].every((k) => sh[k] === true) && !("msg" in sh)) rec().edits.show = { ...SHOW_DEFAULT };
  else rec().edits.show = { ...SHOW_DEFAULT, ...sh };
  return rec().edits.show!;
}
document.querySelectorAll<HTMLInputElement>("#side [data-show]").forEach((x) => (x.onchange = () => { showNow()[x.dataset.show!] = x.checked; openState.P?.show!(rec().edits.show); document.body.classList.toggle("show-inv", !!rec().edits.show!.inv); document.body.classList.toggle("show-status", !!rec().edits.show!.status); keep(); syncSide(); }));
$("orient")!.onclick = (e) => {
  const b = (e.target as Element).closest("button"); if (!b || !openState.rec) return;
  openState.rec.edits.orient = b.dataset.o; sizeFrame(); keep();
};
export function applyShow() {
  const sh = showNow();
  document.body.classList.toggle("show-inv", !!sh.inv); document.body.classList.toggle("show-status", !!sh.status);
  document.querySelectorAll<HTMLInputElement>("#side [data-show]").forEach((x) => (x.checked = sh[x.dataset.show!] !== false));
  P().show!(sh);
}
