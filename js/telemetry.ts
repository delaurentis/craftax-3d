// Game analytics: which events happened and what they carry (starts, achievements, floors, the bot taking over, the end, each
// step's actor and action). Where they go is not decided here: a plugin provides the "telemetry" service (src/core/plugins.ts),
// and with none, nothing is sent. Game events come from the state main.ts applies (observe), so local and server games are
// counted alike; local.ts adds each step and the bot's loads and errors. Per-game totals (steps by you and by bots, an action
// histogram, the bots used) live in localStorage under the game's id, so a game played over several visits is still one game.
// Never sent with ?god / ?ending / ?new / ?spectate, when Settings' "Send anonymous play statistics" is off, or when the
// browser sends Global Privacy Control.
import { service } from "../src/core/plugins";
import type { GameState, Meta } from "../src/core/types";
const TEST = /[?&](god|ending|new|spectate)\b/.test(location.search);
const PREF = "craftax3d.stats";                                               // "0": the player switched it off
const VIEWS = ["first_person", "classic", "three_quarter"];
const ACTIONS = 43;
const get = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const put = (k: string, v: string | number) => { try { localStorage.setItem(k, String(v)); } catch {} };
// Global Privacy Control (not in every browser, nor in TypeScript's DOM types yet)
const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
const sink = () => { const t = service("telemetry"); return t && !TEST && get(PREF) !== "0" && !nav.globalPrivacyControl && t.enabled() ? t : null; };

let meta: Meta | null = null;                                                              // the engine's names (achievements, actions)
fetch(new URL("../engine/js/meta.json", import.meta.url)).then((r) => r.json()).then((m) => { meta = m; }, () => {});
/** How the game looks right now (main.js setContext). */
type Looks = { mode?: string; view?: string; look?: string; quality?: string };
/** A game's totals (kept across visits): steps by you and by bots, the action histogram, the bots used, the bot's stretch now (seg). */
interface GameStats {
  human: number; bot: number; hist: number[]; bots: string[]; ach: number[] | null; maxLevel: number; ctl: string | null;
  seg: { bot_id: string | undefined; step: number; score: number; ach: number } | null; takeovers: number; playMs: number; ended: boolean; seen: boolean; at: number;
}
let ctxFn: () => Looks = () => ({}), version: string | null = null, input: string | null = null, cur: { gid: string; s: GameState } | null = null;
let lastBot: string | null = null, lastLooks: { k: string; view?: string; look?: string } | null = null, booted = false;
const t0 = performance.now();

// every event: the game it belongs to and how it's being played
function context() {
  const c: Record<string, unknown> = { ...ctxFn(), input, engine_version: version };
  if (cur && cur.s) {
    const s = cur.s;
    Object.assign(c, { game_id: cur.gid, seed: s.seed, step: s.timestep, level: s.level, floor: s.floor, score: Math.round(s.score),
      controller: s.world?.control || "human", bot_id: s.world?.bot_id || null });
  }
  return c;
}
export function track(event: string, props: Record<string, unknown> = {}, opts?: { timestamp?: Date }) {
  const t = sink();
  if (t) t.capture(event, { ...context(), ...props }, opts);
}

// per-game totals, kept across visits (the last 20 games)
const GAMES = "craftax3d.tele.games";
let games: Record<string, GameStats> = (() => { try { return JSON.parse(get(GAMES)!) || {}; } catch { return {}; } })();
function stats(gid: string) {
  let g = games[gid];
  if (!g) {
    g = games[gid] = { human: 0, bot: 0, hist: new Array(ACTIONS).fill(0), bots: [], ach: null, maxLevel: 0, ctl: null, seg: null,
                       takeovers: 0, playMs: 0, ended: false, seen: false, at: Date.now() };
    const ids = Object.keys(games).sort((a, b) => games[a].at - games[b].at);
    while (ids.length > 20) delete games[ids.shift()!];
  }
  return g;
}
const persist = () => put(GAMES, JSON.stringify(games));

