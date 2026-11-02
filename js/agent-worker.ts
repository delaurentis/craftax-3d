// The browser's bot, off the main thread: one model from public/models.json (the first is the default: Rekursiv priml 194, trained with rekursiv.ai's priml; MIT),
// run by one of craftax-agents' players (its ONNX file on onnxruntime-web, or its weights on the MinGRU player, on the GPU or the
// CPU): the page picks which (agent.ts) and sends it. Plays as bots/puffer162.py does: the engine's packed observation (cx_obs) and
// action mask in, the most likely allowed action out (or one drawn from the masked distribution when sampling). The model's memory
// starts at zero and is fed back each step; a model that reads the previous action (FORMAT.md) is given the action played last step,
// 43 (none) after a reset.
//   {type: "load", model, player, gpu} → {type: "ready", device}      {type: "reset"}      {type: "act", id, obs, mask, temp} → {type: "act", id, action, probs, value}
//   {type: "took", action}: the action played was another (yours, while it watched), not the one it picked
//   temp: 0 = greedy (the most likely allowed action, PufferLib's demo), else drawn from softmax(logits / temp)
// onnxruntime-web ships in public/agent/ort/ (its wasm beside it), loaded at run time (only by an ONNX player) rather than bundled.
// One message at a time, in order: a message posted while the model loads waits for it, never lost
import { PLAYERS, type Player, type PlayerSpec, type Tensor } from "craftax-agents";
import type { ActResult, ModelEntry } from "../src/core/types";

const N = 43;
// for the brain view: the busiest memory units of each layer (of the entry's `brain` output), by how much each one varies (a running
// mean and variance over the last few hundred steps), picked again every 128 steps, in two tiers: the busiest quarter (48 a layer
// for PufferLib's 4 × 1024: the brain in the panel) and the next three quarters (shown too when the panel is expanded: 192 a layer,
// or half the layer if it's smaller); a unit still near its tier's top keeps its place in the brain
const EMA = 1 / 256, PICK = 128;
interface Sampler { L: number; U: number; S: number; tiers: number[]; mean: Float32Array; vari: Float32Array; shown: number[]; steps: number }
let B: Sampler | null = null;                                        // { L layers, U units, S shown a layer, tiers, mean, vari, shown, steps }
function sampler(L: number, U: number): Sampler {
  const S = Math.min(192, U >> 1), t0 = Math.round(S / 4);
  return { L, U, S, tiers: [t0, S - t0], mean: new Float32Array(L * U), vari: new Float32Array(L * U), steps: 0,
           shown: Array.from({ length: L * S }, (_, i) => Math.floor(i / S) * U + Math.floor(((i % S) * U) / S)) };
}
function busiest(hd: ArrayLike<number>) {
  const { L, U, S, tiers, mean, vari, shown } = B!;
  for (let i = 0; i < hd.length; i++) { const d = hd[i] - mean[i]; mean[i] += EMA * d; vari[i] = (1 - EMA) * (vari[i] + EMA * d * d); }
  if (++B!.steps % PICK) return;
  for (let l = 0; l < L; l++) {
    let rank = Array.from({ length: U }, (_, j) => l * U + j).sort((a, b) => vari[b] - vari[a]), at = l * S;
    for (const n of tiers) {
      const top = new Set(rank.slice(0, n * 2)), slots = shown.slice(at, at + n);
      const keep = new Set(slots.filter((u) => top.has(u))), fresh = rank.slice(0, n * 2).filter((u) => !keep.has(u));
      slots.forEach((u, k) => { shown[at + k] = keep.has(u) ? u : fresh.shift()!; });
      const used = new Set(shown.slice(at, at + n));
      rank = rank.filter((u) => !used.has(u)); at += n;              // the next tier picks from what's left
    }
  }
}

let player: Player | null = null, model: ModelEntry | null = null, prev = 43;                 // prev: the action played last step, 43 = none (an episode start)
const ROOT = new URL(/* @vite-ignore */ "../", import.meta.url);

async function load(m: ModelEntry, spec: PlayerSpec, gpu: boolean) {
  if ((m.obs || "packed843") !== "packed843") throw new Error(`${m.name}: unknown observation "${m.obs}"`);
  const type = PLAYERS[spec.type];
  if (!type) throw new Error(`${m.name}: no player "${spec.type}" in this game`);
  // the player fetches its file itself: a copy of our own in memory (for a progress count) ran a phone out of memory, so a cached
  // file goes to it as a blob: URL (a blob stays on disk). The page shows a plain "Loading…" with a shimmering bar meanwhile
  player = await type.load(spec, m, { url: (f, s) => cached(m, s, new URL(f, ROOT).href), gpu, mobile: navigator.maxTouchPoints > 1,
                                      ortBase: new URL(/* @vite-ignore */ "../agent/ort/", import.meta.url).href });
  model = m; prev = 43; B = null;
}

