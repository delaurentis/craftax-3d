// The sound gate (js/sound.ts): wraps the named effects on Sound's prototype so a fast bot can't flood the browser's audio, and so a
// theme can play its own instead (Theme.sounds); runs once, after every method is in place.
import { Sound } from "./core";
import { onScreen } from "../themes/state";
import type { SoundSpec } from "../themes/types";

// the gate (Pete: a fast bot crashed the browser's sound with thousands of overlapping voices): every named sound passes it before
// it builds a single node, so a dropped sound costs nothing. Three ranks: UI, you, the boss and achievements always play; events
// (blocks breaking, trees falling, kills) thin to a trickle once the bot runs fast; chatter (steps, swings, voices) goes first.
// pace: the bot's moves a second (main.ts; 0 when you play); busy above 12. And whatever the pace, at most ~20 gated sounds a second
export const EVENT = new Set(["chop", "treeFall", "rockBreak", "place", "kill", "mobDie", "bones", "clank", "iceTinkle", "fireRoar", "rattle", "shot", "boom"]);
export const CHATTER = new Set(["step", "swing", "hit", "armorStep", "clash", "groan", "giggle", "moo", "angryMoo", "rustle", "tinkle", "farRec"]);
export const BUSY = 12, EVENTS_PER_S = 5, CAP_PER_S = 20;
Sound.prototype.pace = 0;
Sound.prototype.allow = function (this: Sound, name: string) {
  const now = performance.now(), busy = this.pace > BUSY;
  const recent = (this.played ??= []);
  while (recent.length && now - recent[0] > 1000) recent.shift();
  if (recent.length >= CAP_PER_S) return false;                                // the hard cap
  const last = (this.lastAt ??= {});
  if (CHATTER.has(name)) {
    if (this.pace > 30) return false;                                          // very fast: no chatter at all
    if (busy && now - (last[name] || 0) < 1000) return false;                  // fast: each kind once a second at most
  } else if (busy) {                                                           // events: a steady trickle, ~5 of each a second, unevenly spaced
    if (now - (last[name] || 0) < (1000 / EVENTS_PER_S) * (0.75 + 0.5 * Math.random())) return false;
  }
  last[name] = now; recent.push(now);
  return true;
};
type Effect = (this: Sound, ...a: unknown[]) => unknown;
const proto = Sound.prototype as unknown as Record<string, unknown>;   // the effects by name
// a theme's own sound for this effect (Theme.sounds): by the name and the creature's kind ("hit:cow"), else by the name; null: silent
function themed(name: string, a: unknown[]): SoundSpec | null | undefined {
  const own = onScreen.to?.sounds;
  if (!own) return undefined;
  const kind = a.find((v) => typeof v === "string") as string | undefined, k = kind && `${name}:${kind}`;
  return k && k in own ? own[k] : name in own ? own[name] : undefined;
}
for (const name of [...EVENT, ...CHATTER]) {
  const f = proto[name] as Effect; if (typeof f !== "function") continue;
  proto[name] = function (this: Sound, ...a: unknown[]) {
    const own = themed(name, a);                                               // (asked first: a theme's sound replaces one inside another too)
    if (own === null) return undefined;
    const play = () => (own ? own(this, ...a) : f.apply(this, a));
    if (this.inGate) return play();                                            // a sound inside another: the outer one was let through
    if (!this.allow(name)) return undefined;
    this.inGate = true;
    try { return play(); } finally { this.inGate = false; }
  };
}
