// The platform side of the client: which game server, who you are,
// which world you're looking at, the server list, the world list and the bot panel. main.ts keeps the game; this keeps the plumbing.
//   ?server=<url>   play on another server (the list remembers it)      ?watch=<world id>   open someone's world to watch
//   ?server=local   play in this tab (local.ts: the WebAssembly engine, no server); also used when the page's own server is absent
import { local } from "./local";
import { brain } from "./brain";
import { listed } from "../src/core/plugins";
import { REPO } from "./agent";
import type { BrainView } from "../src/core/plugins";
import type { GameState, ModelEntry, WorldInfo, WorldSummary } from "../src/core/types";
import { phoneMedia } from "../src/ui/side";
const $ = (id: string) => document.getElementById(id)!;                // (index.html has every one asked for)
const store = {
  get(k: string, d: string) { try { const v = localStorage.getItem("craftax3d." + k); return v === null ? d : v; } catch { return d; } },
  set(k: string, v: string) { try { localStorage.setItem("craftax3d." + k, v); } catch {} },
};
const esc = (s: unknown) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" } as Record<string, string>)[c]);
/** A server as GET /api/info describes it (with the probe's time); the browser's own engine answers the same. */
interface ServerInfo { name: string; version?: string; bots?: ModelEntry[]; worlds: number; bot_worlds: number; players: number; local?: boolean; ms: number }


