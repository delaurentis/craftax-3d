// The Ruins theme pack: any world's rock and ore drawn as ruined college stonework (theme.ts). T picks it like any theme.
// Install it in craftax.config.ts: `plugins: [ruins()]`; `ruins({ default: true })` starts players in it until they pick another.
import type { Plugin } from "craftax-3d/plugin";
import { ruinsTheme } from "./theme";

export interface RuinsOptions {
  /** Players start in the Ruins theme until they pick another. */
  default?: boolean;
}

/** The Ruins theme. */
export default function ruins(opts: RuinsOptions = {}): Plugin {
  return {
    name: "ruins",
    provides: ["theme"],
    setup(host) { host.add("theme", { ...ruinsTheme, default: opts.default }); },
  };
}
