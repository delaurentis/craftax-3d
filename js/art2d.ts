// Craftax's own 2D view, drawn in the browser: a port of craftax/craftax/renderer.py's render_craftax_pixels (craftax 1.6.1) at
// 16 px a tile, from Craftax's own textures (web/craftax-art/, MIT). The 9 × 11 tiles around the player (blocks, items, the player,
// mobs, projectiles, then the light map, night and sleep), and the 4 inventory rows under them. Used by the "Original" art when the
// game runs without a server (with a server, its renderer draws the same picture: /api/frame.png).
import type { EngineState, Mob, Pos } from "../src/core/types";

const T = 16, SMALL = 12, NUM = 6, ROWS = 9, COLS = 11, INV = 4;
export const WIDTH = COLS * T, HEIGHT = (ROWS + INV) * T;

const BLOCKS = ["debug_tile", "debug_tile", "grass", "water", "stone", "tree", "wood", "path", "coal", "iron", "diamond", "table",
  "furnace", "sand", "lava", "plant_on_grass", "ripe_plant_on_grass", "wall2", "debug_tile", "wall_moss", "stalagmite", "sapphire",
  "ruby", "chest", "fountain", "fire_grass", "ice_grass", "gravel", "fire_tree", "ice_shrub", "enchantment_table_fire",
  "enchantment_table_ice", "necromancer", "grave", "grave2", "grave3", "necromancer_vulnerable"];
const B = { OUT: 1, DARK: 18, WOOD: 6, STONE: 4, COAL: 8, IRON: 9, DIAMOND: 10, SAPPHIRE: 21, RUBY: 22 };
const ITEMS = [null, "torch_in_inventory", "ladder_down", "ladder_up", "ladder_down_blocked"];
const PLAYER = ["player-left", "player-right", "player-up", "player-down", "player-sleep"];
const MELEE = ["zombie", "gnome_warrior", "orc_soldier", "lizard", "knight", "troll", "pigman", "frost_troll"];
const PASSIVE = ["cow", "bat", "snail"];
const RANGED = ["skeleton", "gnome_archer", "orc_mage", "kobold", "knight_archer", "deep_thing", "fire_elemental", "ice_elemental"];
const PROJ = ["arrow-up", "dagger", "fireball", "iceball", "arrow-up", "slimeball", "fireball", "iceball"];
const PLAYER_PROJ = PROJ;   // your shots carry the same projectile types (a cast fireball is type 2, an arrow 4): a 3-long list drew them wrong
const PICKAXE = [null, "wood_pickaxe", "stone_pickaxe", "iron_pickaxe", "diamond_pickaxe"];
const SWORD = [null, "wood_sword", "stone_sword", "iron_sword", "diamond_sword"];
const ARMOUR = [["iron_helmet", "iron_chestplate", "iron_pants", "iron_boots"], ["diamond_helmet", "diamond_chestplate", "diamond_pants", "diamond_boots"]];
const ARMOUR_ENCH = [["helmet_fire_enchantment", "chestplate_fire_enchantment", "pants_fire_enchantment", "boots_fire_enchantment"],
  ["helmet_ice_enchantment", "chestplate_ice_enchantment", "pants_ice_enchantment", "boots_ice_enchantment"]];
