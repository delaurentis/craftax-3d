// ?scene=campus: a college campus beyond an edge of the map, seen across the water in the distance, in cream stone and green copper
// domes: a quad lawn between two long wings, domed towers at their far ends, the Radcliffe Camera closing the far end, a long range
// behind it. In the game only the map's two rows along that edge change: a paved promenade to look out from. Laid out for the north
// edge and turned to the first side whose promenade holds no ladder (north, east, west, south).
import { orient, SIDES, type Draw, type GeneratedLevel, type Oriented, type Placement, type SetPieces } from "craftax-3d/plugin";
import { CREAM, camera, model, range, tower } from "./model";
import { OXFORD_TILES } from "./tiles";
import { clearSide, drawModel, solidIn, stepAside } from "./draw";

const EDGE_ROWS = 2, PATH = 7, N = 48;                                 // (laid out for Craftax's 48-wide map)
const CAMPUS = { x0: -24, x1: 72, z0: -78, z1: 0 };                     // the land past the edge, in local tiles

// looking out from the spawn: the promenade, a low balustrade on the edge, then the quad lawn between the two wings, the domed towers
// at the wings' far ends, the Camera closing the far end, a long range behind it
const M = model();
{
  const P = CREAM;
  // the balustrade along the map's edge: short runs between stone piers (one long run looked too regular), an urn on each pier, a gap
  // for the walk up the quad's middle
  for (let x = 0; x < N; x++) {
    if (x === 23 || x === 24) continue;
    const pier = x % 6 === 0 || x === 22 || x === 25;
    M.put(x, 0, -1, pier ? P.rustic : P.bal);
    if (pier) M.extras.push([x + 0.25, 1, -0.75, x + 0.75, 1.5, -0.25, P.stone]);
  }
  range(M, -6, 6, -50, -8, P);                                                      // the west wing
  range(M, 42, 54, -50, -8, P);                                                     // the east wing
  tower(M, -3, -58, P); tower(M, 45, -58, P);                                       // the domed towers past the wings' ends
  camera(M, -56, 24, P);                                                            // the Camera, closing the quad
  range(M, -6, 54, -74, -66, P, 9);                                                 // the range behind it
}
// the campus ground: grass, gravel walks round the lawn and up its middle
function campusGround(x: number, z: number): string {
  if (x >= 8 && x < 40 && z >= -46 && z < -3) return (x === 23 || x === 24 || z === -4 || x === 8 || x === 39) ? "gravel" : "grass_top";
  if (z >= -4) return "gravel";                                                     // a walk along the water's edge
  return "grass_top";
}
// the land: a top per tile (so the texture tiles), its edges dropping into the sea
function campusLand(t: Draw, W: number): void {
  const { x0, x1, z0, z1 } = CAMPUS;
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const tex = campusGround(x, z);
    t.piece(tex === "gravel" ? 3900002 : 3900001);
    t.face("top", x, -1, z, x + 1, 0, z + 1, tex);
  }
  t.piece(3900001);
  t.face("nz", x0, -2, z0, x1, 0, z0, "grass_side");
  t.face("nx", x0, -2, z0, x0, 0, z1, "grass_side"); t.face("px", x1, -2, z0, x1, 0, z1, "grass_side");
  t.face("pz", x0, -2, z1, 0, 0, z1, "grass_side"); t.face("pz", W, -2, z1, x1, 0, z1, "grass_side");   // (the map meets it between)
  t.piece(-1);
}

function drawn(o: Oriented, H: number, W: number): Placement {
  const across = o.side === "north" || o.side === "south" ? W : H;
  return {
    data: { side: o.side },
    fog: [110, 480],                                                  // (the standard 30-140 hid the campus in haze)
    paved: (r, c) => o.local(r, c)[0] < EDGE_ROWS,                    // the promenade: stone paving
    beyond: (d) => { campusLand(o.draw(d), across); drawModel(M, o, d, () => true); },
    solid: solidIn(M, o),
  };
}
const promenade = (lr: number) => lr >= 0 && lr < EDGE_ROWS;

export const campus: SetPieces = {
  id: "campus",
  label: "College campus",
  theme: "standard",
  tiles: OXFORD_TILES,
  place(lv: GeneratedLevel) {
    const [H, W] = lv.size;
    if (lv.level !== 0) return null;
    const pick = clearSide(lv, promenade);
    if (!pick) return null;
    return { ...drawn(pick.o, H, W), writes: pick.cells.map(([r, c]) => ({ r, c, block: PATH })), moves: stepAside(lv, pick.cells) };
  },
  // found from the map alone: the two rows along an edge all path (an overworld never has that of its own)
  recognize(lv) {
    const [H, W] = lv.size;
    if (lv.level !== 0) return null;
    for (const side of SIDES) {
      const o = orient(side, H, W), across = side === "north" || side === "south" ? W : H;
      let all = true;
      for (let lr = 0; lr < EDGE_ROWS && all; lr++) for (let lc = 0; lc < across && all; lc++) { const [r, c] = o.tile(lr, lc); all = lv.map[r * W + c] === PATH; }
      if (all) return drawn(o, H, W);
    }
    return null;
  },
};
