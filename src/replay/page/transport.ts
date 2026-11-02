// The replay page's transport: syncing the controls to the player, the spoiler-free end, play and pause, the sound level, Play from here,
// and the timeline (seek, trim handles, zoom and pan).
import { $, EMBED, VIEW, fmt, keep, openState, whoY } from "./open";
import { GAME } from "../../../js/record";
import { endKey, followKey, lane, renderKeys, sel } from "./keyframes";
import { syncSide } from "./side";
import { capture } from "./video";

// this module's state that other modules set (one module can't assign another's let): pan
export interface Transport {
  /** A drag panning the timeline: where it began, the window's start then, and whether it has moved yet. */
  pan: { x: number; a: number; moved: boolean; add?: number } | null;
}
export const transport = {} as Transport;
const btn = (id: string) => $(id) as HTMLButtonElement;

// ---------- the transport ----------
export let lastTick = 0;
export function sync(what?: string) {
  if (!openState.P || !openState.rec) return;
  if (what === "tick" && performance.now() - lastTick < 50) return;
  lastTick = performance.now(); whoY();
  if (openState.P.playing && !EMBED && (openState.P.t > view.b || openState.P.t < view.a)) return setWindow(openState.P.t - 0.05 * span());   // (zoomed: the window follows the playhead)
  $("time")!.innerHTML = `${fmt(openState.P.t - openState.P.start)}<span class="total"> / ${fmt(openState.P.end - openState.P.start)}</span>`;   // (the total: not on an upright phone, replay.css)
  const pl = $("play")!, lab = openState.P.playing ? "❚❚" : "▶";
  if (pl.textContent !== lab) { pl.textContent = lab; pl.setAttribute("aria-label", openState.P.playing ? "Pause" : "Play"); }   // (only on a change: never rebuilt under a click)
  document.body.classList.toggle("paused", !openState.P.playing);
  const tr = $("track")!;
  tr.querySelector<HTMLElement>(".head")!.style.left = pc(openState.P.t);
  tr.querySelector<HTMLElement>('[data-end="in"]')!.style.left = pc(openState.P.start);
  tr.querySelector<HTMLElement>('[data-end="out"]')!.style.left = pc(openState.P.end);
  Object.assign(tr.querySelector<HTMLElement>(".kept")!.style, { left: pc(openState.P.start), width: `calc((100% - ${2 * PAD}px) * ${(openState.P.end - openState.P.start) / span()})` });
  $("lane")!.querySelector<HTMLElement>(".head")!.style.left = pc(openState.P.t);
  if (sel) { if (openState.P.playing) endKey(); else followKey(); }
  if (!EMBED) syncSide();
  if (what === "play" || what === "pause" || what === "end") soundOn();
  if (what === "end") secretEnd();
  if ((what === "seek" || what === "play") && document.body.classList.contains("secret")) { clearTimeout(secretT); document.body.classList.remove("secret"); $("secret")!.firstChild!.textContent = ""; }
}
// a recording cut for no spoilers ends in black: "No spoilers. The rest is secret…" types out (and an embed starts over after it)
export let secretT: ReturnType<typeof setTimeout> | 0 = 0;
export function secretEnd() {
  if (capture) return;                                                 // (a video draws its own ending: film.ts)
  const done = () => { if (EMBED && !VIEW) openState.P!.play(); };
  if (!openState.rec!.secret || openState.P!.end < openState.rec!.dur - 1) return;
  document.body.classList.add("secret");
  const line = "No spoilers. The rest is secret…", el = $("secret")!.firstChild!;
  let i = 0; el.textContent = "";
  const type = () => { el.textContent = line.slice(0, ++i); secretT = setTimeout(i < line.length ? type : done, i < line.length ? (line[i - 1] === "." ? 380 : 70) : 2600); };
  secretT = setTimeout(type, 1700);
}
export const toggle = (e?: Event) => { (e?.currentTarget as HTMLElement | null | undefined)?.blur?.(); if (!openState.P) return; soundOn(); openState.P.playing ? openState.P.pause() : openState.P.play(); };   // (blurred: Space after a click doesn't press it again)
// sound: an embed starts silent (it plays by itself); the editor at 60 %. Remembered for this viewer only. The game's audio can only
// start inside a click, so each click here passes the level in (soundOn)
export const QUIET = EMBED && !VIEW, VKEY = QUIET ? "craftax3d.replay.embedVol" : "craftax3d.replay.vol";   // (a shared link's page: the editor's level)
export let vol = (() => { try { const v = localStorage.getItem(VKEY); return v === null ? (QUIET ? 0 : 60) : +v; } catch { return QUIET ? 0 : 60; } })(), volBack = vol || 60;
export function soundOn() { try { openState.P?.sound!(openState.P.playing ? vol / 100 : 0); } catch {} }   // (paused: silent too, the ambience included)
export function syncVol() { ($("volume") as HTMLInputElement).value = String(vol); $("mute")!.classList.toggle("off", !vol); $("mute")!.setAttribute("aria-label", vol ? "Sound off" : "Sound on"); }
export function setVol(v: number) { vol = Math.max(0, Math.min(100, Math.round(v))); if (vol) volBack = vol; try { localStorage.setItem(VKEY, String(vol)); } catch {} syncVol(); soundOn(); }
$("mute")!.onclick = () => setVol(vol ? 0 : volBack);
$("volume")!.oninput = (e) => setVol(+(e.target as HTMLInputElement).value);
syncVol();
$("bigplay")!.onclick = toggle;
// Play from here: the game in a new tab, with this moment as a new world of yours. The engine's state rides in the address's
// #fragment (gzipped, ~10 KB; never sent to a server), so it works from an embed on any site (local.ts pickUp)
// `say`: where a refusal shows (the embed's badge; the Share window's button in the editor). False when it didn't open
export async function playFromHere(say: (m: string) => void) {
  if (!openState.P) return false;
  const tab = window.open("", "_blank");                               // (opened in the click itself: a popup blocker allows it)
  if (tab) tab.opener = null;
  let h: { version: string; seed: number; snap: string } | null = null, why = "No spoilers: this one has no start of the Graveyard to play from";
  try { h = await openState.P.handoff(); } catch (e) { why = "It couldn't open: " + ((e as Error)?.message || e); }   // (on the Graveyard: from its beginning, record.ts)
  if (!h) { tab?.close(); say(why); return false; }
  const raw = Uint8Array.from(atob(h.snap), (c) => c.charCodeAt(0));
  const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
  let s = ""; for (let i = 0; i < z.length; i += 0x8000) s += String.fromCharCode.apply(null, z.subarray(i, i + 0x8000) as unknown as number[]);
  const from = btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const url = `${GAME}?server=local#from=${from}&seed=${h.seed}&v=${encodeURIComponent(h.version)}`;
  if (tab) tab.location.href = url; else location.href = url;
  return true;
}
$("badge")!.onclick = (e) => { e.preventDefault(); playFromHere((m) => { const b = $("badge")!, was = b.innerHTML; b.textContent = m; setTimeout(() => (b.innerHTML = was), 2500); }); };
// on the press itself, not the click (Pete: pause didn't always stop: a click is lost if the button changes between press and release);
// a click from the keyboard (Enter: detail 0) still works
$("play")!.onpointerdown = (e) => { if (e.button === 0) { e.preventDefault(); toggle(e); } };
$("play")!.onclick = (e) => { if (e.detail === 0) toggle(e); };
$("shield")!.onclick = toggle;
$("rate")!.onchange = (e) => { if (openState.P) openState.P.rate = +(e.target as HTMLSelectElement).value; };
$("loop")!.onclick = (e) => { if (!openState.P) return; openState.P.loop = !openState.P.loop; (e.currentTarget as HTMLElement).classList.toggle("on", openState.P.loop); };
// the track: click or drag to seek; drag a yellow handle to trim
export const track = $("track")!;
// the bar and the keyframe row put time PAD px in from each end, so what sits on either end shows whole; inner(el): that span on screen
export const PAD = 12, inner = (el: Element) => { const b = el.getBoundingClientRect(); return { left: b.left + PAD, width: Math.max(1, b.width - 2 * PAD) }; };
export const timeAt = (x: number) => { const b = inner(track); return view.a + Math.max(0, Math.min(1, (x - b.left) / b.width)) * span(); };
// ---------- the timeline's window (Pete: long recordings need zoom): the bar and the keyframe row show view.a to view.b. The wheel over
// either zooms about the pointer (a sideways swipe or Shift pans), −/+/Fit (or the keys - = 0); playing, the window follows ----------
export const view = { a: 0, b: 1 };
export const span = () => view.b - view.a;
export const pc = (t: number) => `calc(${PAD}px + (100% - ${2 * PAD}px) * ${(t - view.a) / span()})`;
export function setWindow(a: number, s = span()) {
  if (!openState.rec) return;
  s = Math.max(Math.min(openState.rec.dur, 2000), Math.min(openState.rec.dur, s));
  view.a = Math.max(0, Math.min(openState.rec.dur - s, a)); view.b = view.a + s;
  renderKeys(); renderTicks(); sync();
  btn("zoom-fit").disabled = s >= openState.rec.dur - 1; btn("zoom-out").disabled = s >= openState.rec.dur - 1;
}
export const zoomAt = (t: number, f: number) => { const s = span() * f, k = (t - view.a) / span(); setWindow(t - k * s, s); };
export const zoomMid = (f: number) => zoomAt(openState.P && openState.P.t >= view.a && openState.P.t <= view.b ? openState.P.t : (view.a + view.b) / 2, f);
$("zoom-in")!.onclick = () => zoomMid(0.5);
$("zoom-out")!.onclick = () => zoomMid(2);
$("zoom-fit")!.onclick = () => setWindow(0, openState.rec!.dur);
export function onWheel(e: WheelEvent) {
  if (!openState.rec || EMBED) return;
  e.preventDefault();
  const w = inner(e.currentTarget as Element).width;
  if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) setWindow(view.a + ((e.shiftKey ? e.deltaY : 0) + e.deltaX) * span() / w);
  else zoomAt(timeAt(e.clientX), Math.exp(e.deltaY * (e.ctrlKey ? 0.01 : 0.002)));
}
export function renderTicks() {
  lane.querySelectorAll(".tick").forEach((x) => x.remove());
  const w = inner(lane).width || 600, msPx = span() / w;
  const step = [100, 250, 500, 1000, 2000, 5000, 10000, 15000, 30000, 60000, 120000, 300000].find((x) => x / msPx >= 70) || 600000;
  for (let t = Math.ceil(view.a / step) * step; t <= view.b; t += step) {
    const d = Object.assign(document.createElement("div"), { className: "tick" });
    d.style.left = pc(t);
    d.innerHTML = `<span>${step < 1000 ? fmt(t) : fmt(t).replace(/\.0$/, "")}</span>`;
    lane.append(d);
  }
}
addEventListener("resize", () => openState.rec && renderTicks());
export let dragging: string | null = null;
track.addEventListener("pointerdown", (e) => {
  if (!openState.P) return;
  e.preventDefault();                                                  // (no text selection while dragging)
  endKey(); openState.P.free = false;                                            // (scrubbing: the camera is the keyframes' again, not yours)
  soundOn();
  // (Pete: zoomed in, the bar drags along like a map) the playhead, or the whole bar unzoomed, scrubs; elsewhere a drag pans the
  // window and a click (no drag) jumps there
  const headX = inner(track).left + (openState.P.t - view.a) / span() * inner(track).width;
  dragging = (e.target as HTMLElement).dataset.end || (EMBED || span() >= openState.rec!.dur - 1 || Math.abs(e.clientX - headX) < 10 ? "seek" : "pan");
  track.setPointerCapture(e.pointerId);
  if (dragging === "pan") transport.pan = { x: e.clientX, a: view.a, moved: false }; else move(e);
});
track.addEventListener("pointermove", (e) => dragging && (dragging === "pan" ? panMove(e, track) : move(e)));
track.addEventListener("pointerup", (e) => {
  if (dragging === "in" || dragging === "out") keep();
  if (dragging === "pan" && !transport.pan!.moved) { dragging = "seek"; move(e); }
  dragging = null; transport.pan = null;
});
// dragging the bar or the keyframe row sideways: the window slides with the pointer (once it has moved a few pixels)
transport.pan = null;
export function panMove(e: PointerEvent, el: Element) {
  const pan = transport.pan!;
  if (!pan.moved && Math.abs(e.clientX - pan.x) < 4) return;
  pan.moved = true;
  setWindow(pan.a - (e.clientX - pan.x) * span() / inner(el).width);
}
export let seekQ: number | null = null;
export function move(e: PointerEvent) {
  const t = timeAt(e.clientX);
  if (dragging === "in") openState.rec!.edits.in = Math.min(t, openState.P!.end - 200);
  else if (dragging === "out") openState.rec!.edits.out = Math.max(t, openState.P!.start + 200);
  else { seekQ = t; if (!openState.P!.busy) seekNow(); return; }
  sync();
}
export async function seekNow() { while (seekQ !== null) { const t: number = seekQ; seekQ = null; await openState.P!.seek(t); } }
