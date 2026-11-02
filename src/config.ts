// The game's setup, read once: the home site and the plugins, from craftax.config.ts (or the file CRAFTAX_CONFIG names at
// build time). Importing this module registers the plugins, so the game page and the replay page import it first.
import hostConfig from "craftax:config";
import { registerPlugins, type Plugin } from "./core/plugins";

export interface CraftaxConfig {
  /** The game's home on the web: the Research screen and the menus link here. Empty: no links. */
  site: string;
  plugins: Plugin[];
}

export const config: CraftaxConfig = { site: "", plugins: [], ...hostConfig };
registerPlugins(config.plugins);