// a step taken in this tab (local.ts): who took it and what it was
let stepsSince = 0;
export function step(gid: string, action: number, actor: "human" | "bot", botId?: string) {
  const g = stats(gid);
  if (actor === "bot") { g.bot++; if (botId && !g.bots.includes(botId)) g.bots.push(botId); } else g.human++;
  if (action >= 0 && action < ACTIONS) g.hist[action]++;
  if (++stepsSince >= 50) { stepsSince = 0; persist(); }
}

const achName = (i: number) => (meta && meta.achievements[i]) || String(i);
const segmentEnd = (g: GameStats, s: GameState, ended: string) => {
  if (!g.seg) return;
  const a = g.seg;
  track("bot_segment", { bot_id: a.bot_id, steps: s.timestep - a.step, score_gain: Math.round(s.score - a.score),
                         achievements_gained: s.achievements.length - a.ach, ended, speed: s.world?.speed, temp: s.world?.temp });
  g.seg = null;
};
function endGame(g: GameStats, s: GameState, outcome: string, cause?: string | null) {
  if (g.ended) return;
  g.ended = true;
  segmentEnd(g, s, outcome === "abandoned" ? "abandoned" : outcome);
  const steps = g.human + g.bot, best = Math.max(Number(get("craftax3d.tele.best")) || 0, Math.round(s.score));
  const played = (Number(get("craftax3d.tele.played")) || 0) + 1;
  put("craftax3d.tele.best", best); put("craftax3d.tele.played", played);
  track("game_ended", {
    outcome, cause: outcome === "died" ? cause || "Health ran out" : null,
    score_pct: Math.round((100 * s.score) / 226), achievements: s.achievements.map(achName), achievement_count: s.achievements.length,
    steps: s.timestep, max_level: g.maxLevel, play_seconds: Math.round(g.playMs / 1000),
    human_steps: g.human, bot_steps: g.bot, bot_share: steps ? Math.round((1000 * g.bot) / steps) / 1000 : 0, bots_used: g.bots,
    takeovers: g.takeovers, boss_beaten: s.achievements.includes(49),
    action_hist: meta ? Object.fromEntries(g.hist.map((n, i) => [meta!.actions[i], n]).filter(([, n]) => n)) : g.hist,
    $set: { best_score: best, games_played: played },
  });
  persist();
}

// main.ts apply(): every state shown. Watching someone else's world counts nothing
let lastObs = 0;
export function observe(s: GameState | null, cause?: string | null) {
  if (!s || (s.world && (!s.world.you || s.world.kind === "bot"))) return;
  const gid = s.game_id || `${s.world?.id || "server"}:${s.seed}`, g = stats(gid), now = performance.now();
  if (!booted) { booted = true; track("game_booted", { boot_ms: Math.round(now - t0), webgpu: !!(navigator as Navigator & { gpu?: unknown }).gpu }); }
  if (!cur || cur.gid !== gid) {
    // every step since step 0 counted here: a world begun in this tab; else one from before (a reload, My Worlds, an older save)
    const fresh = !g.seen && s.timestep - (g.human + g.bot) <= 1, retry = !!cur && cur.s.seed === s.seed;
    if (!g.seen) { g.ach = s.achievements.slice(); g.maxLevel = s.level; g.ctl = s.world?.control || "human"; g.seen = true; }
    cur = { gid, s };
    track(fresh ? "game_started" : "game_resumed", fresh ? { retry } : { source: lastObs ? "switch" : "reload" });
  }
  cur.s = s;
  if (!lastObs) g.ctl = s.world?.control || "human";                       // a reload always hands control back to you (local.ts)
  if (lastObs && now - lastObs < 30000 && !document.hidden) g.playMs += now - lastObs;   // time actually played
  lastObs = now;
  const by = s.world?.control || "human";
  for (const a of s.achievements) if (!g.ach!.includes(a)) {
    g.ach!.push(a);
    track("achievement_unlocked", { achievement: achName(a), achievement_index: a, by, nth: g.ach!.length });
    if (a === 49) track("boss_defeated", { by, $set: { has_beaten_boss: true } });
  }
  if (s.level > g.maxLevel) { g.maxLevel = s.level; track("floor_reached", { by }); }
  const bid = s.world?.bot_id;
  if (bid && lastBot && bid !== lastBot) track("bot_selected", { bot_id: bid, prev_bot_id: lastBot, is_custom: bid.startsWith("my-") });
  if (bid) lastBot = bid;
  if (by !== g.ctl) {
    track("bot_control_changed", { to: by, health: s.health, ...(by === "bot" ? { $set: { has_used_bot: true } } : {}) });
    if (by === "bot") { g.takeovers++; g.seg = { bot_id: bid, step: s.timestep, score: s.score, ach: s.achievements.length }; }
    else segmentEnd(g, s, "handed_back");
    g.ctl = by;
  }
  if (s.done && !g.ended) endGame(g, s, s.health <= 0 ? "died" : s.achievements.includes(49) ? "won" : "timeout", cause);
}

