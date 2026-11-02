// Painters: the stone variants, the Troll Mines, the fire and ice realms, the Sewers, the Vaults' iron, portcullises and
// the vault door (and its relief, the parts that stand out of it).
import { NAMES, R, S, STONE, def, hex, noise, painters, px, rgb, rnd, specks } from "../paint";
import type { Painter, RGB } from "../paint";
import type { ReliefPixel } from "../../../world/blocks";
import { STONE_SPECK, STONE_VARIANTS, rock, wallBase } from "./terrain";
import { fireBark } from "./objects";

// the stone variants last, so every other tile keeps its place (and its seeds)
for (const n of STONE_VARIANTS.slice(1)) def(n, (g) => rock(g, n, STONE, STONE_SPECK));
// the Troll Mines' rock (world.ts swaps it in there): the same variants, a little darker and cooler, mossy (Pete: Gnomish and Troll
// Mines should differ; not so dark it stops catching the light)
export const TROLL_STONE = hex("#6c6e6a"), TROLL_SPECK = hex("#5a5c58");
for (const n of STONE_VARIANTS) def("troll_" + n, (g) => {
  rock(g, n, TROLL_STONE, TROLL_SPECK);
  specks(g, hex("#4f6e2e"), 3 + ((rnd() * 3) | 0), 2); specks(g, hex("#5f8238"), 4, 1);   // moss: patches and single tufts
  if (rnd() < 0.5) for (let x = 0; x < S; x++) if (rnd() < 0.55) px(g, x, 0, hex("#56782f"), (rnd() - 0.5) * 20);   // here and there a mossy top edge
});
// the fire and ice realms' rock (world.ts swaps it in for stone there): dark red basalt with ember specks, and pale blue packed ice;
// each stone variant has its pair, with the same laser crack art
export const REALM_ROCK: Record<string, Painter> = {
  fire: (g) => { noise(g, hex("#5a2620"), 14); specks(g, hex("#2e1210"), 7, 2); specks(g, hex("#c8461e"), 3, 1); },
  ice: (g) => { noise(g, hex("#93b8dc"), 10); specks(g, hex("#d8ecff"), 6, 2); specks(g, hex("#5f86b8"), 4, 1); },
};
for (const realm of ["fire", "ice"]) for (const n of STONE_VARIANTS) def(realm + "_" + n, (g) => { R.seed = 1 + NAMES.indexOf("stone") * 7919; REALM_ROCK[realm](g); });

def("fire_log_side2", (g) => fireBark(g, 1)); def("fire_log_side3", (g) => fireBark(g, 2));   // (last: no other tile moves)
for (const n of ["lava2", "lava3", "lava4"]) def(n, (g) => { R.seed = 1 + NAMES.indexOf("lava") * 7919; painters.lava(g); });   // (unused now: kept so the tiles after keep their seeds)
// the Troll Mines' overgrown rock (Pete: now and then a block mostly moss): moss all over in three greens, the grey rock showing through
// in a few worn patches; two of them so neighbours differ (world.ts picks one for about one rock block in nine there)
// the Sewers (Pete: set apart from the other dungeon floors): the paving wet, dark and a little green, slime in its joints and the
// light glinting off a thin sheen of water in streaks (the puddles stay the bright moving water); and the dungeon bricks overgrown,
// slime running down from the joints, or moss over most of the wall
export function sewerFloor(g: CanvasRenderingContext2D, k: number) {
  R.seed = 5151 + k * 131;
  noise(g, hex("#4b524d"), 9);
  const joint = (x: number, y: number, w: number, h: number) => { for (let i = 0; i < w; i++) for (let j = 0; j < h; j++) px(g, x + i, y + j, rnd() < 0.55 ? hex("#3c5a2a") : hex("#2f3a32"), (rnd() - 0.5) * 14); };
  joint(0, 0, S, 1); joint(0, 0, 1, S); joint(8, 0, 1, 8); joint(0, 8, S, 1); joint(4, 8, 1, 8);
  // (the pale streaks of a sheen are gone: Pete, they looked strange)
}
for (let k = 0; k < 3; k++) def("sewer_floor" + (k || ""), (g) => sewerFloor(g, k));
// wetter, darker: a picture's pixels darkened (and greened a touch) by wet(y), 0..1 down its 16 rows
export function soak(g: CanvasRenderingContext2D, wet: (y: number) => number) {
  const im = g.getImageData(0, 0, S, S), d = im.data;
  for (let y = 0; y < S; y++) { const w = wet(y); for (let x = 0; x < S; x++) { const i = (y * S + x) * 4; d[i] *= 1 - 0.5 * w; d[i + 1] *= 1 - 0.42 * w; d[i + 2] *= 1 - 0.5 * w; } }
  g.putImageData(im, 0, 0);
}
// the Sewers' wet gradient (Pete: the walls wetter as they go down, into the floor): each wall block in its bottom row soaked darker
// toward its foot, the row above only at its foot, every wall alike (Pete: even everywhere, not on some walls; the floor one even dark)
export const SEWER_WET = ["wall", "wall_mossy", "wall_moss2", "wall_slime", "wall_overgrown", "wall_vines", "wall_worn", "wall_cracked"];
for (const n of SEWER_WET) {
  def(n + "_wet0", (g) => { painters[n](g); soak(g, (y) => 0.35 + 0.65 * (y / (S - 1))); });
  def(n + "_wet1", (g) => { painters[n](g); soak(g, (y) => 0.35 * Math.max(0, (y - 4) / (S - 5))); });
}

