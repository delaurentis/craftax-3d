// The Settings window: its tabs and the agents list.
import "./worlds";
import { pixIcon } from "../../../js/hud";
import { renderResearch } from "../../../js/research";
import { pixelText } from "../../../js/pixeltitle";
import { panelHooks, pct } from "../../../js/net";
import { agentDevice, agentGpu, agentMs, agentNote, gpuOption, setAgentGpu } from "../../../js/agent";
import { $ } from "../../core/shared";
import { api, game } from "../../core/game";
import { apply } from "../../core/apply";
import { snaps } from "../snapshots";
import { locked, play, show, unlockPointer } from "./screen";

import type { ModelEntry } from "../../core/types";

/** GET /api/bots: the bots to pick from (js/local.ts), whether each can run here, and the one picked. */
export interface BotList { current: string; bots: (ModelEntry & { available: boolean; hint?: string | null })[] }
// this module's state that other modules set (one module can't assign another's let): settingsFromGame, settingsFromHelp
export interface Settings {
  /** Opened from the top bar's gear (or the bot panel): closing goes back to the game, not the menu. */
  settingsFromGame: boolean;
  /** Opened from Controls: closing goes back there. */
  settingsFromHelp: boolean;
}
export const settings = {} as Settings;
const input = (id: string) => $(id) as HTMLInputElement;
const click = (id: string) => ($(id)!.onclick as () => void)();   // (the handlers read no event)

