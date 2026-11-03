// Settings' options: speed, click and target options, the crosshair, hands and arrow keys.
import "./help";
import { fx } from "../../../js/fell";
import { $, sound } from "../../core/shared";
import { gfx, resize } from "../../render/quality";
import { flat, game } from "../../core/game";
import { chestState } from "../../effects/chest";
import { entities } from "../../render/entities";
import { crossAim } from "../../input/aim";
import { REACH_ANY, boxModes, targeting } from "../../render/targeting";
import { pathing } from "../../input/pathing";
import { cap, capView, letGo, saveCapture, screens, syncCapture, useClickView, viewIconSync } from "./screen";
import { brainRecOn, setBrainRec } from "../../replay/brain-rec";

// this module's state that other modules set (one module can't assign another's let): crossShown
export interface Options {
  /** Whether the crosshair showed at the last frame (null: not drawn yet). */
  crossShown: boolean | null;
}
export const options = {} as Options;
/** A view's click choices (Settings' 1st person and Bird's-eye tabs): move to target, spam it, hold to target, if it moves. */
export interface ClickPrefs { move: boolean; spam: boolean; hold: boolean; chase: string }
/** The click and target choices in use: the shared switches and the view you're in's ClickPrefs (useClickView). */
export interface Opt extends ClickPrefs { orient: boolean; bump: boolean; preview: boolean }
const input = (id: string) => $(id) as HTMLInputElement, select = (id: string) => $(id) as HTMLSelectElement;
const checked = (e: Event) => (e.target as HTMLInputElement).checked, value = (e: Event) => (e.target as HTMLInputElement | HTMLSelectElement).value;

// Settings → World, in steps a second (Pete): how fast the world goes when you move, and when you stand still (Pause: not at all,
// Craftax's own turns). Standing still is never faster than moving; a shot in flight always goes at the moving speed. Remembered
export const SPEED = "craftax3d.speed";
export function speedSet(move: number, idle: number, mode: string, save = true) {                        // mode: "go" (at the moving speed), "slow" (at Speed when still), "pause"
  move = Math.max(1, Math.min(10, move)); idle = Math.max(0.5, Math.min(move, idle));
  game.tickMs = 1000 / move; game.idleMs = mode === "pause" ? -1 : mode === "go" ? game.tickMs : 1000 / idle;
  input("opt-tick").value = String(move); $("tick-ms")!.textContent = String(move); $("tick-u")!.textContent = move === 1 ? "step / second" : "steps / second";
  const r = input("opt-idlerate"); r.max = String(move); r.value = String(idle); $("idle-v")!.textContent = String(idle); $("idle-u")!.textContent = idle === 1 ? "step / second" : "steps / second";
  select("opt-idle").value = mode; $("row-idlerate")!.style.display = mode === "slow" ? "" : "none";
  if (save) try { localStorage.setItem(SPEED, JSON.stringify({ move, idle, mode })); } catch {}
}
export const speedNow = (): [number, number, string] => [+input("opt-tick").value, +input("opt-idlerate").value, select("opt-idle").value];
{ let o: { move?: number; idle?: number; mode?: string; go?: boolean } | null = null; try { o = JSON.parse(localStorage.getItem(SPEED) ?? "null"); } catch {}   // (a save from before "slows down": go true was it)
  speedSet(o?.move ?? 3, o?.idle ?? 1, o?.mode ?? (o?.go === false ? "pause" : "slow"), false); }
