// Sound methods (mixed into Sound, src/sound/core.ts): recorded clips, cows, crafting, notes and bells, a floor down, chests, achievements,
// the Necromancer, the victory portal, landing, booms, your death.
import { rnd } from "./common";
import type { Sound } from "./core";
import type { Partial3 } from "./world";

export class SoundEvents {
  // a recorded clip: rate (speed and pitch), from offset for dur seconds (all of it when omitted), its last 0.12 s faded out
  // lp: a low-pass cutoff, to muffle a sound heard from far off
  // at: seconds from now to start
  sample(this: Sound, name: string, vol: number, x?: number, z?: number, rate = 0.96 + Math.random() * 0.08, offset = 0, dur = 0, lp = 0, at = 0) {
    const b = this.samples?.[name];
    if (!this.ctx || this.muted || !b) return false;
    const c = this.ctx, t0 = c.currentTime + at, s = c.createBufferSource(), g = c.createGain(), len = (dur || b.duration - offset) / rate;
    s.buffer = b; s.playbackRate.value = rate;
    g.gain.setValueAtTime(1, t0 + Math.max(0, len - 0.12)); g.gain.linearRampToValueAtTime(0, t0 + len);
    let n = s.connect(g);
    if (lp) { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp; n = n.connect(f); }
    n.connect(this.out(vol, x, z)); s.start(t0, offset, dur || undefined);
    return true;
  }
  // a moo: one of three recorded cows (Pete chose them), the old
  // synthesized one until they load
  moo(this: Sound, x: number, z: number) {
    if (!this.sample(`moo-${1 + Math.floor(Math.random() * 3)}`, 0.4, x, z)) this.tone("sawtooth", 150, 115, 0.7, 0.12, x, z, 0, 480);   // (Pete: quieter, under the monsters)
  }
  // hit, a cow moos short and angry (Pete: "cow 1 sounds angry", shorten it): the first 0.8 s of cow 1 at its own speed, faded out
  angryMoo(this: Sound, x: number, z: number) { return this.sample("moo-1", 0.7, x, z, 0.97 + Math.random() * 0.06, 0, 0.8); }
  // a craft, by what was made (Pete chose them): wood a recorded saw and a
  // thock of a mallet; stone two clanks (a clunk with a short low ring); iron (and diamond) a recorded clank, twice; then a short,
  // soft three-note payoff
  // Returns when the last strike lands (s), the moment main.ts shows what was made (Pete: the sound and the item line up; the saw is
  // short, so the item waits only a moment)
  craft(this: Sound, kind = "wood") {
    if (!this.ctx || this.muted) return 0;
    let hit: number;
    if (kind === "stone") { this.craftClank(0, 0.8); this.craftClank(0.2, 1); hit = 0.2; }
    else if (kind === "iron" && this.sample("clank-1", 0.45)) { this.sample("clank-2", 0.55, undefined, undefined, undefined, 0, 0, 0, 0.3); hit = 0.3; }
    else if (kind === "iron") { this.craftClank(0, 0.8); this.craftClank(0.2, 1); hit = 0.2; }
    else { hit = this.sample("saw-1", 0.4, undefined, undefined, undefined, 0, 0.4) ? 0.32 : 0; this.thock(hit); }   // two quick strokes, then the thock
    [523, 659, 784].forEach((f, i) => this.note(f, hit + 0.12 + i * 0.07, 0.08, 0.25));
    return hit;
  }
  thock(this: Sound, t: number, v = 1) {                                                         // a mallet on a wooden block, short and hollow
    const r = (0.94 + Math.random() * 0.12);
    this.partials(420 * r, [[1, 0.07, 1], [2.6, 0.035, 0.35]], 0.35 * v, undefined, undefined, t);
    this.tone("sine", 160 * r, 105, 0.07, 0.3 * v, undefined, undefined, t);
    this.burst("lowpass", 1400, 0.7, 0.025, 0.25 * v, undefined, undefined, t);
  }
  craftClank(this: Sound, t: number, v = 1) {                                                    // heavy metal set down: damped low partials, a thump, a short low ring
    const r = (0.94 + Math.random() * 0.12), ring: Partial3[] = [[1, 0.28, 1], [2.76, 0.16, 0.4]];
    this.partials(250 * r, [[1, 0.12, 1], [2.76, 0.07, 0.5], [5.4, 0.03, 0.2]], 0.3 * v, undefined, undefined, t);
    this.burst("bandpass", 800 * r, 1, 0.06, 0.35 * v, undefined, undefined, t);
    this.tone("sine", 110 * r, 65, 0.1, 0.4 * v, undefined, undefined, t);
    this.burst("highpass", 3000, 0.7, 0.008, 0.08 * v, undefined, undefined, t + 0.004);
    this.partials(430 * r, ring, 0.11 * v, undefined, undefined, t); this.partials(434 * r, ring, 0.08 * v, undefined, undefined, t);
  }
  note(this: Sound, f: number, t: number, vol: number, d = 0.3) {                                                // a soft note with an echo
    this.tone("sine", f, f, d, vol, undefined, undefined, t); this.tone("triangle", f, f, d * 0.7, vol * 0.4, undefined, undefined, t);
    this.tone("sine", f, f, d, vol * 0.3, undefined, undefined, t + 0.16);
  }
  // down a floor (Pete chose the refined one): the old notes in softer voices with an echo, landing on a bell chord and a few sparkles
  levelUp(this: Sound) {
    if (!this.ctx || this.muted) return;
    [392, 523, 659, 784, 1047].forEach((f, i) => this.note(f, i * 0.075, 0.12, 0.25));
    [1047, 1319, 1568].forEach((f) => this.bell(f, 0.4, 0.07));
    for (let i = 0; i < 10; i++) this.tone("sine", rnd(3000, 6000), rnd(3000, 6000), 0.15, 0.02, undefined, undefined, rnd(0.4, 1.0));
  }
  // a chest (Pete chose it): the hinge creaks, stick-slip clicks
  // speeding up; the lid falls back with a wooden knock; the loot sparkles as small bells
  chest(this: Sound, x: number, z: number) {
    for (let t = 0; t < 0.3;) { this.burst("bandpass", 420, 9, 0.02, 0.1, x, z, t); t += 1 / (18 + 40 * t); }
    this.tone("sine", 120, 60, 0.12, 0.4, x, z, 0.3); this.partials(240, [[1, 0.08, 0.25], [2.43, 0.05, 0.1]], 1, x, z, 0.3);
    [784, 988, 1175, 1568, 1976].forEach((f, i) => this.bell(f, 0.42 + i * 0.07, 0.05));
  }
  // a small bell: inharmonic partials ringing down
  bell(this: Sound, f: number, t: number, vol: number) { this.partials(f, [[1, 0.6, 1], [2.0, 0.4, 0.4], [2.76, 0.25, 0.25], [5.4, 0.12, 0.1]], vol, undefined, undefined, t); }
  chime(this: Sound) { if (!this.ctx || this.muted) return; this.bell(660, 0, 0.12); this.bell(990, 0.12, 0.1); }   // an achievement: two bells a fifth apart
  // the Necromancer hit (Pete): an evil wizard's roar, deep and horrifying: three saws a fifth and an octave apart sliding down
  // through a growling resonant low-pass with a slow wobble, a throat of filtered noise, a sub boom under it, the lot sent hard into
  // the tunnel echo so it comes back again and again, darker each time
  necroRoar(this: Sound, x: number, z: number) {
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t0 = c.currentTime, dur = 1.7;
    const bus = c.createGain(); bus.connect(this.out(0.6, x, z));
    if (this.echo) { const wet = c.createGain(); wet.gain.value = 0.8; bus.connect(wet).connect(this.echo); }
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 7;
    lp.frequency.setValueAtTime(1100, t0); lp.frequency.exponentialRampToValueAtTime(180, t0 + dur);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t0); env.gain.exponentialRampToValueAtTime(1, t0 + 0.15);
    env.gain.setValueAtTime(1, t0 + dur * 0.45); env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    lp.connect(env).connect(bus);
    const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = 6.5; vg.gain.value = 5; vib.connect(vg);
    for (const f of [88, 132, 44]) {
      const o = c.createOscillator(); o.type = "sawtooth";
      o.frequency.setValueAtTime(f * 1.35, t0); o.frequency.exponentialRampToValueAtTime(f * 0.62, t0 + dur);
      vg.connect(o.frequency); o.connect(lp); o.start(t0); o.stop(t0 + dur + 0.1);
    }
    vib.start(t0); vib.stop(t0 + dur + 0.1);
    this.burst("bandpass", 480, 3, dur * 0.8, 0.3, x, z, 0, 150);                  // the throat
    this.tone("sine", 62, 26, 1.3, 0.9, x, z);                                       // a sub boom
    this.tone("sine", 41, 22, 1.9, 0.6, x, z, 0.4);
  }
  // the Necromancer's force field turned on harder (a blow at him while protected): a deep electric thrum that drops, a crackle
  // swept down through a band-pass, and a high glassy ring over it
  forceField(this: Sound, x: number, z: number) {
    if (!this.ctx || this.muted) return;
    this.tone("sawtooth", 140, 55, 0.5, 0.35, x, z, 0, 900);
    this.tone("square", 70, 40, 0.45, 0.18, x, z);
    this.burst("bandpass", 2400, 4, 0.35, 0.45, x, z, 0, 500);
    this.tone("sine", 1320, 990, 0.6, 0.12, x, z, 0.02);
  }
  // the victory portal's hum (Pete: an energetic digital hum, soft, coming from it, growing as you come close): a warm drone of two
  // detuned saws, a square buzz pulsing eight times a second through a sweeping band-pass, and little data chirps, a high square
  // stepping between pitches. Built once when the portal is near; level 0..1 each frame (main.ts victoryFx), panned to where it is
  portalHum(this: Sound, level: number, x: number, z: number) {
    if (!this.ctx) return;
    const c = this.ctx, now = c.currentTime;
    if (!this.hum) {
      if (level <= 0) return;
      const out = c.createGain(); out.gain.value = 0;
      const pan = c.createStereoPanner(); out.connect(pan).connect(this.master); out.connect(this.send);
      const srcs: OscillatorNode[] = [];
      const osc = (type: OscillatorType, f: number, detune = 0) => { const o = c.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = detune; o.start(); srcs.push(o); return o; };
      const drone = c.createBiquadFilter(); drone.type = "lowpass"; drone.frequency.value = 380;
      const dg = c.createGain(); dg.gain.value = 0.5;
      osc("sawtooth", 55, -7).connect(drone); osc("sawtooth", 55, 7).connect(drone); drone.connect(dg).connect(out);
      const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.frequency.value = 900; bp.Q.value = 6;
      const sweep = osc("sine", 0.23), sd = c.createGain(); sd.gain.value = 500; sweep.connect(sd).connect(bp.frequency);
      const pulse = c.createGain(); pulse.gain.value = 0.5;
      const lfo = osc("square", 8), ld = c.createGain(); ld.gain.value = 0.5; lfo.connect(ld).connect(pulse.gain);   // 0..1, eight times a second
      osc("square", 110).connect(bp).connect(pulse).connect(out);
      const chirp = osc("square", 1320), cg = c.createGain(); cg.gain.value = 0;
      const clp = c.createBiquadFilter(); clp.type = "lowpass"; clp.frequency.value = 3000;
      chirp.connect(clp).connect(cg).connect(out);
      this.hum = { out, pan, srcs, chirp, cg, nextChirp: 0, off: 0 };
    }
    const h = this.hum, L = this.listener, dx = x - L.x, dz = z - L.z, d = Math.max(Math.hypot(dx, dz), 0.5);
    const want = this.muted ? 0 : Math.max(0, Math.min(1, level)) * 0.14;   // (was 0.22: Pete, a little quieter)
    h.out.gain.setTargetAtTime(want, now, 0.25);
    h.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, (dx * Math.cos(L.yaw) - dz * Math.sin(L.yaw)) / d)) * 0.7, now, 0.1);
    if (want > 0.005 && now > h.nextChirp) {                                // a short burst of data: three to six stepped blips
      const steps = [990, 1320, 1760, 1480, 2200], n = 3 + Math.floor(Math.random() * 4), dt = 0.055;
      for (let i = 0; i < n; i++) {
        const t = now + i * dt;
        h.chirp.frequency.setValueAtTime(steps[(Math.random() * steps.length) | 0], t);
        h.cg.gain.setValueAtTime(0.06, t); h.cg.gain.setValueAtTime(0, t + dt * 0.6);
      }
      h.nextChirp = now + 0.6 + Math.random() * 1.4;
    }
    if (level > 0) { h.off = 0; return; }
    if (!h.off) h.off = now + 1.2;                                         // gone: fade, then take it down
    else if (now > h.off) { for (const o of h.srcs) o.stop(); h.out.disconnect(); this.hum = null; }
  }
  // going through the victory portal (Pete: like being digitized and sent): dive seconds of being taken apart, a buzzing tone that
  // breaks up into falling square-wave steps (sampled down to bits) under a rising electric whoosh; then ride seconds sent down the
  // line, a rushing band of noise sweeping up, a deep energy drone, and a stream of ones and zeros (two pitches of short blips, faster
  // and faster); then put back together at the far end: the steps climbing back up into a chord, a soft thump
  portalRide(this: Sound, dive: number, ride: number) {                                               // (about half as loud as it was: Pete)
    if (!this.ctx || this.muted) return;
    const c = this.ctx, t0 = c.currentTime, T = dive + ride;
    const env = (g: GainNode, pts: [t: number, v: number][]) => { g.gain.setValueAtTime(0.0001, t0); for (const [t, v] of pts) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, v), t0 + t); };
    // digitized: a buzz whose pitch steps down in ever coarser stairs
    for (let i = 0, f = 880; i < 14; i++, f *= 0.88) this.tone("square", f, f, 0.07, 0.035 * (1 - i / 18), undefined, undefined, i * dive / 16, 3000);
    // the whoosh: noise through a band-pass sweeping up the whole way, swelling into the ride
    const n = c.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const bp = c.createBiquadFilter(); bp.type = "bandpass"; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(200, t0); bp.frequency.exponentialRampToValueAtTime(900, t0 + dive); bp.frequency.exponentialRampToValueAtTime(3200, t0 + T * 0.9);
    const ng = c.createGain(); env(ng, [[dive * 0.6, 0.35], [dive + ride * 0.3, 0.8], [T * 0.85, 0.6], [T, 0.0001]]);
    n.connect(bp).connect(ng).connect(this.out(0.24)); n.start(t0); n.stop(t0 + T + 0.1);
    // the line's energy: two detuned saws through a low-pass that opens as you speed up, wobbling
    const lp = c.createBiquadFilter(); lp.type = "lowpass"; lp.Q.value = 6;
    lp.frequency.setValueAtTime(300, t0 + dive); lp.frequency.exponentialRampToValueAtTime(2200, t0 + T * 0.92);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 7; lg.gain.value = 180; lfo.connect(lg).connect(lp.frequency);
    const dg = c.createGain(); env(dg, [[dive, 0.0001], [dive + 0.4, 0.22], [T * 0.9, 0.3], [T + 0.15, 0.0001]]);
    for (const f of [55, 55.8]) { const o = c.createOscillator(); o.type = "sawtooth"; o.frequency.setValueAtTime(f, t0 + dive); o.frequency.exponentialRampToValueAtTime(f * 2, t0 + T); o.connect(lp); o.start(t0 + dive); o.stop(t0 + T + 0.2); }
    lp.connect(dg).connect(this.out(0.27)); lfo.start(t0 + dive); lfo.stop(t0 + T + 0.2);
    // ones and zeros: two pitches of blips (a 1 high, a 0 low), the rate climbing, quieter at the ends
    for (let t = dive * 0.4; t < T - 0.15; ) {
      const k = (t - dive * 0.4) / (T - dive * 0.4), one = Math.random() < 0.5, f = (one ? 2093 : 1568) * (1 + 0.25 * k);
      this.tone("square", f, f, 0.022, 0.026 * Math.sin(Math.PI * Math.min(1, k * 1.2)) + 0.006, undefined, undefined, t, 6000);
      t += 0.075 - 0.055 * k + Math.random() * 0.02;
    }
    // reassembled: the stairs climbing back into a chord, a soft thump
    for (let i = 0, f = 220; i < 10; i++, f *= 1.14) this.tone("square", f, f, 0.06, 0.028, undefined, undefined, T - 0.35 + i * 0.03, 2600);
    for (const f of [523, 659, 784]) this.tone("triangle", f, f, 1.2, 0.045, undefined, undefined, T + 0.02);
    this.tone("sine", 90, 40, 0.5, 0.2, undefined, undefined, T);
  }
  // landing in the new world from the sky (main.ts spawnDrop): a heavy thud and a puff of dirt
  land(this: Sound) { if (!this.ctx || this.muted) return; this.tone("sine", 110, 38, 0.45, 0.7); this.burst("lowpass", 700, 0.8, 0.35, 0.6, undefined, undefined, 0, 180); }
  // ?god's nuke: one big blast, a falling thump under a wash of noise
  boom(this: Sound, x: number, z: number) { if (!this.ctx || this.muted) return; this.tone("sine", 90, 28, 0.9, 0.9, x, z); this.burst("lowpass", 900, 0.7, 0.6, 0.8, x, z); }
  death(this: Sound) { this.tone("triangle", 440, 100, 1.1, 0.3); this.tone("sine", 220, 50, 1.2, 0.3, undefined, undefined, 0.1); }
}
