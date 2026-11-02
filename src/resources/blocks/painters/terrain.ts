// Painters: grass, dirt, sand, the rock variants, the Graveyard's floor and walls, dungeon walls and their damage.
import { BARK, DIRT, GRASS, GRAVEL, LAVA, PATH, PLANK, R, S, SAND, STONE, WATER, WOOD, bricks, def, hex, leaves, logSide, logTop, noise, planks, px, rgb, rnd, sideOver, specks } from "../paint";
import type { Painter, RGB } from "../paint";


def("grass_top", (g) => noise(g, GRASS, 22));
def("grass_side", (g) => sideOver(g, DIRT, GRASS));
def("dirt", (g) => noise(g, DIRT, 18));
// the Graveyard's floor (Pete: dirt, not stone): dark, damp earth, clods and small stones in it, here and there a root or a chip of bone
export function graveDirt(g: CanvasRenderingContext2D, extra?: Painter) {
  noise(g, hex("#3a2c20"), 14);
  for (let i = 0; i < 10; i++) { const x = (rnd() * S) | 0, y = (rnd() * S) | 0; px(g, x, y, hex("#24190f"), (rnd() - 0.5) * 10); px(g, Math.min(S - 1, x + 1), y, hex("#2a1e13")); }   // clods
  for (let i = 0; i < 3; i++) { const x = (rnd() * (S - 1)) | 0, y = (rnd() * (S - 1)) | 0; px(g, x, y, hex("#5a5550"), (rnd() - 0.5) * 20); px(g, x + 1, y, hex("#46423e")); }   // pebbles
  extra?.(g);
}
def("grave_dirt", (g) => { R.seed = 7171; graveDirt(g); });
def("grave_dirt2", (g) => { R.seed = 7272; graveDirt(g, (g) => { let x = 2, y = 3; for (let i = 0; i < 9; i++) { px(g, x, y, hex("#4a3420")); x++; if (rnd() < 0.4) y++; } }); });   // a root
def("grave_dirt3", (g) => { R.seed = 7373; graveDirt(g, (g) => { px(g, 10, 6, hex("#c8c4b4")); px(g, 11, 6, hex("#b0ac9c")); px(g, 11, 7, hex("#a8a494")); }); });   // a chip of bone
// rock: stone's grey and specks, and each variant its own marks in colour too (Pete: rock walls wanted more variation), as in its laser
// line art (below); a rock wall picks one per block (world.ts). base, speck: the rock's colours (the Troll Mines' are darker)
export function rock(g: CanvasRenderingContext2D, n: string, base: RGB, speck: RGB) {
  noise(g, base, n === "stone_fine" ? 8 : 14); specks(g, speck, n === "stone_fine" ? 4 : 7, 2);
  const at = (x: number, y: number, k: number) => { if (x >= 0 && y >= 0 && x < S && y < S) px(g, x, y, base, k); };
  if (n === "stone_fissure") { let x = 4 + ((rnd() * 8) | 0); for (let y = 0; y < S; y++) { at(x, y, -40); if (rnd() < 0.35) x = Math.max(1, Math.min(S - 2, x + (rnd() < 0.5 ? -1 : 1))); } }
  if (n === "stone_star") { const cx = 5 + ((rnd() * 6) | 0), cy = 5 + ((rnd() * 6) | 0); for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) for (let k = 0; k < 3 + ((rnd() * 2) | 0); k++) at(cx + dx * k, cy + dy * k, -34); }
  if (n === "stone_strata") for (const y of [3 + ((rnd() * 2) | 0), 8 + ((rnd() * 2) | 0), 13]) for (let x = 0; x < S; x++) if (rnd() < 0.85) at(x, y, -20 + (rnd() - 0.5) * 10);
  if (n === "stone_pebbles") for (let i = 0; i < 4; i++) { const x = 1 + ((rnd() * 12) | 0), y = 1 + ((rnd() * 12) | 0); at(x, y, 30); at(x + 1, y, 22); at(x, y + 1, 18); at(x + 1, y + 1, -18); }
  if (n === "stone_chip") for (let y = 0; y < 5; y++) for (let x = 0; x < 5 - y; x++) at(S - 1 - x, y, 18 + rnd() * 12);
  if (n === "stone_arcs") specks(g, base.map((v) => Math.min(255, v + 20)), 5, 2);
  if (n === "stone_split") { let y = 5 + ((rnd() * 6) | 0); for (let x = 0; x < S; x++) { at(x, y, -36); if (rnd() < 0.3) y = Math.max(1, Math.min(S - 2, y + (rnd() < 0.5 ? -1 : 1))); } }
}
export const STONE_SPECK = hex("#6c6c6c");
def("stone", (g) => rock(g, "stone", STONE, STONE_SPECK));
export const STONE_VARIANTS: string[] = ["stone", "stone_fissure", "stone_star", "stone_strata", "stone_pebbles", "stone_chip", "stone_arcs", "stone_fine", "stone_split"];
def("placed_stone", (g) => {                                   // stone you placed: cut stone bricks
  noise(g, hex("#8a8a8a"), 10);
  g.fillStyle = rgb(hex("#5e5e5e"));
  for (const y of [0, 8]) g.fillRect(0, y, S, 1);                      // two courses of large bricks
  g.fillRect(0, 0, 1, 8); g.fillRect(8, 0, 1, 8); g.fillRect(4, 8, 1, 8); g.fillRect(12, 8, 1, 8);
  g.fillStyle = rgb(hex("#a4a4a4"));                                     // a lit top edge on each brick
  for (const [x, y, w] of [[1, 1, 7], [9, 1, 7], [0, 9, 4], [5, 9, 7], [13, 9, 3]]) g.fillRect(x, y, w, 1);
});
def("coal_ore", (g) => { noise(g, STONE, 14); specks(g, hex("#202020"), 6, 3); });
def("iron_ore", (g) => { noise(g, STONE, 14); specks(g, hex("#d8af93"), 6, 3); });
def("diamond_ore", (g) => { noise(g, STONE, 14); specks(g, hex("#5decf5"), 6, 3); });
def("sapphire_ore", (g) => { noise(g, STONE, 14); specks(g, hex("#2c50e8"), 6, 3); });
def("ruby_ore", (g) => { noise(g, STONE, 14); specks(g, hex("#e0203a"), 6, 3); });
def("log_side", (g) => logSide(g, BARK));
def("log_top", (g) => logTop(g, BARK, WOOD));
def("leaves", (g) => leaves(g, hex("#3d7a24")));
def("planks", (g) => planks(g, PLANK));
def("sand", (g) => noise(g, SAND, 12));
def("gravel", (g) => { noise(g, GRAVEL, 26); specks(g, hex("#5f5a56"), 10, 2); });
def("water", (g) => { noise(g, WATER, 14); for (let y = 2; y < S; y += 5) for (let x = 0; x < S; x++) if ((x + y) % 7 < 3) px(g, x, y, WATER, 35); });
def("lava", (g) => { noise(g, LAVA, 20); specks(g, hex("#ffd040"), 9, 2); specks(g, hex("#a02a08"), 6, 2); });
def("path", (g) => { noise(g, PATH, 10); g.fillStyle = rgb(PATH, -25); g.fillRect(0, 0, S, 1); g.fillRect(0, 0, 1, S); g.fillRect(8, 0, 1, 8); g.fillRect(0, 8, S, 1); g.fillRect(4, 8, 1, 8); });
def("wall", (g) => wallBase(g));
// the Graveyard's walls (Pete: dark, to match the portal's arch): ancient near-black bricks, each its own shade (a little brown, a
// little blue), worn, in near-black mortar; world.ts uses these on the boss floor in place of the dungeon wall
export function gwallBase(g: CanvasRenderingContext2D) {
  for (let row = 0; row < 4; row++) for (let bx = -1; bx < 3; bx++) {
    const v = 34 + rnd() * 28, tr = rnd() * 6 - 2, tb = rnd() * 8 - 2, off = row % 2 ? 4 : 0;   // (Pete: dark, but the torches must show it)
    for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
      const x = bx * 8 + off + i, y = row * 4 + j;
      if (x < 0 || x >= S) continue;
      const k = i === 7 || j === 3 ? 12 + rnd() * 6 : v + rnd() * 8 - 4 - (rnd() < 0.06 ? 10 : 0);
      g.fillStyle = `rgb(${Math.max(0, k + tr) | 0},${Math.max(0, k) | 0},${Math.max(0, k + tb) | 0})`; g.fillRect(x, y, 1, 1);
    }
  }
}
def("gwall", (g) => { R.seed = 9191; gwallBase(g); });
def("gwall2", (g) => { R.seed = 9292; gwallBase(g); });
def("gwall_crack", (g) => { R.seed = 9393; gwallBase(g); let x = 5, y = 0; for (let i = 0; i < 16 && y < S; i++) { px(g, x, y, hex("#060606")); y++; x = Math.max(1, Math.min(S - 2, x + (rnd() < 0.5 ? 1 : rnd() < 0.5 ? -1 : 0))); } });
def("gwall_worn", (g) => { R.seed = 9494; gwallBase(g); for (const [x, y] of [[2, 1], [9, 5], [13, 9], [4, 13]]) { px(g, x, y, hex("#070707")); px(g, x + 1, y, hex("#0d0d0d")); px(g, x, y + 1, hex("#0d0d0d")); } });
def("gwall_moss", (g) => { R.seed = 9595; gwallBase(g); for (let x = 0; x < S; x++) { const h = 1 + Math.floor(rnd() * 4); for (let y = S - h; y < S; y++) if (rnd() < 0.7) px(g, x, y, hex("#1f3318"), (rnd() - 0.5) * 16); } });                                  // the dungeon's one brick wall (wallBase, below)
def("wall_moss", (g) => { wallBase(g); specks(g, hex("#4f7d33"), 9, 2); });
// dungeon wall variants: every one starts from exactly the same bricks (one seed, one size, one colour) and differs only in its
// state of repair or what grows on it, so neighbouring walls read as one wall; each wall block picks one (world.ts)
export function wallBase(g: CanvasRenderingContext2D) { R.seed = 4242; bricks(g, hex("#7a7a7a"), hex("#555555")); }
def("wall_worn", (g) => {                                        // chipped brick corners
  wallBase(g);
  for (const [x, y] of [[1, 1], [6, 5], [13, 9], [3, 13], [10, 1]]) { px(g, x, y, hex("#3a3a3a")); px(g, x + 1, y, hex("#4a4a4a")); px(g, x, y + 1, hex("#4a4a4a")); }
});
def("wall_cracked", (g) => {                                     // a crack running down across the bricks
  wallBase(g);
  let x = 4, y = 0;
  for (let i = 0; i < 16 && y < S; i++) { px(g, x, y, hex("#2e2e2e")); y++; x = Math.max(1, Math.min(S - 2, x + (rnd() < 0.5 ? 1 : rnd() < 0.5 ? -1 : 0))); }
});
def("wall_moss2", (g) => {                                       // moss creeping up from the foot of the wall
  wallBase(g);
  for (let x = 0; x < S; x++) { const h = 2 + Math.floor(rnd() * 5); for (let y = S - h; y < S; y++) if (rnd() < 0.85) px(g, x, y, hex("#4a7a30"), (rnd() - 0.5) * 30); }
});
def("wall_vines", (g) => {                                       // vines hanging down from the top
  wallBase(g);
  for (const x0 of [2, 7, 12]) { let x = x0; const len = 6 + Math.floor(rnd() * 9);
    for (let y = 0; y < len; y++) { px(g, x, y, hex("#3f6e2a"), (rnd() - 0.5) * 25); if (rnd() < 0.3) px(g, x + 1, y, hex("#5a8a3a")); if (rnd() < 0.25) x = Math.max(0, Math.min(S - 1, x + (rnd() < 0.5 ? 1 : -1))); } }
});
def("wall_mossy", (g) => {                                       // moss growing in the mortar joints
  wallBase(g);
  for (let y = 0; y < S; y += 4) for (let x = 0; x < S; x++) if (rnd() < 0.45) px(g, x, y, hex("#4f7d33"), (rnd() - 0.5) * 30);
});
// broken bricks (Pete: "different bricks which are broken"): the damage is drawn into single bricks of wallBase's grid, never
// a straight-edged slot. Bricks are 7 × 3 inside the mortar, rows offset by half a brick; brick(row, k) lists its pixels.
export function brick(row: number, k: number) {
  const x0 = (row % 2 ? 5 : 1) + k * 8, out: [number, number][] = [];
  for (let y = row * 4 + 1; y <= row * 4 + 3; y++) for (let x = x0; x < x0 + 7; x++) out.push([x % S, y]);
  return out;
}
// shade a set of holes (keys "x,y") as broken-back stone lit from above: a shadow under the lip at the top, a lit floor at the
// bottom, rough dark grey between (no black)
export function holes(g: CanvasRenderingContext2D, set: Set<string>) {
  const has = (x: number, y: number) => set.has(((x + S) % S) + "," + y);
  for (const key of set) {
    const [x, y] = key.split(",").map(Number);
    const c = !has(x, y - 1) ? hex("#232323") : !has(x, y + 1) ? hex("#575757") : hex("#363636");
    px(g, x, y, c, (rnd() - 0.5) * 14);
  }
}
// a jagged bite out of a brick's corner (cx, cy: 0 left/top, 1 right/bottom), r about how far it reaches
export function bite(set: Set<string>, row: number, k: number, cx: number, cy: number, r: number) {
  const b = brick(row, k), xs = b.map((p) => p[0]), x0 = b[0][0], y0 = row * 4 + 1;
  b.forEach(([x, y], i) => {
    const dx = cx ? 6 - ((x - x0 + S) % S) : (x - x0 + S) % S, dy = cy ? 2 - (y - y0) : y - y0;
    if (dx + dy * 1.4 + rnd() * 1.8 < r * 1.6) set.add(x + "," + y);
  });
  return xs;
}
// half a brick broken away, the break a ragged vertical edge
export function half(set: Set<string>, row: number, k: number, side: number) {
  const b = brick(row, k), x0 = b[0][0];
  const cut = [3 + Math.floor(rnd() * 2), 3 + Math.floor(rnd() * 2), 2 + Math.floor(rnd() * 3)];
  for (const [x, y] of b) { const i = (x - x0 + S) % S, c = cut[y - row * 4 - 1]; if (side ? i >= c : i < c) set.add(x + "," + y); }
}
// a hairline crack zigzagging down through one brick
export function brickCrack(g: CanvasRenderingContext2D, row: number, k: number) {
  const b = brick(row, k); let x = b[0][0] + 2 + Math.floor(rnd() * 3);
  for (let y = row * 4; y <= row * 4 + 4; y++) { px(g, x % S, y, hex("#2c2c2c")); if (rnd() < 0.5) px(g, (x + 1) % S, y, hex("#3a3a3a")); x += rnd() < 0.5 ? 1 : -1; }
}
// the face flaked off a brick: a rough, slightly sunken patch, paler where fresh stone shows
export function spall(g: CanvasRenderingContext2D, row: number, k: number) {
  const b = brick(row, k), a = 1 + Math.floor(rnd() * 2), w = 4 + Math.floor(rnd() * 2);
  for (const [x, y] of b) { const i = (x - b[0][0] + S) % S; if (i >= a && i < a + w + (y % 2) && rnd() < 0.9) px(g, x, y, hex("#5c5c5c"), (rnd() - 0.5) * 24); }
  for (let i = a; i < a + w; i++) if (rnd() < 0.8) px(g, b[i][0], b[i][1], hex("#3c3c3c"));   // the shadowed upper edge of the scar
}
// the mortar washed out round a brick, its edges rounded off
export function erode(g: CanvasRenderingContext2D, row: number, k: number) {
  for (const [x, y] of brick(row, k)) {
    const edge = y === row * 4 + 1 || y === row * 4 + 3;
    if (edge && rnd() < 0.5) px(g, x, y, hex("#444444"), (rnd() - 0.5) * 10);
  }
}
export const broken = (name: string, fn: (g: CanvasRenderingContext2D, set: Set<string>) => void) => def(name, (g) => { wallBase(g); const set = new Set<string>(); fn(g, set); holes(g, set); });
broken("wall_bite", (g, set) => { bite(set, 1, 0, 1, 0, 4.5); bite(set, 2, 1, 0, 1, 3.5); });
broken("wall_bite2", (g, set) => { bite(set, 0, 0, 0, 1, 4); bite(set, 3, 0, 1, 1, 5); });
broken("wall_half", (g, set) => { half(set, 2, 0, 1); bite(set, 0, 1, 1, 0, 2.5); });
broken("wall_half2", (g, set) => { half(set, 1, 1, 0); erode(g, 3, 0); });
broken("wall_crack2", (g, set) => { brickCrack(g, 0, 1); brickCrack(g, 2, 0); erode(g, 1, 1); });
broken("wall_crack3", (g, set) => { brickCrack(g, 1, 0); brickCrack(g, 3, 1); bite(set, 3, 1, 0, 0, 2.5); });
broken("wall_spall", (g, set) => { spall(g, 1, 1); spall(g, 3, 0); });
broken("wall_spall2", (g, set) => { spall(g, 0, 0); spall(g, 2, 1); brickCrack(g, 2, 1); });
broken("wall_crumble", (g, set) => { for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) erode(g, r, k); bite(set, 2, 0, 1, 1, 3); });
broken("wall_ruin", (g, set) => { half(set, 1, 0, 1); bite(set, 2, 1, 0, 0, 4); bite(set, 3, 0, 1, 0, 3); brickCrack(g, 0, 0); spall(g, 0, 1); });
def("bedrock", (g) => { noise(g, hex("#4a4a4a"), 40); specks(g, hex("#1a1a1a"), 10, 2); });
def("darkness", (g) => noise(g, hex("#0a0a0a"), 4));
def("table_top", (g) => { planks(g, PLANK); g.fillStyle = rgb(hex("#5a3c1c")); g.fillRect(0, 0, S, 1); g.fillRect(0, 15, S, 1); g.fillRect(0, 0, 1, S); g.fillRect(15, 0, 1, S); g.fillRect(7, 0, 2, S); g.fillRect(0, 7, S, 2); });
def("table_side", (g) => {
  planks(g, PLANK); g.fillStyle = rgb(hex("#5a3c1c")); g.fillRect(0, 0, S, 3);
  g.fillStyle = "#9a9a9a"; g.fillRect(3, 6, 2, 7); g.fillRect(2, 5, 4, 2);                         // hammer
  g.fillStyle = "#6b4a25"; g.fillRect(10, 5, 2, 9); g.fillStyle = "#b8b8b8"; g.fillRect(8, 5, 6, 2); // saw
});
def("furnace_side", (g) => { noise(g, hex("#6e6e6e"), 16); g.fillStyle = rgb(hex("#555555")); g.fillRect(0, 0, S, 2); });
def("furnace_front", (g) => {
  noise(g, hex("#6e6e6e"), 16); g.fillStyle = "#2a2a2a"; g.fillRect(3, 8, 10, 6); g.fillStyle = "#3c3c3c"; g.fillRect(3, 3, 10, 3);
  for (let x = 4; x < 12; x++) if (rnd() < 0.7) px(g, x, 12 + Math.floor(rnd() * 2), hex("#ff9a20"), (rnd() - 0.5) * 60);
});
def("furnace_top", (g) => { noise(g, hex("#777777"), 10); g.fillStyle = "#555"; g.fillRect(0, 0, S, 1); g.fillRect(0, 15, S, 1); g.fillRect(0, 0, 1, S); g.fillRect(15, 0, 1, S); });
