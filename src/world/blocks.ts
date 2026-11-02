// The world's blocks (js/world.ts): Craftax's block and item ids, what each block is drawn with, the realms' wall and floor variants, the
// hashes and value noise that pick them, and the heights the build uses.
import { vaultDoorRelief } from "../../js/textures";

/** A block's textures by face (front: the face toward the open side; inset / h: a smaller box, in blocks). */
export interface BlockLook { top: string; side: string; bottom: string; front?: string; inset?: number; h?: number }
/** A vault door's raised pixel: [x, y from the picture's top, depth out of the wall in blocks, texture]. */
export type ReliefPixel = [number, number, number, string];
/** A texture name, or one picked by the block row's height (a tall side whose blocks each look different). */
export type Tex = string | ((y: number) => string);
export type Vec3 = [number, number, number];

export const B = {
  INVALID: 0, OOB: 1, GRASS: 2, WATER: 3, STONE: 4, TREE: 5, WOOD: 6, PATH: 7, COAL: 8, IRON: 9, DIAMOND: 10, TABLE: 11, FURNACE: 12,
  SAND: 13, LAVA: 14, PLANT: 15, RIPE_PLANT: 16, WALL: 17, DARKNESS: 18, WALL_MOSS: 19, STALAGMITE: 20, SAPPHIRE: 21, RUBY: 22,
  CHEST: 23, FOUNTAIN: 24, FIRE_GRASS: 25, ICE_GRASS: 26, GRAVEL: 27, FIRE_TREE: 28, ICE_SHRUB: 29, ENCH_FIRE: 30, ENCH_ICE: 31,
  NECROMANCER: 32, GRAVE: 33, GRAVE2: 34, GRAVE3: 35, NECROMANCER_VULNERABLE: 36,
};
export const ITEM = { NONE: 0, TORCH: 1, LADDER_DOWN: 2, LADDER_UP: 3, LADDER_DOWN_BLOCKED: 4 };

export const CHUNK = 16;                                           // the world is built in CHUNK × CHUNK tile pieces (World.build)
export const GROUND: Record<number, BlockLook> = {
  [B.GRASS]: { top: "grass_top", side: "grass_side", bottom: "dirt" }, [B.PATH]: { top: "path", side: "stone", bottom: "stone" },
  [B.SAND]: { top: "sand", side: "sand", bottom: "sand" }, [B.FIRE_GRASS]: { top: "fire_grass_top", side: "fire_grass_side", bottom: "fire_grass_side" },
  [B.ICE_GRASS]: { top: "ice_grass_top", side: "ice_grass_side", bottom: "dirt" }, [B.GRAVEL]: { top: "gravel", side: "gravel", bottom: "gravel" },
};
export const cube = (t: string): BlockLook => ({ top: t, side: t, bottom: t });
export const SOLID: Record<number, BlockLook> = {
  [B.STONE]: cube("stone"), [B.WOOD]: cube("planks"), [B.COAL]: cube("coal_ore"), [B.IRON]: cube("iron_ore"), [B.DIAMOND]: cube("diamond_ore"),
  [B.SAPPHIRE]: cube("sapphire_ore"), [B.RUBY]: cube("ruby_ore"), [B.WALL]: cube("wall"), [B.WALL_MOSS]: cube("wall_moss"),
  [B.DARKNESS]: cube("darkness"), [B.OOB]: cube("bedrock"), [B.INVALID]: cube("bedrock"),
  [B.TABLE]: { top: "table_top", side: "table_side", bottom: "planks" },
  [B.FURNACE]: { top: "furnace_top", side: "furnace_side", front: "furnace_front", bottom: "furnace_top" },
  [B.CHEST]: { top: "chest_top", side: "chest_side", front: "chest_front", bottom: "chest_top", inset: 0.07, h: 0.875 },
  [B.ENCH_FIRE]: { top: "ench_fire_top", side: "ench_side", bottom: "obsidian", h: 0.75 },
  [B.ENCH_ICE]: { top: "ench_ice_top", side: "ench_side", bottom: "obsidian", h: 0.75 },
  [B.FOUNTAIN]: { top: "fountain_top", side: "smooth_stone", bottom: "smooth_stone", h: 0.6 },
};
export const GRAVE_FLOOR = ["grave_dirt", "grave_dirt", "grave_dirt", "grave_dirt2", "grave_dirt3"];   // the Graveyard's floor: dirt (Pete)
export const GRAVE_WALLS = ["gwall", "gwall", "gwall2", "gwall2", "gwall_worn", "gwall_crack", "gwall_moss"];   // the Graveyard's dark bricks
// the Sewers' walls (Pete: more moss, in the dungeon's bricks): mostly mossy, slimy or overgrown, a few plain
export const SEWER_WALLS = ["wall_mossy", "wall_mossy", "wall_moss2", "wall_moss2", "wall_slime", "wall_slime", "wall_slime", "wall_overgrown", "wall_overgrown",
  "wall_vines", "wall", "wall_worn", "wall_cracked"];
