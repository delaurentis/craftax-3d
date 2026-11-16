// I: a set piece raised into the world you're in, or taken away (src/scenes/raise.ts does it in the game; rise.ts draws it arriving).
// Only on a page that asks (?build=<id>, ?scene=<id>: src/scenes/active.ts raisable); elsewhere the key does nothing. Raising one
// whose scene names a theme (SetPieces.theme: Radcliffe Square's stone is the Ruins theme's), the world switches to it first, and the
// set piece starts rising a little after, its slower wave following the theme's out from you (the trees bursting as the theme passes).
import { api, game } from "../core/game";
import { apply } from "../core/apply";
import { flash } from "../ui/hud/hint";
import { world } from "../render/arm";
import { pickTheme } from "../themes/ui";
import { onScreen, themeById } from "../themes/state";
import { themeMoving } from "../themes/transition";
import { raisable } from "./active";
import type { GameState } from "../core/types";
import type { SetPieces } from "../themes/types";

const OVERLAP_MS = 900;                                              // (the set piece starts this long into the theme's switch, or when it ends)
export const canRaise = () => raisable().length > 0;
let busy = false;
export async function raiseKey(): Promise<void> {
  if (busy || !game.S) return;
  busy = true;
  try {
    const going = world.piece ? null : raisable()[0];               // (one up already: it's taken away, the theme left as it is)
    if (going && themeFor(going)) await themeDone();
    apply(await api<GameState>("/api/scene", going ? { id: going.id } : {}));   // (no message: it shows for itself)
  } catch (e) { flash((e as Error).message); }                       // (why it couldn't: where you stand, no room)
  finally { busy = false; }
}

// the scene's own theme, switched to (quietly; "standard": none), unless it's on already or isn't installed. True if it switched.
function themeFor(sc: SetPieces): boolean {
  if (!sc.theme) return false;
  const t = sc.theme === "standard" ? null : themeById(sc.theme);
  if ((sc.theme !== "standard" && !t) || onScreen.to === t) return false;
  pickTheme(t, true);
  return true;
}
// the theme's switch under way (or over)
async function themeDone(): Promise<void> {
  const t0 = performance.now();
  await new Promise((r) => requestAnimationFrame(r));
  while (themeMoving() && performance.now() - t0 < OVERLAP_MS) await new Promise((r) => setTimeout(r, 50));
}
