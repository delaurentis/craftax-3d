// The Tropical theme pack: palm trees, beaches fading into the grass, volcanic rock and red clay, pigs for cows, skeletons in grass
// skirts and zombies in Hawaiian shirts (theme.ts). T picks it like any theme. Install it in craftax.config.ts: `plugins: [tropical()]`;
// `tropical({ default: true })` starts players in it.
import type { Plugin } from "craftax-3d/plugin";
import { tropicalTheme } from "./theme";

export interface TropicalOptions {
  /** Players start in the Tropical theme until they pick another. */
  default?: boolean;
}

/** The Tropical theme. */
export default function tropical(opts: TropicalOptions = {}): Plugin {
  return {
    name: "tropical",
    provides: ["theme"],
    setup(host) { host.add("theme", { ...tropicalTheme, default: opts.default }); },
  };
}
