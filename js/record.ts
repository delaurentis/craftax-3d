// Recordings: a stretch of a game saved to a file (.cxreplay; .cxrec before 2026-10-24) and played back, trimmed and re-shot in replay.html, or embedded in a
// page (replay.html?src=…&embed). The engine is deterministic (local.ts), so a recording is the engine's whole state where it began
// (an 84 KB snapshot), every op made to it after (a step, a bot move, a heart lost at lava's edge: local.ts `op`), each at its time,
// and the camera as you held it (the view, the look, where you faced, the hotbar slot, the lit square) ten times a second.
// A replay is the same game page (index.html?replay) loading that snapshot and applying the same ops at the same times, with the
// camera put back from the track, or from the edit keys replay.html lays over it (from a key on: this view and look, this camera)
//
// The file: gzipped JSON (plain JSON loads too)
//   { format: "craftax-recording", v: 1, created, dur (ms), device: { w, h, dpr, touch, phone },
//     version (the engine's), seed, snap (base64), god, who ("human" | "bot"), bot, reply,
//     ops: [{ t, k, … }],  cam: [[t, …CAM]],  edits: { in, out, keys: [{ t, mode, look, yaw, pitch, orbit, el } | { t, rec: true }] } }
import { local } from "./local";

import { service } from "../src/core/plugins";
import type { Cam, CamKey, CamRow, RecHead, RecOp, Recording, UiOp } from "../src/core/types";
export const FORMAT = "craftax-recording";
export const GAME = new URL(/* @vite-ignore */ "../", import.meta.url);                 // the game's folder (replay.html is also served at /replay/)
export const CAM = ["yaw", "pitch", "mode", "look", "orbit", "el", "sel", "aim", "theme"];   // a camera sample after its time (aim: [x, z, top, lo, on] or 0; theme: its id, null Standard)
const clock = () => performance.now();
const r3 = <T>(x: T) => (typeof x === "number" ? Math.round(x * 1e3) / 1e3 : x);