const POTIONS = ["potion_red", "potion_green", "potion_blue", "potion_pink", "potion_cyan", "potion_yellow"];
const MISC = ["health", "food", "drink", "energy", "mana", "sapling", "bow", "book", "xp", "dexterity", "strength", "intelligence",
  "sword_fire_enchantment", "sword_ice_enchantment", "arrow_fire_enchantment", "arrow_ice_enchantment",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

/** A texture's RGBA pixels by size (16: as loaded). */
type Tex = Record<number, Uint8ClampedArray>;
/** What the 2D view draws over the map: the victory portal (its tile, ms) and trees falling over. */
export interface Fx2D { portal?: Pos | null; t?: number; falls?: { r: number; c: number; k: number; fade: number; dir: number }[] }
let tex: Record<string, Tex> | null = null, loading: Promise<void> | null = null;
// every texture as RGBA at 16 px (alpha made 0 / 1 as Craftax does: a // 255), resized with nearest-neighbour when asked
function load(base: string) {
  loading ??= (async () => {
    const names = new Set([...BLOCKS, ...ITEMS, ...PLAYER, ...MELEE, ...PASSIVE, ...RANGED, ...PROJ, ...PICKAXE, ...SWORD,
      ...ARMOUR.flat(), ...ARMOUR_ENCH.flat(), ...POTIONS, ...MISC].filter(Boolean)) as Set<string>;
    const c = document.createElement("canvas"); c.width = c.height = T;
    const g = c.getContext("2d", { willReadFrequently: true })!;
    const out: Record<string, Tex> = {};
    await Promise.all([...names].map(async (n) => {
      const im = new Image(); im.src = `${base}${n}.png`;
      await im.decode();
      g.clearRect(0, 0, T, T); g.drawImage(im, 0, 0, T, T);
      const d = g.getImageData(0, 0, T, T).data;
      for (let i = 3; i < d.length; i += 4) d[i] = d[i] === 255 ? 1 : 0;
      out[n] = { 16: d };
    }));
    tex = out;
  })();
  return loading;
}
function sized(n: string, size: number) {                                           // PIL NEAREST: source pixel floor((i + 0.5) * 16 / size)
  const t = tex![n];
  if (!t[size]) {
    const d = new Uint8ClampedArray(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const s = (Math.floor(((y + 0.5) * T) / size) * T + Math.floor(((x + 0.5) * T) / size)) * 4, o = (y * size + x) * 4;
      d[o] = t[16][s]; d[o + 1] = t[16][s + 1]; d[o + 2] = t[16][s + 2]; d[o + 3] = t[16][s + 3];
    }
    t[size] = d;
  }
  return t[size];
}

// one texture as RGBA at size × size (alpha 0 / 1), loading them all first: null until loaded (the site's /craftax screen: its bar icons)
export function iconPixels(n: string, size: number, base: string) {
  if (!tex) { load(base); return null; }
  return tex[n] ? sized(n, size) : null;
}

// px: the frame as RGB floats; blit a size×size texture at pixel (x0, y0): opaque (rgb only) or with its 0 / 1 alpha
function blit(px: Float32Array, d: Uint8ClampedArray, size: number, x0: number, y0: number, alpha: boolean, map = (x: number, y: number) => [x, y]) {
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const [sx, sy] = map(x, y), s = (sy * size + sx) * 4;
    if (alpha && !d[s + 3]) continue;
    const o = ((y0 + y) * WIDTH + x0 + x) * 3;
    px[o] = d[s]; px[o + 1] = d[s + 1]; px[o + 2] = d[s + 2];
  }
}

// the picture for one state (the engine's /api/state format); null until the textures are loaded (then onReady fires)
export function drawOriginal(s: EngineState, base: string, onReady: () => void, mapOnly = false, fx: Fx2D | null = null) {   // mapOnly: the 9 × 11 view, without the inventory rows; fx.portal: [row, col], fx.t: ms
  const px = originalPixels(s, base, onReady, mapOnly, fx);
  if (!px) return null;
  const h = mapOnly ? ROWS * T : HEIGHT;
  const c = document.createElement("canvas"); c.width = WIDTH; c.height = h;
  const g = c.getContext("2d")!, im = g.createImageData(WIDTH, h);
  for (let i = 0, o = 0; i < WIDTH * h; i++, o += 3) { im.data[i * 4] = px[o]; im.data[i * 4 + 1] = px[o + 1]; im.data[i * 4 + 2] = px[o + 2]; im.data[i * 4 + 3] = 255; }
  g.putImageData(im, 0, 0);
  return c.toDataURL();
}

