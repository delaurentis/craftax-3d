// Recording and replays: the look and camera as keys, the replay's camera, the record button, kept replays.
import { settings } from "../ui/screens/settings";
import { local } from "../../js/local";
import { recorder, player as replayer, download, kept } from "../../js/record";
import { net, brainSize } from "../../js/net";
import { $, sound } from "../core/shared";
import { SPECTATE } from "../render/scene";
import { armState } from "../render/arm";
import { flat, game } from "../core/game";
import { lookState, pickedLook, setSkin } from "../looks/looks";
import { skinOf } from "../looks/registry";
import { refresh2D, setLook, setView, syncLooks, views } from "../views/views";
import { flash } from "../ui/hud/hint";
import { locked, menuPause, pause, play, screens, show, unlockPointer } from "../ui/screens/screen";
import { PHONE } from "../ui/hud/buttons";
import { ask, esc } from "../ui/screens/worlds";
import { pointerState } from "../input/pointer";
import { besidePage } from "../page-url";
import { onScreen, themeById } from "../themes/state";
import { setThemeNow, switchTheme } from "../themes/transition";
import type { Cam } from "../core/types";

// ---------- recording a stretch of the game (record.ts): ⏺ in the top bar starts, again stops and keeps it in this browser for the
// replay page (/replay/, replay.html), which plays it back, trims and re-shoots it, and saves it as a .cxrec file (Pete). The button always shows (Pete); ?rec=0 hides it (remembered, ?rec brings it back)
export const lookNow = () => (flat.picture === 2 ? "crystal" : flat.picture === 1 ? "original" : pickedLook().id);
export const camNow = () => ({ yaw: game.yaw, pitch: game.pitch, mode: flat.mode, look: lookNow(), orbit: flat.orbit, el: flat.el, sel: game.hud ? game.hud.sel : 0,
                        aim: armState.aimOn > 0.01 ? [...armState.aimTile, armState.aimOn] : 0, theme: onScreen.to?.id ?? null });
