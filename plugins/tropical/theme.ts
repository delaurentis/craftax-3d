// The Tropical theme: palm trees for the overworld's trees (palm.ts), beaches fading into the grass, volcanic rock and red clay
// (tiles.ts), pigs for cows, skeletons in grass skirts, zombies in Hawaiian shirts and you in shorts (dress.ts), the pigs' own sounds
// (sounds.ts). No 3D grass right by the sand and no wildflowers.
import type { Theme } from "craftax-3d/plugin";
import { TROPICAL_TILES, barkTop, palmBark, sandRing, tropicalTile } from "./tiles";
import { TRUNK_W, footAt, palm, pickPalm, sizeAt, stubAt } from "./palm";
import { pig, skeleton, you, zombie } from "./dress";
import { PIG_SOUNDS } from "./sounds";

export const tropicalTheme: Theme = {
  id: "tropical", label: "Tropical",                                    // (was Island: Pete, they are all islands)
  icon: '<svg viewBox="0 0 20 20" width="16" height="16" shape-rendering="crispEdges" aria-hidden="true"><path d="M10 7h2v5h-2zM9 12h2v7H9z" fill="#a07a52"/><path d="M10 9h2v1h-2zM9 14h2v1H9zM9 17h2v1H9z" fill="#6e5840"/><path d="M9 2h2v3H9zM7 3h2v2H7zM11 3h2v2h-2zM5 5h10v1H5zM3 6h3v2H3zM14 6h3v2h-3zM2 8h2v2H2zM16 8h2v2h-2z" fill="#5fae3a"/><path d="M6 6h2v1H6zM12 6h2v1h-2zM5 7h1v2H5zM14 7h1v2h-1zM4 9h1v2H4zM15 9h1v2h-1z" fill="#2f6e1e"/><path d="M9 6h1v1H9zM11 6h1v1h-1z" fill="#6b4a2a"/></svg>',   // (a palm, on the replay page's keyframes)
  tiles: TROPICAL_TILES,
  trunk: { width: TRUNK_W, stub: stubAt, base: footAt, height: (r, c, std) => (sizeAt(r, c) === "short" ? 2 : std) },
  paint: { log_side: palmBark, log_top: barkTop },                      // the standard trunk below the palm: palm bark
  tile: tropicalTile,
  flowers: false,                                                       // (Pete: no flowers)
  grassAt: (at) => { const d = at.level ? 0 : sandRing(at); return d === 0 || d >= 3; },   // (Pete: 3D grass only 3 tiles or more from sand)
  crown: (at) => (at.level === 0 && at.block === 5 ? palm(at) : undefined),          // (5: Craftax's tree)
  crownPick: (at) => (at.level === 0 && at.block === 5 ? pickPalm(at.r, at.c) : undefined),
  bits: { leaves: [0x4f9a2e, 0xa8c860] },
  creatures: { skeleton: { model: skeleton }, zombie: { model: zombie }, cow: { model: pig } },
  player: { model: you },
  names: { cow: "pig" },
  sounds: PIG_SOUNDS,
};
