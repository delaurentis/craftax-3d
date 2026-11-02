// The browser's bots (agent-worker.ts runs one): the playable models are listed in public/models.json (the first is the default); each
// loads lazily in a worker of its own, only once picked, and the one it replaces keeps playing until it's ready.
//   const models = await loadModels();   const bot = await loadAgent(models[0]);   bot.reset();
//   const { action, probs, value } = await bot.act(game.obs(), game.mask(), 0);   bot.close();   // close: the worker goes
import { listed, type BotSource } from "../src/core/plugins";
import type { ActResult, Agent, ModelEntry } from "../src/core/types";
import { fileOf, gpuChoice, gpuDefault, pick, playersOf, runsHere, TYPES, type PlayerSpec } from "craftax-agents/players";
const ROOT = new URL(/* @vite-ignore */ "../", import.meta.url);                       // web/: a model's `onnx` is relative to it (or an absolute URL)
let models: Promise<ModelEntry[]> | null = null;
const loading = new Map<string, Promise<Agent>>(), here = new Map<string, Promise<boolean>>();
// other kinds of bot come from plugins (src/core/plugins.ts, the "bot" list: a crystal player, say): their models are listed
// after the registry's, and each runs in its plugin's own worker
export const sourceFor = (m: ModelEntry | null | undefined): BotSource | null => (m && m.kind ? listed("bot").find((b) => b.kind === m.kind) || null : null);
export const loadModels = (): Promise<ModelEntry[]> => (models ??= Promise.all([fetch(new URL("models.json", ROOT)).then((r) => r.json() as Promise<{ models: ModelEntry[] }>),
  ...listed("bot").map((b) => (b.models(ROOT) as Promise<ModelEntry[]>).catch(() => []))])
  .then(([j, ...more]) => {
    // a registry entry of another kind plays only when a plugin runs that kind (which may fill in its details: prepare)
    // and one for computers only (its players all "on": "desktop") isn't offered on a phone or tablet
    const reg = j.models.filter((m) => runsHere(m)).flatMap((m) => { if (!m.kind) return [m]; const s = sourceFor(m); return s ? [s.prepare ? s.prepare(m, ROOT) as ModelEntry : m] : []; });
    const all = [...reg, ...(more as ModelEntry[][]).flat()]; prune(all); return all;
  })
  .catch((e) => { models = null; throw e; }));
// which of craftax-agents' players runs a registry model here (its ONNX file on a computer, say, its MinGRU player on a phone: the
// registry's `players`); ?player=<type> tries that one wherever the model lists it (a test). A plugin bot runs in its own worker
const forced = new URLSearchParams(location.search).get("player");
export const playerFor = (m: ModelEntry): PlayerSpec | null => m.kind ? null
  : (forced && TYPES[forced] && playersOf(m).find((p) => p.type === forced)) || pick(m);
// the file a model loads: its player's, or a plugin bot's own file
const src = (m: ModelEntry) => { const p = playerFor(m); return (p ? fileOf(p, m) : m.onnx || m.file) || m.onnx || m.file!; };
// agent-worker.ts keeps each hosted model it downloads in Cache Storage under its URL: drop the ones the registry no longer names
// (a model moved to a new commit or file), so only the models on offer take space
const CACHE = "craftax-models";
const prune = (ms: ModelEntry[]) => self.caches?.open(CACHE).then(async (c) => {
  const keep = new Set(ms.flatMap((m) => [src(m), ...playersOf(m).map((p) => fileOf(p, m))]).filter((f): f is string => !!f).map((f) => new URL(f, ROOT).href));
  for (const r of await c.keys()) if (!keep.has(r.url)) await c.delete(r);
}).catch(() => {});
// a registry model that won't load: hosted (https) ones are a network or host problem, local paths (agent/…) need building
// (a plugin's prepare() makes its own files' paths absolute on this page's origin: those are missing files, not a connection)
export const buildHint = (m: ModelEntry): string => /^https?:/.test(src(m)) && new URL(src(m)).origin !== location.origin ? "couldn't reach " + new URL(src(m)).host + ": check your connection"
  : sourceFor(m)?.hint ? sourceFor(m)!.hint!(m) : "export it with craftax-agents (see its README)";
