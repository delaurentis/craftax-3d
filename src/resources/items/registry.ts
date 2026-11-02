// What the player can hold, make and wear, as the HUD shows it: potions, the hotbar slots and what each needs, recipes,
// spells, armor pieces, the materials row and the gear list, each with its icon and its Craftax action.
import { iconURL, hasOutlineArt, outlineIconURL } from "../../../js/textures";
import { pixIcon, toolIcon } from "./icons";
import type { IconKind } from "./icons";
import type { GameState, Inventory } from "../../core/types";

/** A hotbar slot: the hand and tools (`tool`), or an item to place, shoot or cast (`action`). */
export interface HotbarSlot {
  name: string; hand?: boolean; tool?: string; note?: string; action?: number; tex?: string; place?: boolean; shoot?: boolean;
  icon(): string; count(s: GameState): number; need(s: GameState): string;
}
/** An E-screen card: [action, name, icon, needs ([what, how many]), where ("table", "table furnace", "ench" or ""), note, verb]. */
export type Recipe = [number, string, (s: GameState) => string, [string, number][], string, string, string?];
/** A gear row: [key, name, icon, carried, what it does]. */
export type GearRow = [string, string, string, boolean, string];
/** An ingredient as the E screen's cards show it: its icon (a second for "ruby or sapphire"), whether that is a block, its name, how many you have. */
export interface Ingredient { icon: string | null; icon2?: string; blk?: boolean; name: string; have: number }
type Attr = "dexterity" | "strength" | "intelligence";
/** An inventory count by name ("wood", or a tool slot's "pickaxe"); undefined for a name the inventory doesn't have ("hand"). */
export const invAt = (inv: Inventory, k: string) => (inv as unknown as Record<string, number | undefined>)[k];

/** [name, color]. */
export const POTIONS: [string, string][] = [["red", "#e02020"], ["green", "#30c030"], ["blue", "#3050f0"], ["pink", "#f080c0"], ["cyan", "#30e0e0"], ["yellow", "#f0e020"]];

// need(s): why the slot can't be used now (Craftax's costs), or "" when it can
export const more = (have: number, want: number, what: string, how?: string) => (have >= want ? "" : `Need ${want - have} more ${what}${how ? " — " + how : ""}`);
export const short = (h: HotbarSlot, s: GameState) => !!h.place && /^Need \d+ more /.test(h.need(s) || "");   // a placeable item, its materials short (not where you stand)
export const SLOT_KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-"];   // the key for each hotbar slot
// a fist, for the Hand slot
export const fistIcon = (() => {
  let url: string | null = null;
  return () => {
    if (url) return url;
    const c = document.createElement("canvas"); c.width = c.height = 16;
    const g = c.getContext("2d")!;
    g.fillStyle = "#c08a68"; g.fillRect(4, 5, 8, 7); g.fillRect(3, 7, 2, 4);
    g.fillStyle = "#d8a888"; g.fillRect(5, 5, 6, 2);
    g.fillStyle = "#8a5a40"; for (const x of [6, 8, 10]) g.fillRect(x, 5, 1, 3);
    g.fillStyle = "#3a7ab0"; g.fillRect(5, 12, 6, 3);
    // the dark outline the pickaxe and sword have (Pete): every empty pixel beside the fist or cuff
    const d = g.getImageData(0, 0, 16, 16).data, on = (x: number, y: number) => x >= 0 && x < 16 && y >= 0 && y < 16 && d[(y * 16 + x) * 4 + 3] > 0;
    g.fillStyle = "#140d06";
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (!on(x, y) && (on(x - 1, y) || on(x + 1, y) || on(x, y - 1) || on(x, y + 1))) g.fillRect(x, y, 1, 1);
    return (url = c.toDataURL());
  };
})();

