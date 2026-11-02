// Sound methods (mixed into Sound, src/sound/core.ts): you in the world: footsteps, swings, grass, chopping and falling trees, leaves, rock
// and ore, placing, drinking, splashing, eating.
import type { Sound } from "./core";

/** A struck body's partials: [ratio, decay s, level] (partials). */
export type Partial3 = [ratio: number, decay: number, level: number];

export class SoundWorld {
  // footsteps, well under everything else, heel then toe (Pete chose them):
  // sand a crunch of many grains; stone a soft low knock and scuff in its own stone echo; grass a soft press and a crinkle
  step(this: Sound, surface: string) {
    if (!this.ctx || this.muted) return;
    const r = (0.94 + Math.random() * 0.12);
    if (surface === "sand") {
      for (let i = 0; i < 9; i++) this.burst("bandpass", 1500 + Math.random() * 2700, 1.2, 0.01 + Math.random() * 0.015, 0.03, undefined, undefined, Math.random() * 0.07);
      this.burst("lowpass", 600 * r, 0.7, 0.07, 0.04);
    } else if (surface === "dirt") {                                       // packed earth: a soft dull thud, a little gritty crunch
      this.tone("sine", 80 * r, 55, 0.06, 0.05); this.burst("lowpass", 420 * r, 0.8, 0.07, 0.06);
      for (let i = 0; i < 4; i++) this.burst("bandpass", 900 + Math.random() * 1400, 1.4, 0.012, 0.012, undefined, undefined, 0.01 + Math.random() * 0.05);
    } else if (surface === "stone") {
      this.wet = 1.2;
      this.tone("sine", 100 * r, 65, 0.05, 0.05); this.burst("lowpass", 900, 0.7, 0.03, 0.038);
      this.partials(520 * r, [[1, 0.03, 1], [2.3, 0.02, 0.4]], 0.023, undefined, undefined, 0.045);
      this.wet = 0;
    } else {
      this.burst("lowpass", 1500 * r, 0.7, 0.05, 0.045); this.burst("bandpass", 2600 * r, 1, 0.04, 0.028, undefined, undefined, 0.04);
      for (let i = 0; i < 3; i++) this.burst("bandpass", 4000 + Math.random() * 2500, 2, 0.01, 0.014, undefined, undefined, 0.01 + Math.random() * 0.07);
    }
  }
  // a swing: air past a blade, the band rising and falling back, swelling to mid-swing; barehanded lower; ±6 % each time
  // (Pete chose it)
  swing(this: Sound, hand = false) {
    const r = 0.94 + Math.random() * 0.12, f = hand ? 0.7 : 1;
    this.swell("bandpass", 320 * r * f, 1700 * r * f, 600 * r * f, 2.2, 0.18, 0.13 * (0.85 + Math.random() * 0.3), undefined, undefined, 0, 0.55);
  }
  // noise through a filter whose frequency goes f0 → f1 (the peak, at af of the way) → f2, its level swelling to that peak and away
  swell(this: Sound, type: BiquadFilterType, f0: number, f1: number, f2: number, q: number, dur: number, vol: number, x?: number, z?: number, t = 0, af = 0.5) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t0 = c.currentTime + t, s = c.createBufferSource(), f = c.createBiquadFilter(), e = c.createGain();
    s.buffer = this.noiseBuf; s.loop = true; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t0); f.frequency.exponentialRampToValueAtTime(f1, t0 + dur * af); f.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    e.gain.setValueAtTime(0.0001, t0); e.gain.exponentialRampToValueAtTime(1, t0 + dur * af); e.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    s.connect(f).connect(e).connect(this.out(vol, x, z));
    s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.05);
  }
  // grass cut (Pete): a quick swish through it and the dry tick of blades snapping
  grassCut(this: Sound, x: number, z: number) {
    if (!this.ctx || this.muted) return;
    this.burst("highpass", 2600, 0.7, 0.12, 0.22, x, z, 0, 5200);
    this.rustle(x, z, 0.16, 70, 0.3, 0.02, "decay");
  }
  // a sapling found in the grass: a bright little two-note pluck as it pops out
  saplingFound(this: Sound, x: number, z: number) {
    if (!this.ctx || this.muted) return;
    this.tone("triangle", 660, 680, 0.12, 0.18, x, z, 0.05); this.tone("triangle", 990, 1000, 0.16, 0.16, x, z, 0.13);
  }
  chop(this: Sound, x: number, z: number) { this.tone("sine", 190, 90, 0.14, 0.5, x, z); this.burst("bandpass", 700, 1, 0.08, 0.4, x, z); }
  // a tree falls (Pete chose it): the creak of fibres slipping, faster
  // as it tips; three branches snap; the crown rushes down; it lands (~1.2 s, with the fall animation) and bounces once; the
  // leaves settle
  treeFall(this: Sound, x: number, z: number) {
    for (let t = 0.15; t < 1.0;) {
      const u = (t - 0.15) / 0.85;
      this.burst("bandpass", 520 * (1 + 0.35 * u), 9, 0.02, 0.06 + 0.08 * u, x, z, t);
      this.burst("bandpass", 1250 * (1 + 0.2 * u), 9, 0.015, 0.03 + 0.04 * u, x, z, t);
      t += 1 / (14 + 32 * u);
    }
    [0.55, 0.82, 0.97].forEach((t) => { this.burst("highpass", 2200, 0.7, 0.018, 0.3, x, z, t); this.burst("bandpass", 1100, 3, 0.05, 0.2, x, z, t); });
    this.rustle(x, z, 0.75, 90, 0.09, 0.48); this.swell("bandpass", 900, 2600, 1600, 0.8, 0.75, 0.06, x, z, 0.48, 0.8);
    this.tone("sine", 70, 30, 0.5, 0.8, x, z, 1.18); this.burst("lowpass", 300, 0.7, 0.35, 0.55, x, z, 1.18);
    this.burst("lowpass", 1400, 0.7, 0.2, 0.25, x, z, 1.18, 200);
    this.tone("sine", 60, 34, 0.2, 0.3, x, z, 1.42); this.burst("lowpass", 250, 0.7, 0.15, 0.2, x, z, 1.42);
    this.rustle(x, z, 1.3, 55, 0.07, 1.2, "fade");
  }
  // leaves: a cloud of short high grains, each its own pitch and level; shape "swell" rises and falls, "fade" only falls
  rustle(this: Sound, x: number, z: number, dur: number, rate: number, vol: number, t = 0, shape = "swell") {
    if (!this.ctx || this.muted) return;
    for (let i = 0, n = Math.round(dur * rate); i < n; i++) {
      const u = Math.random(), env = shape === "swell" ? Math.pow(Math.sin(Math.PI * u), 0.8) : Math.pow(1 - u, 1.6);
      this.burst("bandpass", 2200 + Math.random() * 4600, 1.2 + Math.random() * 1.6, 0.012 + Math.random() * 0.043, vol * env * (0.3 + Math.random() * 0.7), x, z, t + u * dur);
    }
    this.burst("bandpass", 1600, 0.6, dur, vol * 0.25, x, z, t);                    // the soft body under the grains
  }
  // a rock breaks (the original, Pete's pick); an ore adds its own after (Pete chose them from the sound-design page): iron a clank,
  // a gem (diamond, sapphire, ruby) the diamond's tinkle of glassy chips tumbling out, coal a few dull low ones
  rockBreak(this: Sound, x: number, z: number, ore?: string) {
    this.burst("highpass", 1700, 0.7, 0.22, 0.45, x, z); this.tone("sine", 130, 60, 0.16, 0.4, x, z);
    for (let i = 0; i < 3; i++) this.burst("bandpass", 2800 + i * 400, 2, 0.03, 0.22, x, z, 0.05 + i * 0.06);
    if (ore === "iron") return this.clank(x, z);
    const T = ({ coal: [[700, 880, 1050], 4, 0.035, 0.15], diamond: [[2637, 3136, 3520, 4186, 5274, 6272], 10, 0.065, 0.55] } as Record<string, [notes: number[], n: number, vol: number, ring: number]>)[ore === "sapphire" || ore === "ruby" ? "diamond" : String(ore)];
    if (!T) return;
    const [notes, n, vol, ring] = T;
    for (let i = 0, t = 0.1; i < n; i++) {
      const f = notes[Math.floor(Math.random() * notes.length)] * (0.995 + Math.random() * 0.01), g = vol * Math.pow(0.86, i);
      this.partials(f, [[1, ring * (0.7 + Math.random() * 0.5), 1], [2.76, ring * 0.4, 0.3]], g, x + Math.random() * 0.6 - 0.3, z, t);
      t += 0.035 + Math.random() * 0.06 + i * 0.008;
    }
  }
  // iron: the pick strikes metal: a tick, a dull clunk, the ring of a struck bar, each partial doubled a few Hz apart so it beats like
  // iron; then the freed chunk drops and clanks once more, smaller and higher
  clank(this: Sound, x: number, z: number) {
    const r = (0.94 + Math.random() * 0.12), ring: Partial3[] = [[1, 0.55, 1], [2.76, 0.4, 0.55], [5.4, 0.22, 0.3], [8.93, 0.12, 0.15]];
    this.burst("highpass", 5000, 0.7, 0.01, 0.4, x, z, 0.02);
    this.tone("sine", 190 * r, 120, 0.12, 0.35, x, z, 0.02);
    this.partials(520 * r, ring, 0.13, x, z, 0.02); this.partials(524 * r, ring, 0.09, x, z, 0.02);
    this.burst("highpass", 4000, 0.7, 0.008, 0.18, x, z, 0.27);
    this.partials(780 * r, ring.slice(0, 3), 0.07, x, z, 0.27); this.partials(785 * r, ring.slice(0, 3), 0.05, x, z, 0.27);
  }
  // something placed (Pete chose it): it sets down with a low thump and
  // knocks in its material, stone higher and shorter than wood (a table, a plant); a torch is a soft whoomp of flame and a crackle
  place(this: Sound, x: number, z: number, mat = "stone") {
    const r = 0.94 + Math.random() * 0.12;
    if (mat === "torch") {
      this.swell("lowpass", 300, 1400, 700, 0.8, 0.35, 0.22, x, z, 0, 0.3);
      for (let i = 0; i < 6; i++) this.burst("highpass", 3000, 0.7, 0.008, 0.08, x, z, 0.05 + Math.random() * 0.35);
      return;
    }
    const wood = mat === "table" || mat === "plant";
    this.tone("sine", 120 * r, 70, 0.08, 0.4, x, z); this.burst("lowpass", 900, 0.7, 0.05, 0.3, x, z);
    this.partials((wood ? 230 : 540) * r, wood ? [[1, 0.09, 0.3], [2.43, 0.05, 0.15]] : [[1, 0.06, 0.25], [2.24, 0.04, 0.12]], 1, x, z);
    this.burst("bandpass", 3000, 2, 0.03, 0.06, x, z, 0.02);                         // grit
  }
  // a drink of water (Pete chose them; CC0, sounds/README.md): a recorded sip
  // from any water; from a fountain, the longer fountain drink with a sip after it. A potion (no x) keeps the synthesized drink
  drink(this: Sound, x?: number, z?: number, fountain = false) {
    if (x !== undefined) {
      const sip = () => `drink-${1 + Math.floor(Math.random() * 2)}`;
      if (fountain && this.sample("drink-6", 0.4, x, z)) { this.sample(sip(), 0.4, x, z, undefined, 0, 0, 0, this.samples!["drink-6"].duration - 0.1); return; }
      if (this.sample(sip(), 0.4, x, z)) return;
    }
    this.burst("lowpass", 1400, 0.8, 0.3, 0.32, x, z);
    this.tone("sine", 240, 130, 0.09, 0.35, undefined, undefined, 0.12); this.tone("sine", 230, 120, 0.09, 0.3, undefined, undefined, 0.3);
  }
  // a splash into water (the sea beyond the overworld's edge, Pete: a splash, not metal; then a real one, open source): a recorded
  // splash, or till those load a wide wash of noise, its filter falling
  // from bright to dull as the water closes, a fizz of spray over the top, then a few small bubbles rising; no tones held long enough to ring
  splash(this: Sound, x: number, z: number) {
    if (!this.ctx || this.muted) return;
    if (this.sample(`splash-${1 + Math.floor(Math.random() * 3)}`, 0.45, x, z)) return;   // recorded splashes (sounds/README.md); the made one till they load
    this.burst("lowpass", 3200, 0.3, 0.42, 0.5, x, z, 0, 380);             // the body of it: a soft wash, bright to dull
    this.burst("highpass", 3800, 0.3, 0.22, 0.18, x, z, 0.01);             // the spray
    this.burst("bandpass", 700, 0.6, 0.25, 0.22, x, z, 0.05, 260);         // the plunge, low
    for (let i = 0; i < 3; i++) {                                          // bubbles: tiny rising blips, quiet
      const f = 380 + Math.random() * 300;
      this.tone("sine", f, f * 2.2, 0.035, 0.07, x, z, 0.18 + i * 0.07 + Math.random() * 0.04);
    }
  }
  // eating, as the food bar goes up (Pete chose them; CC0, sounds/README.md):
  // meat (a cow, a bat, a snail) soft wet chewing, a plant a crisp bite; quieter than nearly everything else. The old bursts until loaded
  eat(this: Sound, plant = false) {
    if (this.sample(`${plant ? "bite" : "chew"}-${1 + Math.floor(Math.random() * 3)}`, plant ? 0.12 : 0.2)) return;
    for (let i = 0; i < 3; i++) this.burst("bandpass", 2000 + Math.random() * 600, 1.5, 0.05, 0.3, undefined, undefined, i * 0.11);
  }
}
