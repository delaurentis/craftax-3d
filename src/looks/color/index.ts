// Color, the usual look: the world in its own light and colors, the sky, soft glows and blends; the HUD as the game draws it.
// Its css: color.css (body.color: the hotbar's white labels, kept off the line looks' dark plates).
import type { Look, LookView } from "../types";

export const color: Look = {
  id: "color", order: 10, label: "Color", lines: false, cls: "color",
  bloom: { threshold: 3.0, strength: 0.45, radius: 0.5, knee: 0.01, sat: 0 },   // only the HDR highlights (lava, torches, the sun on water)
};
/** Its renderer in the 3D views: the world in its light, as is. */
export const colorView: LookView = { look: "color", views: ["first", "overhead"], base: "color" };
