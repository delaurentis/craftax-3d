// Single player in the browser: the craftax-wasm engine (C → WebAssembly, bit-exact with JAX Craftax) runs the game in this tab and
// answers the same /api/... calls a game server would, so main.ts plays it unchanged. tools/runtime-files.ts copies the engine into
// engine/ from a craftax-wasm checkout. The bot (P) runs here too: agent.ts, one of the models in public/models.json
// as ONNX (the registry's first by default, loaded from Hugging Face), picked in Settings' Agent tab (POST /api/bot) and
// remembered. Bot worlds, watching and the 2D views drawn by Craftax's own renderer need a server.
import { loadModels, loadAgent, available, buildHint, myAgents, sourceFor } from "./agent";
import { SHIPPED } from "./build";
import * as tele from "./telemetry";
import { sceneStore } from "../src/scenes/active";
import { clearWay, placeSetPieces } from "../src/scenes/place";
import { decodeReset, encode, encodeReset, replayReply, snapshot, type KeptReply } from "../src/replay/brain-rec";
import type { Agent, BotReply, CraftaxEngine, CraftaxGame, CraftaxModule, EngineOp, EngineState, GameState, Meta, ModelEntry, Pos, RecHead, Recording, SaveRecord, UiOp, WorldSummary, ApiBody as Body } from "../src/core/types";
// a plugin's bot (a crystal player, say) may see something other than the packed observation: its source says what (observe)
const obsFor = (m: ModelEntry) => { const src = sourceFor(m); return src?.observe ? src.observe(m, game) : game.obs(); };
const SPEEDS = [1, 2, 4, 8, 10, 15, 30, 60, 120, 240];
// (cx, game, meta: null until boot(), which every route, op and save waits for first)
let cx = null as unknown as CraftaxEngine, game = null as unknown as CraftaxGame, meta = null as unknown as Meta, t = 0, seed = 0, fl = 0;
// the worlds you've played here, each autosaved: the one you're in (`world`, `name`) and the rest in IndexedDB (saves)
let world = "", name = "", thumb: string | null = null;                     // thumb: a tiny picture of the world (main.ts grabs it)
// the bot, as a game server would run it: its own clock, `speed` moves a second; `epoch` drops a reply from before a reset or take-over
// `model`: the registry entry playing (models[0] unless you picked another); `pick` drops a switch overtaken by a later one
const bot: { control: "human" | "bot"; model: ModelEntry; agent: Agent | null; reply: BotReply | null; speed: number; paused: boolean; single: boolean; temp: number; epoch: number; pick: number; stale: boolean; useful?: boolean } =
  { control: "human", model: null as unknown as ModelEntry, agent: null, reply: null, speed: 10, paused: false, single: false, temp: 0.2, epoch: 0, pick: 0, stale: false };   // stale: you moved unwatched