$("opt-idle")!.onchange = () => speedSet(...speedNow());
$("opt-idlerate")!.oninput = () => speedSet(...speedNow());
{
  const set = (v: number) => { input("opt-reach").value = String(v); $("reach-v")!.textContent = v >= REACH_ANY ? "any distance" : `${v} ${v === 1 ? "block" : "blocks"}`; };
  set(targeting.reachBlocks);
  $("opt-reach")!.oninput = (e) => { targeting.reachBlocks = +value(e); set(targeting.reachBlocks); pathing.pending = null; try { localStorage.setItem("craftax3d.reach", String(targeting.reachBlocks)); } catch {} };
}
input("opt-mobhp").checked = entities.mobBarsOn;
$("opt-mobhp")!.onchange = (e) => { entities.mobBarsOn = checked(e); try { localStorage.setItem("craftax3d.mobhp", entities.mobBarsOn ? "1" : "0"); } catch {} };
// Capture the mouse, in Settings' 1st person and Bird's-eye tabs (Pete): each view's own (on: taken at the next click in that view)
for (const v of [0, 2] as const) {
  const box = input("opt-cap" + v);
  viewIconSync.push(() => (box.checked = cap[v]));
  box.checked = cap[v];
  box.onchange = () => { cap[v] = box.checked; saveCapture(); syncCapture(); if (v === capView() && !cap[v]) letGo(); };
}
for (const [v, key] of [[0, "craftax3d.targetbox"], [2, "craftax3d.targetbox2"]] as const) {   // Target highlight, in the 1st person and Bird's-eye tabs
  select("opt-targetbox" + v).value = boxModes[v];
  $("opt-targetbox" + v)!.onchange = (e) => { boxModes[v] = value(e); try { localStorage.setItem(key, value(e)); localStorage.removeItem("craftax3d.targetviews"); } catch {} };
}
input("opt-crossclick").checked = crossAim;
// Settings: a click walks you to what you clicked (move), and a mob you click is hit again and again until it is gone (spam); both on
// unless switched off, each remembered
export const opt = {} as Opt;
for (const [k, id] of [["orient", "opt-orient"], ["bump", "opt-bump"], ["preview", "opt-preview"]] as const) {
  // (saved under fresh names, Pete: everyone starts with Move, Spam, Orient and Attack on bump on again, Hold off; then remembered)
  const sk = "craftax3d." + k + ((k as string) === "hold" ? "" : k === "preview" ? "2" : "1"), on0 = (k as string) !== "hold";   // hold: off unless switched on; preview: on (Pete), under a fresh name so everyone starts with it on
  opt[k] = (() => { try { const v = localStorage.getItem(sk); return v === null ? on0 : v === "1"; } catch { return on0; } })();
  input(id).checked = opt[k];
  $(id)!.onchange = (e) => { opt[k] = checked(e); pathing.pending = null; try { localStorage.setItem(sk, opt[k] ? "1" : "0"); } catch {} };
}
// Move to target on click, Spam target on click, Hold to target and If target moves: each view its own, in the 1st person and Bird's-eye
// tabs (Pete; the 2D view goes by bird's-eye's). opt.move / spam / hold / chase are the view you're in (useClickView, from setView);
// each starts from the old shared choice, then is remembered for itself
export const CLICK_ON0: ClickPrefs = { move: true, spam: true, hold: false, chase: "chase" };
screens.clickPer = (() => {
  const old = (k: "move" | "spam" | "hold") => { try { const v = localStorage.getItem("craftax3d." + k + (k === "hold" ? "" : "1")); return v === null ? CLICK_ON0[k] : v === "1"; } catch { return CLICK_ON0[k]; } };
  const base = { move: old("move"), spam: old("spam"), hold: old("hold"), chase: "chase" };
  const per: Record<number, ClickPrefs> = {};
  for (const v of [0, 2]) { let saved: Partial<ClickPrefs> | null = null; try { saved = JSON.parse(localStorage.getItem("craftax3d.click" + v) ?? "null"); } catch {} per[v] = { ...base, ...(saved || {}) }; }
  return per;
})();
// Move to target (Pete): on click (Move on), hold (Move and Hold on), never (Move off); Spam target beside it
export const targetOn = (p: ClickPrefs) => (!p.move ? "never" : p.hold ? "hold" : "click");
for (const v of [0, 2]) for (const k of ["target", "spam", "chase"] as const) {
  const per = screens.clickPer![v], el = $("opt-" + k + v) as HTMLInputElement, isBox = el.type === "checkbox";
  // (all three are menus now; a checkbox's chase would hold true or false)
  if (isBox) el.checked = per[k as "spam"] as boolean; else el.value = k === "target" ? targetOn(per) : k === "spam" ? (per.spam ? "on" : "off") : per[k];
  el.onchange = () => {
    if (k === "target") Object.assign(per, { move: el.value !== "never", hold: el.value === "hold" });
    else if (k === "spam") per.spam = el.value === "on";            // (Spam target: until destroyed / never, Pete)
    else (per as unknown as Record<string, boolean | string>)[k] = isBox ? el.checked : el.value;
    pathing.pending = null; useClickView();
    try { localStorage.setItem("craftax3d.click" + v, JSON.stringify(per)); } catch {}
  };
}
useClickView();
// an upright phone's centered touch controls (index.html, body.unified): on unless switched off in Settings; remembered
// the touch pad, Use and Sleep (Settings, touch screens; on unless switched off): off, the view alone is played by tapping
{
  const on = (() => { try { return localStorage.getItem("craftax3d.pads") !== "0"; } catch { return true; } })();
  document.body.classList.toggle("nopad", !on); input("opt-pads").checked = on;
  $("opt-pads")!.onchange = (e) => {
    document.body.classList.toggle("nopad", !checked(e));
    try { localStorage.setItem("craftax3d.pads", checked(e) ? "1" : "0"); } catch {}
  };
  $("btn-pads")!.onclick = (e) => {                                          // the bottom-right button: the same switch (Pete)
    (e.currentTarget as HTMLElement).blur();
    const c = input("opt-pads"); c.checked = !c.checked; c.onchange!({ target: c } as unknown as Event);   // (the handler reads only e.target)
  };
}
// the bot watching your moves (local.ts reads craftax3d.local.watch): on by default on a computer, off on a phone
{
  const key = "craftax3d.local.watch", get = () => { try { return localStorage.getItem(key); } catch { return null; } };
  const v = get(); input("opt-watch").checked = v === null ? !matchMedia("(pointer: coarse)").matches : v === "1";
  $("opt-watch")!.onchange = (e) => { try { localStorage.setItem(key, checked(e) ? "1" : "0"); } catch {} };
}
// recording the bot's brain in replays (src/replay/brain-rec.ts): off unless switched on
input("opt-brainrec").checked = brainRecOn();
$("opt-brainrec")!.onchange = (e) => setBrainRec(checked(e));
// the centre crosshair on a touch screen (Settings, off by default): without a captured mouse it otherwise hides
// the crosshair in first person: on unless Settings turns it off (Pete; a fresh key, so it starts on for everyone)
export let showCross = (() => { try { return localStorage.getItem("craftax3d.cross1") !== "0"; } catch { return true; } })(); options.crossShown = null;
input("opt-cross").checked = showCross;
$("opt-cross")!.onchange = (e) => { showCross = checked(e); try { localStorage.setItem("craftax3d.cross1", showCross ? "1" : "0"); } catch {} };
input("opt-needwarn").checked = chestState.needOn;
$("opt-needwarn")!.onchange = (e) => { chestState.needOn = checked(e); try { localStorage.setItem("craftax3d.needwarn", chestState.needOn ? "1" : "0"); } catch {} };
input("opt-needonce").checked = chestState.needOnce;
$("opt-needonce")!.onchange = (e) => { chestState.needOnce = checked(e); try { localStorage.setItem("craftax3d.needonce", chestState.needOnce ? "1" : "0"); } catch {} };
{
  const set = (on: boolean) => { document.body.classList.toggle("no-ach", !on); input("opt-achtoast").checked = on; };
  set((() => { try { return localStorage.getItem("craftax3d.achtoast") !== "0"; } catch { return true; } })());
  $("opt-achtoast")!.onchange = (e) => { set(checked(e)); try { localStorage.setItem("craftax3d.achtoast", checked(e) ? "1" : "0"); } catch {} };
}
// Crosshair size (Settings → Gameplay → 1st person, Pete): 8 to 48 px across, the lines thickening with it (2 px to 18, 4 from 27, 6 from 45:
// even, so they stay centred on the pixel grid); remembered
{
  const set = (v: number) => { $("cross")!.style.setProperty("--cs", `${v}px`); $("cross")!.style.setProperty("--ct", `${2 * Math.max(1, Math.round(v / 18))}px`); input("opt-crosssize").value = String(v); $("crosssize-v")!.textContent = String(v); };
  set((() => { try { const v = Number(localStorage.getItem("craftax3d.crosssize")); return v >= 8 && v <= 48 ? v : 18; } catch { return 18; } })());
  $("opt-crosssize")!.oninput = (e) => { set(+value(e)); try { localStorage.setItem("craftax3d.crosssize", value(e)); } catch {} };
}
// Arrows act ahead (Settings, touch screens; on unless switched off, Pete): with a tool in hand, an arrow walks into whatever is in front
// and hits it (a tree, rock or mob: the outer keys' dig), then steps on; body.autodig drops the one-handed pad's outer keys
{
  const on = (() => { try { return localStorage.getItem("craftax3d.autodig") !== "0"; } catch { return true; } })();
  document.body.classList.toggle("autodig", on); input("opt-autodig").checked = on;
  $("opt-autodig")!.onchange = (e) => {
    document.body.classList.toggle("autodig", checked(e));
    try { localStorage.setItem("craftax3d.autodig", checked(e) ? "1" : "0"); } catch {}
  };
}
// Touch controls (Settings, Pete): Auto (the default) splits them in first person, the pad left and Use right, and is one-handed in
// the 3/4 and classic views; or always one-handed, or always two-handed. (Switched off before, the one-handed box: two-handed now)
// (var: setView may run before this line, at the start)
export var hands = (() => { try { return localStorage.getItem("craftax3d.hands") || (localStorage.getItem("craftax3d.unified1") === "0" ? "2" : "auto"); } catch { return "auto"; } })();
export function syncHands() { document.body.classList.toggle("unified", hands === "1" || (hands === "auto" && flat.mode !== 0)); }
syncHands(); select("opt-hands").value = hands;
$("opt-hands")!.onchange = (e) => {
  hands = value(e); syncHands();
  try { localStorage.setItem("craftax3d.hands", hands); } catch {}
};
// Turn without moving (Settings → Gameplay, desktop; Pete): "shift" (the default), Shift + an arrow turns you on the spot and the arrows
// walk in 2D and 3/4; "arrows", the arrow keys only ever turn you (WASD walks). First person's arrows turn the view either way; remembered
export var arrowTurn = (() => { try { return localStorage.getItem("craftax3d.arrowTurn") || "shift"; } catch { return "shift"; } })();
select("opt-turn").value = arrowTurn;
$("opt-turn")!.onchange = (e) => { arrowTurn = value(e); try { localStorage.setItem("craftax3d.arrowTurn", arrowTurn); } catch {} };
// Controls height (Settings → Gameplay, Pete): the touch controls up (or down: below 0) from their usual place, on any screen and
// either way up (phone.css's --pad-lift; each layout keeps them on the screen); 0 is the usual place; remembered
{
  const set = (v: number) => { document.body.style.setProperty("--pad-lift", `${v}px`); input("opt-padlift").value = String(v); $("padlift-v")!.textContent = v > 0 ? `+${v} px` : v < 0 ? `−${-v} px` : "usual"; };   // (short, in a box of one width: phone.css)
  set((() => { try { return Math.min(160, Math.max(-120, Number(localStorage.getItem("craftax3d.padlift")) || 0)); } catch { return 0; } })());
  // within 4 px of the usual place it snaps there (Pete: it was hard to land on; 8 left ±8 out of reach)
  $("opt-padlift")!.oninput = (e) => { const v = Math.abs(+value(e)) <= 4 ? 0 : +value(e); set(v); try { localStorage.setItem("craftax3d.padlift", String(v)); } catch {} };
}
{
  const set = (v: number) => { input("opt-fov").value = String(v); $("fov-v")!.textContent = String(v); };
  set(gfx.fovPick);
  $("opt-fov")!.oninput = (e) => { gfx.fovPick = +value(e); set(gfx.fovPick); resize(); try { localStorage.setItem("craftax3d.fov", String(gfx.fovPick)); } catch {} };
}
// Volume (Settings → Sound, Pete): 0 to 200 %, today's level (100 %) in the middle; remembered by sound.ts
{
  const set = (pc: number) => { input("opt-volume").value = String(pc); $("volume-v")!.textContent = String(pc); };
  set(Math.round(sound.volume * 100));
  $("opt-volume")!.oninput = (e) => { set(+value(e)); sound.setVolume(+value(e) / 100); };
}
// Particle effects (Settings → World, under Ray tracing: Pete): on, the dust a felled tree, a broken block and a fallen creature
// crumble into, in full; off, none (they just vanish); remembered. (The old 0-100% slider's saved amount is ignored)
{
  const box = input("opt-particles"), on = (() => { try { return localStorage.getItem("craftax3d.particles") !== "off"; } catch { return true; } })();
  const set = (v: boolean) => { fx.amount = v ? 1 : 0; box.checked = v; };
  set(on);
  box.onchange = () => { set(box.checked); try { localStorage.setItem("craftax3d.particles", box.checked ? "on" : "off"); } catch {} };
}
$("opt-tick")!.oninput = () => speedSet(...speedNow());