// ---------- the file ----------
export async function encode(r: Recording) {
  const json = new Blob([JSON.stringify(r)], { type: "application/json" });
  if (typeof CompressionStream === "undefined") return json;
  return new Response(json.stream().pipeThrough(new CompressionStream("gzip"))).blob();
}
export async function decode(data: Blob | ArrayBuffer): Promise<Recording> {
  let buf = data instanceof Blob ? await data.arrayBuffer() : data;
  const b = new Uint8Array(buf);
  if (b[0] === 0x1f && b[1] === 0x8b) buf = await new Response(new Blob([b]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer();
  const r = JSON.parse(new TextDecoder().decode(buf));
  if (r.format !== FORMAT) throw new Error("not a Craftax recording");
  r.edits ??= { in: 0, out: null, keys: [] };
  return r;
}
export const fileName = (r: Recording) => {
  const d = new Date(r.created || Date.now()), p = (n: number) => String(n).padStart(2, "0");
  return `craftax-${r.seed}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.cxreplay`;
};
export async function download(r: Recording, name = fileName(r)) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(await encode(r)), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

// ---------- shared: put somewhere public for an embed or a link (replay.html's Embed), by the plugin that provides the
// "replayStore" service (src/core/plugins.ts); with none, the replay page offers the file only. r: the recording as it will be
// shared (trimmed); resolves { id, url } ----------
export const shareHost = () => service("replayStore")?.label || null;
export async function share(r: Recording, onStep: (step: "asking" | "uploading" | "checking") => void = () => {}) {
  const store = service("replayStore");
  if (!store) throw new Error("this copy of the game has nowhere to put a recording: save it as a file instead");
  return store.share(await encode(r), onStep);
}

// ---------- kept in this browser: a stopped recording waits here (IndexedDB, this site's) for the replay page, which plays it,
// keeps its trims and camera keys, and saves it as a file ----------
let kdb: Promise<IDBDatabase> | null = null;
const kopen = () => (kdb ??= new Promise((ok, fail) => {
  const r = indexedDB.open("craftax3d-recordings", 1);
  r.onupgradeneeded = () => r.result.createObjectStore("recs", { keyPath: "id" });
  r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
}));
// any: a request's result is whatever the store holds (recordings, or a key)
const ktx = async (mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest): Promise<any> => {
  const d = await kopen();
  return new Promise((ok, fail) => { const tx = d.transaction("recs", mode), q = f(tx.objectStore("recs")); tx.oncomplete = () => ok(q.result); tx.onerror = () => fail(tx.error); });
};
export const kept = {
  put: (r: Recording) => ktx("readwrite", (s) => s.put(r)),
  get: (id: string): Promise<Recording | undefined> => ktx("readonly", (s) => s.get(id)),
  all: async (): Promise<Recording[]> => (await ktx("readonly", (s) => s.getAll()) as Recording[]).sort((a, b) => (a.created < b.created ? 1 : -1)),
  del: (id: string) => ktx("readwrite", (s) => s.delete(id)),
};

// ---------- recording (in the game) ----------
/** A recording being made: its start, ops and camera so far, the camera row held still, where it's cut for the ending. */
interface Recorder {
  t0: number; head: RecHead | null; ops: RecOp[]; cam: CamRow[]; device: unknown; at: number; last: string; held: CamRow | null;
  cut?: number; secret?: boolean; brain?: string; dur?: number;
}
let R: Recorder | null = null;                                        // { t0, head, ops, cam, device, at }
export const recorder = {
  get on() { return !!R; },
  elapsed: () => (R ? clock() - R.t0 : 0),
  // onEnd: the game reached its ending (local.ts endingGuard), and the recording is cut just before the move that did it
  async start(device: unknown, onEnd?: () => void) {
    const t0 = clock(), ops: RecOp[] = [];
    const at: number[] = [];                                                    // (local's op k is ops[at[k]]: ui ops sit between them)
    const head = await local.record((o) => { at.push(ops.length); ops.push({ t: Math.round(clock() - t0), ...o }); },
      (k, secret) => { if (R) { R.cut = k < at.length ? at[k] : ops.length; R.secret = !!secret; } onEnd?.(); });
    R = { t0, head, ops, cam: [], device, at: -1e9, last: "", held: null };
  },
  // main.ts, every frame: kept every 100 ms, to 3 decimals, and only when it changed (a camera held still costs nothing: the row
  // it held is written again just before the next change, so playback doesn't ease across the pause). The camera is most of a
  // recording: this way 10 minutes is ~40-60 KB of it, not ~180 (2026-10-23)
  // what the game shows that the engine doesn't keep (main.ts: hanging over the lava, letting go, the scorch), as `ui` ops
  ui(o: Omit<UiOp, "k">) { if (R) R.ops.push({ t: Math.round(clock() - R.t0), k: "ui", ...o }); },
  // main.ts, every frame: the bot's brain panel as the screen shows it ("hidden", "small", "big"), kept when it changes, so a replay
  // shows the brain where the recording did (Pete)
  brain(st: string) { if (R && st !== R.brain) { R.brain = st; this.ui({ e: "brain", d: st }); } },
  sample(c: Cam) {
    if (!R) return;
    const t = clock() - R.t0;
    if (t - R.at < 100) return;
    R.at = t;
    const row = CAM.map((k) => (k === "aim" && c.aim ? (c.aim as number[]).map(r3) : r3(c[k as keyof Cam]))) as (number | string | number[] | null)[], key = JSON.stringify(row);
    if (key === R.last) { R.held = [Math.round(t), ...row]; return; }
    if (R.held) R.cam.push(R.held);
    R.held = null; R.last = key;
    R.cam.push([Math.round(t), ...row]);
  },
  async stop(): Promise<Recording | null> {
    if (!R) return null;
    await local.record(null);
    const r = R; R = null;
    if (r.held) r.cam.push(r.held);                                   // (held still to the end)
    // cut for no spoilers (local.ts endingGuard): nothing from op `cut` on; it ends where the cut is, or now if nothing came after it
    const end = r.cut == null ? null : r.cut < r.ops.length ? r.ops[r.cut].t : Math.round(clock() - r.t0);
    if (end !== null) { r.ops.length = Math.min(r.ops.length, r.cut!); r.cam = r.cam.filter((c) => c[0] < end); r.dur = end; }
    return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), format: FORMAT, v: 1, created: new Date().toISOString(), dur: r.dur ?? Math.round(clock() - r.t0), device: r.device, ...r.head!,
             ops: r.ops, camCols: CAM, cam: r.cam, edits: { in: 0, out: null, keys: [] }, ...(r.secret ? { secret: true } : {}) };
  },
};

