// Sound methods (mixed into Sound, src/sound/core.ts): the heart in your ears, held loops, far-off sounds and the ambience of each place
// (wind, crickets, drips, the sea, fire, fountains).
import { rnd } from "./common";
import type { Sound } from "./core";

/** The nearest fountain for its sound (ui/hud/layout fountainNear): where it is, a spring or dripping, how near (1 beside it, 0 at 6 tiles). */
export interface FountainNear { x: number; z: number; spring: boolean; near: number }

export class SoundAmbient {
  // the heart in your ears (Pete, from the sound-design page's death): called every frame; danger 0 is silent, ~0.6 a need run
  // out (health draining), 1 down to the last heart, which beats faster and louder. Lub-dub: a low sine with a second harmonic
  // and a soft thump of noise, so laptop speakers carry it too
  heart(this: Sound, now: number, danger: number) {
    // louder than at first, and growing the longer you stay in danger (Pete): from the moment it starts, over 30 s to more than
    // twice as loud and a quarter faster; it starts over once you are out of it
    if (!danger) { this.dangerSince = 0; return; }
    if (!this.dangerSince) this.dangerSince = now;
    if (!this.ctx || this.muted || now < this.nextBeat) return;
    const grow = Math.min(1, (now - this.dangerSince) / 30000);
    this.nextBeat = now + (danger >= 1 ? 720 : 950) * (1 - 0.25 * grow);
    [[0, 1], [0.22, 0.6]].forEach(([t, g]) => {
      const v = (0.35 + 0.25 * danger) * (1 + 1.3 * grow) * g;
      this.tone("sine", 62, 45, 0.12, v, undefined, undefined, t); this.tone("sine", 124, 90, 0.08, v * 0.6, undefined, undefined, t);
      this.burst("lowpass", 220, 0.7, 0.07, v * 0.6, undefined, undefined, t);
    });
  }

