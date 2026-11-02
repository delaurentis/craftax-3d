// Turning a set piece to a side of the map. A set piece lays itself out once, as if it stood on the north edge: local row 0 is the
// edge, rows count inward, columns run west to east. orient(side, H, W) maps that layout onto the side it chose, for the map writes
// (tiles) and for the drawing (world units). Turns are by quarter turns, so boxes stay boxes.
import type { Draw, Side } from "../themes/types";

export const SIDES: readonly Side[] = ["north", "east", "south", "west"];
export interface Oriented {
  side: Side;
  /** The map tile [r, c] of local tile (lr, lc). */
  tile(lr: number, lc: number): [number, number];
  /** The local tile [lr, lc] of map tile (r, c) (the inverse). */
  local(r: number, c: number): [number, number];
  /** The world point [x, z] of local point (lx, lz) (local x across, local z inward from the edge). */
  point(lx: number, lz: number): [number, number];
  /** A Draw that takes local coordinates and draws them turned (its r0 … c1 stay the map's). */
  draw(d: Draw): Draw;
}
/** side: the edge the piece stands on; H, W: the map's rows and columns. */
export function orient(side: Side, H: number, W: number): Oriented {
  const tile = (lr: number, lc: number): [number, number] =>
    side === "north" ? [lr, lc] : side === "east" ? [lc, W - 1 - lr] : side === "south" ? [H - 1 - lr, W - 1 - lc] : [H - 1 - lc, lr];
  const local = (r: number, c: number): [number, number] =>
    side === "north" ? [r, c] : side === "east" ? [W - 1 - c, r] : side === "south" ? [H - 1 - r, W - 1 - c] : [c, H - 1 - r];
  const point = (lx: number, lz: number): [number, number] =>
    side === "north" ? [lx, lz] : side === "east" ? [W - lz, lx] : side === "south" ? [W - lx, H - lz] : [lz, H - lx];
  // a face's direction turned with the piece: local +z (inward) is the map's +z on the north edge, -x on the east...
  const TURN: Record<Side, Record<string, string>> = {
    north: {}, east: { pz: "nx", nz: "px", px: "pz", nx: "nz" }, south: { pz: "nz", nz: "pz", px: "nx", nx: "px" }, west: { pz: "px", nz: "nx", px: "nz", nx: "pz" },
  };
  const box = (x0: number, z0: number, x1: number, z1: number): [number, number, number, number] => {
    const [ax, az] = point(x0, z0), [bx, bz] = point(x1, z1);
    return [Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz)];
  };
  return {
    side, tile, local, point,
    draw: (d) => ({
      r0: d.r0, c0: d.c0, r1: d.r1, c1: d.c1, piece: d.piece,
      face(f, x0, y0, z0, x1, y1, z1, tex, light, sub) { const [a, b, c, e] = box(x0, z0, x1, z1); d.face(TURN[side][f] ?? f, a, y0, b, c, y1, e, tex, light, sub); },
      box(x0, y0, z0, x1, y1, z1, tex, light, faces) { const [a, b, c, e] = box(x0, z0, x1, z1); d.box(a, y0, b, c, y1, e, tex, light, faces?.map((f) => TURN[side][f] ?? f)); },
    }),
  };
}
