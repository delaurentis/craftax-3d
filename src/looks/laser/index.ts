// Laser: the 3D world as glowing red outlines on a dark fill (the shared outline pass, src/looks/shared/), the HUD as red laser lines
// (src/looks/shared/outline.css in laser.css's red, and laser.css's own rules). Phosphor draws over this frame in its own ink.
import type { Look, LookView } from "../types";

export const laser: Look = {
  id: "laser", order: 30, label: "Laser", lines: true, cls: "laser",
  // a tight glow, the fill stays dark; a wide knee, so the glow fades in with line brightness (by distance), not on / off; crowded
  // lines share their glow (bloomSat)
  bloom: { threshold: 0.17, strength: 0.3, radius: 0.0, knee: 0.25, sat: 5 },
  pass: { ink: [1.0, 0.0232, 0.0091], satAxis: [1, -2, 0], code: false },   // the HUD's #ff2a18 in linear light; the crowding measure: red
  hud: { ink: "#ff2a18", bars: ["#ff2a18", "#ff9a80", "#b81e10", "#4a2724"], key: "L" },
  pixel: {
    every: false,                                                             // only the lines that take a line look's ink (data-pixel-outline): red
    ink: { flat: ["#3a0a06", "#ff2a18"], stone: (t) => `rgb(${Math.round(255 - 70 * t)},${Math.round(96 - 66 * t)},${Math.round(82 - 52 * t)})` },
  },
  aim: { red: 0xffd2c8 },                                                     // the red box in a red world: a pale pink, so it still stands out
  spark: { hue: 5, hex: 0xff2a18, rgb: "255,42,24" },
};
/** Its renderer in the 3D views: the line frame, as is. */
export const laserView: LookView = { look: "laser", views: ["first", "overhead"], base: "outline" };