// the Vaults' iron (Pete: here and there a stretch of wall turned to rusty metal): a riveted plate a block, its seams dark, the iron
// mottled and rust bleeding from the rivets and down from the seam; three so a run of plates doesn't repeat
export function ironPlate(g: CanvasRenderingContext2D, k: number) {
  R.seed = 6161 + k * 173;
  noise(g, hex("#5d5f63"), 10);
  for (let i = 0; i < 5 + k * 2; i++) { const x = Math.floor(rnd() * 14), y = Math.floor(rnd() * 14); for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (rnd() < 0.7) px(g, x + dx, y + dy, hex("#8a4a22"), (rnd() - 0.5) * 30); }   // rust patches
  g.fillStyle = rgb(hex("#2c2d30")); g.fillRect(0, 0, S, 1); g.fillRect(0, 0, 1, S);                         // the seams with the next plates
  g.fillStyle = rgb(hex("#7a7c80")); g.fillRect(1, 1, S - 1, 1); g.fillRect(1, 1, 1, S - 1);                 // their lit lips
  for (const [x, y] of [[3, 3], [12, 3], [3, 12], [12, 12]]) {                                                  // rivets, rust running from them
    px(g, x, y, hex("#9a9ca0")); px(g, x + 1, y + 1, hex("#3a3b3e"));
    for (let d = 2, n = 1 + Math.floor(rnd() * 3); d < 2 + n && y + d < S; d++) px(g, x, y + d, hex("#7a3a18"), (rnd() - 0.5) * 20);
  }
  for (let x = 1; x < S; x++) if (rnd() < 0.35) for (let d = 1, n = 1 + Math.floor(rnd() * 4); d <= n; d++) px(g, x, d, hex("#8a4a22"), (rnd() - 0.5) * 24 - d * 8);   // rust down from the seam
}
for (let k = 0; k < 3; k++) def("vault_iron" + (k || ""), (g) => ironPlate(g, k));
// a rusted portcullis set in a Vaults wall (Pete), 2-4 blocks wide (world.ts portcullises): one picture per width, 16 × width pixels
// by 48 (three blocks up), cut into tiles pcul_<width>_<col><row> (col from the viewer's left, row from the floor). Blackness behind
// a grid of rusty bars two blocks high under a round arch that cuts part way into the block above (Pete), ringed with stones; the
// bars every 4 pixels, ending in points a little above the floor; the walls either side its jambs
export const pculPics: Record<number, HTMLCanvasElement> = {};
export function pculPic(w: number) {
  if (pculPics[w]) return pculPics[w];
  const W = 16 * w, H = 48, c = document.createElement("canvas"); c.width = W; c.height = H;
  const g = c.getContext("2d")!, t = document.createElement("canvas"); t.width = t.height = S;
  wallBase(t.getContext("2d")!);
  for (let k = 0; k < w; k++) for (let r = 0; r < 3; r++) g.drawImage(t, k * S, r * S);           // the wall it's set in
  R.seed = 8181 + w;
  const put = (x: number, y: number, col: string, k = 0) => { g.fillStyle = rgb(hex(col), k); g.fillRect(x, y, 1, 1); };
  const rise = 10, cx = W / 2, open = (x: number, y: number) => y >= 16 || ((x + 0.5 - cx) / (W / 2)) ** 2 + ((16 - y - 0.5) / rise) ** 2 <= 1;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (open(x, y)) put(x, y, "#060606", rnd() * 4);
    else if (y < 16 && (open(x, y + 1) || open(x, y + 2) || open(x - 1, y + 1) || open(x + 1, y + 1))) put(x, y, (x >> 2) % 2 ? "#8a8a88" : "#6e6e6c", (rnd() - 0.5) * 12);   // the arch's stones
  }
  const bar = (x: number, y: number) => put(x, y, "#6e3a1a", (rnd() - 0.5) * 30), hi = (x: number, y: number) => put(x, y, "#9a5a2a", (rnd() - 0.5) * 20);
  for (let x = 1; x < W; x += 4) for (let y = 0; y < 46; y++) if (open(x, y) && open(x, y - 1)) { bar(x, y); if (rnd() < 0.3) hi(x, y); }
  for (let x = 1; x < W; x += 4) put(x, 46, "#4a2610");                                                // the points
  for (const y of [14, 22, 28, 37]) for (let x = 0; x < W; x++) if (open(x, y) && open(x, y - 1)) { bar(x, y); if (x % 4 === 1) hi(x, y); }   // crossbars, glints at the joins
  return (pculPics[w] = c);
}
for (let w = 2; w <= 4; w++) for (let col = 0; col < w; col++) for (let row = 0; row < 3; row++)
  def(`pcul_${w}_${col}${row}`, (g) => g.drawImage(pculPic(w), col * 16, (2 - row) * 16, 16, 16, 0, 0, 16, 16));
