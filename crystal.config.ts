// A test copy of the game with the crystal plugin too, from the craftax-crystal checkout beside this one (laser's picture
// in the classic view, what the crystal sees); everything else as craftax.config.ts has it.
//   CRAFTAX_CONFIG=crystal.config.ts npx vite --port 8797     then open /?crystal
import type { CraftaxConfig } from "./src/config";
import base from "./craftax.config";
import crystal from "../craftax-crystal/src/index";

const config: CraftaxConfig = { ...base, plugins: [...base.plugins, crystal()] };

export default config;