// your own agents (the bot panel's "Test your agent"): a link to an ONNX file in the playable format (craftax-agents' FORMAT.md),
// kept in this browser's localStorage; its memory tensors are read off the model itself (each input X but obs comes back as X_out)
export const REPO = "https://github.com/delaurentis/craftax-agents";       // where the format, the checker and the registry live
const MINE = "craftax3d.myAgents";
const readMine = (): ModelEntry[] => { try { return JSON.parse(localStorage.getItem(MINE) || "[]"); } catch { return []; } };
const writeMine = (l: ModelEntry[]) => { try { localStorage.setItem(MINE, JSON.stringify(l)); } catch {} };
export const myAgents = {
  list: () => readMine(),
  add(url: string, name: string, extra: Record<string, unknown> = {}) {                                     // extra: by, license, source, score from the Add your agent window
    const u = new URL(url, location.href).href, file = decodeURIComponent(u.split(/[?#]/)[0].split("/").pop() || "agent");
    let h = 0; for (const ch of u) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const m: ModelEntry = { id: "my-" + (h >>> 0).toString(36), name: name || file.replace(/\.onnx$/i, ""), about: "your agent · " + new URL(u).host,
                by: "you", onnx: u, obs: "packed843", mine: true };
    for (const k of ["about", "by", "license", "source", "score"] as const) if (extra[k]) m[k] = String(extra[k]).slice(0, 200);
    writeMine([...readMine().filter((x) => x.id !== m.id), m]);
    return m;
  },
  remove(id: string) { writeMine(readMine().filter((x) => x.id !== id)); },
};
// is the model's .onnx there? (a HEAD: nothing downloads; asked once a model; your own are just tried when picked: a host's CORS may
// refuse a HEAD it would let a GET through). An HTML answer is a missing file: the dev server (and a host with a page fallback)
// sends index.html with a 200 for any path, and the model then failed to load with a JSON parse error instead of its hint
export const available = (m: ModelEntry): Promise<boolean> => m.mine ? Promise.resolve(true) : (here.has(m.id) ? here.get(m.id)!
  : here.set(m.id, (self.caches ? caches.open(CACHE).then((c) => c.match(new URL(src(m), ROOT).href)).catch(() => null) : Promise.resolve(null))
    .then((hit) => hit ? true : fetch(new URL(src(m), ROOT), { method: "HEAD" })
      .then((r) => (r.ok && !/text\/html/i.test(r.headers.get("content-type") || "")) || r.status === 405, () => false))).get(m.id)!);

type Waiter = { resolve: (r: never) => void; reject: (e: Error) => void };
// Settings → Agent, "Run on the GPU" (Pete): shown for an agent whose player can run on either (the MinGRU player). Each agent's
// starts as its registry entry says for this kind of device, and keeps what the player picks for it. Switched while the agent
// plays, it moves across with its memory, playing on
const GPU = "craftax3d.agentGpu";
const gpuPicks = (): Record<string, boolean> => { try { return JSON.parse(localStorage.getItem(GPU) || "{}"); } catch { return {}; } };
export const gpuOption = (m: ModelEntry | null | undefined): boolean => !!m && gpuChoice(playerFor(m));
export const agentGpu = (m: ModelEntry): boolean => gpuOption(m) && (gpuPicks()[m.id] ?? gpuDefault(playerFor(m)));   // (no choice offered: never the GPU)
/** Where each loaded agent runs ("gpu" or "cpu"), by id: the player may fall back to the CPU. */
export const agentDevice = new Map<string, string>();
/** How long each loaded agent takes to think a move (ms, a running average), by id: Settings shows it beside the GPU choice. */
export const agentMs = new Map<string, number>();
/** Why a loaded agent runs where it does, when it isn't where it was asked (the GPU didn't start: its error, short), by id. */
export const agentNote = new Map<string, string>();
const live = new Map<string, () => Promise<void>>();                         // each loaded agent's move to the other device
export function setAgentGpu(m: ModelEntry, on: boolean): Promise<void> {
  const all = gpuPicks(); all[m.id] = on;
  try { localStorage.setItem(GPU, JSON.stringify(all)); } catch {}
  return live.get(m.id)?.() ?? Promise.resolve();
}
export function loadAgent(m: ModelEntry): Promise<Agent> {
  if (loading.has(m.id)) return loading.get(m.id)!;
  const p = (async (): Promise<Agent> => {
    if (!(await available(m))) throw new Error(`${m.name} isn't available: ${buildHint(m)}`);
    const own = sourceFor(m), waiting = new Map<number, Waiter>();
    let next = 0;
    // a worker with the model loaded, answering through `waiting`; limit: given up on (and stopped) after that many ms
    const start = (limit = 0) => new Promise<Worker>((resolve, reject) => {
      const w = own ? own.worker(m) : new Worker(new URL("./agent-worker.ts", import.meta.url), { type: "module" });
      const late = limit ? setTimeout(() => { w.terminate(); dispatchEvent(new CustomEvent("cx-model-progress", { detail: { name: m.name, done: true } })); reject(new Error(`${m.name} took too long to switch`)); }, limit) : 0;
      // (a reply from the worker: ready, or the answer to request `id`)
      w.onmessage = ({ data: r }: MessageEvent<{ type: string; id?: number; error?: string; device?: string; note?: string }>) => {
        if (r.type === "ready") clearTimeout(late);
        if (r.type === "ready" && r.device && !r.error) { agentDevice.set(m.id, r.device); agentNote.set(m.id, r.note || ""); }
        if (r.type === "ready") { dispatchEvent(new CustomEvent("cx-model-progress", { detail: { name: m.name, done: true } })); return r.error ? (w.terminate(), reject(new Error(r.error))) : resolve(w); }
        const x = waiting.get(r.id!); waiting.delete(r.id!);
        if (x) r.error ? x.reject(new Error(r.error)) : x.resolve(r as never);
      };
      w.onerror = (e) => { e.preventDefault(); clearTimeout(late); w.terminate(); dispatchEvent(new CustomEvent("cx-model-progress", { detail: { name: m.name, done: true } })); reject(new Error(`${m.name} didn't load: ${buildHint(m)}`)); };
      dispatchEvent(new CustomEvent("cx-model-progress", { detail: { name: m.name } }));   // the page shows "Loading…" until ready
      w.postMessage({ type: "load", model: m, player: playerFor(m), gpu: agentGpu(m) });
    });
    let worker = await start();
    // the GPU setting switched: a new worker on the other device, given this one's memory; the old one answers what it was asked, then goes
    if (!own && gpuOption(m)) live.set(m.id, async () => {
      const mem = await ask<{ mem: unknown[] }>({ type: "getmem" }).then((r) => r.mem), fresh = await start(30000), old = worker;   // (the GPU gives way to the CPU within seconds, craftax-agents mingru/gpu.ts: this is the backstop)
      fresh.postMessage({ type: "setmem", mem }); worker = fresh; agentMs.delete(m.id);
      const end = performance.now() + 3000, bye = () => (waiting.size && performance.now() < end ? setTimeout(bye, 50) : old.terminate()); bye();
    });
    const ask = <T,>(msg: Record<string, unknown>) => { const id = ++next; return new Promise<T>((resolve, reject) => { waiting.set(id, { resolve, reject } as Waiter); worker.postMessage({ ...msg, id }); }); };
    return {
      ...m,
      reset() { worker.postMessage({ type: "reset" }); },
      getMemory() { return ask<{ mem: unknown[] }>({ type: "getmem" }).then((r) => r.mem); },   // a copy of its memory tensors (saved with the world)
      setMemory(mem: unknown[]) { worker.postMessage({ type: "setmem", mem }); },
      took(action: number) { worker.postMessage({ type: "took", action }); },  // the action played was another (yours): its next prev_action
      act(obs: ArrayLike<number>, mask: ArrayLike<boolean>, temp: number) {
        return ask<ActResult>({ type: "act", obs, mask, temp }).then((r) => { if (r.ms != null) { const was = agentMs.get(m.id); agentMs.set(m.id, was == null ? r.ms : was * 0.9 + r.ms * 0.1); } return r; });
      },
      close() {                                                      // switched away: a move still being thought about is dropped
        loading.delete(m.id); live.delete(m.id); agentDevice.delete(m.id); agentMs.delete(m.id); worker.terminate();
        for (const w of waiting.values()) w.reject(new Error("the bot was switched")); waiting.clear();
      },
    };
  })().catch((e) => { loading.delete(m.id); throw e; });
  loading.set(m.id, p);
  return p;
}