// a great vault door in a Vaults wall (Pete): 3 blocks wide and 3 tall, one 48 × 48 picture cut into nine tiles (vdoor_<col><row>, col
// from the viewer's left, row from the floor; world.ts lays them). A riveted iron frame, the round door in it with its rim and locking
// bolts, and in the middle a round recess holding the spoked wheel: lit on its upper left, its shadow in the recess on the lower right,
// so it stands out of the flush door
export let vdoorPic: HTMLCanvasElement | null = null;
export function vaultDoorPic() {
  if (vdoorPic) return vdoorPic;
  const N = 48, c = document.createElement("canvas"); c.width = c.height = N;
  const g = c.getContext("2d")!;
  R.seed = 7373;
  const put = (x: number, y: number, col: RGB, k = 0) => { g.fillStyle = rgb(col, k + (rnd() - 0.5) * 8); g.fillRect(x, y, 1, 1); };
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = x + 0.5 - 24, dy = y + 0.5 - 24, d = Math.hypot(dx, dy), lit = (-dx - dy) / (d || 1);   // lit: +1 upper left, -1 lower right
    const ang = Math.atan2(dy, dx);
    if (x < 2 || y < 2 || x >= N - 2 || y >= N - 2) put(x, y, hex("#2a2b2e"));                         // the frame's dark edge
    else if (d > 21.5) put(x, y, hex("#3c3e42"), rnd() < 0.08 ? 12 : 0);                                 // the frame plate
    else if (d > 21) put(x, y, hex("#1c1d1f"));                                                         // the door's seam
    else if (d > 18.5) put(x, y, hex("#6c6f74"), lit * 24);                                             // its rim, bevelled
    else if (d > 10.5) put(x, y, hex("#55575b"), lit * 8 + (Math.abs(d - 14.5) < 0.5 ? -14 : 0));       // the door's face, a turned ring in it
    else if (d > 9.5) put(x, y, hex("#2c2d30"), -lit * 18);                                             // the recess's edge, lit on its far side
    else {
      put(x, y, hex("#2a2b2e"), (dx + dy > 2 ? -10 : 0));                                               // the recess, in the wheel's shadow below right
      const spoke = [0, 1, 2, 3, 4, 5].some((i) => { const a = ang - i * Math.PI / 3; return Math.abs(Math.sin(a)) * d < 0.7 && Math.cos(a) > 0; });
      if ((d > 7 && d < 8.6) || (spoke && d < 7.5) || d < 2) put(x, y, hex("#8a8d92"), lit * 24);       // the wheel: rim, spokes, hub
      if (spoke && d >= 8.6) put(x, y, hex("#9a9da2"), lit * 18);                                        // a handle knob past the rim at each spoke
    }
  }
  for (let i = 0; i < 8; i++) {                                                                          // the locking bolts round the rim
    const a = i * Math.PI / 4 + Math.PI / 8, x = Math.round(24 + Math.cos(a) * 19.8 - 0.5), y = Math.round(24 + Math.sin(a) * 19.8 - 0.5);
    put(x, y, hex("#8e9094")); put(x + 1, y + 1, hex("#2a2b2e"));
    for (let k = 2, n = 2 + Math.floor(rnd() * 4); k < n && y + k < N - 2; k++) put(x, y + k, hex("#6a3418"), (rnd() - 0.5) * 16 - k * 4);   // rust run from the bolt
  }
  for (let i = 3; i < N - 3; i += 6) for (const [x, y] of [[i, 3], [i, N - 4], [3, i], [N - 4, i]]) { put(x, y, hex("#9a9ca0")); put(x + 1, y + 1, hex("#2e2f32")); }   // the frame's rivets
  for (let x = 2; x < N - 2; x++) if (rnd() < 0.3) for (let k = 0, n = 1 + Math.floor(rnd() * 5); k < n; k++) put(x, 2 + k, hex("#7a3e1c"), (rnd() - 0.5) * 20 - k * 6);   // rust bleeding down from the top, as the plates
  // rust in patches (Pete): blotches on the frame and the door's face, thickest in the middle of each, never in the recess
  for (let i = 0; i < 16; i++) {
    const px0 = 3 + rnd() * 42, py0 = 3 + rnd() * 42, rad = 2.5 + rnd() * 3.5;
    for (let y = Math.floor(py0 - rad); y <= py0 + rad; y++) for (let x = Math.floor(px0 - rad); x <= px0 + rad; x++) {
      const e = Math.hypot(x + 0.5 - px0, y + 0.5 - py0) / rad, d = Math.hypot(x + 0.5 - 24, y + 0.5 - 24);
      if (x < 2 || y < 2 || x >= N - 2 || y >= N - 2 || d < 11 || e > 1 || rnd() < e * 0.8) continue;
      put(x, y, hex(rnd() < 0.3 ? "#5e2e14" : rnd() < 0.5 ? "#8e4a22" : "#7a3e1c"), (rnd() - 0.5) * 18);
    }
  }
  return (vdoorPic = c);
}
for (let col = 0; col < 3; col++) for (let row = 0; row < 3; row++) def(`vdoor_${col}${row}`, (g) => g.drawImage(vaultDoorPic(), col * 16, (2 - row) * 16, 16, 16, 0, 0, 16, 16));
// what stands out of the door (Pete: not flat, catching the light): its pixels [x, y (from the picture's top), depth out of the wall in
// blocks, texture]; the wheel most, the bolts, then the door's rim a little (world.ts builds them as tiny cubes on the wall)
export function vaultDoorRelief(): ReliefPixel[] {
  const out: ReliefPixel[] = [];
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    const dx = x + 0.5 - 24, dy = y + 0.5 - 24, d = Math.hypot(dx, dy), ang = Math.atan2(dy, dx);
    const spoke = [0, 1, 2, 3, 4, 5].some((i) => { const a = ang - i * Math.PI / 3; return Math.abs(Math.sin(a)) * d < 0.7 && Math.cos(a) > 0; });
    if ((d > 7 && d < 8.6) || (spoke && d < 9.6) || d < 2) out.push([x, y, d < 2 ? 0.16 : 0.11, "steel"]);
    else if (d > 18.5 && d <= 21) out.push([x, y, 0.035, "steel_dark"]);
  }
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + Math.PI / 8;
    out.push([Math.round(24 + Math.cos(a) * 19.8 - 0.5), Math.round(24 + Math.sin(a) * 19.8 - 0.5), 0.07, "steel"]);
  }
  return out;
}
def("steel", (g) => { noise(g, hex("#85888d"), 8); specks(g, hex("#7a3e1c"), 4, 2); }); def("steel_dark", (g) => { noise(g, hex("#606367"), 8); specks(g, hex("#6a3418"), 5, 2); });   // (rusted too)
def("wall_slime", (g) => {                                       // slime oozing from the mortar joints and running down the bricks
  wallBase(g);
  for (let y = 0; y < S; y += 4) for (let x = 0; x < S; x++) {
    if (rnd() < 0.5) px(g, x, y, hex("#4f7d33"), (rnd() - 0.5) * 24);
    if (rnd() < 0.12) for (let d = 1, n = 1 + Math.floor(rnd() * 3); d <= n && y + d < S; d++) px(g, x, y + d, hex("#5c8a2e"), (rnd() - 0.5) * 20 - d * 6);
  }
});
def("wall_overgrown", (g) => {                                   // moss over most of the wall, the bricks showing through here and there
  wallBase(g);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) if (rnd() < (y % 4 === 0 ? 0.92 : 0.7)) px(g, x, y, rnd() < 0.2 ? hex("#3a5a24") : hex("#4f7d33"), (rnd() - 0.5) * 28);
});
for (const n of ["troll_mossy", "troll_mossy2"]) def(n, (g) => {
  noise(g, hex("#4f6e2e"), 14);
  specks(g, TROLL_STONE, n === "troll_mossy" ? 4 : 3, 3); specks(g, TROLL_SPECK, 3, 1);   // the rock through it
  specks(g, hex("#6a8f3c"), 7, 2); specks(g, hex("#3a5222"), 6, 2); specks(g, hex("#7da348"), 5, 1);   // lit tufts, shade, bright tips
});
