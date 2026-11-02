// The inventory screen (E): opening it and its actions.
import "../../input/keyboard";
import { B } from "../../../js/world";
import { HOTBAR, POTIONS } from "../../../js/hud";
import { A, sound } from "../../core/shared";
import { startDrink, world } from "../../render/arm";
import { hangState } from "../../effects/hang";
import { game, keys } from "../../core/game";
import { dirTo } from "../../input/targets";
import { BREAK, ENCH, STATION } from "../../input/pathing";
import { send } from "../../input/intent";
import { locked, play, show, unlockPointer } from "./screen";
import { CRAFT_KIND, layout } from "../hud/layout";
import type { Hud } from "../../../js/hud";
import type { GameState } from "../../core/types";

/** Where the E screen was opened: the tile aimed at (a creature: mob), or null. */
export interface PanelTarget { r: number; c: number; mob?: boolean }
/** A sound effect by name (the hud's payoff names one). */
type SoundFx = Record<string, () => void>;
// the E screen acts at once (the world is paused there); enchanting needs the table you were aiming at when you opened it
export let lastAim: PanelTarget | null = null;
export function openPanel(target: PanelTarget | null) {
  lastAim = target;
  const st = target && !target.mob && dirTo(target.r, target.c) && world.at(target.r, target.c);   // opened at a table or furnace beside you: it can be broken here
  game.hud.station = st === B.TABLE ? "crafting table" : st === B.FURNACE ? "furnace" : null;
  game.hud.ench = ENCH.has(st as number);
  if (ENCH.has(st as number)) game.hud.pick = String([36, 37, 42].find((k) => game.S!.available && game.S!.available[k]) || 36);   // at an enchantment table: its cards, one you can do first
  show("panel"); game.hud.renderPanel(game.S!);
  if (locked()) unlockPointer();
  keys.clear(); game.doHeld = game.spaceHeld = false;
}
game.hud = null as unknown as Hud;                                          // (made at boot, js/main.ts)
export async function panelAction(action: number) {
  const d = lastAim && dirTo(lastAim.r, lastAim.c);
  if (action === BREAK) {                                                  // the table or furnace goes; so does the screen opened at it
    if (!d || !STATION.has(world.at(lastAim!.r, lastAim!.c))) return;
    game.hud.station = null; play(); hangState.swingT = performance.now();
    await send({ action: A.DO, face: d });
    return;
  }
  layout.panelCraftT = performance.now();
  // Pete: a craft, level-up, enchant, read or drink is a moment: when it worked (anything you carry or your attributes
  // changed) the screen closes and the payoff plays (hud.payoff); open it again and the card says what the next one needs
  const sig = (s: GameState | null) => s && JSON.stringify([s.inventory, s.dexterity, s.strength, s.intelligence, s.sword_enchant]);
  const before = sig(game.S), was = game.S && { health: game.S.health, mana: game.S.mana, energy: game.S.energy };
  await send({ action, face: [36, 37, 42].includes(action) && d ? d : undefined });
  if (action === A.SLEEP || action === 17) { play(); return; }          // sleep and rest start at once: back to the world to watch
  if (sig(game.S) !== before) {
    play();
    if (action >= 29 && action <= 34) {                                   // a potion: drink it, then say what it did, big
      startDrink(POTIONS[action - 29][1]); sound.drink();
      // Craftax's potions each do one thing, +8 or -3 to health, mana or energy (which colour does what is shuffled every world):
      // the stat that moved the most is the one it touched
      const fx = was && (["health", "mana", "energy"] as const).map((k): [string, number] => [k, game.S![k] - was[k]]).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0];
      setTimeout(() => { const kind = game.hud.payoff(action, game.S!, fx); if (kind) (sound as unknown as SoundFx)[kind](); }, 650);
      return;
    }
    // equip what you just made, if it has a hotbar slot (Pete): a pickaxe or a sword in hand, arrows on the bow, torches ready to
    // place; armour wears itself. Enchanting the sword or the bow takes it up too
    const eq = [11, 12, 13, 20].includes(action) ? "Pickaxe" : [14, 15, 16, 21, 36].includes(action) ? "Sword"
      : (action === 25 || action === 42) && game.S!.inventory.bow ? "Bow" : action === 38 ? "Torch" : null;
    const slot = eq ? HOTBAR.findIndex((h) => h.name === eq) : -1;
    if (slot >= 0) { game.hud.s = game.S!; game.hud.select(slot); }                       // (the new state: the slot isn't taken for empty and bounced)
    const ck = CRAFT_KIND[action];
    if (ck) { layout.panelCraftT = performance.now(); setTimeout(() => game.hud.payoff(action, game.S!), sound.craft(ck) * 1000); return; }   // the item shows as the last strike lands
    const kind = game.hud.payoff(action, game.S!);
    if (kind) (sound as unknown as SoundFx)[kind]();
    return;
  }
  game.hud.renderPanel(game.S!);
}