// slot 1, Hand: chop, mine, attack, drink, open a table (Craftax always uses your best pickaxe and sword; there is no tool to pick).
// Every other slot is an item: a click always places it, shoots it or casts it, and never breaks anything.
export const HOTBAR: HotbarSlot[] = [
  { name: "Hand", hand: true, tool: "hand", note: "chop, mine, attack, drink, use", icon: () => fistIcon(), count: () => 0, need: () => "" },
  { name: "Pickaxe", hand: true, tool: "pickaxe", icon: () => toolIcon("pickaxe", 1), count: () => 0, need: () => "" },
  { name: "Sword", hand: true, tool: "sword", icon: () => toolIcon("sword", 1), count: () => 0, need: () => "" },
  { name: "Stone", action: 7, tex: "stone", icon: () => iconURL("stone"), count: (s) => s.inventory.stone, place: true,
    need: (s) => more(s.inventory.stone, 1, "stone", "mine some with a pickaxe") },
  { name: "Crafting Table", action: 8, tex: "table_side", icon: () => iconURL("table_side"), count: (s) => s.inventory.wood, place: true, note: "uses wood",
    need: (s) => more(s.inventory.wood, 2, "wood", "chop a tree") },
  { name: "Furnace", action: 9, tex: "furnace_front", icon: () => iconURL("furnace_front"), count: (s) => s.inventory.stone, place: true, note: "uses stone",
    need: (s) => more(s.inventory.stone, 1, "stone", "mine some with a pickaxe") },
  { name: "Sapling", action: 10, icon: () => iconURL("i_sapling"), count: (s) => s.inventory.sapling, place: true, note: "plant on grass",
    need: (s) => more(s.inventory.sapling, 1, "sapling", "click grass to find one") },
  { name: "Torch", action: 28, icon: () => iconURL("i_torch"), count: (s) => s.inventory.torches, place: true,
    need: (s) => more(s.inventory.torches, 1, "torch", "craft them at a table (E)") },
  { name: "Bow", action: 24, icon: () => iconURL("i_bow"), count: (s) => (s.inventory.bow ? s.inventory.arrows : 0), shoot: true, note: "shoot an arrow",
    need: (s) => (!s.inventory.bow ? "You don't have a bow yet" : more(s.inventory.arrows, 1, "arrow", "craft them at a table (E)")) },
  { name: "Fireball", action: 26, icon: () => iconURL("i_fireball"), count: (s) => (s.spells[0] ? s.mana : 0), shoot: true, note: "2 mana",
    need: (s) => (!s.spells[0] ? "You haven't learned Fireball yet" : more(s.mana, 2, "mana")) },
  { name: "Iceball", action: 27, icon: () => iconURL("i_iceball"), count: (s) => (s.spells[1] ? s.mana : 0), shoot: true, note: "2 mana",
    need: (s) => (!s.spells[1] ? "You haven't learned Iceball yet" : more(s.mana, 2, "mana")) },
];

// what each crafts or does, for the E screen's picture cards: [action, name, icon, needs, where, note, verb]. needs: [what, how many];
// what: an inventory key, "gem" (a ruby or a sapphire), "mana", "xp" or "potion<i>"; where: "table", "table furnace", "ench" or ""
export const RECIPES: Recipe[] = [
  [11, "Wood Pickaxe", () => toolIcon("pickaxe", 1), [["wood", 1]], "table", "mines stone and coal"],
  [12, "Stone Pickaxe", () => toolIcon("pickaxe", 2), [["wood", 1], ["stone", 1]], "table", "mines iron"],
  [13, "Iron Pickaxe", () => toolIcon("pickaxe", 3), [["wood", 1], ["stone", 1], ["iron", 1], ["coal", 1]], "table furnace", "mines diamonds"],
  [20, "Diamond Pickaxe", () => toolIcon("pickaxe", 4), [["wood", 1], ["diamond", 3]], "table", "mines rubies and sapphires"],
  [14, "Wood Sword", () => toolIcon("sword", 1), [["wood", 1]], "table", "more damage"],
  [15, "Stone Sword", () => toolIcon("sword", 2), [["wood", 1], ["stone", 1]], "table", "more damage"],
  [16, "Iron Sword", () => toolIcon("sword", 3), [["wood", 1], ["stone", 1], ["iron", 1], ["coal", 1]], "table furnace", "more damage"],
  [21, "Diamond Sword", () => toolIcon("sword", 4), [["wood", 1], ["diamond", 2]], "table", "the most damage"],
  [22, "Iron Armour", (s) => armourIcon(s, 1), [["iron", 3], ["coal", 3]], "table furnace", "one piece: less damage taken"],
  [23, "Diamond Armour", (s) => armourIcon(s, 2), [["diamond", 3]], "table", "one piece: much less damage taken"],
  [25, "Arrows ×2", () => iconURL("i_arrow"), [["wood", 1], ["stone", 1]], "table", "for the bow"],
  [38, "Torches ×4", () => iconURL("i_torch"), [["wood", 1], ["coal", 1]], "table", "light the dark"],
];
export const MAGIC: Recipe[] = [
  [35, "Read Book", () => iconURL("i_book"), [["books", 1]], "", "learn a spell", "Read"],
  [36, "Enchant Sword", () => toolIcon("sword", 4), [["mana", 9], ["gem", 1]], "ench", "fire or ice damage", "Enchant"],
  [37, "Enchant Armour", () => toolIcon("chest", 4), [["mana", 9], ["gem", 1]], "ench", "fire or ice protection", "Enchant"],
  [42, "Enchant Bow", () => iconURL("i_bow"), [["mana", 9], ["gem", 1]], "ench", "fire or ice arrows", "Enchant"],
  [39, "Dexterity +1", () => pixIcon("bolt", 1), [["xp", 1]], "", "slower hunger, thirst, fatigue", "Level up"],
  [40, "Strength +1", () => pixIcon("heart", 1), [["xp", 1]], "", "melee damage, max health", "Level up"],
  [41, "Intelligence +1", () => pixIcon("star", 1), [["xp", 1]], "", "spell damage, mana", "Level up"],
  [6, "Sleep", () => pixIcon("bolt", 0.5), [], "", "restores energy (key Z)", "Sleep"],
  [17, "Rest", () => pixIcon("heart", 0.5), [], "", "waits here until healed (key R)", "Rest"],
];
// already made, nothing more to gain (the Make grid ticks it): a tool tier you have or beat, armour every piece of which is at least
// that tier (Craftax makes one piece a craft, the weakest slot first), an attribute at Craftax's cap of 5
export const TIER_OF: Record<number, [string, number] | undefined> = { 11: ["pickaxe", 1], 12: ["pickaxe", 2], 13: ["pickaxe", 3], 20: ["pickaxe", 4], 14: ["sword", 1], 15: ["sword", 2], 16: ["sword", 3], 21: ["sword", 4] };
export function made(a: number, s: GameState) {
  const inv = s.inventory, tier = TIER_OF[a];
  if (tier) return (invAt(inv, tier[0]) || 0) >= tier[1];
  if (a === 22 || a === 23) return (inv.armour || []).every((v) => v >= (a === 22 ? 1 : 2));
  const attr = ({ 39: "dexterity", 40: "strength", 41: "intelligence" } as Record<number, Attr | undefined>)[a];
  return !!attr && s[attr] >= 5;
}
// the done badge: a pixel-art tick on a green tile with clipped corners, drawn on a 10×10 grid (crisp, like the icons)
export const DONE_BADGE = `<span class="done"><svg viewBox="0 0 10 10" width="20" height="20" shape-rendering="crispEdges" aria-hidden="true">`
  + `<path d="M1 0h8v1h1v8h-1v1H1v-1H0V1h1z" fill="#0d3b12"/><path d="M2 1h6v1h1v6h-1v1H2v-1H1V2h1z" fill="#2fa83a"/>`
  + `<path d="M7 3h1v1h-1zM6 4h1v1h-1zM5 5h1v1h-1zM4 6h1v1h-1zM3 5h1v1h-1zM2 4h1v1h-1z" fill="#fff"/></svg></span>`;
