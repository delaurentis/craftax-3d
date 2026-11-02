// The Winter theme pack: snow on everything on the overworld and falling from the sky (theme.ts, snow.ts). T picks it like any
// theme. Install it in craftax.config.ts: `plugins: [winter()]`; `winter({ default: true })` starts players in it.
import type { Plugin } from "craftax-3d/plugin";
import { winterTheme } from "./theme";

export interface WinterOptions {
  /** Players start in the Winter theme until they pick another. */
  default?: boolean;
}

/** The Winter theme. */
export default function winter(opts: WinterOptions = {}): Plugin {
  return {
    name: "winter",
    provides: ["theme"],
    setup(host) { host.add("theme", { ...winterTheme, default: opts.default }); },
  };
}