export const net: {
  base: string; local: boolean; checked: Promise<void> | null; player: string; world: string | null;
  init(): void; headers(json: boolean): Record<string, string>; api<T = GameState>(path: string, body?: object): Promise<T>; query(): string; driving(s: GameState | null | undefined): boolean;
} = {
  base: "",                                   // "" = the server that served this page
  local: false,                               // the game runs in this tab (local.ts)
  checked: null,                              // the probe of the page's own server (once, shared by concurrent calls)
  player: "",
  world: null,                                // null = your own world
  init() {
    let p = store.get("player", "");
    if (!p) { p = Math.random().toString(36).slice(2, 12); store.set("player", p); }
    this.player = p;
    const q = new URLSearchParams(location.search);
    const srv = q.get("server") ?? store.get("server", "");
    this.local = srv === "local";
    this.base = !this.local && srv && srv.replace(/\/$/, "") !== location.origin ? srv.replace(/\/$/, "") : "";
    if (q.get("watch")) this.world = q.get("watch");
  },
  headers(json) {
    const h: Record<string, string> = { "X-Craftax-Player": this.player };
    if (this.world) h["X-Craftax-World"] = this.world;
    if (json) h["Content-Type"] = "application/json";
    return h;
  },
  async api(path, body) {
    if (!this.local && !this.base) {                            // no game server behind this page (a static site): play locally
      this.checked ??= probe(location.origin).then((info) => { if (!info) this.local = true; });
      await this.checked;
    }
    if (this.local) return local.api(path, body) as Promise<never>;   // (each route's own answer: the caller names it)
    const r = await fetch(this.base + path, body ? { method: "POST", headers: this.headers(true), body: JSON.stringify(body) } : { headers: this.headers(false) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || path + " " + r.status);
    return j;
  },
  query() { return "p=" + encodeURIComponent(this.player) + (this.world ? "&w=" + encodeURIComponent(this.world) : ""); },
  // you drive the world shown when it's yours and a human (you) has control
  driving(s) { return !!s && (!s.world || (s.world.you && s.world.control === "human")); },
};

// ---------- the server list ----------
// servers.json (shipped with the site) + servers you added + this page's own server. Each is probed with GET /api/info.
async function serverList() {
  let shipped: { name: string; url: string }[] = [];
  try { shipped = await (await fetch(new URL(/* @vite-ignore */ "../servers.json", import.meta.url), { cache: "no-store" })).json(); } catch {}
  const mine: { name: string; url: string }[] = JSON.parse(store.get("servers", "[]"));
  const all = [{ name: "In your browser (single player)", url: "local" }, { name: "This page's server", url: location.origin }, ...shipped, ...mine];
  const seen = new Set();
  return all.filter((s) => { const u = s.url.replace(/\/$/, ""); if (seen.has(u)) return false; seen.add(u); return true; });
}
async function probe(url: string): Promise<ServerInfo | null> {
  if (url === "local") return { ...(await local.api("/api/info") as Omit<ServerInfo, "ms">), ms: 0 };
  const t0 = performance.now();
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 2500);
    const info = await (await fetch(url.replace(/\/$/, "") + "/api/info", { signal: c.signal })).json();
    return { ...info, ms: Math.round(performance.now() - t0) };
  } catch { return null; }
}
export async function renderServers() {
  const box = $("servers-list"); box.innerHTML = "Looking for servers…";
  const list = await serverList();
  const cur = net.local ? "local" : net.base || location.origin;
  const rows = await Promise.all(list.map(async (s) => ({ s, info: await probe(s.url) })));
  box.innerHTML = rows.map(({ s, info }) => {
    const here = s.url.replace(/\/$/, "") === cur;
    const status = info ? `${esc(info.name)} · ${info.players} playing · ${info.worlds} worlds (${info.bot_worlds} bots) · ${info.ms} ms`
      + (info.bots && info.bots.length ? ` · bot: ${esc(info.bots.map((b) => b.name).join(", "))}` : "") : "offline";
    return `<div class="srow${here ? " here" : ""}"><div><b>${esc(s.name)}</b> <span class="url">${esc(s.url)}</span><br><span class="st">${status}</span></div>`
      + (here ? `<span class="tag">connected</span>` : info ? `<button class="mc small" data-url="${esc(s.url)}">Connect</button>` : "") + "</div>";
  }).join("");
  box.querySelectorAll<HTMLElement>("button[data-url]").forEach((b) => (b.onclick = () => connect(b.dataset.url!)));
}
export function addServer(url: string) {
  url = url.trim().replace(/\/$/, "");
  if (!/^https?:\/\//.test(url)) url = "http://" + url;
  const mine: { name: string; url: string }[] = JSON.parse(store.get("servers", "[]"));
  if (!mine.some((s) => s.url === url)) { mine.push({ name: new URL(url).host, url }); store.set("servers", JSON.stringify(mine)); }
  return renderServers();
}
function connect(url: string) {
  if (url === "local") { store.set("server", "local"); location.search = "?server=local"; return; }
  store.set("server", url.replace(/\/$/, "") === location.origin ? "" : url);
  location.search = url.replace(/\/$/, "") === location.origin ? "" : "?server=" + encodeURIComponent(url);
}
export async function serverName() {
  if (!net.base) { try { return (await net.api<ServerInfo>("/api/info")).name; } catch { return "offline"; } }   // decides local vs this page's
  const info = await probe(net.base);
  return info ? info.name : "offline";
}

// ---------- the world list ----------
export async function renderWorlds(onWatch: (id: string) => void) {
  const box = $("worlds-list"); box.innerHTML = "…";
  const { worlds } = await net.api<{ worlds: WorldSummary[] }>("/api/worlds");
  box.innerHTML = worlds.length ? worlds.map((w) => `<div class="srow"><div><b>${esc(w.name)}</b>${w.you ? " (yours)" : ""}<br>`
    + `<span class="st">${w.control === "bot" ? "🤖 " + esc(w.bot || "bot") : "🧑 a player"} · ${esc(w.floor)} · score ${w.score} · ${w.steps} steps`
    + `${w.done ? " · dead" : ""} · ${w.watchers} watching</span></div><button class="mc small" data-id="${w.id}">${w.you ? "Open" : "Watch"}</button></div>`).join("")
    : "No worlds yet.";
  box.querySelectorAll<HTMLElement>("button[data-id]").forEach((b) => (b.onclick = () => onWatch(b.dataset.id!)));
}

// ---------- the bot panel ----------
// the robot from the top bar's who-plays switch (index.html), as the panel's badge
const ROBOT = `<svg viewBox="0 0 20 20" width="18" height="18" shape-rendering="crispEdges" aria-hidden="true" style="vertical-align:-4px"><rect x="9" y="1" width="2" height="3" fill="#9aa"/><rect x="8" y="0" width="4" height="2" fill="#ff4030"/><rect x="3" y="4" width="14" height="13" fill="#8a96a8"/><rect x="3" y="4" width="14" height="2" fill="#b4c0d0"/><rect x="1" y="8" width="2" height="5" fill="#6a7688"/><rect x="17" y="8" width="2" height="5" fill="#6a7688"/><rect x="5" y="8" width="4" height="3" fill="#20e0ff"/><rect x="11" y="8" width="4" height="3" fill="#20e0ff"/><rect x="6" y="13" width="8" height="2" fill="#3a4250"/><rect x="7" y="13" width="1" height="2" fill="#b4c0d0"/><rect x="9" y="13" width="1" height="2" fill="#b4c0d0"/><rect x="11" y="13" width="1" height="2" fill="#b4c0d0"/></svg>`;
// pixel icons for the pace buttons (the top bar's pause, a play triangle, a step: triangle and bar)
const px = (rects: number[][]) => `<svg viewBox="0 0 20 20" width="20" height="20" shape-rendering="crispEdges" aria-hidden="true">${rects.map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#fff"/>`).join("")}</svg>`;
const tri = (x0: number) => [0, 1, 2, 3, 4, 5].map((i) => [x0 + i, 4 + i, 1, 12 - 2 * i]);   // a stepped triangle pointing right
const ICON = { gear: `<svg viewBox="0 0 20 20" width="20" height="20" shape-rendering="crispEdges" aria-hidden="true"><path fill-rule="evenodd" d="M8 1h4v3h2V2h2v2h2v2h-2v2h3v4h-3v2h2v2h-2v2h-2v-2h-2v3H8v-3H6v2H4v-2H2v-2h2v-2H1V8h3V6H2V4h2V2h2v2h2zM8 7h4v1h1v4h-1v1H8v-1H7V8h1z" fill="#fff"/></svg>`, shot: px([[7, 3, 6, 2], [2, 5, 16, 2], [2, 14, 16, 2], [2, 5, 2, 11], [16, 5, 2, 11], [8, 8, 4, 4]]), grow: px([[2, 2, 6, 2], [2, 2, 2, 6], [12, 2, 6, 2], [16, 2, 2, 6], [2, 16, 6, 2], [2, 12, 2, 6], [12, 16, 6, 2], [16, 12, 2, 6]]),
  shrink: px([[2, 6, 6, 2], [6, 2, 2, 6], [12, 6, 6, 2], [12, 2, 2, 6], [2, 12, 6, 2], [6, 12, 2, 6], [12, 12, 6, 2], [12, 12, 2, 6]]), fold: px([[4, 7, 12, 2], [6, 9, 8, 2], [8, 11, 4, 2]]), unfold: px([[8, 7, 4, 2], [6, 9, 8, 2], [4, 11, 12, 2]]), pause: px([[5, 4, 3, 12], [12, 4, 3, 12]]), play: px(tri(6)), step: px([...tri(4), [13, 4, 3, 12]]) };
// the panel's sliders (speed, temperature): each one element kept across redraws, so a drag isn't cut off by the next state
function slider(name: string, tip: string, min: number, max: number, step: number, show: (v: number) => string, send: (v: number) => void) {
  const el = document.createElement("label");
  el.className = "temp"; el.title = tip;
  el.innerHTML = `<span>${name}</span><input type="range" min="${min}" max="${max}" step="${step}"><b></b>`;
  const input = el.querySelector("input")!, out = el.querySelector("b")!;
  input.oninput = () => { out.textContent = show(+input.value); send(+input.value); };
  // held: a finger or the mouse on it, and a moment after (a phone gives a range input no focus while a finger drags it, so the
  // next state, many a second with a fast bot, put it back under the finger: Pete)
  let held = false, until = 0, finger: number | null = null;
  input.addEventListener("pointerdown", () => { held = true; });
  // a finger: a tap jumps to where it lands and a drag anywhere along it follows (Pete: a phone's range input only moves by its
  // knob, so a tap on the track did nothing). The knob is 16 px across (game.css), its middle reaches 8 px from either end
  const at = (x: number) => {
    const r = input.getBoundingClientRect(), lo = +input.min, hi = +input.max, st = +input.step || 1;
    const t = Math.max(0, Math.min(1, (x - r.left - 8) / Math.max(1, r.width - 16)));
    const v = String(Math.min(hi, lo + Math.round((t * (hi - lo)) / st) * st));
    if (input.value !== v) { input.value = v; input.oninput!(new Event("input")); }
  };
  input.style.touchAction = "none";
  input.addEventListener("pointerdown", (e) => { if (e.pointerType !== "touch") return; e.preventDefault(); finger = e.pointerId; try { input.setPointerCapture(e.pointerId); } catch {} at(e.clientX); });
  addEventListener("pointermove", (e: PointerEvent) => { if (e.pointerId === finger) at(e.clientX); });   // (on the page: the finger may slide off it)
  const off = () => { finger = null; if (held) { held = false; until = performance.now() + 500; } };
  addEventListener("pointerup", off); addEventListener("pointercancel", off);
  return { el, set(v: number) { if (!held && performance.now() > until && document.activeElement !== input) { input.value = String(v); out.textContent = show(v); } } };
}
// a panel button acts as it's pressed, not on the click after (Pete: with a fast bot the page is busy, and a click, down and up on
// the same button, often never came; a press outside the expanded brain always worked). Enter or Space still click it
function press(b: HTMLElement | null, fn: () => void) {
  if (!b) return;
  b.onpointerdown = (e) => { if (e.button) return; e.stopPropagation(); e.preventDefault(); (e.currentTarget as HTMLElement).blur(); fn(); };
  b.onclick = (e) => { e.stopPropagation(); if (e.detail === 0) fn(); };   // (detail 0: from the keyboard; a pointer's click was its press)
}
let speedList = [1, 2, 4, 8, 15, 30, 60, 120, 240];
const speed = slider("speed", "moves a second", 0, speedList.length - 1, 1, (i) => speedList[i] + "/s", (i) => panelHooks.pace({ speed: speedList[i] }));
const temp = slider("temperature", "temperature: 0 always takes the most likely action (it can get stuck in loops); 0.2, the default, mostly does, with a little chance to break loops; 1 draws from the agent's full odds, as in training; higher tries other things",
  0, 2, 0.1, (v) => v.toFixed(1), (v) => panelHooks.pace({ temp: v }));
// the panel is rebuilt only when its layout changes (paused, who's playing...), not on every move: rebuilding under the pointer
// many times a second swallowed clicks on its buttons
let panelKey = "", cur: WorldInfo | null = null, last: [GameState | null, number[]] | null = null, wasDead = false;
// "162 / 226 (their evaluation)" → "72%"; a range "37–44 / 226" → "16–19%" (the share of Craftax's 226 points)
export const pct = (score: string) => {   // a model's Craftax score as % completion (also Settings' Agent tab)
  const m = score.match(/^([\d.]+)(?:\s*[–-]\s*([\d.]+))?\s*\/\s*([\d.]+)/);
  if (!m) return score.split(" (")[0];
  const p = (v: string) => Math.round((100 * +v) / +m[3]);
  return m[2] ? `${p(m[1])}–${p(m[2])}%` : `${p(m[1])}%`;
};
// the down arrow folds the panel to one row (the robot and its name); the up arrow (or the row) opens it again; remembered
// the expand arrows make the whole bot window big in the middle of the screen (brain, sliders and all); again, or Esc, shrinks it
function grow(on: boolean) {
  const el = $("botpanel"), b = el.querySelector<HTMLElement>("button.grow");
  el.classList.toggle("big", on);
  if (on) el.classList.remove("folded");
  // (the icon only when it changes: this runs on every move, and swapping the icon under the pointer mid-click swallowed the click)
  if (b && b.dataset.on !== String(on)) { b.dataset.on = String(on); b.innerHTML = on ? ICON.shrink : ICON.grow; b.dataset.tip = on ? "Shrink" : "Expand"; b.setAttribute("aria-label", b.dataset.tip); }
  if (b) b.style.display = el.classList.contains("folded") && !(PHONE.matches && !el.classList.contains("tiny")) ? "none" : "";   // (a phone's mini brain keeps it: fold)
  const sb = el.querySelector<HTMLElement>("button.shot"); if (sb) sb.style.display = on ? "" : "none";   // the camera: only on the expanded brain
}
// the camera beside the expand arrows: a PNG of the brain's canvas alone (no name, sliders or buttons), at its full drawn size
// a plugin's bot with a brain view of its own (src/core/plugins.ts, "brainView": a crystal's picture, say) shows it instead of the
// neuron brain, always (Pete)
const ownView = (w: WorldInfo) => [...listed("brainView")].reverse().find((v) => v.accepts(w as unknown as Record<string, unknown>)) || null;
let view: typeof brain | BrainView = brain;
function brainShot() {
  const c = view.el.querySelector("canvas"); if (!c) return;
  c.toBlob((b) => {
    if (!b) return;
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(b), download: "craftax-brain-" + new Date().toISOString().slice(0, 19).replace(/[T:]/g, "-") + ".png" });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }, "image/png");
}
addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Escape" && $("botpanel")?.classList.contains("big")) { e.preventDefault(); e.stopImmediatePropagation(); grow(false); } }, true);
function fold(on: boolean, quiet?: boolean) {
  const el = $("botpanel"), b = el.querySelector<HTMLElement>("button.fold");
  el.classList.toggle("folded", on);
  if (on) el.classList.remove("big");
  if (!on) el.classList.remove("tiny");
  // a phone, folded: the mini brain with expand (the big brain) and collapse (to the name alone) beside the name (Pete); collapsed, Show
  const mini = on && PHONE.matches, tiny = el.classList.contains("tiny"), down = on && (!mini || tiny);
  const gb = el.querySelector<HTMLElement>("button.grow"); if (gb) gb.style.display = on && !(mini && !tiny) ? "none" : "";
  if (b && b.dataset.on !== String(down)) { b.dataset.on = String(down); b.innerHTML = down ? ICON.unfold : ICON.fold; b.dataset.tip = down ? "Show" : mini ? "Collapse" : "Hide"; b.setAttribute("aria-label", b.dataset.tip); }
  if (!quiet) store.set("botFolded", on ? "1" : "0");
}
// the fold arrow: on a phone's mini brain, collapse to the name (and back); the expanded brain, hidden at once, to the name alone on
// a phone too (Pete); anywhere else, fold and open the panel as before
function foldBtn() {
  const el = $("botpanel");
  if (el.classList.contains("big") && PHONE.matches) { el.classList.add("tiny"); store.set("botTiny", "1"); fold(true); return; }
  if (el.classList.contains("folded") && PHONE.matches) { const t = !el.classList.contains("tiny"); el.classList.toggle("tiny", t); store.set("botTiny", t ? "1" : "0"); fold(true, true); }
  else fold(!el.classList.contains("folded"));
}
// a tap or click off the expanded brain shrinks it back to the small panel, as its shrink button does (Pete), and does nothing
// else: not a walk or a swing in the world under it. Not from Settings or a screen opened over it (its gear, say)
addEventListener("pointerdown", (e) => {
  const el = $("botpanel"), t = e.target as Element;
  if (!el.classList.contains("big") || el.style.display === "none" || t.closest?.("#botpanel, #settings, .screen.on")) return;
  e.stopPropagation(); e.preventDefault();
  const eat = (ev: Event) => { ev.stopPropagation(); ev.preventDefault(); };
  for (const k of ["mousedown", "mouseup", "click"]) addEventListener(k, eat, { capture: true, once: true });
  setTimeout(() => { for (const k of ["mousedown", "mouseup", "click"]) removeEventListener(k, eat, { capture: true }); }, 600);
  grow(false); if (last) renderBot(...last);
}, { capture: true });
// the name, short on a phone (Pete): "Agent 194" from the model's score out of 226, "Agent X" when it has none
const agentName = (score: string | undefined) => "Agent " + ((String(score || "").match(/^([\d.]+)\s*\/\s*226/) || [, "X"])[1]);
const PHONE = phoneMedia("(max-width: 720px), (max-height: 520px)");   // index.html's phone layout
export function renderBot(s: GameState | null, speeds: number[]) {
  const w = s && s.world, el = $("botpanel");
  last = [s, speeds];
  if (!w) { el.style.display = "none"; panelKey = ""; return; }
  const watching = !w.you, bot = w.control === "bot";
  if (!bot && !watching) { el.style.display = "none"; panelKey = ""; el.dataset.botOn = ""; return; }
  // (hidden in a replay: not shown at all, so the page lays out as without it: a phone's hotbar comes back, Pete)
  if (sizeForced === "hidden") { el.style.display = "none"; panelKey = ""; return; }
  el.style.display = "block";
  cur = w;
  const r: Partial<NonNullable<WorldInfo["bot_reply"]>> = w.bot_reply || {};
  const own = ownView(w);
  view = own || brain;                                           // a bot with a picture of its own (a crystal) always shows it (Pete)
  const pickable = bot && w.you && w.bot_id;                     // the browser's bot: its gear opens Settings' Agent tab, where you pick the model (Pete)
  const head = bot ? `${ROBOT} <b><span class="long">${esc(w.bot || "bot")}</span><span class="short">${esc(agentName(w.bot_score))}</span></b>` : `🧑 a player's world`;
  const ctl = w.you ? `<button class="mc small" data-ctl title="P">${bot ? "Take over" : "Let the bot play"}</button>`
    : `<button class="mc small" data-home>Back to my world</button>`;
  // pause / step and Take over share one row under the sliders
  const pace = bot && w.you ? `<div class="pace"><div class="speed-slot"></div>${w.temp != null ? `<div class="temp-slot"></div>` : ""}`
    + `<div class="pace-btns"><div class="seg"><button data-pause aria-label="${w.paused ? "Resume" : "Pause"}" data-tip="${w.paused ? "Resume" : "Pause"}">${w.paused ? ICON.play : ICON.pause}</button>`
    + `${w.paused ? `<button data-single aria-label="One step" data-tip="One step">${ICON.step}</button>` : ""}`
    + `${pickable ? `<button class="cfg" aria-label="Agent settings" data-tip="Agent settings">${ICON.gear}</button>` : ""}</div>${ctl}${pickable ? `<button class="mc small pick" data-pick>Change agent</button>` : ""}</div></div>` : ctl;   // the gear beside pause, out of the header (Pete)
  const html = `<div class="head"><span>${head}</span><span class="head-btns">${pickable ? `<button class="mcfg" aria-label="Agent settings" data-tip="Agent settings">${ICON.gear}</button>` : ""}<button class="shot" aria-label="Picture of the brain" data-tip="Picture of the brain">${ICON.shot}</button><button class="grow" aria-label="Expand" data-tip="Expand">${ICON.grow}</button><button class="fold" aria-label="Hide" data-tip="Hide">${ICON.fold}</button></span></div>`
    + (bot && r.action ? `<div class="brain-slot" data-v="${view === brain ? "b" : "c"}"></div>` : "")
    // (expanded, a crystal playing: its view's own option under the brain, [x] Show changes)
    + (bot && own ? `<div class="brain-opts"><span class="opt-slot"></span></div>` : "")
    + (r.note ? `<div class="st">${esc(r.note)}</div>` : "") + pace;
  if (html !== panelKey) {
    panelKey = html; el.innerHTML = html;
    // the bot's brain (brain.ts) and the sliders: one element each, kept across rebuilds
    const slot = el.querySelector(".brain-slot"); if (slot) slot.replaceWith(view.el);
    const os = el.querySelector(".opt-slot"); if (os) { if (view !== brain && (view as BrainView).opt) os.replaceWith((view as BrainView).opt!); else os.parentElement!.remove(); }
    const ss = el.querySelector(".speed-slot"); if (ss) ss.replaceWith(speed.el);
    const ts = el.querySelector(".temp-slot"); if (ts) ts.replaceWith(temp.el);
    press(el.querySelector("button[data-pause]"), () => panelHooks.pace({ paused: !cur!.paused }));
    press(el.querySelector("button[data-single]"), () => panelHooks.pace({ single: true }));
    press(el.querySelector("button[data-ctl]"), () => panelHooks.toggle());
    press(el.querySelector("button[data-home]"), () => panelHooks.home());
    // (a phone: the name row only collapses the mini brain to the name and brings it back, like the arrow; the big brain is the
    // expand button's alone, Pete. A tap on the mini brain itself does nothing)
    view.el.onclick = null;
    el.querySelector<HTMLElement>(".head")!.onclick = () => (PHONE.matches && el.classList.contains("folded") ? foldBtn() : fold(!el.classList.contains("folded")));
    press(el.querySelector("button.grow"), () => { grow(!el.classList.contains("big")); if (last) renderBot(...last); });
    press(el.querySelector("button.fold"), () => { foldBtn(); if (last) renderBot(...last); });
    press(el.querySelector("button.shot"), () => brainShot());
    press(el.querySelector("button.mcfg"), () => panelHooks.agentSettings());   // the mini brain's own gear (Pete)
    press(el.querySelector("button.cfg"), () => panelHooks.agentSettings());
    press(el.querySelector("button[data-pick]"), () => panelHooks.agentSettings());   // the big panel's "Change agent", beside Take over (Pete)
  }
  // (small on a phone: the game's own mini brain, folded, on the right with the health readouts beside it on the left: Pete)
  if (sizeForced) { el.classList.remove("tiny"); el.classList.toggle("big", sizeForced === "big"); el.classList.toggle("folded", sizeForced === "small" && PHONE.matches); }
  // a phone, the bot just switched on: its mini brain, whatever the panel was left as last time (Pete)
  else if (PHONE.matches && bot && !el.dataset.botOn) { el.classList.remove("tiny", "big"); el.classList.add("folded"); el.dataset.tinyRead = "1"; }
  el.dataset.botOn = bot ? "1" : "";
  if (!sizeForced && !el.dataset.tinyRead) { el.dataset.tinyRead = "1"; el.classList.toggle("tiny", store.get("botTiny", "0") === "1"); }
  if (!sizeForced) fold(!el.classList.contains("big") && (el.classList.contains("folded") || store.get("botFolded", PHONE.matches ? "1" : "0") === "1")   /* phones: folded to its name (and a mini brain) until opened; expanded, it stays big till shrunk (then back to the mini brain) */, true);
  // dying with the brain expanded: it shrinks back to the small panel, out of the way of the grave (once, as it dies; expand it again
  // after if you like; not in a replay, whose keyframes set it: Pete 36c9)
  const dead = !!s.done;
  if (dead && !wasDead && !sizeForced) el.classList.remove("big");
  wasDead = dead;
  grow(el.classList.contains("big"));
  // (folded: not drawn, so not worked out, the next update after opening draws it; a phone keeps its mini brain going, index.html)
  view.clear = PHONE.matches && el.classList.contains("folded");   // the mini brain: no black behind it, the game shows through (Pete)
  if (bot && r.action && (!el.classList.contains("folded") || (PHONE.matches && !el.classList.contains("tiny")))) { view.body(s); view.update(r as NonNullable<WorldInfo["bot_reply"]>); }
  if (bot && w.you) {
    speedList = speeds; const si = speed.el.querySelector("input")!, mx = String(speeds.length - 1); if (si.max !== mx) si.max = mx;   // (only when it changes: not under a finger every move)
    const i = speeds.indexOf(w.speed);
    speed.set(i < 0 ? speeds.findIndex((v) => v >= w.speed) : i);
    if (w.temp != null) temp.set(w.temp);
  }
}
// a replay's brain (replay.html, per keyframe): "hidden", "small" or "big", set from outside and kept whatever the game remembers about the
// panel (folded, a phone's mini brain); null: the game's own. index.html hides its buttons in a replay
let sizeForced: "hidden" | "small" | "big" | null = null;
PHONE.addEventListener?.("change", () => { if (sizeForced && last) renderBot(...last); });   // (a replay turned to portrait or back)
export function brainSize(m: "hidden" | "small" | "big" | null) {
  if (m === sizeForced) return;
  sizeForced = m;
  if (last) renderBot(...last);
}
/** What the bot panel's buttons do: set by the game (src/ui/hud/botpanel and friends). */
export const panelHooks: { pace(b: { speed?: number; temp?: number; paused?: boolean; single?: boolean }): void; toggle(): void; home(): void; agentSettings(): void } = { pace() {}, toggle() {}, home() {}, agentSettings() {} };
