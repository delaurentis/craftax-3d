// Painters: chests, fire-tree bark, the sealed ladder's grate, the inventory icons and the arrow.
import { ICE, NETHER, OBSID, R, S, SNOW, WATER, def, hex, leaves, logSide, logTop, noise, painters, px, rgb, rnd, sideOver, specks, sprite } from "../paint";
import type { RGB } from "../paint";

// a chest: one piece of grained wood (no plank rows, which read as bricks), a dark frame, the lid a shade lighter
// than the body with one seam between them, iron bands on the corners, and a latch on the front
export function grain(g: CanvasRenderingContext2D, base: RGB, x0: number, y0: number, w: number, h: number) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) px(g, x, y, base, Math.sin(x * 1.7 + Math.sin(y * 0.6) * 1.5) * 9 + (rnd() - 0.5) * 8);
}
export function chestFrame(g: CanvasRenderingContext2D) {
  g.fillStyle = "#3b2610"; g.fillRect(0, 0, S, 1); g.fillRect(0, 15, S, 1); g.fillRect(0, 0, 1, S); g.fillRect(15, 0, 1, S);
  g.fillStyle = "#8a8a8a";                                       // iron corner bands
  for (const [x, y] of [[1, 1], [13, 1], [1, 13], [13, 13]]) g.fillRect(x, y, 2, 2);
}
def("chest_side", (g) => {
  grain(g, hex("#b07a36"), 0, 0, S, 6); grain(g, hex("#9a6428"), 0, 6, S, 10);   // the lid, the body
  g.fillStyle = "#3b2610"; g.fillRect(0, 6, S, 1);                               // the seam where the lid closes
  chestFrame(g);
});
def("chest_front", (g) => {
  painters.chest_side(g);
  g.fillStyle = "#2a2a2a"; g.fillRect(6, 4, 4, 5);                               // the latch: a dark plate, a bright hasp
  g.fillStyle = "#d8d8d8"; g.fillRect(7, 5, 2, 3);
  g.fillStyle = "#888"; g.fillRect(7, 7, 2, 1);
});
def("chest_top", (g) => {
  grain(g, hex("#b07a36"), 0, 0, S, S);
  g.fillStyle = "#4a3016"; g.fillRect(2, 2, 12, 1); g.fillRect(2, 13, 12, 1);     // the lid's raised rim
  chestFrame(g);
});
def("fire_grass_top", (g) => { noise(g, NETHER, 26); specks(g, hex("#a83a1e"), 8, 2); });
def("fire_grass_side", (g) => { noise(g, hex("#4a1d18"), 20); specks(g, NETHER, 8, 2); });
def("ice_grass_top", (g) => { noise(g, SNOW, 8); specks(g, ICE, 5, 2); });
def("ice_grass_side", (g) => sideOver(g, hex("#6f8597"), SNOW, 4));
// a fire tree's bark (Pete: not the same orange dashes on every block): channels of flame running its length, two to a face, each
// wandering its own way but entering and leaving at the same columns, so block on block they join into long burning seams; three
// versions, world.ts picks one a block up the trunk
export function fireBark(g: CanvasRenderingContext2D, k: number) {
  R.seed = 4401 + k * 977;
  logSide(g, hex("#2e1a14"));
  for (const c0 of [3, 11]) {
    let x = c0;
    for (let y = 0; y < S; y++) {
      if (y > 0 && y < S - 3 && rnd() < 0.45) x = Math.max(c0 - 2, Math.min(c0 + 2, x + (rnd() < 0.5 ? -1 : 1)));
      if (y >= S - 3) x += Math.sign(c0 - x);                              // back to its column by the block's foot
      px(g, x, y, hex("#ffc040"), (rnd() - 0.5) * 30);                      // the hot core
      for (const d of [-1, 1]) if (rnd() < 0.55) px(g, x + d, y, hex("#e8501a"), (rnd() - 0.5) * 30);   // its glow, ragged
    }
  }
  if (k === 2) for (let y = 4, x = 7; y < 11; y++) { px(g, x, y, hex("#f07a20"), (rnd() - 0.5) * 20); if (rnd() < 0.5) x++; }   // a short side seam
}
def("fire_log_side", (g) => fireBark(g, 0));
def("fire_log_top", (g) => logTop(g, hex("#2e1a14"), hex("#7a3018")));
def("fire_leaves", (g) => leaves(g, hex("#d4541c"), 0.18));
def("ice_leaves", (g) => leaves(g, hex("#a8e0f2"), 0.18));
def("ice", (g) => { noise(g, ICE, 10); g.fillStyle = "rgba(255,255,255,0.6)"; g.fillRect(3, 2, 1, 6); g.fillRect(10, 8, 1, 5); });
def("obsidian", (g) => { noise(g, OBSID, 10); specks(g, hex("#3a2a55"), 6, 2); });
def("ench_fire_top", (g) => { noise(g, hex("#8a1a14"), 14); g.fillStyle = "#3b1010"; g.fillRect(0, 0, S, 2); g.fillRect(0, 14, S, 2); g.fillStyle = "#f0d070"; g.fillRect(5, 5, 6, 6); g.fillStyle = "#c03018"; g.fillRect(6, 6, 4, 4); });
def("ench_ice_top", (g) => { noise(g, hex("#1a4a8a"), 14); g.fillStyle = "#102040"; g.fillRect(0, 0, S, 2); g.fillRect(0, 14, S, 2); g.fillStyle = "#f0f0f0"; g.fillRect(5, 5, 6, 6); g.fillStyle = "#40a0f0"; g.fillRect(6, 6, 4, 4); });
def("ench_side", (g) => { noise(g, OBSID, 10); g.fillStyle = "#5a2a8a"; g.fillRect(0, 0, S, 3); specks(g, hex("#8a5ad0"), 3, 1); });
def("grave", (g) => { noise(g, hex("#9a9a9a"), 12); g.fillStyle = "#555"; g.fillRect(7, 3, 2, 9); g.fillRect(4, 5, 8, 2); });
def("fountain_top", (g) => { noise(g, WATER, 14); g.fillStyle = rgb(hex("#9a9a9a")); g.fillRect(0, 0, S, 2); g.fillRect(0, 14, S, 2); g.fillRect(0, 0, 2, S); g.fillRect(14, 0, 2, S); });
def("smooth_stone", (g) => { noise(g, hex("#9a9a9a"), 8); g.fillStyle = "#777"; g.fillRect(0, 0, S, 1); g.fillRect(0, 15, S, 1); });
def("plant", (g) => sprite(g, (g) => {
  // darker than the grass round it (Pete: it got lost on the grass), and all green (Pete: no brown): a dark green stem, deep green
  // leaves with a darker underside
  g.fillStyle = "#1a4a16"; g.fillRect(7, 6, 2, 10);
  for (const [x, y, w] of [[3, 7, 4], [9, 5, 4], [4, 3, 3], [9, 9, 3], [5, 11, 2]]) {
    g.fillStyle = rgb(hex("#2c7424"), (rnd() - 0.5) * 24); g.fillRect(x, y, w, 1);
    g.fillStyle = rgb(hex("#1d5418"), (rnd() - 0.5) * 16); g.fillRect(x, y + 1, w, 1);
  }
}));
def("ripe_plant", (g) => sprite(g, (g) => {
  painters.plant(g);
  for (const [x, y] of [[4, 4], [10, 3], [10, 8], [3, 9]]) { g.fillStyle = "#d8262a"; g.fillRect(x, y, 2, 2); g.fillStyle = "#ff8080"; g.fillRect(x, y, 1, 1); }
}));
def("ladder", (g) => sprite(g, (g) => {
  g.fillStyle = "#6e5028"; g.fillRect(3, 0, 2, S); g.fillRect(11, 0, 2, S);                // two rails
  g.fillStyle = "#9a7440"; for (let y = 1; y < S; y += 3) g.fillRect(4, y, 8, 1);       // five thin rungs a block (Pete: more, smaller)
}));
// a sealed ladder's grate (Pete: rusty, as the Vaults' portcullis, not plain red): iron bars both ways, rust-brown with lighter worn
// edges, darker pits and the odd orange flake, rivets where they cross; see-through between the bars
def("bars", (g) => sprite(g, (g) => {
  const put = (x: number, y: number, col: string, k: number) => { g.fillStyle = rgb(hex(col), k); g.fillRect(x, y, 1, 1); };
  const rust = (x: number, y: number) => { const r = rnd(); put(x, y, r < 0.08 ? "#b8682a" : r < 0.22 ? "#4a2610" : "#6e3a1a", (rnd() - 0.5) * 26); };
  for (const x of [1, 5, 10, 14]) for (let y = 0; y < S; y++) { rust(x, y); put(x + 1, y, "#55301a", (rnd() - 0.5) * 18); }   // the bars down, a shaded side each
  for (const y of [3, 11]) for (let x = 0; x < S; x++) { rust(x, y); put(x, y + 1, "#4a2610", (rnd() - 0.5) * 16); }           // and across
  for (const x of [1, 5, 10, 14]) for (const y of [3, 11]) put(x, y, "#9a5a2a", (rnd() - 0.5) * 14);                     // the rivets, worn bright
}));
def("hole", (g) => { noise(g, hex("#080808"), 6); g.fillStyle = "#3a3a3a"; g.fillRect(0, 0, S, 1); g.fillRect(0, 15, S, 1); g.fillRect(0, 0, 1, S); g.fillRect(15, 0, 1, S); });
def("ice_shrub", (g) => sprite(g, (g) => {
  for (let i = 0; i < 9; i++) { g.fillStyle = rgb(ICE, (rnd() - 0.5) * 50); const x = 2 + Math.floor(rnd() * 11); g.fillRect(x, 3 + Math.floor(rnd() * 5), 1, 9); }
  g.fillStyle = "#ffffff"; g.fillRect(5, 3, 1, 1); g.fillRect(10, 5, 1, 1);
}));
// inventory icons (hotbar / crafting screen)
def("i_sapling", (g) => sprite(g, (g) => { painters.plant(g); }));
def("i_torch", (g) => sprite(g, (g) => { g.fillStyle = "#7a5a30"; g.fillRect(7, 6, 2, 9); g.fillStyle = "#ffd040"; g.fillRect(6, 3, 4, 4); g.fillStyle = "#fff4b0"; g.fillRect(7, 4, 2, 2); }));
def("i_bow", (g) => sprite(g, (g) => { g.fillStyle = "#7a5a30"; for (let i = 0; i < 12; i++) g.fillRect(3 + Math.round(Math.sin(i / 11 * Math.PI) * 5), 2 + i, 2, 1); g.fillStyle = "#ddd"; g.fillRect(4, 2, 1, 12); }));
def("i_fireball", (g) => sprite(g, (g) => { g.fillStyle = "#ff6a1a"; g.fillRect(4, 4, 8, 8); g.fillStyle = "#ffd040"; g.fillRect(6, 6, 4, 4); g.fillStyle = "#b02a08"; g.fillRect(3, 6, 1, 4); g.fillRect(12, 6, 1, 4); }));
def("i_iceball", (g) => sprite(g, (g) => { g.fillStyle = "#5ab8f0"; g.fillRect(4, 4, 8, 8); g.fillStyle = "#e8f8ff"; g.fillRect(6, 6, 4, 4); g.fillStyle = "#2a70c0"; g.fillRect(3, 6, 1, 4); g.fillRect(12, 6, 1, 4); }));
def("i_coal", (g) => sprite(g, (g) => { g.fillStyle = "#222"; g.fillRect(4, 5, 8, 7); g.fillStyle = "#444"; g.fillRect(5, 6, 3, 2); }));
def("i_iron", (g) => sprite(g, (g) => { g.fillStyle = "#c8c8c8"; g.fillRect(3, 6, 10, 5); g.fillStyle = "#f0f0f0"; g.fillRect(4, 7, 8, 1); }));
def("i_diamond", (g) => sprite(g, (g) => { g.fillStyle = "#5decf5"; g.fillRect(5, 3, 6, 3); g.fillRect(4, 6, 8, 2); g.fillRect(6, 8, 4, 3); g.fillRect(7, 11, 2, 2); g.fillStyle = "#d8ffff"; g.fillRect(6, 4, 2, 2); }));
def("i_ruby", (g) => sprite(g, (g) => { g.fillStyle = "#e0203a"; g.fillRect(5, 4, 6, 8); g.fillRect(4, 6, 8, 4); g.fillStyle = "#ff9aa8"; g.fillRect(6, 5, 2, 2); }));
def("i_sapphire", (g) => sprite(g, (g) => { g.fillStyle = "#2c50e8"; g.fillRect(5, 4, 6, 8); g.fillRect(4, 6, 8, 4); g.fillStyle = "#9ab0ff"; g.fillRect(6, 5, 2, 2); }));
def("i_book", (g) => sprite(g, (g) => { g.fillStyle = "#7a2a1a"; g.fillRect(3, 3, 10, 11); g.fillStyle = "#f0e8d0"; g.fillRect(4, 4, 8, 9); g.fillStyle = "#7a2a1a"; g.fillRect(7, 4, 2, 9); }));
// an arrow: a flint head (H lit, h shade) at the top right, the shaft (s), white and grey fletching (F, f) swept back
// at the tail, all outlined (o)
export const ARROW = [
  "..............o.",
  "...........oooho",
  "..........oHHho.",
  ".........oHHhho.",
  "..........ohhho.",
  ".........osoho..",
  "........oso.o...",
  ".......oso......",
  "......oso.......",
  "...oooso........",
  "..oFFso.........",
  ".oFFsfo.........",
  ".oFsffo.........",
  "oFsffo..........",
  "osfoo...........",
  ".oo.............",
];
export const ARROW_INK: Record<string, string | undefined> = { o: "#140d06", s: "#7a5530", H: "#9a9a9f", h: "#5f5f64", F: "#f0f0f0", f: "#bebec3" };
def("i_arrow", (g) => sprite(g, (g) => ARROW.forEach((row, y) => [...row].forEach((ch, x) => { const ink = ARROW_INK[ch]; if (ink) { g.fillStyle = ink; g.fillRect(x, y, 1, 1); } }))));
def("i_potion", (g) => sprite(g, (g) => { g.fillStyle = "#ddd"; g.fillRect(7, 2, 2, 3); g.fillStyle = "#fff"; g.fillRect(4, 5, 8, 9); g.fillRect(5, 4, 6, 1); }));
