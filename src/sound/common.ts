// What the sound's parts share (js/sound.ts): the mute and volume keys, a random range, the creatures' recorded voices and each place's
// reverb.

export const KEY = "craftax3d.muted", VOL = "craftax3d.volume";
export const load = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
export const save = (v: boolean) => { try { localStorage.setItem(KEY, v ? "1" : "0"); } catch {} };

export const rnd = (a: number, b: number) => a + Math.random() * (b - a);
// the mobs' recorded voices: kind → [[clip, speed]…, level, low-pass]
/** A recorded clip and its speed. */
export type Clip = [name: string, rate: number];
/** A creature's voices: its clips, their level and a low-pass cutoff (0: none). */
export type Voice = [clips: Clip[], level: number, lp: number];
export const TROLL: Clip[] = [["troll-1", 0.97], ["troll-2", 0.97], ["troll-3", 0.97], ["troll-4", 0.97]], ORC = TROLL.map(([n]): Clip => [n, 1.22]);
export const VOICES: Record<string, Voice> = {
  zombie: [[1, 2, 3, 4, 5].map((k): Clip => [`zombie-${k}`, 1]), 0.6, 0],
  troll: [TROLL, 0.75, 0], frost_troll: [TROLL, 0.75, 0],
  orc_soldier: [ORC, 0.6, 0], orc_mage: [ORC, 0.6, 0],                    // orcs: the trolls, faster, so smaller
  deep_thing: [[["deep-1", 0.7], ["deep-2", 0.6], ["deep-3", 0.6]], 0.6, 1400],   // wet and gurgly, as if under the water
  pigman: [[["pig-1", 0.8], ["pig-2", 0.8], ["pig-3", 0.8]], 0.6, 3000],   // pig grunts, lower: big and mean
  lizard: [[["snarl-1", 1], ["snarl-2", 1]], 0.6, 0],                     // the scary monster snarls
  kobold: [[["kobold-1", 1.1], ["kobold-2", 1.1], ["kobold-3", 1.1]], 0.5, 0],   // small creatures chittering
  knight: [[["armor-1", 1], ["chain-1", 1], ["chain-2", 1]], 0.45, 0], knight_archer: [[["armor-1", 1.1], ["chain-1", 1.1], ["chain-2", 1.1]], 0.4, 0],   // armour, not a voice
};
// the reverb of each place (Pete: reverb in the right environments): [tail s, decay curve, wet]
export const SPACES: Record<string, [tail: number, decay: number, wet: number]> = { overworld: [0.45, 4, 0.08], cave: [2.2, 2.2, 0.3], fire: [1.2, 3, 0.15], ice: [2.5, 2, 0.22], grave: [2.5, 2, 0.22] };
