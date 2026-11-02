// Painters: lava's frame slots, the stone, dirt and Fire Realm floors, grass tops, flowers and shoots.
import { COLS, GRASS, NAMES, S, def, hex, noise, px, rgb, rnd, specks } from "../paint";
import { STONE_VARIANTS, rock } from "./terrain";

// lava's animation frames (LAVA_TILES below): blanks to the end of an atlas row, then two whole rows of 16, four variants' 8 frames
// each; filled from the painted lava tile once the atlas is drawn
while (NAMES.length % COLS) def("pad" + NAMES.length, () => {});
for (let v = 0; v < 4; v++) for (let f = 0; f < 8; f++) def(`lavaf${v}_${f}`, () => {});
// the plain stone floor (world.ts floorKinds, Pete: darker, the bricks' grey, and more varied): the rock patterns in the path's own
// grey, two shades of it, so a floor of them reads as one stone in many pieces (added last: the tiles before keep their seeds)
export const FLOOR_STONES: string[] = [];
for (const [k, base] of [["a", "#646464"], ["b", "#5c5c5f"]]) for (const n of STONE_VARIANTS) {
  const name = `floor_${k}_${n}`; if (n !== "stone_strata") FLOOR_STONES.push(name);   // (strata: its stripes looked strange on a floor, Pete)
  def(name, (g) => rock(g, n, hex(base), hex(k === "a" ? "#505050" : "#4a4a4e")));
}
// the bare dirt floor (Pete: the grass blocks' dirt was too bright on a floor): darker, packed earth, four ways, with a few small
// stones and darker clods in it
// the Fire Realm's paving (Pete: its bricks reddish, a little darker than the ground round them): the path's brick pattern in a dark red
{ const FP = hex("#5a2420"); def("fire_path", (g) => { noise(g, FP, 10); g.fillStyle = rgb(FP, -22); g.fillRect(0, 0, S, 1); g.fillRect(0, 0, 1, S); g.fillRect(8, 0, 1, 8); g.fillRect(0, 8, S, 1); g.fillRect(4, 8, 1, 8); }); }
export const FLOOR_DIRTS: string[] = [];
for (let v = 0; v < 4; v++) {
  const name = `floor_dirt${v}`; FLOOR_DIRTS.push(name);
  def(name, (g) => {
    noise(g, hex(v % 2 ? "#3a3029" : "#3f342c"), 11);   // (Pete: greyer, and darker again)
    specks(g, hex("#2b241e"), 4 + v, 2);                                  // clods
    for (let i = 0; i < 2 + (v & 1); i++) { const x = (rnd() * (S - 1)) | 0, y = (rnd() * (S - 1)) | 0; px(g, x, y, hex("#6a625a"), (rnd() - 0.5) * 16); px(g, x + 1, y, hex("#57504a")); }   // pebbles
  });
}
// grass with more variety (Pete): a few tops a grass block picks one of by its position (world.ts GRASS_TOPS), and short shoots that
// stand on some blocks. Added after the lava frames so every tile before keeps its place and seed
def("grass_top2", (g) => { noise(g, GRASS, 22); specks(g, hex("#4a8a28"), 7, 2); specks(g, hex("#3f7a22"), 4, 1); });   // darker clumps
def("grass_top3", (g) => {                                       // a lighter patch, bright blade tips
  noise(g, hex("#67a63a"), 20);
  for (let i = 0; i < 14; i++) { const x = (rnd() * S) | 0, y = (rnd() * (S - 1)) | 0; px(g, x, y, hex("#86c24c"), (rnd() - 0.5) * 16); px(g, x, y + 1, hex("#4e8c2a")); }
});
// flowers' colours (Pete: on stems, in 3D, their colours per world): column x is one petal colour (rows 0-7, a little shading), rows 8-15
// its flower's centre; world.ts picks a few columns per world seed and builds each flower from pixel cubes of them
export const PETALS = ["#f4f0e0", "#fbe7a0", "#f2d43a", "#f0a830", "#e86a28", "#d8302a", "#a8182c", "#f49ab8", "#d84a9a", "#c8a0e8",
  "#8a4ac8", "#5a48d0", "#4a7ae8", "#8ac8f0", "#f4b898", "#ffffff"];
export const CENTRES = ["#e0a020", "#c88a18", "#7a4a12", "#5a3410", "#f2d43a", "#f2d43a", "#f2d43a", "#f2d43a", "#f2d43a", "#f2d43a",
  "#f2d43a", "#f2d43a", "#f2d43a", "#f2d43a", "#e0a020", "#e0a020"];
def("flower_colors", (g) => { for (let x = 0; x < S; x++) for (let y = 0; y < S; y++) px(g, x, y, hex(y < 8 ? PETALS[x] : CENTRES[x]), (rnd() - 0.5) * 14); });
// shoots (Pete: a pixel in size all around): world.ts builds each blade as a 1/16-block column and paints its sides with one column
// of this tile from the bottom up (dark at the foot, lighter up the blade), its top with a texel of the bright top row
def("grass_blade", (g) => {
  for (let x = 0; x < S; x++) {
    const k = (rnd() - 0.5) * 24;
    // (Pete: too dark, at the foot most): the foot the ground's own green, so a blade grows out of it, lighter going up
    for (let y = 0; y < S; y++) { const up = S - 1 - y; px(g, x, y, up < 3 ? hex("#5f9f35") : up < 6 ? hex("#6cae3c") : hex("#7cc046"), k); }   // (Pete: too pale: nearer the ground's green)
    px(g, x, 0, hex("#98d85c"), k);
  }
});