// the same picture as RGB floats (0..255, WIDTH a row; the site's /craftax screen in colour draws these); null until the textures load
export function originalPixels(s: EngineState, base: string, onReady: () => void, mapOnly = false, fx: Fx2D | null = null) {
  if (!tex) { load(base).then(onReady); return null; }
  const px = new Float32Array(WIDTH * HEIGHT * 3), H = s.size[0], W = s.size[1];
  const r0 = s.pos[0] - (ROWS >> 1), c0 = s.pos[1] - (COLS >> 1);
  const inMap = (r: number, c: number) => r >= 0 && c >= 0 && r < H && c < W;
  const ladderOpen = s.monsters_killed >= 8;
  for (let i = 0; i < ROWS; i++) for (let j = 0; j < COLS; j++) {
    const r = r0 + i, c = c0 + j, x = j * T, y = i * T;
    const b = inMap(r, c) ? s.map[r * W + c] : B.OUT;
    if (b === B.OUT || b === B.DARK) {
      const v = b === B.OUT ? 128 : 0;
      for (let yy = 0; yy < T; yy++) for (let xx = 0; xx < T; xx++) px.fill(v, ((y + yy) * WIDTH + x + xx) * 3, ((y + yy) * WIDTH + x + xx) * 3 + 3);
    } else blit(px, sized(BLOCKS[b] || "debug_tile", T), T, x, y, false);
    let it = inMap(r, c) ? s.items[r * W + c] : 0;
    if (it === 2 && !ladderOpen) it = 4;                            // a ladder down stays blocked until the floor is cleared
    if (it && ITEMS[it]) blit(px, sized(ITEMS[it]!, T), T, x, y, true);
  }
  blit(px, sized(PLAYER[s.sleeping ? 4 : s.dir - 1] || "player-down", T), T, (COLS >> 1) * T, (ROWS >> 1) * T, true);
  const at = (p: Pos): Pos => [p[0] - r0, p[1] - c0];
  const onScreen = ([i, j]: Pos) => i >= 0 && j >= 0 && i < ROWS && j < COLS;
  for (const [list, names] of [[s.melee, MELEE], [s.passive, PASSIVE], [s.ranged, RANGED]] as [Mob[], string[]][]) {
    for (const m of list) { const p = at(m.pos); if (onScreen(p) && names[m.type]) blit(px, sized(names[m.type], T), T, p[1] * T, p[0] * T, true); }
  }
  for (const [list, names] of [[s.mob_projectiles, PROJ], [s.player_projectiles, PLAYER_PROJ]] as [Mob[], string[]][]) {
    for (const m of list) {
      const p = at(m.pos); if (!onScreen(p) || !names[m.type]) continue;
      const flip = m.dir![0] > 0 || m.dir![1] > 0, tr = m.dir![1] !== 0;
      // flip rows when moving down or right, then transpose when moving sideways (renderer.py's order)
      const map = (x: number, y: number) => { let [rr, cc] = tr ? [x, y] : [y, x]; if (flip) rr = T - 1 - rr; return [cc, rr]; };
      blit(px, sized(names[m.type], T), T, p[1] * T, p[0] * T, true, map);
    }
  }
  // darkness, night (overworld only), sleep: on the map part
  const day = s.level === 0 ? s.daylight : 1, nightK = Math.max(2 * (0.5 - day), 0), sleep = s.sleeping ? 0.5 : 1;
  const cy = (ROWS * T) >> 1, cx = (COLS * T) >> 1, maxD = Math.hypot(Math.max(cy, ROWS * T - 1 - cy), Math.max(cx, COLS * T - 1 - cx));
  const night = [0, 16, 64];
  for (let y = 0; y < ROWS * T; y++) for (let x = 0; x < COLS * T; x++) {
    const r = r0 + ((y / T) | 0), c = c0 + ((x / T) | 0), L = inMap(r, c) ? s.light[r * W + c] / 255 : 0;
    const mask = (Math.hypot(y - cy, x - cx) / maxD) * nightK, noise = Math.random() * 95 + 32, o = (y * WIDTH + x) * 3;
    for (let k = 0; k < 3; k++) {
      let v = px[o + k] * L;
      if (day < 1) { const n = night[k] * 0.5 + 0.5 * ((1 - mask) * v + mask * noise); v = day * v + (1 - day) * n; }
      px[o + k] = v * sleep;
    }
  }
  if (fx && fx.portal) portal2D(px, fx.portal[0] - r0, fx.portal[1] - c0, fx.t!);
  for (const f of (fx && fx.falls) || []) fall2D(px, f.r - r0, f.c - c0, f.k, f.fade, f.dir);
  if (!mapOnly) inventory(px, s);
  return px;
}