// a replay's view and look, straight from where it is to where it goes (Pete: leaving classic 2D for laser went through the crystal's
// 2D view, as the game's own button does): never through a third. `cut`: no transition at all (a seek, the loop back to the start)
export function goLook(mode: number, look: string, cut: boolean) {
  if (look === "original" || look === "crystal") { if (lookNow() !== look) setLook(look, true); }
  else {
    if (flat.picture) { flat.picture = 0; refresh2D(); }                             // out of classic, straight to the 3D look asked for
    if (mode !== flat.mode) setView(mode);
    if (lookNow() !== look || lookState.pick !== look) setLook(look, true);
  }
  if (cut) {
    lookState.fade = null; views.phosOff++; setSkin(skinOf(look));
    flat.t = flat.on ? 1 : 0; flat.k = flat.mode === 1 ? 0 : 1; flat.img = flat.mode === 1 && flat.picture ? 1 : 0;
    refresh2D(); syncLooks();
  }
}
// the bot's brain panel as the screen shows it now: "hidden" (no bot, or folded to its name), "small", or "big" (net.ts)
export function brainShown() {
  const el = $("botpanel");
  if (!el || el.style.display !== "block") return "hidden";
  if (el.classList.contains("big")) return "big";
  return el.classList.contains("folded") && !(PHONE.matches && !el.classList.contains("tiny")) ? "hidden" : "small";
}
// a replay's theme, as recorded (or as a keyframe sets it): switched when the recording switched, with the game's own transition (a
// seek: at once). Only on a change, so T on the replay page shows another theme until the recording's next one. A theme this
// game doesn't have: told once, drawn in Standard
const replayed = { theme: undefined as string | null | undefined, told: new Set<string>() };
function replayTheme(id: string | null, cut: boolean) {
  if (!cut && id === replayed.theme) return;
  replayed.theme = id;
  const t = themeById(id);
  if (id && !t && !replayed.told.has(id)) { replayed.told.add(id); flash(`This replay was played in the "${id}" theme, which isn't installed here: shown in Standard`); }
  if (cut) setThemeNow(t); else switchTheme(t);
}
export function replayCam(c: Cam | null) {
  if (replayer.rec) {                                                       // the bot's brain as the keyframe in force sets it (replay.html), or as
    brainSize(replayer.brainAt(replayer.t) as "hidden" | "small" | "big");                                // the recording showed it
  }
  if (replayer.free) { replayer.aim = null; return; }                         // replay.html framing a shot: the view and camera are yours
  if (!c) return;
  const cut = replayer.cutNext; replayer.cutNext = false;
  if (cut || c.look !== lookNow() || (!flat.picture && c.mode !== flat.mode)) goLook(c.mode, c.look, !!cut);
  replayTheme(c.theme ?? null, !!cut);
  if (c.yaw == null) {                                                      // first person with no recorded camera: face where they face
    const want = (<Record<number, number>>{ 1: Math.PI / 2, 2: -Math.PI / 2, 3: 0, 4: Math.PI })[game.S!.dir] ?? game.yaw;
    pointerState.yawGoal = game.yaw + Math.atan2(Math.sin(want - game.yaw), Math.cos(want - game.yaw)); pointerState.pitchGoal = c.pitch;
  } else { game.yaw = c.yaw; game.pitch = c.pitch; pointerState.yawGoal = pointerState.pitchGoal = null; }
  flat.orbit = c.orbit; flat.el = c.el; flat.orbitGoal = null;
  if (game.hud && c.sel !== game.hud.sel) game.hud.select(c.sel, true);
  replayer.aim = c.aim || null;
}
export const recOn = (() => { try { const q = new URLSearchParams(location.search).get("rec"); if (q !== null) localStorage.setItem("craftax3d.rec", q === "0" ? "0" : "1"); return localStorage.getItem("craftax3d.rec") !== "0"; } catch { return true; } })();
export let recTimer: ReturnType<typeof setInterval> | 0 = 0;
if (recOn && !SPECTATE) $("btn-rec")!.hidden = false;
// a recording is a clip, at most 10 minutes (what sharing takes), and never the ending: beating the necromancer stops it just before
// the blow that did it (local.ts endingGuard; no spoilers in anyone's clips, Pete)
export const REC_MAX_MS = 10 * 60e3;
export async function recStop(why = "") {
  if (!recorder.on) return;
  const b = $("btn-rec")!;
  clearInterval(recTimer); b.classList.remove("on"); b.dataset.tip = "Record"; delete b.dataset.warned;
  if (why) sound.chime();                                                  // stopped by itself (10 minutes, the ending): you hear it too (Pete)
  const r = (await recorder.stop())!;                                      // (recorder.on: there is one)
  try { await kept.put(r); }
  catch { await download(r); flash(`${why}Saved a ${Math.round(r.dur / 1000)} s recording`); return; }   // (no IndexedDB here: the file at once)
  syncReplays();
  // then ask (Pete): watch it now, or play on. The game holds still while you choose (a menu's pause: no idle ticks, the bot paused)
  const was = screens.screen;
  screens.screen = "ask"; screens.hadLock = false; if (locked()) unlockPointer(); menuPause(true);
  const s = Math.round(r.dur / 1000), len = s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`;
  const watch = await ask("Recording saved", `${why ? esc(why) + "<br>" : ""}${len}, kept in this browser. Watch it now, trim it and save it, or keep playing?`, "Watch it", "Keep playing");
  screens.screen = was; menuPause(was !== null);
  if (watch) openReplays(r.id);
  else if (was === null) play();
}
// Replays (the start menu, beside Research): shown once this browser has a recording; the replay page, at /replay/ on playcraftax,
// else replay.html beside the game. `id`: straight into that recording
export async function syncReplays() { try { $("btn-replays")!.hidden = !(await kept.all()).length; } catch {} }
export async function openReplays(id?: string) {
  const nearby = besidePage("replay.html");   // the page, not an asset (vite)
  let url = nearby;
  // (each wait cut short: Pete's phone never left the menu, one of them never settling)
  const within = <T,>(p: Promise<T>, ms: number) => Promise.race([p, new Promise<undefined>((r) => setTimeout(r, ms))]);
  try { if ((await within(fetch("/replay/", { method: "HEAD" }), 1500))?.ok) url = new URL("/replay/", location.href); } catch {}
  if (id) url.searchParams.set("open", id);
  await within(local.flush().catch(() => {}), 1500);                       // (the world saved first: Back comes back to it)
  location.href = url.href;
}
$("btn-replays")!.onclick = () => openReplays();
if (!SPECTATE) syncReplays();
$("btn-rec")!.onclick = async (e) => {
  const b = e.currentTarget as HTMLElement; b.blur();
  if (!net.local) { flash("Recording needs the game in this browser"); return; }
  if (recorder.on) return recStop();
  await recorder.start({ w: innerWidth, h: innerHeight, dpr: devicePixelRatio, touch: document.body.classList.contains("touch"), phone: PHONE.matches },
    () => recStop("Recording stopped before the ending: no spoilers. "));
  b.classList.add("on"); flash("Recording");
  recTimer = setInterval(() => {
    const ms = recorder.elapsed(), s = Math.floor(ms / 1000);
    if (ms >= REC_MAX_MS) { recStop("Recording stopped: 10 minutes is the most. "); return; }
    if (ms >= REC_MAX_MS - 30e3 && !b.dataset.warned) { b.dataset.warned = "1"; flash("Recording stops in 30 seconds (10 minutes is the most)"); }
    b.dataset.tip = `Recording ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}: click to stop and save`;
  }, 500);
};
$("btn-top-settings")!.onclick = (e) => { (e.currentTarget as HTMLElement).blur(); settings.settingsFromGame = true; if (locked()) unlockPointer(); show("settings"); };
$("btn-top-menu")!.onclick = (e) => { (e.currentTarget as HTMLElement).blur(); if (screens.screen !== null && screens.screen !== "dead") play(); else pause(); };
// a click anywhere on the menu screen that isn't a button (or a field) closes it and goes back to the game
$("start")!.addEventListener("click", (e) => { if (!(e.target as Element).closest("button, input, select, label, a")) play(); });