// local.ts: the world you're in ended for good (My Worlds' ✕), before its replacement starts
export function abandon() { if (cur && cur.s && !cur.s.done) endGame(stats(cur.gid), cur.s, "abandoned"); }
export function setVersion(v: string) { version = v; }
// main.ts: how the game looks right now ({ mode, view, look, quality }); a change of view or look is a setting_changed
export function setContext(fn: () => Looks) { ctxFn = fn; }
export function looks() {
  const c = ctxFn(), k = `${c.view}|${c.look}`;
  if (lastLooks && lastLooks.k !== k && booted) {                            // (the page setting itself up isn't a choice)
    if (c.view !== lastLooks.view) track("setting_changed", { setting: "view", value: c.view });
    if (c.look !== lastLooks.look) track("setting_changed", { setting: "look", value: c.look });
  }
  lastLooks = { k, view: c.view, look: c.look };
}
export const viewName = (m: number) => VIEWS[m] || String(m);
// main.ts show(): the menus and screens as screens (null: back in the game)
let lastScreen: string | null | undefined;
export function screen(id: string | null) { if (id !== lastScreen) { lastScreen = id; if (id) track("screen_viewed", { screen: id }); } }
// Settings > Agent's speed and temperature sliders: one event per pause in the dragging
let paceT: ReturnType<typeof setTimeout> | undefined, pace: Record<string, unknown> = {};
export function paced(b: Record<string, unknown>) { Object.assign(pace, b); clearTimeout(paceT); paceT = setTimeout(() => { track("bot_pace_changed", pace); pace = {}; }, 2000); }

// the player's input: the last kind used goes on every event
const inputIs = (k: string) => { if (input !== k) input = k; };
addEventListener("keydown", () => inputIs("keyboard"), { capture: true, passive: true });
addEventListener("pointerdown", (e) => { const t = (e as PointerEvent).pointerType; inputIs(t === "touch" ? "touch" : t === "pen" ? "pen" : "mouse"); }, { capture: true, passive: true });
addEventListener("gamepadconnected", () => inputIs("gamepad"));
// leaving the page: the bot's stretch so far, and the totals
addEventListener("pagehide", () => {
  persist();
  if (cur && cur.s) { const g = stats(cur.gid); if (g.seg) { segmentEnd(g, cur.s, "page_closed"); persist(); } }
});

// Settings' switch (index.html #opt-stats)
const box = document.getElementById("opt-stats") as HTMLInputElement | null;
if (box) {
  box.checked = get(PREF) !== "0" && !nav.globalPrivacyControl;
  box.disabled = !!nav.globalPrivacyControl;
  box.onchange = (e) => {
    if (!(e.target as HTMLInputElement).checked) { track("stats_off"); service("telemetry")?.consent?.(false); put(PREF, "0"); }
    else { put(PREF, "1"); service("telemetry")?.consent?.(true); track("stats_on"); }
  };
}
track("$pageview");