let models: ModelEntry[] = [];
// Settings: the bot watching your moves (see /api/step). On unless switched off on a computer, off unless switched on on a phone (main.ts)
// the bot's temperature: the one you last set for this model, else the model's own (its registry entry's `temperature`), else 0.2,
// mostly its top move with a little chance to break loops (Pete: at 1.0 PufferLib's died fast; priml's agent is evaluated at 1.0)
// ONLY USEFUL ACTIONS (Pete, note 5912): the bot chooses only among actions that would make a difference now (the engine's cx_useful:
// each action stepped on a copy and compared with doing nothing), within Craftax's own mask. Each model says its default in its registry
// entry (`usefulOnly`; the crystals on, the ONNX bots off: they were trained on Craftax's own mask); a choice in Settings is remembered per model,
// except a crystal: picking one always turns it on (Pete db97), unticking lasts until the next pick
const usefulFor = (m: ModelEntry) => {
  if (sourceFor(m)?.usefulOnly) return true;
  const v = store.get("botUseful:" + m.id); return v === "1" ? true : v === "0" ? false : !!m.usefulOnly;
};
const botMask = () => {
  const mask = game.mask();
  if (!bot.useful || !game.useful) return mask;
  const u = game.useful().map((v, i) => v && mask[i]);
  return u.some(Boolean) ? u : mask;
};
const tempFor = (m: ModelEntry) => { const tp = store.get("botTemp:" + m.id); return tp !== null && tp !== "" ? +tp : typeof m.temperature === "number" ? m.temperature : 0.2; };
const watching = () => { const v = store.get("watch"); return v === null ? !matchMedia("(pointer: coarse)").matches : v === "1"; };
// ?new: the game as a first-time visitor sees it (the opening menu, a fresh world), in its own storage wiped each load: your saves untouched
// ?god: the best gear, every enchantment and spell, maxed attributes, and nothing kills you, in every world here. Dev builds
// (build.ts), and a shipped build only while served from this machine (out/ on 9500): never on the site. Its worlds keep their own
// storage, so a god world never lands among your real ones. ?ending is ?god too (main.ts: straight to the necromancer's death)
const HERE = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
export const GOD = (!SHIPPED || HERE) && /[?&](god|ending)\b/.test(location.search);
const godOn = () => { if (GOD && game.god) game.god(true); };            // (an engine built before cx_god: no god, but the game runs)
const NEW = /[?&]new\b/.test(location.search);
// ?spectate (the site's private /craftax: the game on an iPhone beside the crystal): this copy plays no game of its own; the page that
// holds it (same origin) posts { cx: "spectate", seed } to start a seed and { cx: "spectate", actions } for each step it took, and
// the same engine on the same seed and actions is the same game, step for step. Its own storage, saving nothing
// ?replay (replay.html: a recording played back, record.ts): spectating, driven by the recording's own ops instead of a page's messages
export const REPLAY = /[?&]replay\b/.test(location.search);
export const SPECTATE = REPLAY || /[?&]spectate\b/.test(location.search);
const SCENE = sceneStore(), NS = SPECTATE ? "craftax3d.spectate." : NEW ? "craftax3d.new." : SCENE ? SCENE.ns : GOD ? "craftax3d.god." : "craftax3d.local.", DB = SPECTATE ? "craftax3d-spectate" : NEW ? "craftax3d-new" : SCENE ? SCENE.db : GOD ? "craftax3d-god" : "craftax3d";
const resetWorld = (sd: number) => { game.reset(sd); placeSetPieces(cx, game, sd, fl); };   // a new world, with ?scene=<id>'s set pieces in it (src/scenes; its worlds kept apart: SCENE)
const spectated: { seed?: number; actions?: number[] }[] = [];                                                  // messages that came before the engine
function spectate(d: { seed?: number; actions?: number[] }) {
  if (d.seed !== undefined) { seed = d.seed; game.reset(seed); }
  for (const a of d.actions || []) if (!game.done) game.step(a);
  t++;
}
if (SPECTATE && !REPLAY) addEventListener("message", (e) => {
  if (e.origin !== location.origin || !e.data || e.data.cx !== "spectate") return;
  if (game) spectate(e.data); else spectated.push(e.data);
});
if (NEW) try {
  for (const k of Object.keys(localStorage)) if (k.startsWith(NS)) localStorage.removeItem(k);
  indexedDB.deleteDatabase(DB);
} catch {}
// recording (record.ts): every change made to the engine, as an op, while `rec.sink` is set; a replay applies the same ops to the
// same snapshot, and the same engine gives the same game, step for step
// No spoilers in a recording (Pete): the whole boss fight shows, his death and the portal opening too, but never going through it.
// The recording ends as you come within a few tiles of the portal ("the rest is secret": replay.html fades out there): main.ts calls
// local.portalCut, `won(k, true)` cutting before op k (rec.m, set as each move starts: the step that came near; or now, the bot's walk in).
// A new world after the win any other way (the menu) is cut there too (op: before its load). Begun with him beaten: the same
const rec: { sink: ((o: EngineOp) => void) | null; who: string; bot?: string | null; reply: null; n: number; m: number; won: ((k: number, secret: boolean) => void) | null; beat: boolean } =
  { sink: null, who: "human", reply: null, n: 0, m: 0, won: null, beat: false };
const cutAt = (k: number) => { if (rec.won && !SPOILERS) { const f = rec.won; rec.won = null; f(k, true); } };
const op = (o: EngineOp) => { if (rec.sink) { if (o.k === "load" && rec.beat) cutAt(rec.n); rec.n++; rec.sink(o); } };
const moveStarts = () => { rec.m = rec.n; };
// ?debug&spoilers, on this machine only (localhost; never on playcraftax.com, Pete): a recording goes on through the boss and the
// portal, uncut. (Such a recording can't be shared either: the verifier refuses one that goes on past the win into a new world)
const SPOILERS = /[?&]debug\b/.test(location.search) && /[?&]spoilers\b/.test(location.search) && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
function endingGuard() {                                             // (rec.beat: he's beaten, a new world from here is cut)
  if (rec.won && !rec.beat && game.state().achievements.includes(49)) rec.beat = true;
}
const b64 = (b: Uint8Array) => { let s = ""; for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000) as unknown as number[]); return btoa(s); };
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const replyOf = (r: BotReply | null) => encode(r, sourceFor(bot.model));   // (a bot move kept, and rebuilt in a replay: src/replay/brain-rec.ts)
const kept = (k: unknown) => { const m = shown(); return replayReply(k as KeptReply, m && sourceFor(m), { seed, actions: meta.actions, model: m!, observe: () => obsFor(m!) }, () => t++); };
function applyOp(o: EngineOp | UiOp) {
  switch (o.k) {
    case "load": game.load(unb64(o.snap)); seed = o.seed; if (o.god) game.god?.(true); break;
    case "step":                                                     // as POST /api/step: face, then up to n steps
      if (o.f >= 1 && o.f <= 4) game.face(o.f);
      for (let i = 0; i < o.n && !game.done; i++) { if (game.intoLava && game.intoLava(o.a)) break; game.step(o.a); }
      if (rec.who !== "bot") bot.reply = { action: meta.actions[o.a] };   // (main.ts swings the tool for a DO, as the bot's)
      break;
    case "a": game.step(o.a); break;                                  // a bot move
    case "reply": bot.reply = kept(o.r); break;
    case "who": rec.who = o.who; rec.bot = o.bot || null; bot.reply = null; decodeReset(); break;
    case "hurt": game.hurt?.(1); break;
    case "shove": game.shove?.(o.dr, o.dc); break;
    case "floor": game.teleport(o.level); break;
    case "place": game.place(o.r, o.c); break;
    case "boss": game.bossSet?.(o.hits); break;
    case "kill": for (const [r, c] of o.cells) game.killAt?.(r, c); break;
  }
  t++;
}
const store = {
  get(k: string) { try { return localStorage.getItem(NS + k); } catch { return null; } },
  set(k: string, v: string | number | boolean) { try { localStorage.setItem(NS + k, String(v)); } catch {} },
};

