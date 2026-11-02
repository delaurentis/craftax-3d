// The Sound class (js/sound.ts re-exports it): the context and its shared graph, a replay video's offline render, volume and mute, and the
// building blocks (out, tone, burst, reverb); its effects live in world.ts, creatures.ts, events.ts and ambient.ts, mixed into its
// prototype here.
import { besidePage } from "../page-url";
import { mixin } from "../core/mixin";
import { SPACES, VOL, load, save } from "./common";
import { SoundWorld } from "./world";
import { SoundCreatures } from "./creatures";
import { SoundEvents } from "./events";
import { SoundAmbient } from "./ambient";

/** Where the listener stands (tile units) and faces (radians), set each frame. */
export interface Listener { x: number; z: number; yaw: number }
/** The victory portal's hum, built when it is near (portalHum). */
export interface Hum { out: GainNode; pan: StereoPannerNode; srcs: OscillatorNode[]; chirp: OscillatorNode; cg: GainNode; nextChirp: number; off: number }
/** A replay video's sound being computed (filmBegin): the live sound kept aside, the offline context, its length and how far it is. */
export interface Film { keep: Sound; c: OfflineAudioContext; sec: number; rate: number; at: number; done: Promise<AudioBuffer> | null }

/** The parts mixed into Sound (below), and what gate.ts puts on its prototype. */
export interface Sound extends SoundWorld, SoundCreatures, SoundEvents, SoundAmbient {
  /** The bot's moves a second (0 when you play): gate.ts thins the sounds by it. */
  pace: number;
  allow(name: string): boolean;
}
export class Sound {
  /** The audio context: made on the first key or click (unlock); an offline one while a replay video's sound is computed. */
  declare ctx: AudioContext | OfflineAudioContext | null;
  declare muted: boolean;
  /** 0 to 2, 1 being the usual level. */
  declare volume: number;
  declare listener: Listener;
  /** When the next cricket, drip, gust and heartbeat may come (performance.now()). */
  declare nextCricket: number;
  declare nextDrip: number;
  declare nextGust: number;
  declare nextBeat: number;
  /** The recorded clips, decoded (from unlock on). */
  declare samples?: Record<string, AudioBuffer>;
  // the shared graph (build)
  declare master: GainNode;
  declare noiseBuf: AudioBuffer;
  declare wind: GainNode;
  declare echo: GainNode;
  declare stoneVerb: ConvolverNode;
  /** How much of each sound goes to the stone room now. */
  declare wet: number;
  /** The held loops by name (ambient's loop). */
  declare loops: Record<string, GainNode>;
  declare verb: ConvolverNode;
  declare send: GainNode;
  declare long: ConvolverNode;
  declare longIn: GainNode;
  declare room: GainNode;
  declare tunnel: GainNode;
  declare tunnelF: BiquadFilterNode;
  declare sprayG: GainNode;
  declare cold: GainNode;
  declare coldF: BiquadFilterNode;
  declare howlA: GainNode;
  declare howlAF: BiquadFilterNode;
  declare howlB: GainNode;
  declare howlBF: BiquadFilterNode;
  /** The reverb's place now (setSpace). */
  declare space: string | null;
  declare hum: Hum | null;
  declare film?: Film;
  // set by the effects as they run
  /** Sounds at a position also go to the long echo. */
  declare longWet?: boolean;
  /** No new creature voice before then (context time). */
  declare voiceUntil?: number;
  /** Since when you have been in danger (heart). */
  declare dangerSince?: number;
  declare nextBlorp?: number;
  declare nextSettle?: number;
  declare nextFar?: number;
  declare nextTinkle?: number;
  declare nextGhost?: number;
  declare nextCrow?: number;
  declare nextGate?: number;
  declare nextBell?: number;
  // the gate (gate.ts): the times of the gated sounds in the last second, each kind's last time, and whether one is playing
  declare played?: number[];
  declare lastAt?: Record<string, number>;
  declare inGate?: boolean;

  constructor() {
    this.ctx = null; this.muted = load();
    this.volume = (() => { try { const v = parseFloat(localStorage.getItem(VOL) ?? ""); return v >= 0 && v <= 2 ? v : 1; } catch { return 1; } })();
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.nextCricket = 0; this.nextDrip = 0; this.nextGust = 0; this.nextBeat = 0;
  }