// ---------- playing one back (in the game, ?replay; replay.html drives it as window.cxReplay) ----------
const lerpAngle = (a: number, b: number, k: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
const BLEND = 1500, ease = (x: number) => x * x * (3 - 2 * x);                 // (keyframes: camAt)
// First person is always the player's own eyes (Pete: a keyframe's held camera, or one recorded in 3/4, had him drinking with his back
// to the water): the camera as it was recorded wherever the recording was in first person then, else the way the player faces
// (yaw null: main.ts turns to their direction)
const firstPerson = (c: Cam | null, rc: Cam | null): Cam | null => (!c || c.mode !== 0 ? c : rc && rc.mode === 0 ? { ...c, yaw: rc.yaw, pitch: rc.pitch, aim: rc.aim } : { ...c, yaw: null, pitch: -0.15, aim: 0 });
const sampleAt = (cam: CamRow[], i: number) => Object.fromEntries(CAM.map((k, j) => [k, cam[i][j + 1]])) as unknown as Cam;
/** What a replay (main.js, replay.html) hears from the player: load, seek, play, pause, tick, end. */
type Listener = (what: string, p: Player) => void;
/** The replay player (window.cxReplay): the recording, where it is, and what the game page hangs on it (main.js). */
export interface Player {
  rec: Recording | null; t: number; playing: boolean; rate: number; loop: boolean; free: boolean; aim: unknown; woke: number;
  oi: number; ci: number; last: number; busy: Promise<void> | null; listeners: Set<Listener>; cutNext?: boolean;
  brains?: { rec: Recording; ch: [number, string | null, string?][]; has: boolean; first: string };
  readonly start: number; readonly end: number;
  wake(): void; still(now: number): boolean; on(f: Listener): () => boolean; emit(what: string): void; load(r: Recording): Promise<void>;
  seek(ms: number): Promise<void>; play(): void; pause(): void; frame(now: number): Cam | null; recCam(t: number): Cam | null;
  camAt(t: number): Cam | null; camKeyed(t: number): Cam | null; brainAt(t: number): string; recBrainAt(t: number): string;
  handoff(): Promise<{ version: string; seed: number; snap: string } | null>; trimmed(): Promise<Recording>;
  // set by the game page (main.ts) for replay.html
  onUi?: (o: Omit<UiOp, "k">, live: boolean) => void;
  camNow?: () => Cam;
  look?: (mode: number, look: string) => void;
  /** T on the replay page: the next theme (back: the one before), as T in the game. */
  theme?: (back: boolean) => void;
  /** A theme's name by its id (null: Standard), for the keyframes' labels. */
  themeName?: (id: string | null | undefined) => string;
  /** The themes installed in the game, Standard first, in T's order (the side's theme menu). */
  themeList?: () => { id: string | null; label: string; icon?: string }[];
  /** Show this theme now, with its transition (the side's theme menu; drawing only, the player's own choice untouched). */
  setTheme?: (id: string | null) => void;
  shot?: () => void;
  film?: { canvas: HTMLCanvasElement; world: unknown; begin(sec: number): void; to(sec: number): void; end(): void };
  sound?: (v: number) => void;
  show?: (o?: Record<string, boolean>) => void;
}
export const player: Player = {
  rec: null, t: 0, playing: false, rate: 1, loop: false, free: false, aim: null, woke: 0,
  // paused, the picture holds still (Pete: pause didn't): main.ts stops drawing, mobs, water and clouds included, once whatever a seek
  // or a change of view set going has settled (`wake`: draw on a while, ~0.8 s). Setting a keyframe (free) always draws
  wake() { this.woke = performance.now(); },
  still(now: number) { return !!this.rec && !this.playing && !this.free && !this.busy && now - this.woke > 800; },
  oi: 0, ci: 0, last: 0, busy: null, listeners: new Set(),
  get start() { return this.rec ? this.rec.edits.in || 0 : 0; },
  get end() { return this.rec ? this.rec.edits.out ?? this.rec.dur : 0; },
  on(f: Listener) { this.listeners.add(f); return () => this.listeners.delete(f); },
  emit(what: string) { for (const f of this.listeners) f(what, this); },
  async load(r: Recording) { this.rec = r; this.playing = false; await this.seek(this.start); this.emit("load"); },
  // to `ms`: the recording's start again, and every op up to then (the engine runs thousands of steps in a few milliseconds)
  seek(ms: number) {
    return (this.busy = (async () => {
      const r = this.rec!;
      await local.replayStart(r);
      this.oi = 0; this.ci = 0; this.t = Math.max(0, Math.min(ms, r.dur));
      let hang: UiOp | null = null;
      while (this.oi < r.ops.length && r.ops[this.oi].t <= this.t) {
        const o = r.ops[this.oi++];
        if (o.k === "ui") { if (o.e === "hang" || o.e === "letgo") hang = o; } else local.replayOp(o);
      }
      this.onUi?.(hang && hang.e === "hang" ? hang : { e: "letgo" }, false);   // (hanging at this moment, or not)
      this.busy = null; this.wake(); this.cutNext = true; this.emit("seek");   // (main.ts: the view and look jump, no transition)
    })());
  },
  play() { if (!this.rec) return; if (this.t >= this.end - 1) this.seek(this.start); this.playing = true; this.last = 0; this.emit("play"); },
  pause() { this.playing = false; if (!this.busy) this.woke = 0; this.emit("pause"); },   // (the picture stops at once, mid-step: no settling on)
  // main.ts, every frame: the clock on, the ops now due, and the camera for this moment (null: none loaded, or seeking)
  frame(now: number) {
    if (!this.rec || this.busy) return null;
    const dt = this.last ? now - this.last : 0; this.last = now;
    if (this.playing) {
      this.t += dt * this.rate;
      if (this.t >= this.end) {
        if (this.loop) { this.seek(this.start); return null; }
        this.t = this.end; this.pause(); this.emit("end");
      }
    }
    const ops = this.rec.ops;
    while (this.oi < ops.length && ops[this.oi].t <= this.t) { const o = ops[this.oi++]; if (o.k === "ui") this.onUi?.(o, true); else local.replayOp(o); }
    this.emit("tick");
    return this.camAt(this.t);
  },
  // the recorded camera at t (between two samples: the angles eased, the rest the earlier one's), under the edit key in force then
  recCam(t: number) {
    const cam = this.rec!.cam;
    if (!cam.length) return null;
    let i = Math.min(this.ci, cam.length - 1);
    if (cam[i][0] > t) i = 0;
    while (i + 1 < cam.length && cam[i + 1][0] <= t) i++;
    this.ci = i;
    const a = sampleAt(cam, i);
    if (i + 1 < cam.length) {
      const b = sampleAt(cam, i + 1), k = Math.max(0, Math.min(1, (t - cam[i][0]) / (cam[i + 1][0] - cam[i][0] || 1)));
      if (a.mode === b.mode) for (const f of ["yaw", "pitch", "orbit"] as const) a[f] = lerpAngle(a[f]!, b[f]!, k);
      if (a.mode === b.mode) a.el += (b.el - a.el) * k;
    }
    return a;
  },
  // Keyframes (replay.html): each sets the view and the look from its moment on, and, if you framed it by hand (`fixed`), the camera;
  // a keyframe that didn't touch the camera keeps the recorded one. Between two keyframes the camera glides (Pete): over the whole
  // gap when both hold a camera, else over the last BLEND ms before the next one; a change of view happens at the keyframe itself
  // (the game animates it). Keys from before keyframes (`rec: true`, "the recorded camera from here") still play: no view, no camera
  camAt(t: number) { return firstPerson(this.camKeyed(t), this.recCam(t)); },
  camKeyed(t: number) {
    const rc = this.recCam(t), keys = this.rec!.edits.keys;
    if (!rc || !keys.length) return rc;
    let i = -1;
    while (i + 1 < keys.length && keys[i + 1].t <= t) i++;
    const a = keys[i] || null, b = keys[i + 1] || null;
    const camOf = (k: CamKey | null): Cam => (!k ? rc : { ...rc, mode: k.mode ?? rc.mode, look: k.look ?? rc.look, theme: k.theme !== undefined ? k.theme : rc.theme,
      ...(k.fixed ? { yaw: k.yaw!, pitch: k.pitch!, orbit: k.orbit!, el: k.el!, aim: 0 as const } : {}) });
    const A = camOf(a);
    if (!b) return A;
    const B = camOf(b), gap = b.t - (a ? a.t : 0), w = a && a.fixed && b.fixed ? gap : Math.min(BLEND, gap);
    const u = (t - (b.t - w)) / (w || 1);
    if (u <= 0 || A.mode !== B.mode) return A;
    const k = ease(Math.min(1, u));
    return { ...A, yaw: lerpAngle(A.yaw!, B.yaw!, k), pitch: A.pitch + (B.pitch - A.pitch) * k, orbit: lerpAngle(A.orbit, B.orbit, k),
             el: A.el + (B.el - A.el) * k, aim: k < 0.5 ? A.aim : B.aim };
  },
  // the bot's brain at t (replay.html): "hidden", "small" or "big", as the last keyframe that set it says; until one does, as the
  // recording showed it then (its `brain` ui ops), or for a recording from before those, shown while the bot played (Pete)
  brainAt(t: number) {
    let b: string | null = null;
    for (const k of this.rec!.edits.keys) { if (k.t > t) break; if (k.brain) b = k.brain; }
    return b || this.recBrainAt(t);
  },
  recBrainAt(t: number) {
    const r = this.rec!;
    if (this.brains?.rec !== r) {                                       // (once per recording: its brain and who changes, in order)
      const ch: [number, string | null, string?][] = [], fall = (who?: string) => (who === "bot" ? "small" : "hidden");
      let has = false, who = r.who;
      for (const o of r.ops) {
        if (o.k === "ui" && o.e === "brain") { has = true; ch.push([o.t, o.d as string]); } else if (o.k === "who") { who = o.who; ch.push([o.t, null, fall(who)]); }
      }
      this.brains = { rec: r, ch, has, first: fall(r.who) };
    }
    const B = this.brains;
    let b: string | null = B.has ? null : B.first;
    for (const [at, d, guess] of B.ch) { if (at > t) break; if (B.has) { if (d) b = d; } else if (guess) b = guess; }
    return b || (B.has ? "hidden" : B.first);
  },
  // "Play from here" (replay.html): paused, the engine exactly as it stands at this moment
  // On the Graveyard (Pete): only from its beginning, the moment this recording arrived there, never mid-fight; a recording that
  // begins on the Graveyard gives its own start, if the necromancer is still unhurt then (null: nowhere to start from)
  async handoff() {
    this.pause();
    if (local.replayWhere().level !== 8) return local.replaySnap();
    const r = this.rec!, at = this.t;
    await local.replayStart(r);
    let w = local.replayWhere();
    for (let i = 0; w.level !== 8 && i < r.ops.length; i++) { local.replayOp(r.ops[i]); w = local.replayWhere(); }
    const h = w.level === 8 && w.boss === 0 ? local.replaySnap() : null;
    await this.seek(at);
    return h;
  },
  // a new recording from in to out: its start the engine as it stood at `in` (the ops before it applied), the rest moved back by `in`
  async trimmed() {
    const r = this.rec!, a = this.start, b = this.end, at = this.t;
    await local.replayStart(r);
    let who = r.who, bot = r.bot, reply = r.reply, i = 0;
    for (; i < r.ops.length && r.ops[i].t < a; i++) {
      const o = r.ops[i];
      local.replayOp(o);
      if (o.k === "who") { who = o.who; bot = o.bot || null; reply = null; }
      if (o.k === "reply") reply = o.r;
    }
    const head = local.replaySnap(), brain0 = this.recBrainAt(a);
    const shift = <T extends { t: number }>(x: T): T => ({ ...x, t: Math.max(0, x.t - a) });
    const ci = Math.max(0, r.cam.findIndex((c) => c[0] >= a) - 1);
    const keys = r.edits.keys.filter((k) => k.t > a && k.t <= b).map(shift);
    const k0 = [...r.edits.keys].reverse().find((k) => k.t <= a); if (k0) keys.unshift({ ...k0, t: 0 });   // (the keyframe in force at the start)
    const out: Recording = { ...r, ...head, who, bot, reply: reply && head.reply, created: new Date().toISOString(), dur: Math.round(b - a),
                  ops: [{ t: 0, k: "ui" as const, e: "brain", d: brain0 }, ...r.ops.slice(i).filter((o) => o.t <= b).map(shift)],
                  cam: r.cam.slice(ci).filter((c) => c[0] <= b).map((c): CamRow => [Math.max(0, c[0] - a), ...(c.slice(1) as (number | string | number[] | null)[])]),
                  edits: { in: 0, out: null, keys, ...(r.edits.show ? { show: r.edits.show } : {}), ...(r.edits.orient ? { orient: r.edits.orient } : {}) } };
    await this.seek(at);
    return out;
  },
};
addEventListener("resize", () => player.wake());                       // (a resized frame draws itself again, paused or not)
