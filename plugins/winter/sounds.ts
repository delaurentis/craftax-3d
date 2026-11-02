// The reindeer's sounds (Winter's Theme.sounds), in place of the cow's: quiet and now and then, never a moo. Made the way the game
// makes its own creature voices, from its sound building blocks: filtered noise for breath and snow (burst), a voice through two
// vowel formants (vox), a low thump (tone). Idle: half the time nothing, else a soft snort, a low grunt or hooves crunching in snow.
// Hurt: a short bleat over a soft thump; killed: a falling bleat, quieter than the cow's.
import type { Sound, SoundSpec } from "craftax-3d/plugin";

const r = (a: number, b: number) => a + Math.random() * (b - a);
// a snort: a short huff of breath through the nose, a low puff under it
const snort = (s: Sound, x: number, z: number) => { s.burst("bandpass", r(800, 1000), 1.3, 0.16, 0.09, x, z, 0, 500); s.burst("lowpass", 320, 0.7, 0.1, 0.06, x, z, 0.02); };
// a grunt: low and short, through soft vowels
const grunt = (s: Sound, x: number, z: number) => s.vox(r(100, 118), r(80, 90), 360, 880, 0.22, 0.07, x, z, 0, 0.03);
// hooves in snow: two or three soft crunches
const hooves = (s: Sound, x: number, z: number) => { for (let i = 0, t = 0, n = 2 + Math.floor(Math.random() * 2); i < n; i++, t += r(0.18, 0.28)) { s.burst("highpass", r(2200, 3000), 0.8, 0.05, 0.035, x, z, t); s.burst("lowpass", 500, 0.7, 0.04, 0.04, x, z, t); } };
// a bleat: higher, short, a little nasal
const bleat = (s: Sound, x: number, z: number, vol: number, dur: number, fall: number) => s.vox(r(240, 270), fall, 520, 1500, dur, vol, x, z, 0, 0.02);

/** The reindeer's sounds, by the game's names for the cow's. */
export const REINDEER_SOUNDS: Record<string, SoundSpec | null> = {
  moo: (s: Sound, x: number, z: number) => { const k = Math.random(); if (k < 0.5) return; (k < 0.7 ? snort : k < 0.88 ? grunt : hooves)(s, x, z); },
  angryMoo: (s: Sound, x: number, z: number) => { bleat(s, x, z, 0.09, 0.16, 200); return true; },
  "hit:cow": (s: Sound, x: number, z: number) => { s.burst("lowpass", 400, 0.7, 0.08, 0.2, x, z); bleat(s, x, z, 0.09, 0.16, 200); },
  "mobDie:cow": (s: Sound, x: number, z: number) => { bleat(s, x, z, 0.1, 0.4, 130); s.tone("sine", 90, 50, 0.14, 0.25, x, z, 0.4); s.burst("lowpass", 320, 0.7, 0.1, 0.18, x, z, 0.4); },
  "kill:cow": (s: Sound, x: number, z: number) => { s.burst("lowpass", 400, 0.7, 0.08, 0.2, x, z); s.mobDie(x, z, "cow", true); },
};