// a chopped tree falling over in Craftax's own 2D look (Pete: so the felling sound makes sense; and inside its own tile, never spilling
// into the next): cut at the trunk, a stump left standing, the tree above it, cut out of its tile's grass (its trunk's browns, its
// leaves' darker greens above the trunk's foot), tipping over sideways about the cut and shrinking as it goes so it lies within the
// tile (k 0..1 of a quarter turn, dir ±1); then all of it fades (fade 0..1). Drawn after the darkness pass
function fall2D(px: Float32Array, i: number, j: number, k: number, fade: number, dir: number) {
  const d = tex!.tree && tex!.tree[16];
  if (!d || i < 0 || j < 0 || i >= ROWS || j >= COLS) return;
  const CUT = 13, isTree = (x: number, y: number) => { const s = (y * T + x) * 4, r = d[s], g = d[s + 1]; return r > g || (y < 9 && g < 0x90); };
  const a = dir * (Math.PI / 2) * k * k, ca = Math.cos(a), sa = Math.sin(a), sc = 1 - 0.35 * k;   // falling faster as it goes
  const PX = 7.5 - dir * 3.5 * k, PY = CUT - 4 * k;                     // the cut sliding back and up, so the fallen tree lies inside the tile
  const X0 = j * T, Y0 = i * T, w = 1 - fade;
  const put = (x: number, y: number, s: number) => { const o = ((Y0 + y) * WIDTH + X0 + x) * 3; px[o] = px[o] * (1 - w) + d[s] * w; px[o + 1] = px[o + 1] * (1 - w) + d[s + 1] * w; px[o + 2] = px[o + 2] * (1 - w) + d[s + 2] * w; };
  for (let y = CUT; y < T; y++) for (let x = 0; x < T; x++) if (isTree(x, y)) put(x, y, (y * T + x) * 4);   // the stump
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const dx = (x + 0.5 - PX) / sc, dy = (y + 0.5 - PY) / sc;
    const sx = Math.floor(7.5 + ca * dx + sa * dy), sy = Math.floor(CUT - sa * dx + ca * dy);   // back into the upright tree
    if (sx < 0 || sy < 0 || sx >= T || sy >= CUT || !isTree(sx, sy)) continue;
    put(x, y, (sy * T + sx) * 4);
  }
}

