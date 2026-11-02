// Pixel art 3D: a look of its own (M, and a button), the world in color's render drawn in big square pixels (4 CSS px each, nearest
// neighbor) and quantized to a 16-color palette (DawnBringer's DB16) with an ordered 4 × 4 dither (pixel.glsl.ts). Its HUD is
// color's. Install it in craftax.config.ts: `plugins: [pixel()]`.
import * as THREE from "three";
import type { Look, LookView, Plugin } from "craftax-3d/plugin";
import { PIXEL } from "./pixel.glsl";

export interface PixelOptions {
  /** CSS px per drawn pixel (default 4). */
  size?: number;
  /** The ordered dither's strength (0: none, flat bands of color). */
  dither?: number;
}

// DB16: sixteen colors made for game art, in display colors (the pass works after tone mapping)
const DB16 = [0x140c1c, 0x442434, 0x30346d, 0x4e4a4e, 0x854c30, 0x346524, 0xd04648, 0x757161,
  0x597dce, 0xd27d2c, 0x8595a1, 0x6daa2c, 0xd2aa99, 0x6dc2ca, 0xdad45e, 0xdeeed6];
const rgb = (h: number) => new THREE.Vector3(((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255);

/** The pixel art look. */
export default function pixel(opts: PixelOptions = {}): Plugin {
  const look: Look = {
    id: "pixel", label: "Pixel", order: 50,                                 // after noir in M's order
    lines: false, cls: "color pixel",                                       // color's render and HUD
    icon: `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" shape-rendering="crispEdges"><rect x="2" y="2" width="8" height="8" fill="#6daa2c"/><rect x="10" y="2" width="8" height="8" fill="#597dce"/><rect x="2" y="10" width="8" height="8" fill="#854c30"/><rect x="10" y="10" width="8" height="8" fill="#dad45e"/><rect x="6" y="6" width="4" height="4" fill="#140c1c"/><rect x="10" y="10" width="4" height="4" fill="#140c1c"/></svg>`,
  };
  const view: LookView = {
    look: "pixel", views: ["first", "overhead"], base: "color", scale: opts.size ?? 4,
    post: { shader: PIXEL, uniforms: { uPal: { value: DB16.map(rgb) }, uDither: { value: opts.dither ?? 0.12 } } },
  };
  return {
    name: "pixel",
    provides: ["look", "lookView"],
    setup(host) { host.add("look", look); host.add("lookView", view); },
  };
}
