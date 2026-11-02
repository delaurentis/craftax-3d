// Film noir: a look of its own (M, and a button), the world in color's render turned black and white by a post pass (noir.glsl.ts:
// hard contrast, a vignette, a little film grain), the HUD in grays (noir.css). Install it in craftax.config.ts: `plugins: [noir()]`.
// The worked example in doc/looks.md.
import type { Look, LookView, Plugin } from "craftax-3d/plugin";
import css from "./noir.css?raw";
import { NOIR } from "./noir.glsl";

export interface NoirOptions {
  /** How much film grain (0: none). */
  grain?: number;
  /** How dark the corners go (0: no vignette, 1: black). */
  vignette?: number;
}

/** The noir look. */
export default function noir(opts: NoirOptions = {}): Plugin {
  const look: Look = {
    id: "noir", label: "Noir", order: 40,                                   // after laser in M's order
    lines: false, cls: "color noir",                                        // color's render and HUD, and noir.css over it
    css,
    icon: `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="#111" stroke="#eee" stroke-width="1.4"/><path d="M10 2.5a7.5 7.5 0 0 1 0 15Z" fill="#eee"/></svg>`,
  };
  const view: LookView = {
    look: "noir", views: ["first", "overhead"], base: "color",
    post: { shader: NOIR, uniforms: { uGrain: { value: opts.grain ?? 0.08 }, uVignette: { value: opts.vignette ?? 0.7 } } },
  };
  return {
    name: "noir",
    provides: ["look", "lookView"],
    setup(host) { host.add("look", look); host.add("lookView", view); },
  };
}