  // ambience, called every frame: surf by the water (sea: 1 beside it, fading in a few tiles; main.ts seaNear), crickets at night,
  // drips underground. The surf is a third of the old everywhere-wind at most (Pete: a loud white noise all over the overworld)
  // trees: the [x, z] of trees a few tiles off (main.ts treesNear); now and then a gust rustles one of them (Pete chose it): 1.5–3.5 s of leaves over a soft low air swell, louder with more trees about
  // a looped recording (made on first use, once its file is in), low-passed at lp, its level eased to `level`
  loop(this: Sound, name: string, level: number, lp = 0) {
    let l = this.loops[name];
    if (!l && !level) return;
    if (!l) {
      const b = this.samples?.[name]; if (!b) return;
      const c = this.ctx!, s = c.createBufferSource(), g = c.createGain();
      s.buffer = b; s.loop = true; s.loopStart = 0.05; s.loopEnd = b.duration - 0.05;   // past the mp3's padding at both ends
      g.gain.value = 0; let n: AudioNode = s;
      if (lp) { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = lp; f.Q.value = 0.5; n = n.connect(f); }
      n.connect(g).connect(this.master); s.start(0, Math.random() * b.duration);
      l = this.loops[name] = g;
    }
    l.gain.setTargetAtTime(level, this.ctx!.currentTime, 0.8);
  }
  // fire: 1 in the Fire Realm, a big real fire burning low and dark in the background (Pete: flames, not noise; subtle); lava: 0-1,
  // how near lava is (main.ts lavaNear), thick slow bubbling only then, with now and then one big bubble bursting
  // one tinkle of ice: a recorded glass tap sped up high, now and then the recorded chimes, else a synthesized glassy bell; all quiet,
  // somewhere around you, and mostly the long echo
  tinkle(this: Sound) {
    const a = rnd(0, 6.283), d = rnd(2, 10), x = this.listener.x + Math.cos(a) * d, z = this.listener.z + Math.sin(a) * d, r = Math.random();
    this.longWet = true;
    if (!(r < 0.45 && this.sample(`glass-${1 + Math.floor(Math.random() * 3)}`, rnd(0.05, 0.12), x, z, rnd(1.4, 2.6)))
      && !(r < 0.55 && this.sample(`chimes-${1 + Math.floor(Math.random() * 2)}`, 0.06, x, z, rnd(0.9, 1.4)))) {
      const f = rnd(2200, 6000);
      [[1, rnd(0.6, 1.2), 0.04], [2.76, 0.4, 0.015], [5.4, 0.2, 0.008]].forEach(([m, dd, g]) => this.tone("sine", f * m, f * m * 0.995, dd, g, x, z));
    }
    this.longWet = false;
  }
  // a recording far off: muffled, quiet, mostly the long echo (the Graveyard)
  farRec(this: Sound, name: string, vol: number, rate: number, lp: number) {
    const a = rnd(0, 6.283), d = rnd(7, 15);
    this.longWet = true; this.sample(name, vol, this.listener.x + Math.cos(a) * d, this.listener.z + Math.sin(a) * d, rate, 0, 0, lp); this.longWet = false;
  }
  // ambience, called every frame. level: the floor (0 the Overworld, 6 Fire Realm, 7 Ice Realm, 8 Graveyard); lava 0-1 how near lava
  // is (main.ts lavaNear); fountain: the nearest fountain within a few tiles, { spring, near 0-1 } (main.ts fountainNear), or null.
  // Each place has its own reverb (Pete), and its own bed: surf and leaves above ground; in the caves a low rock hum, air moaning
  // through the tunnels, stones settling and now and then a far thud, drips only by a dripping fountain, a spring's bubbling by a
  // spring; the Fire Realm a quiet fire; the Ice Realm a cold wind and glass tinkling; the Graveyard a howling wind, ghosts, a bell,
  // crows and a gate (Pete chose them all)
  // burn 0-1: sinking into lava (main.ts lavaFire): the lava swells loud round you and the Fire Realm's fire roars up (Pete)
  ambient(this: Sound, now: number, daylight: number, under: boolean, sea = 0, trees: [x: number, z: number][] = [], level = 0, lava = 0, fountain: FountainNear | null = null, burn = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, fire = level === 6, ice = level === 7, grave = level === 8, cave = under && !fire && !ice && !grave;
    this.setSpace(fire ? "fire" : ice ? "ice" : grave ? "grave" : under ? "cave" : "overworld");
    this.loop("fire-loop", Math.max(fire ? 0.07 : 0, 0.5 * burn), 1500);   // a hearth (Pete's pick), subtle; roaring as you burn
    this.loop("lava-loop", 0.18 * lava + 0.4 * burn, 700); this.loop("boil-loop", 0.08 * lava + 0.25 * burn, 500);   // (a third quieter, Pete)
    if (lava > 0 && now > (this.nextBlorp || 0)) {
      this.nextBlorp = now + (1200 + Math.random() * 2800) / Math.max(lava, 0.3);
      const a = Math.random() * 6.283, dd = 2 + Math.random() * 5, x = this.listener.x + Math.cos(a) * dd, z = this.listener.z + Math.sin(a) * dd;
      this.tone("sine", 70 + Math.random() * 40, 160 + Math.random() * 100, 0.18, 0.17 * lava, x, z); this.burst("lowpass", 350, 1, 0.2, 0.1 * lava, x, z, 0.15, 150);
    }
    this.wind.gain.setTargetAtTime(under ? 0 : sea * (0.018 + 0.006 * daylight + 0.004 * Math.sin(now / 2700)), t, 0.6);
    if (!under && daylight < 0.35 && now > this.nextCricket) {
      this.nextCricket = now + 350 + Math.random() * 900;
      const x = this.listener.x + (Math.random() - 0.5) * 16, z = this.listener.z + (Math.random() - 0.5) * 16;
      for (let i = 0; i < 3; i++) this.tone("sine", 4300, 4300, 0.035, 0.05 * (0.35 - daylight) / 0.35, x, z, i * 0.06);
    }
    if (!under && trees.length && now > this.nextGust) {
      this.nextGust = now + 7000 + Math.random() * 16000;
      const [x, z] = trees[Math.floor(Math.random() * trees.length)], amt = Math.min(1, trees.length / 6), dur = 1.5 + Math.random() * 2;
      this.rustle(x, z, dur, 40 + Math.random() * 40, 0.05 * amt);
      this.swell("lowpass", 250, 550, 300, 0.7, dur, 0.06 * amt, x, z, 0, 0.5);
    } else if (!trees.length && now > this.nextGust) this.nextGust = now + 3000 + Math.random() * 6000;   // walk into a wood: not at once
    // the caves
    this.room.gain.setTargetAtTime(cave ? 0.05 + 0.02 * Math.sin(now / 11000 * 6.283) : 0, t, 0.8);
    this.tunnel.gain.setTargetAtTime(cave ? 0.012 * Math.pow(Math.max(0, Math.sin(now / 17000 * 6.283)), 2) : 0, t, 0.8);
    this.tunnelF.frequency.setTargetAtTime(290 + 90 * Math.sin(now / 23000 * 6.283), t, 1);
    if (cave && now > (this.nextSettle || 0)) {
      this.nextSettle = now + rnd(6000, 15000);
      const a = rnd(0, 6.283), d = rnd(8, 14), x = this.listener.x + Math.cos(a) * d, z = this.listener.z + Math.sin(a) * d;
      for (let i = 0, tt = 0, n = 3 + Math.floor(Math.random() * 4); i < n; i++) { this.burst("bandpass", rnd(1100, 2400), 3, 0.02, 0.18 * Math.pow(0.8, i), x, z, tt); tt += rnd(0.06, 0.16); }
    }
    if (cave && now > (this.nextFar || 0)) {
      this.nextFar = now + rnd(15000, 35000);
      const a = rnd(0, 6.283), x = this.listener.x + Math.cos(a) * 14, z = this.listener.z + Math.sin(a) * 14;
      this.tone("sine", 70, 38, 0.35, 0.5, x, z); this.burst("lowpass", 300, 0.7, 0.3, 0.35, x, z);
    }
    // fountains: a spring's jet hisses and its basin burbles; a dripping one drips
    const spring = fountain && fountain.spring ? fountain.near : 0;
    this.sprayG.gain.setTargetAtTime(0.012 * spring * (0.7 + 0.6 * Math.random()), t, 0.05);
    if (spring && Math.random() < 0.5 * spring) {
      const fx = fountain!.x, fz = fountain!.z;
      this.tone("sine", rnd(320, 900), rnd(800, 2300), 0.055, rnd(0.03, 0.07) * spring, fx + rnd(-0.3, 0.3), fz);
      if (Math.random() < 0.6) this.burst("highpass", rnd(3500, 6000), 0.7, 0.006, rnd(0.02, 0.05) * spring, fx, fz);
    }
    if (fountain && !fountain.spring && now > this.nextDrip) {
      this.nextDrip = now + 900 + Math.random() * 2200;
      const f = rnd(800, 1300), x = fountain.x + rnd(-0.4, 0.4), z = fountain.z + rnd(-0.4, 0.4);
      this.tone("sine", f, f * 2.6, 0.055, 0.14 * fountain.near, x, z); if (Math.random() < 0.4) this.tone("sine", f * 1.5, f * 3.9, 0.055, 0.05 * fountain.near, x, z, 0.09);
    }
    // the Ice Realm
    this.cold.gain.setTargetAtTime(ice ? 0.01 + 0.008 * Math.sin(now / 5300) : 0, t, 0.8);
    this.coldF.frequency.setTargetAtTime(2400 + 900 * Math.sin(now / 7100), t, 1);
    if (ice && now > (this.nextTinkle || 0)) { this.nextTinkle = now + rnd(250, 1400); this.tinkle(); }
    // the Graveyard
    this.howlA.gain.setTargetAtTime(grave ? 0.03 * (0.5 + 0.5 * Math.sin(now / 6100)) : 0, t, 1);
    this.howlB.gain.setTargetAtTime(grave ? 0.015 * (0.5 + 0.5 * Math.sin(now / 4300 + 1)) : 0, t, 1);
    this.howlAF.frequency.setTargetAtTime(380 + 120 * Math.sin(now / 3700), t, 1); this.howlBF.frequency.setTargetAtTime(760 + 220 * Math.sin(now / 2900), t, 1);
    if (grave) {
      if (now > (this.nextGhost || 0)) { this.nextGhost = now + rnd(8000, 20000); this.farRec(`ghost-${1 + Math.floor(Math.random() * 5)}`, 0.3, rnd(0.85, 1), 2500); }
      if (now > (this.nextCrow || 0)) { this.nextCrow = now + rnd(14000, 30000); this.farRec(`crow-${1 + Math.floor(Math.random() * 2)}`, 0.2, rnd(0.9, 1.05), 3000); }
      if (now > (this.nextGate || 0)) { this.nextGate = now + rnd(30000, 60000); this.farRec(`gate-${1 + Math.floor(Math.random() * 2)}`, 0.2, rnd(0.8, 0.95), 2000); }
      if (now > (this.nextBell || 0)) {                                     // a deep bell, three slow tolls
        this.nextBell = now + rnd(25000, 45000);
        const a = rnd(0, 6.283), x = this.listener.x + Math.cos(a) * 12, z = this.listener.z + Math.sin(a) * 12;
        this.longWet = true;
        for (let k = 0; k < 3; k++) [[0.5, 4, 0.5], [1, 3.5, 1], [1.19, 2.5, 0.5], [1.5, 2, 0.3], [2, 1.5, 0.25], [2.6, 1, 0.15]].forEach(([m, dd, g]) => this.tone("sine", 196 * m, 196 * m * 0.997, dd, 0.06 * g, x, z, k * 2.4));
        this.longWet = false;
      }
    }
  }
}
