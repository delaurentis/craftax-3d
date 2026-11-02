// The university tiles: stone, its rusticated courses and arches, windows, fluted columns, cornices, balustrades, the domes' lead or copper
// and ribs, a gold finial, the railing's iron and the Camera's oak door. Two sets of building stone (their painters shared with the
// Ruins theme, plugins/shared/stone.ts): the real Radcliffe Camera's honey-colored stone and lead (ox_), and cream stone with green
// copper domes (oxp_, the far campus). Each tile is painted with the same random numbers as in the original game, so the pixels
// are the same.
import { hex, noise, px, rgb, rnd, S, specks, type Painter, type RGB } from "craftax-3d/plugin";
import { HONEY_STONE, STONE_OUTLINES, arch, seeded, stoneSet, type TileSet } from "../shared/stone";

type G = CanvasRenderingContext2D;
const out: [string, Painter, number][] = [];                           // each tile with its place in the original's run (its seed)
let place = 0;
const def = (name: string, fn: Painter) => { out.push([name, fn, place++]); };
const line = (g: G, c: RGB, k: number, x: number, y: number, w: number, h: number) => { g.fillStyle = rgb(c, k); g.fillRect(x, y, w, h); };

for (const [n, fn] of stoneSet("ox_", ...HONEY_STONE)) def(n, fn);
const LEAD = hex("#7b7d7c");                                           // weathered lead: a neutral, slightly warm grey (blue-grey read as slate)
def("ox_lead", (g) => { noise(g, LEAD, 9); line(g, LEAD, 22, 0, 0, 1, S); line(g, LEAD, 22, 8, 0, 1, S); line(g, LEAD, -16, 0, 15, S, 1); specks(g, hex("#a3a4a0"), 3, 1); });   // (pale oxide streaks)
def("ox_rib", (g) => { noise(g, hex("#96978f"), 8); line(g, LEAD, 30, 6, 0, 4, S); });
def("ox_gold", (g) => { noise(g, hex("#d6aa3c"), 22); specks(g, hex("#f6dc84"), 4, 1); });
def("ox_iron", (g) => { noise(g, hex("#222428"), 7); });              // the railing's black iron
// the Camera's front door: oak double doors, panelled and studded, in a stone frame, two blocks high; a fanlight in the arch
const OAK = hex("#5a3a1e");
const oak = (g: G, x: number, y: number) => px(g, x, y, x === 7 || x === 8 ? hex("#3a2412") : (x % 7 === 3 && y % 5 === 2) ? hex("#8a8a8a") : OAK, (rnd() - 0.5) * 12);
def("ox_door_lo", (g) => { noise(g, hex("#cfae74"), 8); for (let y = 0; y < S; y++) for (let x = 2; x < 14; x++) oak(g, x, y); line(g, OAK, -20, 2, 7, 12, 1); });
def("ox_door_hi", (g) => {
  noise(g, hex("#cfae74"), 8);
  for (let y = 2; y < S; y++) for (let x = 2; x < 14; x++) if (y >= 8 || Math.hypot(x - 7.5, y - 8) <= 6) {
    if (y < 8) px(g, x, y, (x === 7 || x === 8 || (x + y) % 4 === 0) ? hex("#6a5636") : hex("#2b3540"), (rnd() - 0.5) * 8);   // the fanlight
    else if (y === 8) px(g, x, y, hex("#7a6040"));
    else oak(g, x, y);
  }
  line(g, hex("#cfae74"), 22, 7, 0, 2, 2);                            // the keystone
});
// (places 16 … 18 in the original's run: the ruins' tiles, now the Ruins theme's, plugins/ruins/tiles.ts)
place += 3;
for (const [n, fn] of stoneSet("oxp_", hex("#e4dcc6"), hex("#b3a88c"))) def(n, fn);
const COPPER = hex("#4f9e8e"), SLATE = hex("#5d6670");
def("oxp_copper", (g) => { noise(g, COPPER, 12); line(g, COPPER, 26, 0, 0, 1, S); line(g, COPPER, 26, 8, 0, 1, S); specks(g, hex("#3d7f72"), 5, 2); });
def("oxp_copper_rib", (g) => { noise(g, hex("#73bfae"), 8); line(g, COPPER, -10, 6, 0, 4, S); });
def("oxp_roof", (g) => { noise(g, SLATE, 8); for (const y of [0, 4, 8, 12]) line(g, SLATE, -14, 0, y, S, 1); });


// line drawings for laser and phosphor (the stone's, shared with the ruins, and the door's); the plain stone and metal tiles have
// none and draw as the standard laser surfaces do
const DOOR: Record<string, Painter> = {
  ox_door_lo: (g) => { g.strokeRect(8, 0, 48, 64); g.beginPath(); g.moveTo(32, 0); g.lineTo(32, 64); g.stroke(); g.strokeRect(14, 6, 12, 20); g.strokeRect(38, 6, 12, 20); g.strokeRect(14, 34, 12, 24); g.strokeRect(38, 34, 12, 24); },
  ox_door_hi: (g) => { arch(g, 8, 56, 8); g.beginPath(); g.moveTo(8, 33); g.lineTo(56, 33); g.moveTo(32, 33); g.lineTo(32, 64); g.stroke(); },
};
const outlineOf = (name: string): Painter | undefined => DOOR[name] ?? STONE_OUTLINES[name.replace(/^oxp?_/, "")];

/** The tiles, for the set pieces' `tiles`. */
export const OXFORD_TILES: TileSet = Object.fromEntries(
  out.map(([name, fn, k]) => {
    const outline = outlineOf(name);
    return [name, outline ? { paint: seeded(k, fn), outline } : { paint: seeded(k, fn) }];
  }),
);