  unlock() {
    if (!this.ctx) {
      try { this.ctx = new AudioContext(); } catch { return; }
      const c = this.ctx;
      this.build(c);
      // recorded sounds (sounds/, all CC0; see sounds/README.md), decoded once; until one is in, its effect falls back or stays silent
      this.samples = {};
      for (const n of ["moo-1", "moo-2", "moo-3", "zombie-1", "zombie-2", "zombie-3", "zombie-4", "zombie-5", "chew-1", "chew-2", "chew-3", "bite-1", "bite-2", "bite-3", "giggle-1", "giggle-2", "giggle-3", "giggle-4", "troll-1", "troll-2", "troll-3", "troll-4", "drink-1", "drink-2", "drink-6", "splash-1", "splash-2", "splash-3", "deep-1", "deep-2", "deep-3", "pig-1", "pig-2", "pig-3", "snarl-1", "snarl-2", "saw-1", "clank-1", "clank-2", "fire-loop", "lava-loop", "boil-loop",
        "kobold-1", "kobold-2", "kobold-3", "armor-1", "chain-1", "chain-2", "metal-1", "metal-2", "metal-3", "clash-1", "clash-2", "clash-3", "felem-1", "felem-2", "ielem-1", "ielem-2", "glass-1", "glass-2", "glass-3", "chimes-1", "chimes-2", "ghost-1", "ghost-2", "ghost-3", "ghost-4", "ghost-5", "crow-1", "crow-2", "gate-1", "gate-2", "fire-roar"]) fetch(besidePage(`sounds/${n}.mp3`)).then((r) => r.arrayBuffer())
        .then((b) => c.decodeAudioData(b)).then((buf) => (this.samples![n] = buf)).catch(() => {});
    }
    if (this.ctx.state === "suspended") this.ctx.resume();
  }
  // the sounds' shared graph on context c: the master and its limiter, wind, echo, rooms, reverbs and the noise beds
  build(c: BaseAudioContext) {
    this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : 0.7 * this.volume;
    // a limiter last (Pete: no clipping when many sounds land at once): it only acts on peaks
    const lim = c.createDynamicsCompressor(); lim.threshold.value = -6; lim.knee.value = 4; lim.ratio.value = 12; lim.attack.value = 0.003; lim.release.value = 0.15;
    this.master.connect(lim).connect(c.destination);
    this.noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // wind: looped noise through a low-pass, its level drifting
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 420;
    this.wind = c.createGain(); this.wind.gain.value = 0;
    src.connect(lp).connect(this.wind).connect(this.master); src.start();
    // an echo for sounds from somewhere down a tunnel: a delay fed back on itself through a low-pass, each repeat duller and fainter
    this.echo = c.createGain(); const dl = c.createDelay(1), fb = c.createGain(), dlp = c.createBiquadFilter();
    dl.delayTime.value = 0.23; fb.gain.value = 0.45; dlp.type = "lowpass"; dlp.frequency.value = 1800;
    this.echo.connect(dl).connect(dlp).connect(fb).connect(dl); dlp.connect(this.master);
    // a short stone room for footsteps on stone: a generated 1.2 s tail, fed while this.wet > 0
    this.stoneVerb = c.createConvolver(); this.stoneVerb.connect(this.master);
    { const n = Math.round(1.2 * c.sampleRate), b = c.createBuffer(2, n, c.sampleRate);
      for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2.5); }
      this.stoneVerb.buffer = b; }
    this.wet = 0; this.loops = {};
    // the shared reverb (set per place by ambient → setSpace) and a long, slow 5 s one for the Ice Realm and the Graveyard
    this.verb = c.createConvolver(); this.send = c.createGain(); this.send.gain.value = 0; this.send.connect(this.verb).connect(this.master);
    this.long = c.createConvolver(); this.longIn = c.createGain(); this.longIn.gain.value = 1.4; this.longIn.connect(this.long).connect(this.master);
    this.long.buffer = this.impulse(5, 1.5);
    // looping noise beds, each through its own band, silent until a place needs it
    const bed = (type: BiquadFilterType, f: number, q: number): [GainNode, BiquadFilterNode] => { const s2 = c.createBufferSource(); s2.buffer = this.noiseBuf; s2.loop = true; const bf = c.createBiquadFilter(); bf.type = type; bf.frequency.value = f; bf.Q.value = q; const g = c.createGain(); g.gain.value = 0; s2.connect(bf).connect(g).connect(this.master); s2.start(Math.random()); return [g, bf]; };
    [this.room] = bed("lowpass", 160, 0.7); [this.tunnel, this.tunnelF] = bed("bandpass", 280, 9); [this.sprayG] = bed("bandpass", 3200, 0.8);
    [this.cold, this.coldF] = bed("bandpass", 2200, 7); [this.howlA, this.howlAF] = bed("bandpass", 380, 5); [this.howlB, this.howlBF] = bed("bandpass", 760, 7);
    for (const g of [this.cold, this.howlA, this.howlB]) g.connect(this.longIn);
    this.space = null; this.hum = null;
  }
  // a replay's video (js/film.ts): the sound computed with the frames, not played. filmBegin swaps in an OfflineAudioContext as long as
  // the video, its clock the page's (index.html __film), at full volume; filmTo(s) computes it up to s seconds and holds there, so a
  // sound a frame starts lands at that frame; filmEnd gives the whole track and puts the live sound back as it was
  filmBegin(sec: number, rate = 48000) {
    this.unlock();
    if (!this.ctx) return false;
    const keep = { ...this }, c = new OfflineAudioContext(2, Math.max(128, Math.ceil(sec * rate)), rate), t0 = performance.now();
    Object.defineProperty(c, "currentTime", { get: () => Math.max(0, (performance.now() - t0) / 1000) });
    Object.defineProperty(c, "state", { get: () => "running" });   // (unlock never resumes it: filmTo does)
    (keep.ctx as AudioContext).suspend();                                  // (the live context)
    this.ctx = c; this.muted = false; this.volume = 1; this.build(c);
    this.film = { keep, c, sec, rate, at: 0, done: null };
    return true;
  }
  async filmTo(s: number) {
    const f = this.film; if (!f) return;
    const q = Math.floor(s * f.rate / 128) * 128 / f.rate;                 // (suspends land on 128-sample blocks)
    if (q <= f.at || q >= f.sec) return;
    const held = f.c.suspend(q); f.at = q;
    if (!f.done) f.done = f.c.startRendering(); else OfflineAudioContext.prototype.resume.call(f.c);
    await held;
  }
  async filmEnd() {
    const f = this.film; if (!f) return null;
    if (!f.done) f.done = f.c.startRendering(); else OfflineAudioContext.prototype.resume.call(f.c);
    const buf = await f.done.catch(() => null);
    for (const k of Object.keys(this)) if (!(k in f.keep)) delete (this as unknown as Record<string, unknown>)[k];   // (the film's own fields)
    Object.assign(this, f.keep); this.ctx!.resume();
    return buf;
  }

  // the volume (Settings → Sound, Pete): 0 to 2, 1 being today's level; remembered
  setVolume(v: number) {
    this.volume = Math.max(0, Math.min(2, v)); try { localStorage.setItem(VOL, String(this.volume)); } catch {}
    if (this.master && !this.muted) this.master.gain.setTargetAtTime(0.7 * this.volume, this.ctx!.currentTime, 0.05);
  }
  // a replay's own level (replay.html): 0 silences it; not remembered, so the game's own volume and mute are never touched
  level(v: number) {
    this.volume = Math.max(0, Math.min(2, v)); this.muted = this.volume === 0;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.7 * this.volume, this.ctx!.currentTime, 0.05);
  }
  toggle() {
    this.muted = !this.muted; save(this.muted);
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : 0.7 * this.volume, this.ctx!.currentTime, 0.05);
    return this.muted;
  }

  // the output for one sound: a gain, panned and attenuated for world position (x, z) when given
  out(vol: number, x?: number, z?: number) {
    const c = this.ctx!, g = c.createGain();
    if (x === undefined) {
      g.gain.value = vol; g.connect(this.master);
      if (this.wet) { const w = c.createGain(); w.gain.value = this.wet; g.connect(w).connect(this.stoneVerb); }
      return g;
    }
    const L = this.listener, dx = x - L.x, dz = z! - L.z, d = Math.hypot(dx, dz);
    g.gain.value = vol / (1 + d * 0.35);
    const p = c.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, (dx * Math.cos(L.yaw) - dz * Math.sin(L.yaw)) / Math.max(d, 0.5))) * 0.8;
    g.connect(p).connect(this.master); g.connect(this.send);
    if (this.longWet) g.connect(this.longIn);
    if (this.wet) { const w = c.createGain(); w.gain.value = this.wet; g.connect(w).connect(this.stoneVerb); }
    return g;
  }

  // an oscillator gliding f0 → f1 with a fast attack and an exponential decay; filter: optional low-pass cutoff
  tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, x?: number, z?: number, t = 0, filter = 0) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t0 = c.currentTime + t, o = c.createOscillator(), e = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t0 + dur);
    e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(1, t0 + 0.006); e.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let n = o.connect(e);
    if (filter) { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = filter; n = n.connect(f); }
    n.connect(this.out(vol, x, z));
    o.start(t0); o.stop(t0 + dur + 0.05);
    return o;
  }

  // a burst of filtered noise; f1: sweep the filter to it over the burst
  burst(type: BiquadFilterType, f0: number, q: number, dur: number, vol: number, x?: number, z?: number, t = 0, f1 = 0) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t0 = c.currentTime + t, s = c.createBufferSource(), f = c.createBiquadFilter(), e = c.createGain();
    s.buffer = this.noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t0);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(1, t0 + 0.004); e.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(e).connect(this.out(vol, x, z));
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
  }

  // ---------- the effects ----------
  // a generated impulse response: len seconds of noise decaying as (1 - t)^k
  impulse(len: number, k: number) {
    const c = this.ctx!, n = Math.round(len * c.sampleRate), b = c.createBuffer(2, n, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = b.getChannelData(ch); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, k); }
    return b;
  }
  setSpace(name: string) {
    if (this.space === name || !this.ctx) return;
    const [len, k, wet] = SPACES[name]; this.space = name;
    this.verb.buffer = this.impulse(len, k); this.send.gain.setTargetAtTime(wet, this.ctx.currentTime, 0.3);
  }
}
mixin(Sound, SoundWorld, SoundCreatures, SoundEvents, SoundAmbient);
