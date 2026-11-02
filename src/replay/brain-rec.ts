// The bot's brain in a recording. Every bot move keeps its action and its five likeliest (top). With Settings → Agent → "Record
// brain activity" on, it also keeps what the brain panel draws, so a replay's brain moves as it did live: all the
// action probabilities, the memory units the panel shows (4-bit, layer by layer, only those that changed since the last move) and
// the senses that changed. A bot source with a picture of its own (the crystal) records and rebuilds that itself (BotSource.brain),
// with or without the setting. A recording holds changes, so a replay rebuilds the brain move by move from its start (as it does
// the game), and a trimmed recording starts from a whole one (snapshot()).
import type { BotReply } from "../core/types";
import type { BotSource, BrainCodec } from "../core/plugins";

const KEY = "craftax3d.brainRec";
/** Settings: record the brain's activity in replays (bigger files). Off unless switched on. */
export const brainRecOn = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
export const setBrainRec = (on: boolean) => { try { localStorage.setItem(KEY, on ? "1" : "0"); } catch {} };

/** A move's brain as a recording keeps it: the reply's own fields, and b (the panel's activity) and x (the bot source's own). */
export type KeptReply = BotReply & { b?: Kept; x?: unknown };
type Kept = { abs?: 1; p?: number[]; ms?: number[]; shape?: [number, number, number]; m?: number[]; s?: number[] };

const q7 = (v: number, top: number) => Math.max(-7, Math.min(7, Math.round((v / top) * 7)));
const tops = (mem: number[], [L, per]: [number, number, number]) =>
  Array.from({ length: L }, (_, l) => { let t = 1e-6; for (let i = l * per; i < (l + 1) * per && i < mem.length; i++) t = Math.max(t, Math.abs(mem[i])); return Number(t.toPrecision(3)); });

// ---- recording: what was last kept, so the next move keeps only what changed ----
let encM: number[] | null = null, encS: number[] | null = null, encFirst = true;
export function encodeReset() { encM = encS = null; encFirst = true; }
export function encode(r: BotReply | null, src: BotSource | null): KeptReply | null {
  if (!r) return null;
  const out: KeptReply = { action: r.action, top: r.top, value: r.value, note: r.note, pending: r.pending };
  const full = brainRecOn(), first = encFirst; encFirst = false;
  if (src?.brain?.record) { const x = src.brain.record(r, full, first); if (x !== undefined) out.x = x; }
  if (!full) return out;
  const b: Kept = {};
  if (r.probs) b.p = r.probs.map((p) => Math.round(p * 255));
  if (r.mem && r.memShape) {
    const ms = tops(r.mem, r.memShape), q = r.mem.map((v, i) => q7(v, ms[Math.min(ms.length - 1, Math.floor(i / r.memShape![1]))]));
    b.ms = ms;
    if (!encM || encM.length !== q.length) { b.shape = r.memShape; b.abs = 1; b.m = q; }
    else { const d: number[] = []; q.forEach((v, i) => { if (v !== encM![i]) d.push(i, v); }); if (d.length) b.m = d; }
    encM = q;
  }
  if (r.sense) {
    const s = r.sense.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
    if (!encS || encS.length !== s.length) b.s = [-1, ...s];             // (-1 first: the whole list)
    else { const d: number[] = []; s.forEach((v, i) => { if (v !== encS![i]) d.push(i, v); }); if (d.length) b.s = d; }
    encS = s;
  }
  out.b = b;
  return out;
}

// ---- replaying: the brain as it stands, rebuilt from the changes ----
let decM: number[] | null = null, decMs: number[] = [], decShape: [number, number, number] | null = null, decS: number[] | null = null, decFirst = true;
export function decodeReset() { decM = decS = null; decMs = []; decShape = null; decFirst = true; }
/** A kept move back to a reply the brain panel draws, and (src.brain) the source's own part, which may come a moment later. */
export function decode(k: KeptReply | null, src: BotSource | null, ctx: Omit<Parameters<BrainCodec["replay"]>[1], "first">): { reply: BotReply | null; later: Promise<Partial<BotReply>> | null } {
  if (!k) return { reply: null, later: null };
  const { b, x, ...r } = k, reply: BotReply = { ...r };
  if (b) {
    if (b.p) reply.probs = b.p.map((v) => v / 255);
    if (b.shape) decShape = b.shape;
    if (b.ms) decMs = b.ms;
    if (b.m) { if (b.abs || !decM) decM = b.m.slice(); else for (let i = 0; i < b.m.length; i += 2) decM[b.m[i]] = b.m[i + 1]; }
    if (b.s) { if (b.s[0] === -1 || !decS) decS = b.s.slice(1); else for (let i = 0; i < b.s.length; i += 2) decS[b.s[i]] = b.s[i + 1]; }
    if (decM && decShape) { const per = decShape[1]; reply.mem = decM.map((q, i) => (q / 7) * (decMs[Math.min(decMs.length - 1, Math.floor(i / per))] ?? 1)); reply.memShape = decShape; }
    if (decS) reply.sense = decS.map((v) => v / 255);
  }
  const first = decFirst; decFirst = false;
  let later: Promise<Partial<BotReply>> | null = null;
  if (src?.brain) { const extra = src.brain.replay({ ...reply, x }, { ...ctx, first }); if (extra instanceof Promise) later = extra; else Object.assign(reply, extra); }
  return { reply, later };
}
/** decode(), its later part added to the reply once it comes (changed: the game's state is new). */
export function replayReply(k: KeptReply | null, src: BotSource | null, ctx: Omit<Parameters<BrainCodec["replay"]>[1], "first">, changed: () => void): BotReply | null {
  const { reply, later } = decode(k, src, ctx);
  if (later) later.then((x) => { Object.assign(reply!, x); changed(); }, (e) => console.warn("[craftax-3d] the brain's picture in a replay:", e));
  return reply;
}
/** The brain as it stands now, as a whole (not changes): a trimmed recording's first move. */
export function snapshot(r: BotReply | null, src: BotSource | null): KeptReply | null {
  if (!r) return null;
  const out: KeptReply = { action: r.action, top: r.top, value: r.value, note: r.note, pending: r.pending };
  const x = src?.brain?.snapshot?.(); if (x !== undefined) out.x = x;
  if (decM || decS || r.probs) {
    out.b = { abs: 1, ...(r.probs ? { p: r.probs.map((p) => Math.round(p * 255)) } : {}), ...(decM && decShape ? { m: decM.slice(), ms: decMs, shape: decShape } : {}), ...(decS ? { s: [-1, ...decS] } : {}) };
  }
  return out;
}
