// Sound methods (mixed into Sound, src/sound/core.ts): combat and creatures: hits, bones, voices, hurt and shot, deaths, whooshes, groans,
// giggles, rattles, kills, the elementals, knights.
import { VOICES, rnd } from "./common";
import type { Sound } from "./core";
import type { Partial3 } from "./world";

export class SoundCreatures {
  // a hit on a mob (Pete chose it): a contact tick, a slap sweeping down,
  // a punchy body, then what was hit (a skeleton's bones clack, a zombie squelches, a troll booms) and the mob's own grunt through
  // vowel formants; pitch ±6 % each time
  hit(this: Sound, x: number, z: number, kind: string) {
    // a cow (Pete: the recorded angry moo, not synthesized): only a soft thump under the moo
    if (kind === "cow" && this.angryMoo(x, z)) { this.burst("lowpass", 400, 0.7, 0.08, 0.3, x, z); return; }
    const troll = kind === "troll" || kind === "frost_troll", r = 0.94 + Math.random() * 0.12;
    this.burst("highpass", 3500, 0.7, 0.012, 0.32, x, z);
    this.burst("bandpass", 2200 * r, 1.4, 0.08, 0.5, x, z, 0.002, 450);
    this.tone("sine", 125 * r, 52, 0.15, 0.75, x, z); this.tone("triangle", 250 * r, 90, 0.05, 0.2, x, z);
    if (kind === "skeleton") { this.partials(1900 * r, [[1, 0.07, 0.2], [1.78, 0.05, 0.12]], 1, x, z); this.bones(x, z, 4, 0.05); return; }
    if (troll) this.tone("sine", 80 * r, 38, 0.25, 0.5, x, z);
    if (kind === "zombie") this.burst("lowpass", 700, 1, 0.12, 0.3, x, z, 0.01, 200);   // a wet squelch
    const v = troll ? [75, 55, 300, 800, 0.3] : kind === "zombie" ? [130, 90, 450, 1100, 0.2] : kind === "cow" ? [170, 130, 420, 950, 0.22] : [170, 120, 520, 1300, 0.16];
    this.vox(v[0] * r, v[1] * r, v[2], v[3], v[4], 0.45, x, z, 0.04);
  }
  // a struck body: sine partials [ratio, decay s, level] over base f
  partials(this: Sound, f: number, list: Partial3[], vol: number, x?: number, z?: number, t = 0) { list.forEach(([m, d, g]) => this.tone("sine", f * m, f * m * 0.985, d, vol * g, x, z, t)); }
  // bones knocking: pairs of tuned clacks, a quick pair then a gap
  bones(this: Sound, x: number, z: number, n: number, vol: number, fall = false) {                                     // fall: a collapse, each knock quieter and quicker
    for (let i = 0, t = 0; i < n; i++) {
      const r = 0.85 + Math.random() * 0.3, g = fall ? vol * Math.pow(0.88, i) : vol;
      this.partials(2000 * r, [[1, 0.03, 1], [1.7, 0.02, 0.5]], g, x, z, t); this.burst("highpass", 3000, 0.7, 0.008, g, x, z, t);
      t += i % 2 ? (0.07 + Math.random() * 0.05) * (fall ? Math.pow(0.85, i) : 1) : 0.02 + Math.random() * 0.015;
    }
  }
  // a voice: a buzzing glottis (sawtooth f0 → f1) through two vowel formants F1, F2
  vox(this: Sound, f0: number, f1: number, F1: number, F2: number, dur: number, vol: number, x: number, z: number, t = 0, att = 0.02) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t0 = c.currentTime + t, o = c.createOscillator(), e = c.createGain(), out = this.out(vol, x, z);
    o.type = "sawtooth"; o.frequency.setValueAtTime(f0, t0); o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(1, t0 + att); e.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    [[F1, 5, 1], [F2, 7, 0.45]].forEach(([f, q, gn]) => {
      const b = c.createBiquadFilter(); b.type = "bandpass"; b.frequency.value = f; b.Q.value = q;
      const g = c.createGain(); g.gain.value = gn * 2.2; e.connect(b).connect(g).connect(out);
    });
    o.connect(e); o.start(t0); o.stop(t0 + dur + 0.05);
  }
  // hurt: built on the shot (Pete chose it), but a blow rather than a pierce:
  // a dull punch where the shot has its high thwack, a lower thump, lower and shorter grunts
  hurt(this: Sound) {
    this.burst("bandpass", 900, 1, 0.05, 0.45);
    this.tone("sine", 130, 50, 0.18, 0.7);
    this.tone("sawtooth", 230, 130, 0.2, 0.26, undefined, undefined, 0.03, 900);
    this.tone("sawtooth", 150, 95, 0.24, 0.14, undefined, undefined, 0.05, 600);
  }
  // shot (arrow, dagger, fireball...): a sharp thwack into you, a dull thump, then a pained grunt; worse than a plain hurt
  shot(this: Sound) {                                                                 // toned down (Pete chose it from the sound-design page: the old one hurt)
    this.burst("highpass", 2300, 0.9, 0.03, 0.3);
    this.tone("sine", 150, 55, 0.16, 0.5);
    this.tone("sawtooth", 280, 150, 0.24, 0.18, undefined, undefined, 0.04, 900);
    this.tone("sawtooth", 180, 110, 0.28, 0.1, undefined, undefined, 0.06, 600);
  }
  // a death (Pete chose it), timed to fell.ts (the body rolls over in 0.45 s,
  // lies 0.6 s, then crumbles to dust): a short groan in the mob's voice (a skeleton's bones clatter instead), a bump as it hits the
  // floor, then a long soft exhale of dust coming in gently, with a fine grit sifting through it
  mobDie(this: Sound, x: number, z: number, kind = "", voiced = false) {
    if (!this.ctx || this.muted) return;
    const troll = kind === "troll" || kind === "frost_troll", size = troll ? 1.3 : 1;
    if (kind === "skeleton") this.bones(x, z, 6, 0.09, true);
    else if (!voiced) {
      const [f0, peak, end, F1, F2, dur, vol] = troll ? [70, 78, 40, 300, 750, 0.5, 0.7] : kind === "zombie" ? [92, 102, 52, 400, 920, 0.35, 0.6]
        : kind === "cow" ? [155, 168, 95, 380, 850, 0.32, 0.45] : [150, 165, 85, 500, 1200, 0.32, 0.5];
      this.wail(f0, peak, end, F1, F2, dur, vol, x, z, 0.03);
    }
    this.tone("sine", 95 / size, 50 / size, 0.14 * size, 0.4 * size, x, z, 0.45);
    this.burst("lowpass", 350, 0.7, 0.1, 0.3 * size, x, z, 0.45);
    const d = 1.5 * size, t = 1.0;                                           // the dust
    this.swell("bandpass", 500, 1100, 450, 0.6, d, 0.16 * size, x, z, t, 0.4);
    for (let i = 0, n = Math.round(28 * size); i < n; i++) {
      const u = Math.random(), env = Math.sin(Math.PI * Math.min(1, u * 1.15));
      this.burst("highpass", 4000 + Math.random() * 4000, 0.7, 0.006 + Math.random() * 0.012, 0.045 * env, x, z, t + 0.1 + u * d);
    }
  }
  // a dying voice: the cry rises, then sags far below where it started while its vibrato slows and widens, the mouth closes, breath
  // takes over from the voice
  wail(this: Sound, f0: number, peak: number, end: number, F1: number, F2: number, dur: number, vol: number, x: number, z: number, t = 0) {
    const c = this.ctx!, t0 = c.currentTime + t, o = c.createOscillator(), e = c.createGain(), out = this.out(vol, x, z);
    o.type = "sawtooth"; o.frequency.setValueAtTime(f0, t0); o.frequency.linearRampToValueAtTime(peak, t0 + dur * 0.2); o.frequency.exponentialRampToValueAtTime(end, t0 + dur);
    const vib = c.createOscillator(), vd = c.createGain();
    vib.frequency.setValueAtTime(6.5, t0); vib.frequency.linearRampToValueAtTime(2, t0 + dur);
    vd.gain.setValueAtTime(peak * 0.03, t0); vd.gain.linearRampToValueAtTime(peak * 0.08, t0 + dur); vib.connect(vd).connect(o.frequency);
    const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const ng = c.createGain(); ng.gain.setValueAtTime(0.15, t0); ng.gain.linearRampToValueAtTime(0.7, t0 + dur);
    const vg = c.createGain(); vg.gain.setValueAtTime(1, t0); vg.gain.linearRampToValueAtTime(0.25, t0 + dur);
    o.connect(vg).connect(e); n.connect(ng).connect(e);
    e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(1, t0 + 0.08); e.gain.setValueAtTime(1, t0 + dur * 0.35); e.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    [[F1, 5, 1], [F2, 7, 0.45]].forEach(([f, q, gn]) => {
      const b = c.createBiquadFilter(); b.type = "bandpass"; b.Q.value = q; b.frequency.setValueAtTime(f, t0); b.frequency.linearRampToValueAtTime(f * 0.7, t0 + dur);
      const g = c.createGain(); g.gain.value = gn * 2.2; e.connect(b).connect(g).connect(out);
    });
    for (const s of [o, vib, n]) { s.start(t0); s.stop(t0 + dur + 0.05); }
  }
  whoosh(this: Sound, kind: string, x?: number, z?: number) {
    if (kind === "fireball") {                                             // a roar with crackle in it (Pete chose the refined ones)
      this.swell("lowpass", 400, 1600, 900, 0.8, 0.5, 0.3, x, z, 0, 0.6);
      for (let i = 0; i < 12; i++) this.burst("highpass", 3000, 0.7, 0.008, 0.1, x, z, Math.random() * 0.45);
    } else if (kind === "iceball") {                                       // a cold hiss and a glassy shimmer
      this.swell("highpass", 3000, 4500, 3500, 0.7, 0.35, 0.12, x, z);
      [2637, 3951, 5274].forEach((f, i) => this.tone("sine", f, f * 0.98, 0.35, 0.035, x, z, 0.05 + i * 0.06));
    } else {                                                                 // an arrow: a thin whistle passing (Pete chose it, sound-design page)
      this.swell("bandpass", 2500, 4500, 2000, 3, 0.22, 0.2, x, z, 0, 0.6);
      this.tone("sine", 2100, 1500, 0.2, 0.03, x, z);
    }
  }
  // a monster's growl: breath noise through two throat formants, its level swelling and fading, roughened by a fast flutter
  // (amplitude, not pitch: the old buzzing saw read as a fart); trolls deeper and longer, zombies a moan; skeletons have no
  // throat, so they rattle instead
  // far: a moan from off in the dark (main.ts), faint and muffled. A zombie moans with one of five recorded zombies (Pete chose them;
  // CC0, see sounds/README.md), the growl below until they load
  groan(this: Sound, kind: string, x: number, z: number, far = false) {
    if (!this.ctx || this.muted) return;
    // one voice at a time (Pete: not a lot of overlap): nothing new until the last has finished and a beat has passed
    const now = this.ctx.currentTime;
    if (now < (this.voiceUntil || 0)) return;
    if (kind === "gnome_warrior" || kind === "gnome_archer") { const d = this.giggle(x, z, far); if (d) this.voiceUntil = now + d + 1.5; return; }
    if (kind === "ice_elemental") { this.voiceUntil = now + this.iceTinkle(x, z, far) + 1.5; return; }
    if (kind === "fire_elemental") { this.voiceUntil = now + this.fireRoar(x, z, far) + 1.5; return; }
    // recorded voices (Pete chose them all; CC0, see sounds/README.md):
    // [clips, speed, level, low-pass]; slower is bigger. Far off (main.ts), quieter and muffled
    const v = VOICES[kind];
    if (v) {
      const [name, rate] = v[0][Math.floor(Math.random() * v[0].length)], b = this.samples?.[name];
      if (b) {
        const r = rate * (0.97 + Math.random() * 0.06);
        this.sample(name, far ? v[1] * 0.7 : v[1], x, z, r, 0, 0, far ? 900 : v[2]);
        this.voiceUntil = now + b.duration / r + 1.5;
        return;
      }
    }
    if (far) return;
    this.voiceUntil = now + 2;
    if (kind === "skeleton") return this.rattle(x, z);
    const deep = kind === "troll" || kind === "frost_troll", zombie = kind === "zombie";
    const c = this.ctx, t0 = c.currentTime, dur = (deep ? 1.4 : zombie ? 1.2 : 0.9) * (0.85 + Math.random() * 0.3);
    const f1 = (deep ? 260 : zombie ? 420 : 340) * (0.9 + Math.random() * 0.2);
    const src = c.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const lo = c.createBiquadFilter(); lo.type = "bandpass"; lo.Q.value = 6;               // the throat: two resonances that close
    lo.frequency.setValueAtTime(f1 * 1.15, t0); lo.frequency.linearRampToValueAtTime(f1 * 0.8, t0 + dur);   // a little as it ends
    const hi = c.createBiquadFilter(); hi.type = "bandpass"; hi.Q.value = 5;
    hi.frequency.setValueAtTime(f1 * 2.9, t0); hi.frequency.linearRampToValueAtTime(f1 * 2.2, t0 + dur);
    const hiG = c.createGain(); hiG.gain.value = 0.35;
    const rough = c.createGain(); rough.gain.value = 0.55;                                   // the flutter of a growl
    const lfo = c.createOscillator(), depth = c.createGain();
    lfo.type = "triangle"; lfo.frequency.value = (deep ? 22 : 30) + Math.random() * 8; depth.gain.value = 0.45;
    lfo.connect(depth).connect(rough.gain);
    const env = c.createGain();                                                            // a swell, not a hit
    env.gain.setValueAtTime(0.0001, t0); env.gain.exponentialRampToValueAtTime(1, t0 + dur * 0.35);
    env.gain.setValueAtTime(1, t0 + dur * 0.55); env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    const out = this.out(deep ? 1.1 : 0.9, x, z);
    src.connect(lo).connect(rough); src.connect(hi).connect(hiG).connect(rough);
    rough.connect(env).connect(out);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + dur + 0.05); lfo.start(t0); lfo.stop(t0 + dur + 0.05);
  }
  // gnomes laugh (Pete chose it): children laughing, recorded (CC0, see
  // sounds/README.md), made spooky: slowed to ~80 % (lower, drawn out), muffled, faint, and echoing as if from down the tunnel
  giggle(this: Sound, x: number, z: number, far = false) {
    const b = this.samples?.[`giggle-${1 + Math.floor(Math.random() * 4)}`];
    if (!b) return;
    // by distance (Pete: louder when close, fainter further off): a gnome beside you is loud, clear and dry; far off, faint, muffled
    // and mostly echo (k: 0 within 2 tiles, 1 from 16)
    const L = this.listener, k = Math.min(1, Math.max(0, (Math.hypot(x - L.x, z - L.z) - 2) / 14, far ? 0.8 : 0));
    const c = this.ctx!, s = c.createBufferSource(), lp = c.createBiquadFilter(), out = this.out(0.9 * (1 - 0.65 * k), x, z), wet = c.createGain();
    s.buffer = b; s.playbackRate.value = 0.78 + Math.random() * 0.08; lp.type = "lowpass"; lp.frequency.value = 6000 - 4800 * k;
    wet.gain.value = 0.25 + 0.6 * k; s.connect(lp).connect(out); out.connect(wet).connect(this.echo); s.start();
    return b.duration / s.playbackRate.value;
  }
  // a skeleton's rattle (Pete chose the in-between one): every knock a dry noise click with a lighter tuned clack inside it; some
  // come as a quick pair, most at random spacing
  rattle(this: Sound, x: number, z: number) {
    for (let i = 0, t = 0, n = 7 + Math.floor(Math.random() * 4); i < n; i++) {
      const r = rnd(0.85, 1.15);
      this.burst("bandpass", rnd(2400, 4000), 3, 0.025, 0.34, x, z, t);   // (Pete: louder, it was hard to hear)
      this.partials(2100 * r, [[1, 0.03, 1], [1.7, 0.02, 0.5]], 0.13, x, z, t);
      t += Math.random() < 0.4 ? rnd(0.02, 0.03) : rnd(0.04, 0.085);
    }
  }
  // the killing blow (Pete: heavy hits, with the animal's own sound where we have one; no heavy for a cow): the hit, then the mob's
  // recorded voice (or a short synthesized cry), and its death without the death groan
  kill(this: Sound, x: number, z: number, kind: string) {
    if (!this.ctx || this.muted) return;
    if (kind === "cow") { this.hit(x, z, "cow"); return this.mobDie(x, z, "cow", true); }
    if (kind === "ice_elemental") { this.hit(x, z, kind); this.iceTinkle(x, z); return this.mobDie(x, z, kind, true); }
    if (kind === "fire_elemental") { this.hit(x, z, kind); this.fireRoar(x, z); return this.mobDie(x, z, kind, true); }   // the angry moo, not a synthesized cry (Pete)
    this.hit(x, z, kind);
    const v = VOICES[kind], pick = v && v[0][Math.floor(Math.random() * v[0].length)];
    // just the start of its voice, cut short (Pete: a zombie's whole moan went on long after it was dead and gone)
    let voiced = !!(pick && this.sample(pick[0], v[1], x, z, pick[1] * rnd(0.97, 1.03), 0, Math.min(0.6, this.samples![pick[0]]?.duration || 0.6), v[2], 0.04));
    if (!voiced && kind !== "skeleton") {
      const c = ({ zombie: [120, 60, 420, 1000], troll: [70, 38, 300, 750], frost_troll: [70, 38, 300, 750] } as Record<string, number[]>)[kind] || [160, 85, 500, 1200];
      this.vox(c[0], c[1], c[2], c[3], 0.45, 0.5, x, z, 0.03, 0.05); voiced = true;
    }
    this.mobDie(x, z, kind, voiced);
  }
  // an ice elemental (Pete: tinkly like the Ice Realm, not chimes): the realm's own tinkle, a little cluster of glassy synthesized bells
  // (partials 1, 2.76, 5.4, ringing half a second to a second) and a recorded glass tap sped up high, scattered over half a second and
  // mostly the long echo, over a faint cold hiss; returns how long it lasts. far: fewer, fainter, muffled
  iceTinkle(this: Sound, x: number, z: number, far = false) {
    if (!this.ctx || this.muted) return 0;
    const n = far ? 2 : 4 + Math.floor(Math.random() * 4), v = far ? 0.5 : 1;
    this.longWet = true;
    for (let i = 0; i < n; i++) {
      const f = rnd(2200, 6000), t = rnd(0, 0.6), xx = x + rnd(-0.4, 0.4);
      [[1, rnd(0.6, 1.2), 0.06], [2.76, 0.4, 0.02], [5.4, 0.2, 0.01]].forEach(([m, dd, g]) => this.tone("sine", f * m, f * m * 0.995, dd, g * v, xx, z, t));
    }
    if (!far) this.sample(`glass-${1 + Math.floor(Math.random() * 3)}`, 0.1, x, z, rnd(1.8, 2.6), 0, 0, 0, rnd(0, 0.4));
    this.longWet = false;
    this.swell("highpass", 4000, 6000, 4500, 0.7, 0.8, 0.03 * v, x, z, 0, 0.4);
    return 1;
  }
  // a fire elemental (Pete: a loud roaring fire, with its breath and roar): a burst of a big real fire roaring up and dying down
  // (BigSoundBank #0987), its breath or roar (slowed, dark) inside it, and a low rumble; returns how long it lasts
  fireRoar(this: Sound, x: number, z: number, far = false) {
    if (!this.ctx || this.muted) return 0;
    const v = far ? 0.45 : 1;
    this.sample("fire-roar", 0.7 * v, x, z, rnd(0.9, 1.1), 0, 0, far ? 1500 : 0);
    this.sample(`felem-${1 + Math.floor(Math.random() * 2)}`, 0.5 * v, x, z, rnd(0.75, 0.85), 0, 0, far ? 1200 : 2500, 0.15);
    this.swell("lowpass", 90, 220, 120, 0.8, 1.3, 0.3 * v, x, z, 0, 0.35);
    return 1.8;
  }
  // knights: armour clanking as they walk, and steel on steel as they swing (Pete)
  armorStep(this: Sound, x: number, z: number) { this.sample(`metal-${1 + Math.floor(Math.random() * 3)}`, 0.18, x, z, rnd(0.9, 1.15)); }
  clash(this: Sound, x: number, z: number) { this.sample(`clash-${1 + Math.floor(Math.random() * 3)}`, 0.45, x, z, rnd(0.95, 1.05)); }
}