// the victory portal in Craftax's own 2D look (Pete; main.ts openPortal places it): a tile-sized arch of near-black brick, a green
// gem in it, open at the bottom, full of phosphor-green characters flickering in waves; its green light spills onto the tiles round
// it. Drawn after the darkness pass, so it shines in the dark. (i, j): its tile in the view
function portal2D(px: Float32Array, i: number, j: number, t: number) {
  const put = (x: number, y: number, r: number, g: number, b: number) => { if (x < 0 || y < 0 || x >= COLS * T || y >= ROWS * T) return; const o = (y * WIDTH + x) * 3; px[o] = r; px[o + 1] = g; px[o + 2] = b; };
  const add = (x: number, y: number, r: number, g: number, b: number) => { if (x < 0 || y < 0 || x >= COLS * T || y >= ROWS * T) return; const o = (y * WIDTH + x) * 3; px[o] = Math.min(255, px[o] + r); px[o + 1] = Math.min(255, px[o + 1] + g); px[o + 2] = Math.min(255, px[o + 2] + b); };
  const X = j * T, Y = i * T, cx = X + T / 2, cy = Y + T / 2, s = t / 1000;
  for (let y = Y - 2 * T; y < Y + 3 * T; y++) for (let x = X - 2 * T; x < X + 3 * T; x++) {   // the light on the floor round it
    const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / T, k = Math.max(0, 1 - d / 2.4) ** 2 * (0.9 + 0.1 * Math.sin(s * 0.8));
    if (k > 0) add(x, y, 10 * k, 90 * k, 35 * k);
  }
  if (i < 0 || j < 0 || i >= ROWS || j >= COLS) return;
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const frame = x < 3 || x > 12 || y < 3;
    if (frame) {                                                       // the brick: dark, a darker mortar line every 3 rows, a gem
      const mortar = y % 3 === 2 || (x === (y % 6 < 3 ? 1 : 13) && y > 2);
      const v = mortar ? 8 : 24 + ((x * 7 + y * 13) % 9);
      put(X + x, Y + y, v, v, v + 3);
      continue;
    }
    // inside (Pete: calm, no stripes): a still speckle of green, each pixel its own shade, now and then one changes (every couple of
    // seconds each, at its own moment), and the whole of it breathes very slowly
    const hp = (n: number) => { let h = n | 0; h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }, k0 = hp(x * 131 + y * 977);
    const v = hp(x * 131 + y * 977 + Math.floor(s * 0.5 + k0 * 7) * 7919), br = 0.85 + 0.15 * Math.sin(s * 0.8);
    if (v > 0.93) put(X + x, Y + y, 190 * br, 255 * br, 200 * br);              // a few bright
    else if (v > 0.45) put(X + x, Y + y, 25 * br, (110 + 120 * (v - 0.45) / 0.48) * br, 45 * br);   // most green, in shades
    else put(X + x, Y + y, 3, 26 + 20 * v, 9);
  }
  put(X + 1, Y + 7, 60, 255, 120); put(X + 14, Y + 10, 60, 255, 120); put(X + 8, Y + 1, 60, 255, 120);   // green gems in the arch
}

// the victory portal's tunnel in Craftax's own 2D look (Pete): the 9 × 11 view looking straight down a square tunnel of the portal's
// green speckle, rings of it rushing out from the dark middle toward you; t: seconds into the ride. A data URL, as drawOriginal's
export function tunnel2D(t: number) {
  const W2 = COLS * T, H2 = ROWS * T, c = document.createElement("canvas"); c.width = W2; c.height = H2;
  const g = c.getContext("2d")!, im = g.createImageData(W2, H2), d = im.data;
  const hp = (n: number) => { let h = n | 0; h = Math.imul(h ^ (h >>> 16), 0x7feb352d); h = Math.imul(h ^ (h >>> 15), 0x846ca68b); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const fr = Math.floor(t * 12), speed = 2.5 + 4 * Math.min(1, t / 1.5);
  for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
    const px = x >> 1, py = y >> 1;                                     // chunky: 2 × 2 screen pixels to a speck
    const dx = (x + 0.5 - W2 / 2) / (W2 / H2), dy = y + 0.5 - H2 / 2, r = Math.max(Math.abs(dx), Math.abs(dy)) + 1;   // square rings
    const z = 40 / r, ring = z * 1.2 + t * speed;                       // depth down the tunnel, and its rings rushing at you
    const band = (ring % 1) < 0.55 ? 1 : 0.35, fade = Math.min(1, r / 22);   // dark far away (the middle)
    const v = hp(px * 131 + py * 977 + Math.floor(ring) * 7919 + fr * 104729);
    const k = band * fade, o = (y * W2 + x) * 4;
    if (v > 0.93) { d[o] = 190 * k; d[o + 1] = 255 * k; d[o + 2] = 200 * k; }
    else if (v > 0.45) { d[o] = 25 * k; d[o + 1] = (110 + 120 * (v - 0.45) / 0.48) * k; d[o + 2] = 45 * k; }
    else { d[o] = 3; d[o + 1] = (26 + 20 * v) * k; d[o + 2] = 9; }
    d[o + 3] = 255;
  }
  g.putImageData(im, 0, 0);
  return c.toDataURL();
}