// the Vaults (Pete: rusty iron here and there): the map cut into 7 × 7 tile cells, about one in four holding a rectangle 2-4 tiles
// a side somewhere in it, and any wall inside that rectangle is iron plate, so a stretch of a wall turns metal, not a scatter of blocks
export let RELIEF_CACHE: ReliefPixel[] | null = null;
export const RELIEF: Iterable<ReliefPixel> = { [Symbol.iterator]() { return (RELIEF_CACHE ??= vaultDoorRelief())[Symbol.iterator](); } };
export const VAULT_IRON = ["vault_iron", "vault_iron1", "vault_iron2"];
export function vaultIron(r: number, c: number): boolean {
  const R = Math.floor(r / 7), C = Math.floor(c / 7), h = Math.imul(R * 73856093 ^ C * 19349663 ^ 0x2545f491, 2654435761) >>> 0;
  if (h % 4) return false;
  const w = 2 + ((h >>> 4) % 3), d = 2 + ((h >>> 8) % 3), x0 = (h >>> 12) % (8 - w), y0 = (h >>> 16) % (8 - d), x = c - C * 7, y = r - R * 7;
  return x >= x0 && x < x0 + w && y >= y0 && y < y0 + d;
}
export const SEWER_WET = new Set(SEWER_WALLS);                                 // (textures.ts: their _wet0, _wet1: all of them)
export const SEWER_FLOOR = ["sewer_floor", "sewer_floor", "sewer_floor1", "sewer_floor2"];
export const WALL_VARIANTS = ["wall", "wall", "wall", "wall", "wall", "wall", "wall_worn", "wall_worn", "wall_cracked", "wall_moss2", "wall_vines", "wall_mossy",
  "wall_bite", "wall_bite2", "wall_half", "wall_half2", "wall_crack2", "wall_crack3", "wall_spall", "wall_spall2", "wall_crumble", "wall_ruin"];
export const ORE = new Set([B.COAL, B.IRON, B.DIAMOND, B.SAPPHIRE, B.RUBY]);   // one block of a tall column shows it (the build)
export const TALL = new Set([B.STONE, B.COAL, B.IRON, B.DIAMOND, B.SAPPHIRE, B.RUBY, B.WALL, B.WALL_MOSS, B.DARKNESS, B.OOB, B.INVALID]);
export const TREES: Record<number, { log: string; leaves: string }> = { [B.TREE]: { log: "log", leaves: "leaves" }, [B.FIRE_TREE]: { log: "fire_log", leaves: "fire_leaves" } };
export const FIRE_BARK = ["fire_log_side", "fire_log_side2", "fire_log_side3"];   // (textures.ts fireBark)
export const CROSS: Record<number, string> = { [B.PLANT]: "plant", [B.RIPE_PLANT]: "ripe_plant", [B.ICE_SHRUB]: "ice_shrub" };
// grass (Pete: more variety and texture): a top per block, mostly plain, and on about one block in three a few short shoots
export const GRASS_TOPS = [...Array(5).fill("grass_top"), ...Array(3).fill("grass_top2"), ...Array(3).fill("grass_top3")];
export const FLOOR_BRICK = 1, FLOOR_STONE = 2, FLOOR_DIRT = 3;
export const DIRT_DIP = 1 / 16;                                  // how much lower bare dirt lies (a pixel; main.ts sets feet on it)
export const grassHash = (r: number, c: number): number => Math.imul(r * 73856093 ^ c * 19349663 ^ 0x51ed27, 2654435761) >>> 0;
// value noise by the world's seed: a lattice of random heights every `cell` tiles, smoothly blended between them, 0..1
export function valueNoise(r: number, c: number, cell: number, seed: number): number {
  const fr = r / cell, fc = c / cell, i = Math.floor(fr), j = Math.floor(fc), tr = fr - i, tc = fc - j;
  const v = (a: number, b: number) => (Math.imul(grassHash(a, b) ^ seed, 0x2c1b3c6d) >>> 8) / 16777216;
  const sr = tr * tr * (3 - 2 * tr), sc = tc * tc * (3 - 2 * tc);
  return (v(i, j) * (1 - sc) + v(i, j + 1) * sc) * (1 - sr) + (v(i + 1, j) * (1 - sc) + v(i + 1, j + 1) * sc) * sr;
}
// how grassy a tile is (0 bare .. 1 meadow): two octaves of it, cut so about three quarters of the map is bare and the grass gathers
// in fewer areas, rising quickly to thick grass in their middles (Pete)
export const grassField = (r: number, c: number, seed: number): number => Math.max(0, Math.min(1, (0.8 * valueNoise(r, c, 11, seed) + 0.2 * valueNoise(r, c, 5, seed ^ 0x5bd1e995) - 0.58) / 0.2));
export const GRAVES = new Set([B.GRAVE, B.GRAVE2, B.GRAVE3]);
export const CEIL = 3;                                       // underground ceiling height
export const PLACED_H = 1.5;                                        // a stone you place stands this tall: chest-high cover you can see over
export const TRUNK = 4;                                             // tree trunk height; the canopy sits above head height
export const FLAT_TRUNK = 2;                                        // in the overhead 2D view: 2 blocks of trunk, 1 of leaves
export const UP: Vec3 = [0, 1, 0], SWAY = [0, 0, 1, 1], LEAF_SWAY = [1, 1, 1, 1];
export const LIQUID_TOP = -0.15;
export const NORMAL: Record<string, Vec3> = { top: [0, 1, 0], bottom: [0, -1, 0], px: [1, 0, 0], nx: [-1, 0, 0], pz: [0, 0, 1], nz: [0, 0, -1] };

export const FOUNTAIN_RIM = 0.14, FOUNTAIN_WATER = 0.42;              // the basin's stone rim, and its water (the real water: waves, sky)

export const isSolid =(b: number): boolean => b in SOLID || b in TREES || b === B.STALAGMITE || b === B.NECROMANCER || b === B.NECROMANCER_VULNERABLE;
