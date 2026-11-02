// Phosphor: an old green text-mode screen. Laser's frame redrawn in green characters (code-art.ts in the shared outline pass), with
// shockwaves where things are hit and the Necromancer in code (fx.ts), the gravestone in characters (gravestone.ts), the HUD and
// menus in the scene's green (src/looks/shared/outline.css in phosphor.css's ink, and its own rules), the simulation's typed
// caption (caption.ts).
import type { Look, LookView } from "../types";
import { necroCode, shockwave } from "./fx";
import { codeStone } from "./gravestone";

export const phosphor: Look = {
  id: "phosphor", order: 20, label: "Phosphor", lines: true, over: true, cls: "phosphor",
  pass: { ink: [0.03, 1.0, 0.12], satAxis: [-2, 1, 0], code: true },        // the HUD's #30ff61; the crowding measure: green
  hud: { ink: "#30ff61", bars: ["#30ff61", "#c8ffd6", "#1c8f3d", "#06240f"], key: "P" },
  pixel: {
    every: true,                                                              // every line on the page in the scene's greens
    ink: {
      flat: ["#06210f", "#30ff61"],
      stone: (t) => `rgb(${Math.round(200 - 172 * t)},${Math.round(255 - 60 * t)},${Math.round(214 - 150 * t)})`,   // green-white to green
      cut: ["#0b3a18", "#9dffb4"],                                            // on the dark code stone the cut burns bright
      ext: ["#03140a", "#072a12"], outline: "#020a04",
    },
  },
  aim: { green: 0xd8ffe2, every: 0xd8ffe2, glow: true },                      // every box style greenish white, its target glowing (Pete)
  spark: { hue: 132, hex: 0x2aff5a, rgb: "48,255,97" },
  // his field there all the time, and he almost white with it, blazing white when hit (Pete): his body glows, the pool round him strong
  necro: { glow: 0.9, flare: 1.6, light: 0.9 },
  shock: (pos, strength, model) => shockwave(pos, strength, model),
  frame: (now, on) => necroCode(now, on),
  dead: () => requestAnimationFrame(() => codeStone()),                       // its picture, now the stone has its size
};
/** Its renderer in the 3D views: laser's line frame, in its code art (its pass: code-art.ts in the shared outline pass). */
export const phosphorView: LookView = { look: "phosphor", views: ["first", "overhead"], base: "outline" };