// the inventory rows, as renderer.py lays them out (icons at 80 %, digits at 40 % in the cell's bottom-right corner; 0 shows nothing)
function inventory(px: Float32Array, s: EngineState) {
  const Y = ROWS * T, PAD = (T - SMALL) >> 1, inv = s.inventory;
  const icon = (n: string | null, x: number, y: number, show = true, alpha = false) => { if (show && n) blit(px, sized(n, SMALL), SMALL, x * T + PAD, Y + y * T + PAD, alpha); };
  const digit = (d: number, x: number, y: number, dx = 0) => { if (d > 0) blit(px, sized(String(d), NUM), NUM, x * T + T - NUM - dx, Y + y * T + T - NUM, true); };
  const zero = (d: number, x: number, y: number) => blit(px, sized(String(d), NUM), NUM, x * T + T - NUM, Y + y * T + T - NUM, true);
  const two = (v: number, x: number, y: number) => { v = Math.max(0, Math.min(99, v | 0)); if (v === 0) return; (v >= 10 ? zero : digit)(v % 10, x, y); digit((v / 10) | 0, x, y, NUM); };
  const one = (v: number, x: number, y: number) => digit(Math.max(0, Math.min(9, v | 0)), x, y);
  const stat = (n: string, v: number, x: number) => { icon(n, x, 0, v > 0); two(v, x, 0); };
  stat("health", Math.max(Math.floor(s.health), 1), 0); stat("food", s.food, 1); stat("drink", s.drink, 2); stat("energy", s.energy, 3); stat("mana", s.mana, 4);
  const res = (b: number, v: number, x: number, y: number) => { icon(BLOCKS[b], x, y, v > 0); two(v, x, y); };
  res(B.WOOD, inv.wood, 0, 2); res(B.STONE, inv.stone, 1, 2); res(B.COAL, inv.coal, 0, 1); res(B.IRON, inv.iron, 1, 1);
  res(B.DIAMOND, inv.diamond, 2, 1); res(B.SAPPHIRE, inv.sapphire, 3, 1); res(B.RUBY, inv.ruby, 4, 1);
  icon("sapling", 5, 1, inv.sapling > 0); two(inv.sapling, 5, 1);
  icon(PICKAXE[inv.pickaxe], 8, 2); icon(SWORD[inv.sword], 8, 1); icon("bow", 6, 1, inv.bow > 0);
  icon("arrow-up", 6, 2, inv.arrows > 0); two(inv.arrows, 6, 2);
  inv.armour.forEach((a, i) => icon(a ? ARMOUR[a - 1][i] : null, 7, i));
  icon("torch_in_inventory", 2, 2, inv.torches > 0); two(inv.torches, 2, 2);
  inv.potions.forEach((n, i) => { icon(POTIONS[i], i, 3, n > 0); two(n, i, 3); });
  icon("book", 3, 2, inv.books > 0); two(inv.books, 3, 2);
  icon("fireball", 4, 2, s.spells[0]); icon("iceball", 5, 2, s.spells[1]);
  if (s.sword_enchant) icon(s.sword_enchant === 1 ? "sword_fire_enchantment" : "sword_ice_enchantment", 8, 1, true, true);
  const arrowE = inv.arrows > 0 ? s.bow_enchant : 0;
  if (arrowE) icon(arrowE === 1 ? "arrow_fire_enchantment" : "arrow_ice_enchantment", 6, 2, true, true);
  s.armour_enchant.forEach((e, i) => { if (e) icon(ARMOUR_ENCH[e - 1][i], 7, i, true, true); });
  one(s.level, 6, 0);
  icon("xp", 9, 0, s.xp > 0); one(s.xp, 9, 0);
  icon("dexterity", 9, 1); one(s.dexterity, 9, 1); icon("strength", 9, 2); one(s.strength, 9, 2); icon("intelligence", 9, 3); one(s.intelligence, 9, 3);
}