// armour comes in a fixed order in Craftax: each craft upgrades the first piece below its tier (helmet, chestplate, leggings, boots),
// so the card shows the piece the next craft makes; made: the piece just made (the payoff), the last one at the tier
/** [key, name]. */
export const PIECES: [string, string][] = [["helmet", "Helmet"], ["chest", "Chestplate"], ["pants", "Leggings"], ["boots", "Boots"]];
export function nextPiece(s: GameState | null | undefined, tier: number, made = false) {
  const a = (s && s.inventory.armour) || [0, 0, 0, 0];
  if (made) { for (let k = 3; k >= 0; k--) if ((a[k] || 0) >= tier) return k; return 1; }
  const k = a.findIndex((v) => (v || 0) < tier);
  return k < 0 ? 1 : k;
}
export function armourIcon(s: GameState | null | undefined, tier: number, made = false) { return toolIcon(PIECES[nextPiece(s, tier, made)][0], tier + 2); }
// what a chest can hold, for its loot list: inventory key, icon, name
/** [inventory key, icon, name]. */
export const LOOT: [string, string, string][] = [["wood", "log_side", "Wood"], ["stone", "stone", "Stone"], ["coal", "i_coal", "Coal"], ["iron", "i_iron", "Iron"], ["diamond", "i_diamond", "Diamond"],
  ["sapphire", "i_sapphire", "Sapphire"], ["ruby", "i_ruby", "Ruby"], ["sapling", "i_sapling", "Sapling"], ["torches", "i_torch", "Torches"],
  ["arrows", "i_arrow", "Arrows"], ["books", "i_book", "Books"], ["bow", "i_bow", "Bow"]];
// an ingredient: its icon, its name, how many you have
export const ING: Record<string, [string, string] | undefined> = {
  wood: ["log_side", "wood"], stone: ["stone", "stone"], coal: ["i_coal", "coal"], iron: ["i_iron", "iron"], diamond: ["i_diamond", "diamond"],
  books: ["i_book", "book"], sapling: ["i_sapling", "sapling"],
};
export function ingredient(what: string, s: GameState): Ingredient {
  const inv = s.inventory, ing = ING[what];
  if (ing) return { icon: iconURL(ing[0]), blk: !ing[0].startsWith("i_"), name: ing[1], have: invAt(inv, what) || 0 };
  if (what === "gem") return { icon: iconURL("i_ruby"), icon2: iconURL("i_sapphire"), name: "ruby or sapphire", have: Math.max(inv.ruby || 0, inv.sapphire || 0) };
  // beside one enchantment table the gem is no longer a choice: a fire table takes a ruby, an ice table a sapphire
  if (what === "ruby" || what === "sapphire") return { icon: iconURL("i_" + what), name: what, have: invAt(inv, what) || 0 };
  if (what === "mana") return { icon: pixIcon("star", 1), name: "mana", have: s.mana };
  if (what === "xp") return { icon: null, name: "XP", have: s.xp };
  const i = +what.slice(6);                                                 // potion<i>
  return { icon: iconURL("i_potion", POTIONS[i][1]), name: POTIONS[i][0] + " potion", have: s.inventory.potions[i] };
}