// Settings from the menu goes back to the menu; from the top bar's gear, back to the game
settings.settingsFromGame = false;
$("btn-settings")!.onclick = () => { settings.settingsFromGame = false; show("settings"); };
$("btn-research")!.onclick = () => { renderResearch($("research-body")!); show("research"); };   // the papers and the agents, over the game
$("btn-research-x")!.onclick = () => show("start");
$("btn-test-agent")!.onclick = () => openAgentAdd(false);   // Research's "Try your agent": Settings' Agent tab, its link box open
$("research")!.onclick = (e) => { if (e.target === e.currentTarget) show("start"); };   // a click off the window closes it
settings.settingsFromHelp = false;
$("btn-settings-close")!.onclick = () => { if (settings.settingsFromHelp) { settings.settingsFromHelp = false; show("help"); return; } settings.settingsFromGame ? play() : show("start"); };
$("btn-settings-x")!.onclick = () => click("btn-settings-close");
($("ico-drop") as HTMLImageElement).src = pixIcon("drop", 1);                                      // the World tab's note: the HUD's own water drop
// Settings' tabs (World, Gameplay, Agent, Sound), as Research's
export function settingsTab(t: string) {
  document.querySelectorAll<HTMLElement>("#settings-tabs .tab").forEach((b) => { b.classList.toggle("on", b.dataset.tab === t); b.setAttribute("aria-selected", String(b.dataset.tab === t)); });
  document.querySelectorAll<HTMLElement>("#settings .spage").forEach((p) => (p.hidden = p.dataset.page !== t));
  if (t === "agent") renderAgents();
  $("set-agent-open")!.hidden = t !== "agent";                               // "+ Add your agent" beside Back, on the Agent tab
}
document.querySelectorAll<HTMLElement>("#settings-tabs .tab").forEach((b) => (b.onclick = (e) => { (e.currentTarget as HTMLElement).blur(); settingsTab(b.dataset.tab!); }));
// Gameplay's own tabs on a desktop: Click, Move, 1st person, Bird's-eye, Show (a touch screen lists them all, each under its tab's name and icon:
// index.html .subhead)
document.querySelectorAll<HTMLElement>("#play-tabs .tab").forEach((b) => {
  const h = document.createElement("div"); h.className = "subhead"; h.innerHTML = b.innerHTML;
  document.querySelector(`#settings .sub[data-sub="${b.dataset.sub}"]`)?.prepend(h);
});
document.querySelectorAll<HTMLElement>("#play-tabs .tab").forEach((b) => (b.onclick = (e) => {
  (e.currentTarget as HTMLElement).blur();
  document.querySelectorAll("#play-tabs .tab").forEach((t) => { t.classList.toggle("on", t === b); t.setAttribute("aria-selected", String(t === b)); });
  document.querySelectorAll<HTMLElement>("#settings .sub").forEach((p) => (p.hidden = p.dataset.sub !== b.dataset.sub));
}));
// the Agent tab: the agents to pick from (a pick only chooses: nothing downloads or runs until you let the bot play), its speed and
// temperature, and a link to your own ONNX agent (added to the list, likewise not downloaded)
export const BOT_SPEEDS = [1, 2, 4, 8, 15, 30, 60, 120, 240];
export const escH = (t: unknown) => String(t).replace(/[&<>"]/g, (c) => (<Record<string, string>>{ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
export async function renderAgents(note?: string) {
  const el = $("set-agents")!;
  let list: BotList;
  try { list = await api<BotList>("/api/bots"); } catch (e) { el.innerHTML = `<div class="err">${escH((e as Error).message)}</div>`; return; }
  el.innerHTML = list.bots.map((b) => `<button data-id="${escH(b.id)}" class="${b.id === list.current ? "on" : ""}"${b.available ? "" : " disabled"}>`
    + `<b>${escH(b.name)}</b><small><i>${escH(b.available ? b.about || "" : "not built here")}</i></small>`
    + (b.score ? `<span class="score" title="${escH(b.score)}">${escH(pct(b.score))}</span>` : "")   // how much of Craftax it completes
    + (b.mine ? `<span class="rm" data-rm="${escH(b.id)}" title="Forget this agent">×</span>` : "") + `</button>`).join("")
    + (note ? `<div class="err">${escH(note)}</div>` : "");
  // Run on the GPU (Pete): under the agents, for the picked one if its player can run on either; where it runs now, if it's loaded
  const cur = list.bots.find((b) => b.id === list.current), box = input("opt-gpu"), row = $("gpu-row")!;
  const show = gpuOption(cur);
  row.hidden = !show; row.style.display = show ? "" : "none";   // (a label's own display would show it hidden)
  if (cur && show) {
    const on = agentDevice.get(cur.id), ms = agentMs.get(cur.id), pace = ms != null ? ` About ${Math.round(ms)} ms a move.` : "";
    box.checked = agentGpu(cur);
    // unticked: what the GPU would do here (Pete); ticked: where it runs now. Then how fast, once it's playing
    const why = navigator.maxTouchPoints > 1 ? "Thinks faster, but may slow graphics." : "On a computer the usual ONNX player is faster still; this is for trying the phone player.";
    const now = !on ? "Uses the GPU when it plays." : on === "cpu" ? `Tried GPU, reverted to CPU${agentNote.get(cur.id) ? ` (${agentNote.get(cur.id)})` : ""}.` : "Now on the GPU.";
    $("gpu-note")!.textContent = (box.checked ? now : why) + pace;
    box.onchange = () => { $("gpu-note")!.textContent = "Moving…"; setAgentGpu(cur, box.checked).then(() => renderAgents(), (e: Error) => renderAgents(e.message)); };
  }
  // the list scrolled (itself, not the page) so the picked agent is wholly in view (Pete 71be)
  requestAnimationFrame(() => {
    const b = el.querySelector("button.on"); if (!b) return;
    const lr = el.getBoundingClientRect(), br = b.getBoundingClientRect();
    if (br.top < lr.top) el.scrollTop -= lr.top - br.top + 2;
    else if (br.bottom > lr.bottom) el.scrollTop += br.bottom - lr.bottom + 2;
  });
  // the picked one's description, cut off with …, scrolls through after a moment (Pete), back and forth at a reading pace
  const on = el.querySelector<HTMLElement>("button.on small");
  if (on) setTimeout(() => {
    const dx = on.scrollWidth - on.clientWidth;
    if (!on.isConnected || dx < 3) return;
    on.style.setProperty("--dx", `${-dx - 6}px`); on.style.setProperty("--t", `${4 + dx / 25}s`); on.classList.add("run");
  }, 1200);
  el.querySelectorAll<HTMLElement>("button[data-id]").forEach((b) => (b.onclick = async (e) => {
    const rm = (e.target as Element).closest<HTMLElement>("[data-rm]");
    try {
      apply(rm ? await api("/api/myagents", { remove: rm.dataset.rm }) : await api("/api/bot", { id: b.dataset.id }));
      renderAgents();
    } catch (er) { renderAgents((er as Error).message); }
  }));
  const w = game.S && game.S.world;
  if (w && w.speed) { let i = BOT_SPEEDS.findIndex((v) => v >= w.speed); if (i < 0) i = BOT_SPEEDS.length - 1; input("opt-botspeed").value = String(i); $("botspeed-v")!.textContent = String(BOT_SPEEDS[i]); }
  if (w && w.temp != null) { input("opt-temp").value = String(w.temp); $("temp-v")!.textContent = (+w.temp).toFixed(1); }
  if (w && w.useful != null && $("opt-useful")) input("opt-useful").checked = !!w.useful;   // the picked model's own default, or your choice for it
}
// bot speed: a slider over the bot panel's steps (1 to 240 moves a second), as its own slider
const target = (e: Event) => e.target as HTMLInputElement;
$("opt-botspeed")!.oninput = (e) => { $("botspeed-v")!.textContent = String(BOT_SPEEDS[+target(e).value]); };
$("opt-botspeed")!.onchange = async (e) => { try { apply(await api("/api/pace", { speed: BOT_SPEEDS[+target(e).value] })); } catch {} };
$("opt-temp")!.oninput = (e) => { $("temp-v")!.textContent = (+target(e).value).toFixed(1); };
$("opt-temp")!.onchange = async (e) => { try { apply(await api("/api/pace", { temp: +target(e).value })); } catch {} };
if ($("opt-useful")) $("opt-useful")!.onchange = async (e) => { try { apply(await api("/api/pace", { useful: target(e).checked })); } catch {} };
// "+ Add your agent" (Pete): a window for its details. Add & try it puts it in your list (nothing downloads until it plays); the
// registry entry it makes is shown to copy into a pull request on the agents repo, which lists it for everyone
export const AGENTS_REPO = "https://github.com/delaurentis/craftax-agents";
export function agentBox() {
  const pop = document.createElement("div");
  pop.className = "ask agentpop";
  const f = (id: string, label: string, ph: string, req?: boolean) => `<label class="fld">${label}${req ? " *" : ""}<input data-f="${id}" placeholder="${ph}" spellcheck="false" autocomplete="off"></label>`;
  pop.innerHTML = `<div class="menu"><button class="x" data-no aria-label="Close"><svg viewBox="0 0 20 20" width="20" height="20" shape-rendering="crispEdges" aria-hidden="true"><path d="M3 3h3v2h2v2h4V5h2V3h3v3h-2v2h-2v4h2v2h2v3h-3v-2h-2v-2H8v2H6v2H3v-3h2v-2h2V8H5V6H3z" fill="#fff"/></svg></button><h1 style="margin:0 0 4px"><canvas data-pixel-flat data-pixel-size="4" data-pixel-max="420" role="img"></canvas></h1>`
    + f("url", "ONNX link", "https://…/agent.onnx", true) + f("name", "Name", "My agent") + f("about", "About", "size, architecture: one line") + f("by", "By", "you or your team")
    + f("license", "License", "MIT") + f("source", "Source", "https://github.com/… (code or paper)") + f("score", "Score", "e.g. 41 / 226")
    + `<p class="note">The agent must be in the playable format (<a href="${AGENTS_REPO}/blob/main/FORMAT.md" target="_blank" rel="noopener">FORMAT.md</a>).</p>`
    + `<div class="err" hidden></div><div class="pair"><button class="mc" data-add>Add &amp; try it</button><button class="mc" data-info>More info…</button></div>`
    + `<p class="note list">To list it for everyone, run the checker, then open a pull request adding this entry to <a href="${AGENTS_REPO}#add-your-agent" target="_blank" rel="noopener">the agents repo</a>:</p>`
    + `<textarea readonly></textarea><div class="pair"><button class="mc" data-copy>Copy entry</button><button class="mc" data-repo>Open the repo ↗</button></div></div>`;
  const val = (k: string) => pop.querySelector<HTMLInputElement>(`[data-f="${k}"]`)!.value.trim();
  const entry = () => {
    const u = val("url"), file = (u.split(/[?#]/)[0].split("/").pop() || "agent").replace(/\.onnx$/i, "");
    const id = (val("name") || file).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-agent";
    // every field the window asks for is in the entry, filled as you type (empty until then), in the registry's order
    const e = { id, name: val("name") || file, about: val("about"), by: val("by"), license: val("license"), source: val("source"),
      score: val("score"), onnx: u || "https://…/agent.onnx", bytes: "(from the checker)", sha256: "(from the checker)", obs: "packed843" };
    return JSON.stringify(e, null, 2);
  };
  const ta = pop.querySelector("textarea")!, err = pop.querySelector<HTMLElement>(".err")!;
  const sync = () => { ta.value = entry(); };
  pop.querySelectorAll("input").forEach((i) => { i.oninput = sync; i.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") pop.querySelector<HTMLElement>("[data-add]")!.click(); }; });
  const end = () => { pop.remove(); removeEventListener("keydown", key, true); };
  const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); end(); } };
  pop.onclick = (e) => { if (e.target === pop) end(); };
  const btn = (sel: string) => pop.querySelector<HTMLElement>(sel)!;
  btn("[data-no]").onclick = end;
  btn("[data-info]").onclick = () => window.open(AGENTS_REPO + "/blob/main/FORMAT.md", "_blank", "noopener");
  btn("[data-repo]").onclick = () => window.open(AGENTS_REPO + "#add-your-agent", "_blank", "noopener");
  btn("[data-copy]").onclick = (e) => { navigator.clipboard?.writeText(ta.value).then(() => { (e.target as HTMLElement).textContent = "Copied"; }, () => { ta.select(); }); };
  btn("[data-add]").onclick = async () => {
    try {
      apply(await api("/api/myagents", { url: val("url"), name: val("name"), about: val("about"), by: val("by"), license: val("license"), source: val("source"), score: val("score") }));
      end(); renderAgents();
    } catch (e) { err.hidden = false; err.textContent = (e as Error).message; }
  };
  addEventListener("keydown", key, true);
  const bc = document.body.classList;
  if (bc.contains("laser")) pop.querySelector<HTMLCanvasElement>("h1 canvas")!.dataset.pixelColor = "red";   // laser: a red title
  pixelText(pop.querySelector<HTMLCanvasElement>("h1 canvas")!, "Add your agent");                 // the title in the pixel font (Pete)
  document.body.append(pop); sync();
  pop.querySelector<HTMLInputElement>('[data-f="url"]')!.focus();
}
$("set-agent-open")!.onclick = () => agentBox();
// "Test your agent" from Research (Pete): always here, the Agent tab with its link box open
export function openAgentAdd(fromGame = true) {
  settings.settingsFromGame = fromGame; if (locked()) unlockPointer();
  show("settings"); settingsTab("agent"); agentBox();
}
// the bot window's gear (Pete: it replaced the model dropdown): Settings on the Agent tab, back to the game when closed
panelHooks.agentSettings = () => { settings.settingsFromGame = true; if (locked()) unlockPointer(); show("settings"); settingsTab("agent"); };
$("settings")!.onclick = (e) => { if (e.target === e.currentTarget) click("btn-settings-close"); };   // a touch off the window closes it
$("btn-shot")!.onclick = (e) => { (e.currentTarget as HTMLElement).blur(); snaps.shotWanted = true; };
