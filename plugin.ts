// craftax-3d/plugin: everything a plugin may use from the game, in one place. A plugin built into a copy of the game (listed in
// craftax.config.ts) imports from here and nowhere else in the game, so the game's own files can change without breaking it
// (npm run check holds plugins/ and examples/ to that). A plugin a player adds by hand is one plain file that can't import: it
// gets the same things from its host, host.kit (and three.js as host.three).
//
//   import { B, hex, px, type Plugin, type Theme } from "craftax-3d/plugin";
//
// What's here:
//   types     every slot's interface (Plugin, PluginHost, Theme, SetPieces, BotSource, Telemetry, Look, LookView...) and Sound, RGB
//   blocks    B (Craftax's block ids, by name) and ORE (the ore blocks)
//   paint     painting 16 × 16 tiles as the game does: S (16), R and rnd (its seeded random numbers), hex, rgb, px, noise, specks,
//             the base colors SAND, SNOW, STONE, the rock's variants STONE_VARIANTS, and standardTile / standardOutline (a tile
//             the game has, painted as the game paints it, and its laser drawing), to draw over
//   models    the creatures' parts: U (a texture pixel, 1/16 block), part, quadruped, haloMaterial (call them from a model(),
//             once the game has loaded)
//   hud       an item's pixels and icon as the HUD draws them: toolPixels, iconURL
//   orient    set pieces placed facing any side: orient, SIDES
import { B, ORE } from "./src/world/blocks";
import { NAMES, R, S, SAND, SNOW, STONE, hex, noise, painters, px, rgb, rnd, specks, type Painter } from "./src/resources/blocks/paint";
import { STONE_VARIANTS } from "./src/resources/blocks/painters/terrain";
import { OUTLINE } from "./src/resources/blocks/outline-atlas";
import { U, haloMaterial, part, quadruped } from "./js/models";
import { toolPixels } from "./src/resources/items/icons";
import { iconURL } from "./src/resources/blocks/atlas";
import { SIDES, orient } from "./src/scenes/orient";
import { kitRef } from "./src/core/plugins";

export type * from "./src/core/plugins";
export type { Sound } from "./src/sound/core";
export type { BotReply } from "./src/core/types";
export type { RGB } from "./src/resources/blocks/paint";
export type { Oriented } from "./src/scenes/orient";

/** A tile the game has, painted with the same random numbers as the game paints it: a theme's tile drawn over the standard one. */
export const standardTile = (name: string): Painter => (g) => { R.seed = 1 + NAMES.indexOf(name) * 7919; painters[name](g); };
/** That tile's laser and phosphor drawing (64 × 64, white lines on black), the same way. */
export const standardOutline = (name: string): Painter => (g) => { R.seed = 7 + NAMES.indexOf(name) * 104729; OUTLINE[name]?.(g); };

export { B, ORE, R, S, SAND, SNOW, STONE, STONE_VARIANTS, hex, noise, px, rgb, rnd, specks, U, haloMaterial, part, quadruped, toolPixels, iconURL, SIDES, orient };

/** The same, grouped, as a plugin added by hand gets it (host.kit). */
export const kit = {
  blocks: { B, ORE },
  paint: { S, R, rnd, hex, rgb, px, noise, specks, SAND, SNOW, STONE, STONE_VARIANTS, standardTile, standardOutline },
  models: { U, part, quadruped, haloMaterial },
  hud: { toolPixels, iconURL },
  orient: { orient, SIDES },
};
export type Kit = typeof kit;
kitRef.kit = kit;
