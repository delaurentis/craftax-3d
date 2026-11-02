// The pigs' sounds (Tropical's Theme.sounds), by the game's names for the cow's: real pigs, recorded (CC0, sounds/README.md), loaded
// from the folder beside this one into the game's own samples the first time a pig makes a sound; until they're in, a grunt or squeal
// made from the game's sound building blocks.
import type { Sound, SoundSpec } from "craftax-3d/plugin";

const r = (a: number, b: number) => a + Math.random() * (b - a), any = <T>(list: T[]) => list[Math.floor(Math.random() * list.length)];
const OINKS = ["pig-oink-1", "pig-oink-2", "pig-oink-3"], SQUEALS = ["pig-squeal-1", "pig-squeal-2", "pig-squeal-3"];
let loading = false;
function load(s: Sound): void {
  if (loading || !s.ctx || !s.samples) return;
  loading = true;
  const ctx = s.ctx, samples = s.samples;
  for (const n of [...OINKS, ...SQUEALS]) {
    fetch(new URL(`./sounds/${n}.mp3`, import.meta.url)).then((res) => res.arrayBuffer()).then((b) => ctx.decodeAudioData(b))
      .then((buf) => (samples["tropical-" + n] = buf)).catch(() => {});
  }
}
const rec = (s: Sound, list: string[], vol: number, x: number, z: number, rate = r(0.95, 1.05), dur = 0) => { load(s); return s.sample("tropical-" + any(list), vol, x, z, rate, 0, dur); };
const oink = (s: Sound, x: number, z: number, vol = 0.08) => { s.vox(r(150, 180), r(105, 120), 520, 1250, 0.11, vol, x, z, 0, 0.03); s.vox(r(140, 165), r(95, 110), 500, 1150, 0.13, vol * 0.9, x, z, 0.16, 0.03); };
const squeal = (s: Sound, x: number, z: number, vol: number, dur: number, fall: number) => s.vox(r(620, 700), fall, 900, 2300, dur, vol, x, z, 0, 0.02);

export const PIG_SOUNDS: Record<string, SoundSpec> = {
  moo: (s: Sound, x: number, z: number) => { if (Math.random() < 0.35) return; if (!rec(s, OINKS, 0.28, x, z)) oink(s, x, z); },
  angryMoo: (s: Sound, x: number, z: number) => { if (!rec(s, SQUEALS, 0.32, x, z, r(0.95, 1.05), 0.7)) squeal(s, x, z, 0.08, 0.18, 520); return true; },
  "hit:cow": (s: Sound, x: number, z: number) => { s.burst("lowpass", 400, 0.7, 0.08, 0.2, x, z); if (!rec(s, SQUEALS, 0.35, x, z, r(1, 1.1), 0.6)) squeal(s, x, z, 0.09, 0.2, 520); },
  "mobDie:cow": (s: Sound, x: number, z: number) => { if (!rec(s, ["pig-squeal-2", "pig-squeal-3"], 0.38, x, z, 0.92)) squeal(s, x, z, 0.1, 0.45, 300); s.burst("lowpass", 320, 0.7, 0.1, 0.18, x, z, 0.4); },
  "kill:cow": (s: Sound, x: number, z: number) => { s.burst("lowpass", 400, 0.7, 0.08, 0.2, x, z); s.mobDie(x, z, "cow", true); },
};