// a registry model hosted elsewhere (Hugging Face, pinned to a commit: it never changes under its URL) is kept in the browser's Cache
// Storage under that URL, so picking it again, even on a later visit, downloads nothing (Hugging Face's download links are signed
// afresh each time, so the browser's own HTTP cache never hits). Kept only when its size is the one the registry gives; agent.ts
// drops copies the registry no longer names. Your own agents, local paths, or no Cache Storage (an insecure page): fetched as before
const CACHE = "craftax-models";                                       // agent.ts prunes it by the same name
async function cached(m: ModelEntry, spec: PlayerSpec, url: string) {
  if (m.mine || !/^https:/.test(url) || !self.caches) return url;
  const bytes = spec.bytes ?? (spec.file ? undefined : m.bytes);
  try {
    const c = await caches.open(CACHE);
    const r = await c.match(url);
    if (r) return URL.createObjectURL(await r.blob());
    const f = await fetch(url);
    if (!f.ok) return url;
    const b = await f.blob();
    if (!bytes || b.size === bytes) await c.put(url, new Response(b, { headers: { "content-type": "application/octet-stream" } })).catch(() => {});
    return URL.createObjectURL(b);
  } catch { return url; }
}

async function act({ obs, mask, temp }: { obs: Float32Array; mask: ArrayLike<boolean>; temp: number }) {
  const t0 = performance.now(), out = await player!.step(obs, prev), logits = out.logits, ms = performance.now() - t0;
  let best = 0, max = -Infinity;
  for (let i = 0; i < N; i++) if (mask[i] && logits[i] > max) { max = logits[i]; best = i; }
  const probs = new Float32Array(N); let sum = 0;
  const k = temp > 0 ? 1 / temp : 1;
  for (let i = 0; i < N; i++) if (mask[i]) sum += probs[i] = Math.exp((logits[i] - max) * k);
  for (let i = 0; i < N; i++) probs[i] /= sum;
  if (temp > 0) { let r = Math.random(); for (let i = 0; i < N; i++) if ((r -= probs[i]) <= 0 && mask[i]) { best = i; break; } }
  prev = best;                                                       // what it plays, as the next step's prev_action ("took" corrects it)
  // for the brain view (brain.ts): the policy's 51 self-sensing inputs (stats and inventory, the tail of the observation) and, if the
  // model names a brain output, the busiest units of that memory (192 of each of PufferLib's 4 layers, layer by layer, its busiest
  // 48 first) with its layout [layers, units a layer, the first tier]
  const sense = Array.from(obs.slice(obs.length - 51), (v) => Math.round(v * 1000) / 1000);
  const r: ActResult = { action: best, probs: Array.from(probs), value: out.value, sense, ms };
  const brain = model!.brain && out.outputs[model!.brain.output];
  if (brain) {
    const hd = brain.data, L = model!.brain!.layers || 1;
    if (!B || B.L * B.U !== hd.length) B = sampler(L, Math.floor(hd.length / L));
    busiest(hd);
    r.mem = B.shown.map((u) => Math.round(hd[u] * 1000) / 1000); r.memShape = [B.L, B.S, B.tiers[0]];
  }
  return r;
}

/** A saved memory tensor (getmem / setmem: as onnxruntime's tensors were saved, so a world saved before players still loads), and the last action played as one more item. */
type Saved = { type: "float32"; dims: readonly number[]; data: Float32Array } | { prev: number };
/** What the page sends (agent.ts). */
type Message = ({ type: "load"; model: ModelEntry; player: PlayerSpec; gpu: boolean } | { type: "reset" } | { type: "took"; action: number } | { type: "getmem"; id: number }
  | { type: "setmem"; mem: Saved[] } | { type: "act"; id: number; obs: Float32Array; mask: boolean[]; temp: number }) & { id?: number };
let queue = Promise.resolve();
onmessage = ({ data: m }: MessageEvent<Message>) => { queue = queue.then(() => handle(m)); };
async function handle(m: Message) {
  try {
    if (m.type === "load") { if (!player) await load(m.model, m.player, m.gpu); postMessage({ type: "ready", device: player!.device, note: player!.note }); }
    else if (m.type === "reset") { player!.reset(); prev = 43; }
    else if (m.type === "took") prev = m.action;
    // its memory out (saved with the world) and back in (a reload, the same agent, the same moment of the same world); the last
    // action played goes with it, as one more item {prev}
    else if (m.type === "getmem") postMessage({ type: "mem", id: m.id, mem: (player!.state.map((t) => ({ type: "float32", dims: t.dims, data: t.data.slice() })) as Saved[])
      .concat(player!.readsPrev ? [{ prev }] : []) });
    else if (m.type === "setmem") {
      const p = m.mem.find((t) => "prev" in t) as { prev: number } | undefined;
      player!.state = (m.mem.filter((t) => !("prev" in t)) as unknown as Tensor[]).map((t) => ({ dims: [...t.dims], data: Float32Array.from(t.data) }));
      prev = p ? p.prev : 43;
    }
    else if (m.type === "act") postMessage({ type: "act", id: m.id, ...(await act(m)) });
  } catch (e) { postMessage({ type: m.type === "act" ? "act" : "ready", id: m.id, error: String((e as Error)?.message || e) }); }
}
