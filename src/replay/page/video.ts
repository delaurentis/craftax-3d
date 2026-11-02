// The replay page's keys (Space, the timeline's zoom, keyframe steps) and making a video: asking about its sound, then every frame computed
// into an MP4 (js/film.ts).
import { embedPop, sharePop } from "./share";
import { fileName } from "../../../js/record";
import { makeVideo, pickFile, canFilm, FPS } from "../../../js/film";
import { $, EMBED, fmt, openState } from "./open";
import { setWindow, toggle, zoomMid } from "./transport";
import { addKey, askPop, deleteKey, endKey, sel, setIn, setOut } from "./keyframes";
import { stepKey } from "./side";

const rec = () => openState.rec!, P = () => openState.P!;                  // (a recording is open wherever these run)

// the keys. Space (Pete): play from wherever you are, pause, and at the end from the beginning again; also while setting a keyframe
// (it ends there and plays on), and also with the game in focus (its own keys are caught first, below)
export function onKey(e: KeyboardEvent) {
  const t = e.target as Element;
  if (!openState.P || (t.closest && t.closest("textarea, select, input"))) return;
  if (capture) { if (e.code === "Escape") capture.stopped = true; return; }   // (making a video: Esc stops it, nothing else)
  if (embedPop.classList.contains("on") && e.code !== "Escape") return;   // (the embed window: its keys are its own)
  if (e.code === "Space") { e.preventDefault(); e.stopPropagation(); endKey(); toggle(); return; }
  if (EMBED) return;
  if (e.code === "Escape") { if (embedPop.classList.contains("on")) embedPop.classList.remove("on"); else if (sharePop.classList.contains("on")) sharePop.classList.remove("on"); else endKey(); }
  else if (sel && (e.code === "Delete" || e.code === "Backspace")) { e.preventDefault(); deleteKey(sel); }   // (not the start's)
  else if (e.code === "BracketLeft" || e.code === "BracketRight") stepKey(e.code === "BracketLeft" ? -1 : 1);   // (the keyframe before, after)
  else if (sel) return;                                                // (setting a keyframe: the game's other keys are the game's)
  else if (e.code === "KeyI") setIn();
  else if (e.code === "KeyO") setOut();
  else if (e.code === "KeyK") addKey(openState.P.t);
  else if (e.code === "KeyT") ($("frame") as HTMLIFrameElement).contentWindow?.cxReplay?.theme?.(e.shiftKey);   // the next theme (drawing only)
  else if (e.code === "ArrowLeft" || e.code === "ArrowRight") openState.P.seek(openState.P.t + (e.code === "ArrowLeft" ? -1 : 1) * (e.shiftKey ? 5000 : 1000));
  else if (e.code === "Comma" || e.code === "Period") openState.P.seek(openState.P.t + (e.code === "Comma" ? -100 : 100));   // (a tenth of a second)
  else if (e.code === "Equal" || e.code === "NumpadAdd") zoomMid(0.5);
  else if (e.code === "Minus" || e.code === "NumpadSubtract") zoomMid(2);
  else if (e.code === "Digit0") setWindow(0, rec().dur);
}
addEventListener("keydown", (e) => onKey(e as KeyboardEvent));

// the video's sound: on or off (Pete), the same box in Share and in Put it on the web's MP4; remembered for this viewer
export const VSND = "craftax3d.replay.videoSound";
export let videoSound = (() => { try { return localStorage.getItem(VSND) !== "0"; } catch { return true; } })();
// asked once Make a video is chosen (Pete: not a box in the Share window): true / false, or null (cancelled)
export function askSound() {
  return new Promise<boolean | null>((done) => {
    const pop = Object.assign(document.createElement("div"), { className: "askpop" });
    const w = ($("frame") as HTMLIFrameElement).contentWindow!, k = 1080 / Math.min(w.innerWidth, w.innerHeight), ev = (x: number) => Math.round(x * k / 2) * 2;   // (film.ts's size)
    pop.innerHTML = `<div class="win"><h2>Make a video</h2><p>${ev(w.innerWidth)} × ${ev(w.innerHeight)} MP4, ${fmt(P().end - P().start)} at ${FPS} fps: the trimmed recording, every frame computed.</p>`
      + `<label class="vsound"><input type="checkbox"${videoSound ? " checked" : ""}> Include the sound</label><div class="row"><button data-no>Cancel</button><button data-yes>Make it</button></div></div>`;
    const box = pop.querySelector("input")!;
    const end = (v: boolean | null) => { pop.remove(); removeEventListener("keydown", key, true); done(v); };
    const key = (e: KeyboardEvent) => { if (e.code === "Escape") { e.stopPropagation(); end(null); } else if (e.code === "Enter") { e.stopPropagation(); go(); } };
    const go = () => { videoSound = box.checked; try { localStorage.setItem(VSND, videoSound ? "1" : "0"); } catch {} end(videoSound); };
    pop.onclick = (e) => { if (e.target === pop) end(null); };
    pop.querySelector<HTMLElement>("[data-yes]")!.onclick = go;
    pop.querySelector<HTMLElement>("[data-no]")!.onclick = () => end(null);
    addEventListener("keydown", key, true);
    document.body.append(pop); pop.querySelector<HTMLElement>("[data-yes]")!.focus();
  });
}
// ---------- a video: every frame computed, picture and sound, into an MP4 (js/film.ts; Pete: not a recording of the screen) ----------
export let capture: { stopped: boolean } | null = null;
export async function recordVideo() {
  if (!openState.P || capture) return;
  if (!canFilm()) return void askPop("No video here", "This browser can't encode video. Chrome, Edge or Safari 17 can.", "OK");
  const sound = await askSound();
  if (sound === null) return;
  const name = fileName(rec()).replace(/\.cxreplay$/, ".mp4");
  let file: FileSystemWritableFileStream | null = null;
  try { file = await pickFile(name); } catch { return; }              // (the picker, inside the click; cancelled: nothing)
  endKey(); $("loop")!.classList.remove("on");
  capture = { stopped: false };
  document.body.classList.add("capturing");
  const bar = $("filming")!.querySelector("i")!, pct = $("filming")!.querySelector("b")!;
  const progress = (k: number) => { bar.style.width = (100 * k).toFixed(1) + "%"; pct.textContent = Math.floor(100 * k) + " %"; };
  progress(0);
  $("filming")!.querySelector<HTMLElement>(".opt-stop")!.onclick = () => (capture!.stopped = true);
  try {
    const blob = await makeVideo({ iframe: $("frame") as HTMLIFrameElement, P: P(), rec: rec(), file, audio: sound, onProgress: progress, stop: () => capture!.stopped });
    if (blob) { const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name }); a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 60000); }
  } catch (er) {
    const e = er as Error | null;
    if (e?.name !== "AbortError") { console.error(e); askPop("The video failed", String(e?.message || e).replace(/[<&]/g, (c) => (c === "<" ? "&lt;" : "&amp;")), "OK"); }
  } finally {
    document.body.classList.remove("capturing"); capture = null;
    await P().seek(P().start);
  }
}