// n: the stat's maximum, one icon a point as Craftax counts them; above 9 (strength raises max health, dexterity food, water and
// energy, intelligence mana) the row grows toward the middle, icons the same size (Pete: a -3 potion at 13 health showed 9 hearts)
export function bar(kind: IconKind, v: number, right?: boolean, extra = "", cls = "", n = 9) {
  const html: string[] = [];
  for (let i = 0; i < n; i++) { const f = v >= i + 1 ? 1 : v >= i + 0.5 ? 0.5 : 0; html.push(`<img class="f${f * 2}" src="${pixIcon(kind, f)}">`); }   // f2 full, f1 half, f0 empty
  if (right) html.reverse();
  return `<div class="bar ${right ? "right" : ""} ${cls}" data-k="${kind}" style="--n:${n}">${extra}${html.join("")}</div>`;
}

// what hit you, blinked beside the hearts
export const HIT_ICON: Record<string, (() => string) | undefined> & { sword: () => string } = { sword: () => toolIcon("sword", 3), arrow: () => iconURL("i_arrow"), fireball: () => iconURL("i_fireball"), iceball: () => iconURL("i_iceball") };

// Craftax crafts only when a table (and, for iron, a furnace too) is in one of the 8 tiles around you: which are
export function near(s: GameState) {
  const [H, W] = s.size, has = (t: number) => [-1, 0, 1].some((dr) => [-1, 0, 1].some((dc) => {
    const r = s.pos[0] + dr, c = s.pos[1] + dc;
    return (dr || dc) && r >= 0 && c >= 0 && r < H && c < W && s.map[r * W + c] === t;
  }));
  return { table: has(11), furnace: has(12), fire: has(30), ice: has(31), ench: has(30) || has(31) };   // fire / ice: an enchantment table
}

// the E screen's weapons and armour row: [key, name, icon, carried, what it does]; one of each kind, at the tier you have
export const TIERS = ["Wood", "Stone", "Iron", "Diamond"], ARMOUR_TIER = ["", "Iron", "Diamond"];
export const TOOL_NOTE = { pickaxe: ["mines stone and coal", "mines iron", "mines diamonds", "mines rubies and sapphires"] };
// enchantments (Craftax: 1 fire, 2 ice) on a sword, a bow or a worn piece: the piece keeps its colours with a purple glow round it
// (index.html .ench) and its card says what it carries (Pete)
export const ELEM = ["", "fire", "ice"];
export function enchOf(s: GameState, k: string) {
  const i = PIECES.findIndex(([p]) => p === k);
  return k === "sword" ? s.sword_enchant || 0 : k === "bow" ? s.bow_enchant || 0 : i >= 0 ? (s.armour_enchant || [])[i] || 0 : 0;
}
export function enchNote(s: GameState, k: string) {
  const e = ELEM[enchOf(s, k)]; if (!e) return "";
  return k === "sword" ? `Enchanted with ${e}: its hits deal extra ${e} damage` : k === "bow" ? `Enchanted with ${e}: its arrows deal extra ${e} damage`
    : `Enchanted against ${e}: less ${e} damage taken`;
}
export function gear(s: GameState): GearRow[] {
  const inv = s.inventory, arm = inv.armour || [0, 0, 0, 0];
  const tool = (k: string, label: string): GearRow => { const t = invAt(inv, k) || 0; return [k, t ? `${TIERS[t - 1]} ${label}` : label, toolIcon(k, t || 1), t > 0,
    k === "pickaxe" ? TOOL_NOTE.pickaxe[t - 1] : t === 4 ? "the most damage" : "more damage"]; };
  return [tool("pickaxe", "Pickaxe"), tool("sword", "Sword"), ["bow", "Bow", iconURL("i_bow"), !!inv.bow, "shoots arrows"],
    ...PIECES.map(([k, label], i): GearRow => [k, arm[i] ? `${ARMOUR_TIER[arm[i]]} ${label}` : label, toolIcon(k, (arm[i] || 1) + 2), arm[i] > 0,
      arm[i] > 1 ? "much less damage taken" : "less damage taken"])];
}
