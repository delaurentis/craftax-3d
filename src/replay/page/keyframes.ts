// The replay page's editing: trims and camera keyframes (setting, adding, moving, deleting, resetting them) and the keyframe row.
import { inner, onWheel, panMove, pc, span, sync, track, transport, view } from "./transport";
import { $, fmt, keep, openState } from "./open";
import { renderKeyList } from "./side";
import type { Cam, CamKey } from "../../core/types";
import { STANDARD_ICON, iconHTML } from "../../themes/icon";

/** The replay page's open recording and player: assumed there wherever an edit runs (a recording is open). */
const rec = () => openState.rec!, P = () => openState.P!;

// ---------- editing: trims, keyframes ----------
export const setIn = () => { rec().edits.in = Math.min(P().t, P().end - 200); sync(); keep(); };
export const setOut = () => { rec().edits.out = Math.max(P().t, P().start + 200); sync(); keep(); };
export const VIEWS: Record<number, string> = { 0: "first person", 1: "classic 2D", 2: "3/4" };
export const LOOKS: Record<string, string> = { color: "color", laser: "laser", phosphor: "phosphor", original: "original art", crystal: "what the crystal sees" };
export const frames = (n: number) => new Promise<void>((ok) => { const w = ($("frame") as HTMLIFrameElement).contentWindow!; const f = (): unknown => (--n <= 0 ? ok() : w.requestAnimationFrame(f)); w.requestAnimationFrame(f); });
// the keyframe being set: the replay is paused on it and the game's controls are yours (P.free): its view and look follow what the
// game shows, and once you move the camera, the camera too (`fixed`). Done, Esc, or playing on ends it
export let sel: CamKey | null = null, base: Cam | null = null;
// (from one keyframe straight to another, the panel and the page stay put: Pete saw them jump as it closed and opened again)
export async function selectKey(k: CamKey) {
  if (sel === k) return;
  endKey(true);
  P().pause(); await P().seek(k.t); await frames(2);                       // (the camera as the replay has it here, then yours)
  sel = k; P().free = true; base = P().camNow!();
  document.body.classList.add("editing", "free");
  renderKeys(); describeKey();
}
export function endKey(switching = false) {
  if (!sel) return;
  sel = null; base = null; if (openState.P) openState.P.free = false;
  if (!switching) document.body.classList.remove("editing", "free");
  renderKeys(); keep();
}
export const moved = (a: Cam, b: Cam) => (["yaw", "pitch", "orbit", "el"] as const).some((f) => Math.abs((a[f] as number) - (b[f] as number)) > 0.002);
export function followKey() {                                                // (sync, while one is being set)
  const c = P().camNow!(), k = sel!;
  let changed = c.mode !== k.mode || c.look !== k.look;
  k.mode = c.mode; k.look = c.look;
  // its theme, as T (or the side's menu) shows it now; a theme not installed here is drawn as Standard but kept in the keyframe, so it
  // comes back where it is installed, until another is picked
  const shown = c.theme ?? null, here = k.theme == null || !!P().themeList?.().some((t) => t.id === k.theme);
  if (here ? shown !== k.theme : shown !== null) { k.theme = shown; changed = true; }
  // (first person is always the player's own eyes: nothing to hold)
  if (c.mode !== 0 && moved(c, base!)) { Object.assign(k, { fixed: true, yaw: c.yaw, pitch: c.pitch, orbit: c.orbit, el: c.el }); base = c; changed = true; }
  if (changed) { renderKeys(); describeKey(); keep(); }
}
export function describeKey() {}                                            // (no panel: the keyframe row and the side say it all, Pete)
// Keyframes (Pete): there is always one at the very start, holding the recording's own view and look (it can be set, not moved or
// deleted), and no two closer than KEY_GAP: a new one that close picks the one already there, and a dragged one stops at its
// neighbours (they never pass each other)
// (Pete: as close as touching: the gap is a diamond's width on screen, so zoomed in they can be closer, but never under KEY_MIN)
export const KEY_MIN = 250, keyGap = () => Math.max(KEY_MIN, 22 * span() / (inner(lane).width || 600));
// The keyframes start as the game played (Pete): one at the start, and one wherever the player changed the view or the look while
// recording, read off the recorded camera; they're ordinary keyframes after that, to change or delete. Done once per recording
// (`seeded`); a recording opened before this keeps the keyframes it has and gains the ones it was missing
export function firstKey() {
  const keys = rec().edits.keys, cam = rec().cam, iMode = rec().camCols ? rec().camCols!.indexOf("mode") + 1 : 3, iLook = iMode + 1;
  const iTheme = rec().camCols ? rec().camCols!.indexOf("theme") + 1 : 0;   // (0: a recording from before themes)
  if (!rec().edits.seeded && cam.length) {
    let prev: { mode: number; look: string; theme: string | null } | null = null;
    for (const row of cam) {
      const mode = row[iMode] as number, look = row[iLook] as string, theme = iTheme ? ((row[iTheme] as string | null | undefined) ?? null) : null;
      if (prev && prev.mode === mode && prev.look === look && prev.theme === theme) continue;
      const at = prev ? row[0] : 0; prev = { mode, look, theme };       // (the first sample: the start)
      const set = iTheme ? { mode, look, theme } : { mode, look };
      if (at === 0) { if (keys.length && keys[0].t === 0) Object.assign(keys[0], set); else keys.unshift({ t: 0, ...set, fixed: false }); continue; }
      if (keys.some((k) => Math.abs(k.t - at) < KEY_MIN)) continue;
      keys.push({ t: at, ...set, fixed: false, auto: true });
    }
    keys.sort((a, b) => a.t - b.t);
    rec().edits.seeded = true;
  }
  if (!(keys.length && keys[0].t === 0)) { const c = P().recCam(0) || P().camNow!(); keys.unshift({ t: 0, mode: c.mode, look: c.look, fixed: false }); }
  keep();
}
export function addKey(t: number) {
  t = Math.round(Math.max(0, Math.min(rec().dur, t)));
  const near = rec().edits.keys.find((x) => Math.abs(x.t - t) < keyGap());
  if (near) return selectKey(near);
  const c = P().camNow!();
  const k: CamKey = { t, mode: c.mode, look: c.look, theme: c.theme ?? null, fixed: false };
  rec().edits.keys = rec().edits.keys.concat(k).sort((a, b) => a.t - b.t);
  keep(); return selectKey(k);
}
$("keyadd")!.onclick = () => addKey(P().t);
// on the keyframe row (Pete): a keyframe's ✕ removes it (not the start's); its camera, once lit (you framed it), asks to go back to the
// recorded camera
export const isFirst = (k: CamKey) => k === rec().edits.keys[0] && k.t === 0;
export function deleteKey(k: CamKey) {
  if (isFirst(k)) return;
  if (sel === k) endKey();
  rec().edits.keys = rec().edits.keys.filter((x) => x !== k); renderKeys(); keep(); P().wake?.();
}
export async function resetCamera(k: CamKey) {
  if (!k.fixed || !(await askPop("Reset the camera?", `The keyframe at ${fmt(k.t - P().start)} goes back to the recorded camera. Its view and look stay.`, "Reset", "Keep"))) return;
  k.fixed = false; delete k.yaw; delete k.pitch; delete k.orbit; delete k.el;
  const was = sel === k; endKey(); renderKeys(); keep(); P().wake?.();
  if (was) selectKey(k);
}
// a small question in the middle of the screen, in the Share window's style
export function askPop(title: string, text: string, yes: string, no?: string) {
  return new Promise<boolean>((done) => {
    const pop = Object.assign(document.createElement("div"), { className: "askpop" });
    pop.innerHTML = `<div class="win"><h2>${title}</h2><p>${text}</p><div class="row"><button data-yes>${yes}</button>${no ? `<button data-no>${no}</button>` : ""}</div></div>`;
    const end = (v: boolean) => { pop.remove(); removeEventListener("keydown", key, true); done(v); };
    const key = (e: KeyboardEvent) => { if (e.code === "Escape") { e.stopPropagation(); end(false); } else if (e.code === "Enter") { e.stopPropagation(); end(true); } };
    pop.onclick = (e) => { if (e.target === pop) end(false); };
    pop.querySelector<HTMLElement>("[data-yes]")!.onclick = () => end(true);
    if (no) pop.querySelector<HTMLElement>("[data-no]")!.onclick = () => end(false);
    addEventListener("keydown", key, true);
    document.body.append(pop); pop.querySelector<HTMLElement>(no ? "[data-no]" : "[data-yes]")!.focus();
  });
}
// the row: click to drop a keyframe; a diamond: click to set it, drag it along to move it
export const lane = $("lane")!;
export const laneTime = (x: number) => { const b = inner(lane); return view.a + Math.max(0, Math.min(1, (x - b.left) / b.width)) * span(); };
track.addEventListener("wheel", onWheel, { passive: false });
lane.addEventListener("wheel", onWheel, { passive: false });
export let keyDrag: { k: CamKey; x: number; moved: boolean; lo: number; hi: number; pinned: boolean } | null = null;
lane.addEventListener("pointerdown", (e) => {
  if (!openState.P) return;
  e.preventDefault();
  const d = (e.target as Element).closest<HTMLElement>(".key");
  if (!d) { transport.pan = { x: e.clientX, a: view.a, moved: false, add: laneTime(e.clientX) }; lane.setPointerCapture(e.pointerId); return; }   // (a drag pans; a click drops a keyframe)
  const kk = rec().edits.keys[+d.dataset.i!];
  if ((e.target as Element).closest(".kx")) { deleteKey(kk); return; }
  if ((e.target as Element).closest(".cam.on") && sel === kk) { resetCamera(kk); return; }   // (only on the keyframe you're on: elsewhere a click picks it)
  const k = rec().edits.keys[+d.dataset.i!], i = rec().edits.keys.indexOf(k), ks = rec().edits.keys;
  const g = keyGap(), lo = i > 0 ? ks[i - 1].t + g : 0, hi = i + 1 < ks.length ? ks[i + 1].t - g : rec().dur;   // (between its neighbours)
  keyDrag = { k, x: e.clientX, moved: false, lo, hi, pinned: k.t === 0 && i === 0 }; lane.setPointerCapture(e.pointerId);
});
lane.addEventListener("pointermove", (e) => {
  if (transport.pan && !keyDrag) return panMove(e, lane);
  if (!keyDrag) return;
  if (!keyDrag.moved && Math.abs(e.clientX - keyDrag.x) < 4) return;
  if (keyDrag.pinned) return;                                          // (the first keyframe stays at the start)
  keyDrag.moved = true; keyDrag.k.t = Math.round(Math.max(keyDrag.lo, Math.min(keyDrag.hi, laneTime(e.clientX))));
  renderKeys();
});
lane.addEventListener("pointerup", () => {
  if (transport.pan && !keyDrag) { const p = transport.pan; transport.pan = null; if (!p.moved) addKey(p.add!); return; }
  if (!keyDrag) return;
  const { k, moved: m } = keyDrag; keyDrag = null;
  if (m) { keep(); if (sel === k) { sel = null; selectKey(k); } } else selectKey(k);
});
export function renderKeys() {
  lane.querySelectorAll(".key").forEach((k) => k.remove());
  if (!openState.rec) return;
  renderKeyList();
  openState.rec.edits.keys.forEach((k, i) => {
    const d = Object.assign(document.createElement("div"), { className: "key" + (k.fixed ? "" : " view") + (k === sel ? " sel" : "") });
    d.dataset.i = String(i); d.style.left = pc(k.t);
    const classic = k.look === "original" || k.look === "crystal";
    d.innerHTML = `<i class="dia"></i>` + (k.rec ? "" : (ICONS[classic ? "vclassic" : "v" + k.mode] || "") + (classic ? "" : ICONS["a" + k.look] || "") + themeIcon(k) + CAMERA.replace("<svg", `<svg class="cam${k.fixed ? " on" : ""}"`) + (k.brain ? BRAIN.replace("<svg", `<svg class="brn ${k.brain}"`) : "")) + (isFirst(k) ? "" : `<b class="kx" title="Remove this keyframe">✕</b>`);
    d.title = `${fmt(k.t)}: ${k.rec ? "the recorded camera" : `${VIEWS[k.mode!] ?? "view"}, ${LOOKS[k.look!] ?? "look"}${themeOf(k)}${k.fixed ? ", your camera" : ""}${k.brain ? `, brain ${{ hidden: "hidden", small: "small", big: "expanded" }[k.brain]}` : ""}`}`;
    lane.append(d);
  });
}
/** A keyframe's theme, for its label (", Winter"; none when it follows the recording's). */
export const themeOf = (k: CamKey) => (k.theme === undefined ? "" : ", " + (P().themeName?.(k.theme) ?? k.theme ?? "Standard"));
export const ICONS: Record<string, string> = {};
// a keyframe's theme on the row, under its look (only once a theme is installed, or the keyframe holds one): the theme's own icon,
// Standard's tree, else a T. A keyframe that follows the recording (no theme of its own) shows it dimmed
function themeIcon(k: CamKey): string {
  const list = P().themeList?.() ?? [], id = k.theme ?? null;
  if (list.length < 2 && id === null) return "";
  const t = list.find((x) => x.id === id);
  return iconHTML(id === null ? STANDARD_ICON : t?.icon, "thm" + (k.theme === undefined ? " dim" : ""));
}
export const BRAIN = '<svg viewBox="0 0 20 20" width="16" height="16" shape-rendering="crispEdges" aria-hidden="true"><path d="M5 3h10v1h2v2h1v7h-1v2h-3v2h-2v-2H5v-1H3v-2H2V6h1V4h2z" fill="#e88ab0"/><path d="M10 4h1v10h-1zM5 8h3v1H5zM13 7h3v1h-3zM6 11h2v1H6zM13 11h2v1h-2z" fill="#9a3e66"/></svg>';   // (a keyframe that sets the brain)
export const CAMERA = '<svg viewBox="0 0 20 20" width="16" height="16" shape-rendering="crispEdges" aria-hidden="true"><path d="M7 4h6v2h4v10H3V6h4z" fill="#ddd"/><path d="M8 8h4v1h1v4h-1v1H8v-1H7V9h1z" fill="#2a2a2a"/><path d="M9 10h2v2H9z" fill="#4ab0ff"/><path d="M4 7h2v1H4z" fill="#ffd84a"/></svg>';   // (a keyframe that holds your camera)
