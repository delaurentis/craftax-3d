// The one place a copy of the game is set up: its home site and the plugins it loads. A plugin listed here is on; one left out
// isn't imported, so it isn't in the build at all. A host site keeps its own copy of this file and builds with
// CRAFTAX_CONFIG=path/to/its/craftax.config.ts (vite.config.ts), importing these from "craftax-3d/plugins/…".
import type { CraftaxConfig } from "./src/config";
import winter from "./plugins/winter";
import ruins from "./plugins/ruins";
import tropical from "./plugins/tropical";
// import university from "./plugins/university";                         its building stone is Ruins': list both
// import noir from "./plugins/noir";
// import pixel from "./plugins/pixel";

const config: CraftaxConfig = {
  site: "https://playcraftax.com",
  plugins: [winter(), ruins(), tropical()],
};

export default config;
