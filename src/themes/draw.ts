// The Draw a theme's decorate and a set piece's draw build with (src/themes/types.ts): faces and boxes into one of the world's
// meshes, each piece its own laser and phosphor outline.
import { face, type Geo } from "../world/geo";
import { COLS, NAMES, ROWS } from "../resources/blocks/paint";
import type { Draw } from "./types";

// a tile the atlas doesn't have (a slip, or the atlas full): that face is left out and told once, never an error that stops the build
const told = new Set<string>();
function has(tex: string): boolean {
  const i = NAMES.indexOf(tex);
  if (i >= 0 && i < COLS * ROWS) return true;
  if (!told.has(tex)) { told.add(tex); console.warn(`[craftax-3d] a theme or set piece draws with the tile "${tex}", which isn't in the atlas: left out`); }
  return false;
}
const ok = new Set<string>();
const check = (tex: string) => ok.has(tex) || (has(tex) && !!ok.add(tex));

const ALL = ["top", "bottom", "pz", "nz", "px", "nx"];
/** A Draw into geo for the tiles [r0, r1) × [c0, c1); its pieces' ids start at band × 4096 (110: themes, 120 on: set pieces). */
export function makeDraw(geo: Geo, r0: number, c0: number, r1: number, c1: number, band: number): Draw {
  const id0 = geo.id;
  return {
    r0, c0, r1, c1,
    face(f, x0, y0, z0, x1, y1, z1, tex, light = 1, sub, sway) { if (check(tex)) face(geo, f, x0, y0, z0, x1, y1, z1, tex, light, sway === undefined ? null : typeof sway === "number" ? [sway, sway, sway, sway] : [...sway], sub ? [...sub] : null); },
    box(x0, y0, z0, x1, y1, z1, tex, light = 1, faces = ALL) { if (check(tex)) for (const f of faces) face(geo, f, x0, y0, z0, x1, y1, z1, tex, light); },
    piece(n) { geo.id = n < 0 ? id0 : band * 4096 + 1 + (Math.abs(Math.floor(n)) % 4000000); },
  };
}
