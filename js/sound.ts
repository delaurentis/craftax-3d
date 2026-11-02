// Sound: every effect synthesized with Web Audio, no audio files. Tones and filtered noise bursts make footsteps, chopping, mining,
// placing, drinking, eating, combat, mob groans and the ambience (wind by day, crickets at night, drips underground). Sounds at a world
// position are panned and fade with distance from the listener. The context starts on the first key or click (browser rule).
// The parts live in src/sound/ (core.ts: the Sound class, its effects in world.ts, creatures.ts, events.ts, ambient.ts; gate.ts
// thins them when a fast bot plays); this module keeps the name everything imports from it.
export { Sound } from "../src/sound/core";
import "../src/sound/gate";