let booting: Promise<void> | null = null;
const boot = () => (booting ??= start());
async function start() {
  const [{ loadCraftax, FLAGS }, m, reg] = await Promise.all([
    import("../engine/js/craftax.mjs") as Promise<unknown> as Promise<CraftaxModule>,
    fetch(new URL("../engine/js/meta.json", import.meta.url)).then((r) => r.json() as Promise<Meta>),
    loadModels().catch((): ModelEntry[] => [{ id: "puffer162", name: "PufferLib 162", onnx: "agent/puffer162.onnx",   // no models.json: the old one
      state: [{ in: "h", out: "h_out", shape: [4, 1, 1024] }], brain: { output: "h_out", layers: 4 } }]),
  ]);
  models = reg; bot.model = all().find((x) => x.id === store.get("bot")) || models[0]; bot.temp = tempFor(bot.model); bot.useful = usefulFor(bot.model);
  cx = await loadCraftax();
  tele.setVersion(cx.version);
  meta = { ...m, speeds: SPEEDS };
  game = cx.newGame(fl = FLAGS.SINGLE_STEP | FLAGS.KEEP_DEAD | FLAGS.ACTION_MASK);   // a sleep plays out step by step; a death stays on screen
  if (!SPECTATE || REPLAY) game.playOn?.(true);                             // (spectating: the game as the page plays it, a win ends it) the win doesn't end the game: a quiet Graveyard, the portal (Pete)
  seed = Number(store.get("seed")) || ((Math.random() * 2 ** 31) | 0);
  world = store.get("world") || newId(); name = store.get("name") || nextName();
  game.reset(seed);
  try { const b = !SPECTATE && store.get("game"); if (b) game.load(Uint8Array.from(atob(b), (c) => c.charCodeAt(0))); else if (!SPECTATE) placeSetPieces(cx, game, seed, fl); }
  catch { resetWorld(seed); }                                     // a snapshot from another engine build: start this seed afresh
  if (SPECTATE && !REPLAY) { bot.control = "bot"; for (const d of spectated.splice(0)) spectate(d); }   // driven from outside: main.ts watches, as it watches the bot
  godOn();
  slotRev = Number(store.get("rev")) || 0;                               // the slot this copy came from (save)
  if (!SPECTATE && /[#&]from=/.test(location.hash)) await pickUp();
  addEventListener("pagehide", save);
  document.addEventListener("visibilitychange", () => document.hidden && save());
  bot.speed = Number(store.get("botSpeed")) || bot.speed;
  // after a reload you are always in control (Pete): the bot's model only downloads when you let it play (its memory would start
  // afresh anyway, and fetching ~60 MB at once ran a phone out of memory before the page was up)
  store.set("control", "human");
}
// the game survives a reload: a snapshot of the whole engine state (84 KB) every 50 steps and when the tab is hidden, kept twice:
// in localStorage for the reload (written at once, even as the page goes away) and in IndexedDB beside your other worlds (My Worlds)
// the reload slot is the world last PLAYED, whichever copy of the game played it: with the game open twice (two tabs, a pane), a
// copy that sat idle never writes over the slot of one played more recently (it was putting the wrong world back on a reload). Every
// world still keeps its own save in My Worlds (IndexedDB)
let playedAt = 0;                                                          // when this copy last took a step
// the slot's revision: every write to the reload slot bumps it, and each copy of the game remembers the one it last loaded or wrote.
// A copy whose revision is behind the slot's (another tab or pane saved since) and that hasn't played since then is out of date:
// it writes nothing, so an idle copy hidden or closed can't put you back where it stood (Pete: it reloaded him away from a table)
let slotRev = 0, moved = false;
const played = () => { playedAt = Date.now(); moved = true; endingGuard(); };
function save() {
  if (!game || SPECTATE) return;
  const b = game.save();
  const slotWorld = store.get("world"), slotAt = Number(store.get("playedAt")) || 0;
  const rev = Number(store.get("rev")) || 0;
  if (slotWorld === world && rev !== slotRev && !moved) return;            // out of date (above): neither the slot nor My Worlds
  if (slotWorld === world && playedAt < slotAt && !moved) return;          // the same, for a slot written before revisions
  moved = false;
  if (!slotWorld || slotWorld === world || playedAt >= slotAt) {
    slotRev = rev + 1; store.set("rev", slotRev);
    let bin = "";
    for (let i = 0; i < b.length; i += 0x8000) bin += String.fromCharCode.apply(null, b.subarray(i, i + 0x8000) as unknown as number[]);
    store.set("seed", seed); store.set("game", btoa(bin)); store.set("world", world); store.set("name", name);
    store.set("control", bot.control); store.set("botSpeed", bot.speed); store.set("playedAt", Math.max(playedAt, slotAt));
  }
  const s = game.state();
  if (s.done) return died();
  const rec: SaveRecord = { id: world, name, seed, version: cx.version, updated: Date.now(), floor: s.floor, score: Math.round(s.score),
                steps: s.timestep, done: false, snap: b, thumb };
  // the bot's memory, when it is current (it is playing, or watched every move of yours): saved beside the snapshot, with the agent
  // and the step it belongs to, so turning it on again after a reload carries on from here (memoryFor, /api/control)
  const current = bot.agent && (bot.control === "bot" || (watching() && !bot.stale));
  (current ? bot.agent!.getMemory().then((mem): SaveRecord["mem"] =>  ({ model: bot.model.id, step: s.timestep, data: mem }), () => null) : Promise.resolve(null))
    .then(async (mem: SaveRecord["mem"] | null) => {
      if (!mem && bot.agent && !current) return saves.put(rec);          // stale now: the saved memory goes with it
      if (!mem) { const old = await saves.get(world).catch(() => null); if (old && old.mem) mem = old.mem; }   // not loaded yet: keep the last one
      return saves.put(mem ? { ...rec, mem } : rec);
    }).catch(() => {});
}
// a saved memory that fits: this world, this agent, and recent: at most 60 steps behind the world (the last save as a page goes
// away can't wait for the bot's memory, so the snapshot may be a little ahead of it). A save made while it was stale (you played
// unwatched) carries no memory at all
async function memoryFor() {
  try {
    const r = await saves.get(world), m = r && r.mem, cur = game.state().timestep;
    return m && m.model === bot.model.id && m.step <= cur && cur - m.step <= 60 ? m.data : null;
  } catch { return null; }
}
// a death (Pete): permadeath, the world's autosave goes (Try this seed again starts it over); once per world
let buried: string | null = null;
function died() {
  if (buried === world) return;
  buried = world;
  saves.del(world).catch(() => {});
}
const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
function nextName() { const n = (Number(store.get("worlds")) || 0) + 1; store.set("worlds", n); return "World " + n; }

// IndexedDB: one record a world ({id, name, seed, version, updated, floor, score, steps, done, snap})
let db: Promise<IDBDatabase> | null = null;
const open = () => (db ??= new Promise((ok, fail) => {
  const r = indexedDB.open(DB, 1);
  r.onupgradeneeded = () => r.result.createObjectStore("worlds", { keyPath: "id" });
  r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
}));
// any: a request's result is whatever the store holds (a SaveRecord, a list of them, or a key)
const txn = async (mode: IDBTransactionMode, f: (st: IDBObjectStore) => IDBRequest): Promise<any> => {
  const d = await open();
  return new Promise((ok, fail) => {
    const tx = d.transaction("worlds", mode), r = f(tx.objectStore("worlds"));
    tx.oncomplete = () => ok(r.result); tx.onerror = () => fail(tx.error);
  });
};
const saves = {
  put: (rec: SaveRecord) => txn("readwrite", (st) => st.put(rec)),
  get: (id: string): Promise<SaveRecord | undefined> => txn("readonly", (st) => st.get(id)),
  all: (): Promise<SaveRecord[]> => txn("readonly", (st) => st.getAll()),
  del: (id: string) => txn("readwrite", (st) => st.delete(id)),
};
// switch to a saved world: the one you leave is saved first; the bot (if it's playing) carries on in the new one, its memory fresh
function enter(rec: SaveRecord) {
  if (rec.version !== cx.version) throw new Error("that world was saved by another version of the game");
  save();
  game.load(rec.snap); seed = rec.seed; world = rec.id; name = rec.name; thumb = rec.thumb || null; buried = null; t++;
  godOn();
  bot.epoch++; if (bot.agent) bot.agent.reset();
  if (bot.control === "bot" && bot.agent) botLoop(bot.epoch);
  played(); save();                                                    // you chose it: it is the world a reload brings back
  op({ k: "load", snap: b64(game.save()), seed, god: GOD });
  return state();
}
// a new world (from `sd`, or a random seed): the one you leave is saved (keep), or ended for good (My Worlds' ✕ on the world you're in)
function fresh(sd: number | undefined, keep: boolean) {
  if (keep) save(); else saves.del(world).catch(() => {});
  world = newId(); name = nextName(); thumb = null;
  seed = (sd ?? (Math.random() * 2 ** 31)) & 0x7fffffff; resetWorld(seed); godOn(); played(); save(); t++;
  op({ k: "load", snap: b64(game.save()), seed, god: GOD });
  store.set("games", games() + 1);                                     // one more game in this browser, yours or the bot's
  bot.epoch++; if (bot.agent) bot.agent.reset();
  if (bot.control === "bot" && bot.agent) botLoop(bot.epoch);          // bot mode stays on: it drives the new world too
  return state();
}

// a recording's "Play from here" (replay.html): the game as it stood at that moment comes in the address's #fragment (never sent to
// a server; gzipped, ~10 KB), #from=<snapshot>&seed=<seed>&v=<engine version>, and becomes a new world of yours (the one you were in
// keeps its save). Another engine build's snapshot can't load: it is left alone and you are where you were
async function pickUp() {
  const h = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, "", location.pathname + location.search);   // (a reload doesn't pick it up twice)
  try {
    if (h.get("v") !== cx.version) throw new Error("recorded on another version of the game");
    const z = Uint8Array.from(atob(h.get("from")!.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const snap = new Uint8Array(await new Response(new Blob([z]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer());
    save();
    world = newId(); name = "From a replay"; thumb = null; buried = null;
    seed = (Number(h.get("seed")) || 0) & 0x7fffffff; game.load(snap);
    if (!GOD) game.god?.(false);                                      // (a ?god recording: an ordinary world here)
    played(); save(); t++;
    store.set("games", games() + 1);
  } catch (e) { console.warn("Play from here:", (e as Error).message); }
}
// how many games this browser has played, you and the bot together (the first world counts): Try again types "Simulation #n" (main.ts)
const games = () => Math.max(1, Number(store.get("games")) || 1);
const shown = (): ModelEntry | null => (REPLAY ? (rec.bot ? all().find((m) => m.name === rec.bot) ?? null : null) : bot.model);   // (a replay: its own bot, by name)
function summary(s: EngineState): WorldSummary {
  return { id: "local", name: "This browser", kind: "player", control: REPLAY ? (rec.who === "bot" ? "bot" : "replay") : bot.control, you: true,
           bot: REPLAY ? (rec.who === "bot" ? rec.bot : null) : bot.control === "bot" ? bot.model.name : null, bot_id: shown()?.id, bot_score: shown()?.score, floor: s.floor, level: s.level,
           score: Math.round(s.score), steps: s.timestep, done: s.done, watchers: 0 }; }
function state() {
  const s = game.state() as GameState;                                    // (the fields the engine leaves out, filled in below)
  // the necromancer while he can be hit: Craftax's renderer swaps in his pale picture; the engine's map never does, so it's done here
  // and beaten, his tile is floor (main.ts lays his corpse there; a rebuilt chunk would stand him back up)
  // (the crystal's frame reads the engine's own map, as JAX Craftax has it: engine_map, kept when this rewrites the tile)
  if (s.boss_vulnerable || s.boss_progress >= 8) { const i = s.map.indexOf(32); if (i >= 0) { s.engine_map = s.map.slice(); s.map[i] = s.boss_progress >= 8 ? 7 : 36; } }
  s.t = t; s.seed = seed; s.game_id = world; s.games = games();
  s.world = { ...summary(s), speed: bot.speed, paused: bot.paused, bot_reply: bot.control === "bot" || REPLAY ? bot.reply : null,
              temp: bot.agent ? bot.temp : null, useful: bot.model ? !!bot.useful : null, crystal_stamp: !!shown()?.stamp, bot_kind: shown()?.kind || null };
  s.available = game.available();
  // sleep and rest change no inventory or map, so the probe above never counts them: Craftax's own action mask says when they're
  // allowed (energy / health below full)
  const mask = game.mask();
  s.available[6] = mask[6]; s.available[17] = mask[17];
  return s;
}

const all = () => [...models, ...myAgents.list()];                              // the registry, then your own agents
const routes: Record<string, (b: Body, q?: URLSearchParams) => unknown> = {
  "GET /api/info": () => ({ name: "In your browser", version: cx.version, bots: models, worlds: 1, bot_worlds: +(bot.control === "bot"),
                            players: 1, local: true }),
  "GET /api/meta": () => meta,
  "GET /api/worlds": () => ({ worlds: [summary(game.state())] }),
  "GET /api/state": (body, q) => (q!.get("since") === String(t) ? { same: true, t } : state()),
  "POST /api/available": () => ({ available: game.available() }),
  "POST /api/reset": (b) => fresh(b.seed, true),                  // a new world: the one you leave stays in your saves
  "POST /api/step": (b) => {                                     // as the server: face the aimed tile, then up to 50 steps
    moveStarts();
    if (bot.control === "bot") throw new Error("the bot is playing: take over first");
    if (b.face >= 1 && b.face <= 4) game.face(b.face);
    const n = Math.max(1, Math.min(b.n | 0 || 1, 50));
    op({ k: "step", f: b.face | 0, a: b.action | 0, n });
    for (let i = 0; i < n && !game.done; i++) {
      // Settings, "Bot watches you play": once its model is loaded, it sees each of your moves as it would its own (its move
      // thrown away, and your move is the action it remembers playing; asleep it sees nothing, as when it plays), so its memory is
      // current when it takes over
      if (bot.agent && watching()) { if (game.mask()[1]) { const ob = obsFor(bot.model); if (!(ob instanceof Promise)) { bot.agent.act(ob, game.mask(), bot.temp).catch(() => {}); bot.agent.took(b.action | 0); } else bot.stale = true; } }
      else bot.stale = true;
      if (game.intoLava && game.intoLava(b.action | 0)) break;   // a step into lava kills you (a rule for human play, Pete; bots never come here)
      game.step(b.action | 0);
      tele.step(world, b.action | 0, "human");
    }
    played();
    if (++t % 50 === 0 || game.done) save();
    return state();
  },
  "POST /api/scorch": () => {                                    // saved at lava's edge, a heart lost (main.ts lavaTry; human play only)
    moveStarts();
    if (bot.control === "bot") throw new Error("the bot is playing: take over first");
    if (game.hurt) game.hurt(1);
    op({ k: "hurt" });
    played(); t++;
    if (game.done) save();
    return state();
  },
  "POST /api/shove": (b) => {                                     // knocked back a tile by a second hit (main.ts Knockback; human play only)
    if (bot.control === "bot" || !game.shove) return state();
    if (game.shove(b.dr | 0, b.dc | 0)) { op({ k: "shove", dr: b.dr | 0, dc: b.dc | 0 }); played(); t++; }
    return state();
  },
  "POST /api/pace": (b) => {
    if ("speed" in b) { bot.speed = Math.max(0.5, Math.min(240, +b.speed || 10)); store.set("botSpeed", bot.speed); }   // remembered at once, not only with the world
    if ("paused" in b) bot.paused = !!b.paused;
    if (b.single) bot.single = true;
    if ("temp" in b) { bot.temp = Math.max(0, Math.min(2, +b.temp || 0)); store.set("botTemp:" + bot.model.id, bot.temp); }   // 0 greedy (the top action), else drawn at this temperature; remembered for this model
    if ("useful" in b) { bot.useful = !!b.useful; store.set("botUseful:" + bot.model.id, bot.useful ? "1" : "0"); }   // only useful actions, remembered for this model
    tele.paced({ speed: bot.speed, paused: bot.paused, temp: bot.temp });
    t++; return state();
  },
  "POST /api/control": async (b) => {
    if (b.control === "bot") {
      const t0 = performance.now(), a = await loadAgent(bot.model);   // the first time: the model (~60 MB for PufferLib's) and runtime
      if (a !== bot.agent && performance.now() - t0 > 100) tele.track("bot_loaded", { bot_id: bot.model.id, load_ms: Math.round(performance.now() - t0) });
      if (a !== bot.agent || bot.stale) {                        // its memory starts here, unless it watched all your moves,
        const mem = await memoryFor();                           // or it was saved at this very moment (a reload): it carries on
        if (mem) a.setMemory(mem); else a.reset();
      }
      bot.agent = a; bot.stale = false;
      bot.control = "bot"; bot.reply = null; bot.epoch++;
      encodeReset(); op({ k: "who", who: "bot", bot: bot.model.name });
      botLoop(bot.epoch);
    } else { bot.control = "human"; bot.epoch++; op({ k: "who", who: "human" }); }
    store.set("control", bot.control);                           // a reload keeps whoever is playing
    t++; return state();
  },
  // the bot panel's model picker: every model in the registry, whether its .onnx is here (a HEAD each, nothing downloads)
  "GET /api/bots": async () => ({ current: bot.model.id, bots: await Promise.all(all().map(async (m) => {
    const ok = await available(m);
    return { ...m, available: ok, hint: ok ? null : buildHint(m) };
  })) }),
  // switch models: the new one loads while the old one keeps playing, then takes over from where the game is, its memory fresh; a
  // model that won't load leaves the old one playing (the error goes back to the picker). Remembered for this browser
  "POST /api/bot": async (b) => {
    const m = all().find((x) => x.id === b.id), my = ++bot.pick;
    if (!m) throw new Error("no such bot: " + b.id);
    if (m.id === bot.model.id) return state();
    if (!(await available(m))) throw new Error(`${m.name} isn't available: ${buildHint(m)}`);
    const a = bot.control === "bot" ? await loadAgent(m) : null;   // not playing: nothing downloads; it loads when it's let play
    if (bot.pick !== my) { if (a && a !== bot.agent) a.close(); return state(); }
    if (bot.agent) bot.agent.close();
    bot.model = m; bot.agent = a; store.set("bot", m.id); bot.temp = tempFor(m); bot.useful = usefulFor(m);
    if (a) a.reset();
    // (as when the bot starts: the brain recorder starts over, its last model's layout gone, Pete: a crystal picked over an ONNX bot
    // stopped at its first move; and the recording says who plays now)
    if (bot.control === "bot" && a) { bot.epoch++; bot.reply = null; encodeReset(); op({ k: "who", who: "bot", bot: m.name }); botLoop(bot.epoch); }
    t++; return state();
  },
  // your own agents: add one by its link (kept in this browser; then picked like any other), or forget one
  "POST /api/myagents": async (b) => {
    if (b.remove) { myAgents.remove(b.remove); if (bot.model.id === b.remove) return routes["POST /api/bot"]({ id: models[0].id }); t++; return state(); }
    if (!/^https?:\/\//i.test(b.url || "")) throw new Error("paste a link to an .onnx file (https://…)");
    const m = myAgents.add(b.url, (b.name || "").trim(), b);
    tele.track("custom_agent_added", { host: new URL(b.url).host });   // the host only, never the link
    return routes["POST /api/bot"]({ id: m.id });
  },
  "POST /api/portal-way": (b) => { if (clearWay(game, (b.cells || []) as number[][])) { played(); t++; } return state(); },   // the victory portal's way in, its tombstones cleared (src/scenes/place.ts clearWay); not an op
  "POST /api/debug/place": (b) => { if (!GOD) return state(); game.place(b.r | 0, b.c | 0); op({ k: "place", r: b.r | 0, c: b.c | 0 }); played(); return state(); },   // ?god's ghost, back in a body where it drifted to
  "POST /api/debug/floor": (b) => { game.teleport(b.level | 0); op({ k: "floor", level: b.level | 0 }); played(); t++; return state(); },
  "POST /api/debug/boss": (b) => {                                // ?ending (main.ts): by the necromancer, his hits set; 8 beats him
    if (!GOD || !game.bossSet) throw new Error("the ending needs ?god");
    game.bossSet(b.hits | 0);
    const f = game.state();
    for (const m of [...f.melee, ...f.ranged]) game.killAt!(m.pos[0], m.pos[1]);   // (his minions gone)
    op({ k: "boss", hits: b.hits | 0 }); op({ k: "kill", cells: [...f.melee, ...f.ranged].map((m) => m.pos) });
    played(); t++;
    return state();
  },
  "POST /api/debug/nuke": (b) => {                                // ?god, N: the monsters on these tiles die (main.ts picks the ones on screen)
    if (!GOD || !game.killAt) throw new Error("nuke needs ?god");
    let n = 0;
    for (const [r, c] of (b.cells || []) as Pos[]) n += +game.killAt(r, c);
    op({ k: "kill", cells: b.cells || [] });
    played(); t++;
    return { ...state(), nuked: n };
  },
};

// one bot move a tick: a sleep or rest goes on without it (PufferLib counts a whole sleep as one agent step; the mask is NOOP
// only then), a death stops it (your world stays on screen, as on the server)
async function botLoop(epoch: number) {
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  while (bot.epoch === epoch) {
    const t0 = performance.now();
    if (game.done || (bot.paused && !bot.single)) { await wait(50); continue; }
    bot.single = false; moveStarts();
    // asleep (only NOOP allowed): a tick every SLEEP_MS, so it lies down, goes dark and wakes in about 3 s (Pete), one at a time (a zombie's
    // hit wakes it at once); past 30 a second at the bot's own pace, unseen (Pete: too slow; player-pose.ts shows no sleep then)
    const mask = game.mask(), asleep = !mask[1], SLEEP_MS = 40;
    if (asleep) { game.step(0); op({ k: "a", a: 0 }); tele.step(world, 0, "bot", bot.model.id); }
    else {
      let r;
      const allowed = botMask();
      try { r = await bot.agent!.act(await obsFor(bot.model), allowed, bot.temp); }
      catch (e) { if (bot.epoch !== epoch) return; tele.track("bot_error", { bot_id: bot.model.id, message: String((e as Error).message).slice(0, 200) }); bot.control = "human"; bot.epoch++; bot.reply = { action: "NOOP", note: "bot error: " + (e as Error).message }; t++; return; }
      if (bot.epoch !== epoch) return;
      const top = r.probs.map((p, i) => [i, p]).filter(([, p]) => p > 0).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([i, p]): [string, number] => [meta.actions[i], Math.round(p * 1000) / 1000]);
      bot.reply = { action: meta.actions[r.action], top, probs: Array.from(r.probs), mem: r.mem || null, memShape: r.memShape || null, sense: r.sense, value: Math.round(r.value * 1000) / 1000,
                    note: null, memPix: r.memPix || null,   // (no "ms of light" line under the brain: it was the simulation's time, not the light's, Pete 9a7f)
                    split: r.split || null, maps: r.maps || null, allowed: bot.useful ? Array.from(allowed, Boolean) : null };   // (only useful actions on: the brain darkens the rest, Pete e286)
      if (bot.reply.action === "DO") {                           // a hit: show the swing first (reply.pending: main.ts swings the tool),
        bot.reply.pending = true; t++;                             // then the blow lands; a beat that shrinks as the bot speeds up
        op({ k: "reply", r: replyOf(bot.reply) });
        await wait(Math.min(220, 2.5 * 1000 / bot.speed));
        if (bot.epoch !== epoch) return;
        bot.reply = { ...bot.reply!, pending: false };
      }
      op({ k: "reply", r: replyOf(bot.reply) }); op({ k: "a", a: r.action });
      game.step(r.action);
      tele.step(world, r.action, "bot", bot.model.id);
    }
    played();
    if (++t % 50 === 0 || game.done) save();
    await wait(Math.max(0, (asleep && bot.speed <= 30 ? SLEEP_MS : 1000 / bot.speed) - (performance.now() - t0)));
  }
}
export const local = {
  // record.ts: start a recording (the whole engine as it is now, then every op from here on, to `sink`), or stop it
  async record(sink: ((o: EngineOp) => void) | null, won: ((k: number, secret: boolean) => void) | null = null): Promise<RecHead | null> {
    await boot();
    rec.sink = sink; rec.n = 0; rec.m = 0; rec.won = won;
    rec.beat = !!sink && game.state().achievements.includes(49);        // (beaten before it began: the portal is still secret)
    if (!sink) return null;
    encodeReset();
    return { version: cx.version, seed, snap: b64(game.save()), god: GOD, who: bot.control, bot: bot.control === "bot" ? bot.model.name : null,
             reply: bot.control === "bot" ? replyOf(bot.reply) : null };
  },
  // record.ts, playing one back (?replay): the recording's start, then its ops in order
  async replayStart(r: Recording) {
    await boot();
    if (r.version !== cx.version) console.warn(`recorded on engine ${r.version}, playing on ${cx.version}: it may not play out the same`);
    game.load(unb64(r.snap)); seed = r.seed; if (r.god) game.god?.(true);
    rec.who = r.who === "bot" ? "bot" : "human"; rec.bot = r.bot; decodeReset(); bot.reply = kept(r.reply || null); t++;
  },
  replayOp: applyOp,
  // main.ts enterPortal: the recording ends here, before the step onto the portal (step), or now (the bot walked in on its own)
  portalCut: (step?: boolean) => cutAt(step ? rec.m : rec.n),
  replayWhere: () => { const s = game.state(); return { level: s.level, boss: s.boss_progress }; },   // ("Play from here" on the Graveyard)
  replaySnap: () => ({ version: cx.version, seed, snap: b64(game.save()), reply: snapshot(bot.reply, shown() && sourceFor(shown()!)) }),   // (a trimmed recording's new start)
  // My Worlds on the start menu (main.ts): your worlds, newest first; open one; forget one
  async saves() {
    await boot(); save();
    let list = (await saves.all()).sort((a, b) => b.updated - a.updated);
    for (const r of list) if (r.done && r.id !== world) saves.del(r.id).catch(() => {});   // dead worlds kept by an older version
    list = list.filter((r) => !r.done);
    return list.map(({ snap, checkpoint, ...r }) => ({ ...r, current: r.id === world && !game.done, old: r.version !== cx.version }));
  },
  async open(id: string) { await boot(); const rec = await saves.get(id); if (!rec) throw new Error("that world is gone"); return enter(rec); },
  thumb(url: string | null) { thumb = url; },                                   // the world's picture, saved with it from the next save on
  async flush() { await boot(); save(); },                          // save now (the pause menu)
  async kill() { await boot(); tele.abandon(); return fresh(undefined, false); },  // end the world you're in; a new one takes its place
  async remove(id: string) { await boot(); if (id !== world) await saves.del(id); },
  async api(path: string, body?: object): Promise<unknown> {
    await boot();
    const u = new URL(path, location.origin), key = (body ? "POST " : "GET ") + u.pathname, f = routes[key] as (typeof routes)[string] | undefined;
    if (REPLAY && body && f && key !== "POST /api/available") throw new Error("This is a recording: it plays itself");
    if (!f) throw new Error(u.pathname.startsWith("/api/worlds")
      ? "bot worlds need a game server: pick one under Servers (P lets the bot play this one)" : "not available in the browser: " + u.pathname);
    try { return await f(body || {}, u.searchParams); }
    catch (e) { tele.track("api_error", { path: u.pathname, message: String((e as Error).message).slice(0, 200) }); throw e; }   // a bot that won't load lands here too
  },
};
