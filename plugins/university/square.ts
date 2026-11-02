// ?scene=oxford: Radcliffe Square on an edge of the map. The Radcliffe Camera stands half past the edge (its far half, and the
// square's, drawn on land out there), so from where you start you see all of it and can walk up to its front; round it its lawn
// inside an iron railing, the paved square round that, a paved avenue from the square to the row before the spawn, and a walk across
// the lawn from the gate to the door. In the engine's own map the Camera's round footprint is wall (nothing walks into it, nothing
// mines it), the lawn grass, and the square, the walk and the avenue path; the rest is drawn over them.
//
// Laid out for the north edge (local row 0 the edge, rows counting inward), then turned to the first side whose ground holds no
// ladder (north, east, west, south), the Camera's door and the avenue facing the spawn. The world keeps the player's seed.
import { orient, SIDES, type Draw, type GeneratedLevel, type Oriented, type Placement, type SetPieces } from "craftax-3d/plugin";
import { FOOT, HONEY, camera, model, railing, type Model } from "./model";
import { OXFORD_TILES } from "./tiles";
import { clearSide, drawModel, inChunk, offMap, solidIn, stepAside } from "./draw";

// the Camera's middle tile is local row CR; the lawn ring is about a third of the building's radius wide, as in Radcliffe Square, so
// the railing stands 3.5 blocks out from the wall (~7 m at this scale); the square is 27 tiles wide; the avenue 5
const CR = 4, LAWN = 11.2, SQUARE = 13, AVENUE = 2;
const WALL = 17, GRASS = 2, PATH = 7, WALL_MOSS = 19;

/** The layout on one side: the Camera's column cc and the spawn's local row sr (the avenue stops just before it). */
function layout(o: Oriented, H: number, W: number) {
  const [sr, cc] = o.local(H >> 1, W >> 1);                           // (Craftax starts you in the map's middle)
  const dist = (r: number, c: number) => Math.hypot(r - CR, c - cc);
  const inSquare = (r: number, c: number) => r <= CR + SQUARE && Math.abs(c - cc) <= SQUARE;   // (to the map's edge on the far side)
  const inAvenue = (r: number, c: number) => r > CR + SQUARE && r < sr && Math.abs(c - cc) <= AVENUE;
  const walk = (r: number, c: number) => c === cc && r > CR && dist(r, c) > FOOT && dist(r, c) <= LAWN;
  // the layout's mark, in the engine's map where nothing can change it: the footprint's middle tile, under the Camera, is mossy wall
  const block = (r: number, c: number) => (r === CR && c === cc ? WALL_MOSS : dist(r, c) <= FOOT ? WALL : dist(r, c) <= LAWN && !walk(r, c) ? GRASS : PATH);
  return { cc, sr, dist, inSquare, inAvenue, walk, block, area: (r: number, c: number) => r >= 0 && (inSquare(r, c) || inAvenue(r, c)) };
}
type Layout = ReturnType<typeof layout>;

// the model, made once per column the Camera stands on (the middle of the map's width, which side it is on decides)
const models = new Map<number, Model>();
function modelAt(cc: number): Model {
  let m = models.get(cc);
  if (!m) { m = model(); camera(m, CR, cc, HONEY); railing(m, CR, cc, LAWN - 0.2, Math.PI / 2); models.set(cc, m); }   // its gate toward the spawn
  return m;
}

// the square's ground past the map's edge: the lawn round the Camera, the paving round that, a strip of grass beyond, its edges
// dropping into the sea (under the Camera itself: nothing, its base covers it)
function squareLand(L: Layout, t: Draw): void {
  const x0 = L.cc - SQUARE - 3, x1 = L.cc + SQUARE + 4, z0 = CR - SQUARE - 3;
  for (let z = z0; z < 0; z++) for (let x = x0; x < x1; x++) {
    const d = L.dist(z, x), sq = Math.abs(x - L.cc) <= SQUARE && z >= CR - SQUARE;
    if (d <= FOOT) continue;
    const tex = !sq ? "grass_top" : d <= LAWN ? "grass_top" : "floor_a_" + ["stone", "stone_fine", "stone_chip", "stone_pebbles"][(x * 7 + z * 13 & 0xffff) % 4];
    t.piece(tex === "grass_top" ? 3900001 : 3900002);
    t.face("top", x, -1, z, x + 1, 0, z + 1, tex);
  }
  t.piece(3900001);
  t.face("nz", x0, -2, z0, x1, 0, z0, "grass_side");
  t.face("nx", x0, -2, z0, x0, 0, 0, "grass_side"); t.face("px", x1, -2, z0, x1, 0, 0, "grass_side");
  t.piece(-1);
}

// how it draws, the same for a new world (place) and one found again (recognize)
function drawn(o: Oriented, H: number, W: number): Placement {
  const L = layout(o, H, W), m = modelAt(L.cc), loc = (r: number, c: number) => o.local(r, c);
  return {
    data: { side: o.side },
    covers: (r, c) => { const [lr, lc] = loc(r, c); return L.dist(lr, lc) <= FOOT; },
    // the square, the walk and the avenue: stone paving, no bare dirt
    paved: (r, c) => { const [lr, lc] = loc(r, c); return (L.inSquare(lr, lc) && (L.dist(lr, lc) > LAWN || L.walk(lr, lc))) || L.inAvenue(lr, lc); },
    draw: (d) => drawModel(m, o, d, inChunk(d)),
    beyond: (d) => { squareLand(L, o.draw(d)); drawModel(m, o, d, offMap(H, W)); },   // its half past the edge
    solid: solidIn(m, o),
  };
}

export const square: SetPieces = {
  id: "oxford",
  label: "Radcliffe Square",
  theme: "ruins",                                                  // (its stone is the Ruins theme's; without Ruins installed, the player's own)
  tiles: OXFORD_TILES,
  place(lv: GeneratedLevel) {
    const [H, W] = lv.size;
    if (lv.level !== 0 || H < 2 * (CR + SQUARE) || W < 2 * SQUARE + 1) return null;
    const pick = clearSide(lv, (lr, lc, o) => layout(o, H, W).area(lr, lc));
    if (!pick) return null;                                          // (two sides never both hold the one ladder: unreachable)
    const L = layout(pick.o, H, W);
    const writes = pick.cells.map(([r, c]) => { const [lr, lc] = pick.o.local(r, c); return { r, c, block: L.block(lr, lc) }; });
    return { ...drawn(pick.o, H, W), writes, moves: stepAside(lv, pick.cells) };
  },
  // found from the map alone: the mark under the Camera's middle, and its footprint wall (a few tiles may have stayed as they were,
  // under a creature that couldn't step aside); an overworld never has mossy wall of its own
  recognize(lv) {
    const [H, W] = lv.size;
    if (lv.level !== 0 || H < 2 * (CR + SQUARE) || W < 2 * SQUARE + 1) return null;
    for (const side of SIDES) {
      const o = orient(side, H, W), L = layout(o, H, W), [mr, mc] = o.tile(CR, L.cc);
      if (lv.map[mr * W + mc] !== WALL_MOSS) continue;
      let off = 0;
      for (let lr = 0; lr <= CR + FOOT; lr++) for (let lc = L.cc - 8; lc <= L.cc + 8; lc++) {
        if (L.dist(lr, lc) > FOOT || (lr === CR && lc === L.cc)) continue;
        const [r, c] = o.tile(lr, lc);
        if (lv.map[r * W + c] !== WALL) off++;
      }
      if (off <= 3) return drawn(o, H, W);
    }
    return null;
  },
};
