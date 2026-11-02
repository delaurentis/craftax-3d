// World methods (mixed into World, src/world/core.ts): loose pieces (a cube, a felled tree's parts), a block's texture, the overhead tree's
// box, the flat view's switch, and the crosshair's raycast.
import * as THREE from "three";
import { B, CEIL, CROSS, FLAT_TRUNK, GRAVES, ITEM, LIQUID_TOP, SOLID, TALL, TREES, TRUNK } from "./blocks";
import { CROWN_Y, Geo, Q, STUB_W, addCrown, crownCubes, face } from "./geo";
import { themeCrown, themeRemap } from "../themes/blocks";
import { drawCrown } from "../themes/crowns";
import { themeAt, trunkInset } from "../themes/state";
import type { Vec3 } from "./blocks";
import type { World } from "./core";

/** What the aim touches (input/aim): a tile (raycast below) or a creature, how far along the ray, the face's [dr, dc] (null: a top
 *  or bottom, or a creature), and what it is. */
export interface AimHit {
  r: number; c: number; normal: [number, number] | null;
  /** How far along the ray (none: the 2D view's aim). */
  t?: number;
  floor?: boolean; ladder?: boolean; up?: boolean;
  /** The cave ceiling, meaning the tile below it. */
  ceil?: boolean;
  /** A creature: its key in mobs. */
  mob?: boolean; key?: string;
  /** The height where the ray meets it, and the point. */
  y?: number; point?: THREE.Vector3;
}
/** What the crosshair touches (raycast): a tile. */
export interface RayHit extends AimHit { t: number; floor: boolean; ladder: boolean; up: boolean }
/** A felled tree's parts (treeParts). */
export type TreeParts = Record<"stump" | "nick" | "top" | "log", THREE.Group> & { leafColors?: [number, number] };

// a felled tree's leaf bits, from the theme it's drawn in: one pair for every tree, or each tree its own (by where it stands)
const leafBits = (v: [number, number] | ((r: number, c: number) => [number, number]) | undefined, r: number, c: number): [number, number] | undefined =>
  typeof v === "function" ? v(r, c) : v;

export class WorldShapes {
  // a textured cube of side s centred on the origin (rock chunks, the piece that flies to the hotbar)
  cube(this: World, tex: string, s: number, cutout = false): THREE.Mesh {                                    // cutout: a sprite's see-through pixels stay see-through
    const g = new Geo(null);
    for (const f of ["top", "bottom", "pz", "nz", "px", "nx"]) face(g, f, -s / 2, -s / 2, -s / 2, s / 2, s / 2, s / 2, tex, 1);
    return g.mesh(cutout ? this.mats.cutout : this.mats.opaque);
  }
  // the texture of a minable block (stone and ores), or null
  blockTex(this: World, b: number): string | null { return b === B.STONE || b === B.COAL || b === B.IRON || b === B.DIAMOND || b === B.SAPPHIRE || b === B.RUBY ? SOLID[b].side : null; }

  // that little tree's bounds as drawn (main.ts's Target box): its crown of quarter-block cubes on the stub, [x0, y0, z0, x1, y1, z1]
  flatTreeBox(this: World, r: number, c: number): [number, number, number, number, number, number] {
    let x0 = 9, x1 = -9, z0 = 9, z1 = -9, y1 = 0;
    for (const [x, y, z] of crownCubes(r * this.W + c)) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z); y1 = Math.max(y1, y); }
    return [c + x0 * Q, 0, r + z0 * Q, c + (x1 + 1) * Q, CROWN_Y + (y1 + 1) * Q, r + (z1 + 1) * Q];
  }
  // the overhead 2D view: a tree is 2 blocks of trunk and 1 leaf block on its own tile, like Craftax's 2D map
  setFlat(this: World, on: boolean): void {
    this.flat = !!on;
    for (const m of [...(this.crowns || []), ...(this.trunks || [])]) m.visible = !this.flat;
    for (const m of [...(this.tops || []), ...(this.stubs || [])]) m.visible = this.flat;
  }

  // what the crosshair touches: first tile box along the ray within reach. Returns {r, c, t, normal: [dr, dc] or null, floor}
  raycast(this: World, o: THREE.Vector3, d: THREE.Vector3, reach: number, crowns = false): RayHit | null {                     // crowns: trees' leaves count too (first person: full-size trees)
    let best: RayHit | null = null;
    const test = (r: number, c: number, y0: number, y1: number, floor: boolean, inset = 0) => box(r, c, c + inset, y0, r + inset, c + 1 - inset, y1, r + 1 - inset, floor);
    const box = (r: number, c: number, bx0: number, y0: number, bz0: number, bx1: number, y1: number, bz1: number, floor: boolean, ladder = false) => {
      let tmin = 0, tmax = reach, axis = -1, sign = 0;
      for (const [k, lo, hi] of [[0, bx0, bx1], [1, y0, y1], [2, bz0, bz1]]) {
        const oo = [o.x, o.y, o.z][k], dd = [d.x, d.y, d.z][k];
        if (Math.abs(dd) < 1e-9) { if (oo < lo || oo > hi) return; continue; }
        let t0 = (lo - oo) / dd, t1 = (hi - oo) / dd, s = -1;
        if (t0 > t1) { [t0, t1] = [t1, t0]; s = 1; }
        if (t0 > tmin) { tmin = t0; axis = k; sign = s; }
        tmax = Math.min(tmax, t1);
        if (tmin > tmax) return;
      }
      if (!best || tmin < best.t) best = { r, c, t: tmin, floor, ladder, normal: axis === 0 ? [0, sign] : axis === 2 ? [sign, 0] : null, up: axis === 1 && sign === 1 };
    };
    const r0 = Math.floor(o.z), c0 = Math.floor(o.x), R = Math.ceil(reach) + 1;
    for (let r = r0 - R; r <= r0 + R; r++) for (let c = c0 - R; c <= c0 + R; c++) {
      if (r < 0 || c < 0 || r >= this.H || c >= this.W) continue;
      const b = this.at(r, c);
      if (b === B.WATER || b === B.LAVA) { test(r, c, -1, LIQUID_TOP, true); continue; }
      if (b in SOLID) { const t = SOLID[b]; test(r, c, 0, TALL.has(b) ? this.height(r, c) : t.h || 1, false, t.inset || 0); continue; }
      if (b in TREES) {                                                  // the trunk, and its 3 × 3 crown: a click in the leaves is the tree
        const th = this.trunkH(r, c);
        test(r, c, 0, th, false, 0.2);
        if (crowns) box(r, c, c - 1, th - 1, r - 1, c + 2, th + 2, r + 2, false);
      }
      else if (b in CROSS) test(r, c, 0, 0.8, false, 0.2);
      else if (b === B.STALAGMITE) test(r, c, 0, 2, false, 0.12);
      else if (GRAVES.has(b)) test(r, c, 0, 0.9, false, 0.25);
      else if (b === B.NECROMANCER || b === B.NECROMANCER_VULNERABLE) test(r, c, 0, this.propBox(r, c)?.max.y ?? 2.2, false, 0.15);   // (his whole height, hat and all)
      // a ladder: one solid slab over its rails and rungs (not the gaps between them), so a click on it is a click on the ladder
      const it = this.items[r * this.W + c];
      if (it === ITEM.LADDER_UP) box(r, c, c + 0.1, 0, r + 0.38, c + 0.9, this.level ? CEIL : 3, r + 0.62, false, true);
      else if (it === ITEM.LADDER_DOWN || it === ITEM.LADDER_DOWN_BLOCKED) box(r, c, c + 0.18, -1.6, r + 0.05, c + 0.82, 0.4, r + 0.25, true, true);
      test(r, c, -1, 0, true);
      // the cave ceiling: a click there means the tile below. Only from under it: from above (overhead, 3/4) the ray goes to the floor
      if (this.level && this.level !== 8 && this.height(r, c) < CEIL && o.y < CEIL) {
        const was: RayHit | null = best; test(r, c, CEIL, CEIL + 1, true);
        if (best !== was) (best as RayHit).ceil = true;   // (set by test above: TS does not follow assignments in closures)
      }
    }
    return best;
  }

  /** The model a block on (r, c) is drawn as (the Necromancer), or null. */
  propAt(this: World, r: number, c: number): THREE.Object3D | null {
    return this.props.children.find((o) => Math.floor(o.position.z) === r && Math.floor(o.position.x) === c) ?? null;
  }
  /** The box round that model, as it stands; null if none. Measured once per model. */
  propBox(this: World, r: number, c: number): THREE.Box3 | null {
    const p = this.propAt(r, c);
    if (!p) return null;
    return (p.userData.box as THREE.Box3 | undefined) ?? (p.userData.box = new THREE.Box3().setFromObject(p));
  }
  // one tree of block type b, centred on x = z = 0, split at cutY for the felling animation: the stump, the notch (pale wood showing on
  // the side [dr, dc] the axe came from) and the top (trunk above the cut + canopy), each in its own group so the top can pivot
  // short: the overhead views' tree (2 blocks of trunk, 1 leaf block), so a tree falls at the size it is drawn
  treeParts(this: World, b: number, cutY: number, notch: number[], L: number, short = false, seed: number | null = null): TreeParts {
    const tk = seed == null ? TRUNK : this.trunkH(Math.floor(seed / this.W), seed % this.W);   // (seed: the tile, r * W + c)
    const t = TREES[b] || TREES[B.TREE], w = short ? 0.5 - STUB_W : 0.5 - trunkInset((TREES[b] ? b : B.TREE) === B.TREE), cutH = 0.22, TH = short ? (seed == null ? FLAT_TRUNK : this.stubH(Math.floor(seed / this.W), seed % this.W)) : tk;
    const stump = new Geo(null), top = new Geo(null), leaves = new Geo(null), nick = new Geo(null);
    stump.noRows = top.noRows = true;
    for (const f of ["pz", "nz", "px", "nx"]) face(stump, f, -w, 0, -w, w, cutY - cutH / 2, w, t.log + "_side", L);
    face(stump, "top", -w, 0, -w, w, cutY - cutH / 2, w, t.log + "_top", L);
    for (const f of ["pz", "nz", "px", "nx", "top"]) face(top, f, -w, cutY + cutH / 2, -w, w, TH, w, f === "top" ? t.log + "_top" : t.log + "_side", L);
    face(top, "bottom", -w, cutY + cutH / 2, -w, w, TH, w, t.log + "_top", L);
    // the notch: the trunk carries on behind the cut, only the axe side is bitten in (a thinner core across the gap)
    const [dr, dc] = notch, core = 0.12, X0 = dc < 0 ? -w + core * 2 : -w, X1 = dc > 0 ? w - core * 2 : w, Z0 = dr < 0 ? -w + core * 2 : -w, Z1 = dr > 0 ? w - core * 2 : w;
    for (const f of ["pz", "nz", "px", "nx"]) face(nick, f, X0, cutY - cutH / 2, Z0, X1, cutY + cutH / 2, Z1, t.log + "_top", L);
    // a theme's own crown (Winter's fir), as it stands, moved to the origin; else the standard one
    const tr = seed == null ? -1 : Math.floor(seed / this.W), tc = seed == null ? -1 : seed % this.W;
    const own = seed == null ? null : themeCrown(this, tr, tc, TH, L, short);
    if (own) drawCrown(leaves, own, L, 77 * 4096 + 1, -(tc + 0.5), -(tr + 0.5));
    if (seed != null && !own) leaves.remap = themeRemap(this, tr, tc);   // (a theme's tiles for this tree's leaves: Autumn's own color, say, kept as it falls)
    if (short && !own) addCrown(leaves, -0.5, CROWN_Y, -0.5, seed ?? 0, t.leaves, L);
    const cells: Vec3[] = [];
    if (!short && !own) for (let dy = tk - 1; dy <= tk + 1; dy++) for (let r = -1; r <= 1; r++) for (let c = -1; c <= 1; c++) {
      if (dy === tk + 1 && r && c) continue;
      if (dy === tk - 1 && !r && !c) continue;
      cells.push([r, c, dy]);
    }
    const has = new Set(cells.map((q) => q.join(",")));
    for (const [r, c, dy] of cells) for (const f of ["top", "bottom", "pz", "nz", "px", "nx"]) {
      const [a, bb, cc] = ({ top: [0, 0, 1], bottom: [0, 0, -1], pz: [1, 0, 0], nz: [-1, 0, 0], px: [0, 1, 0], nx: [0, -1, 0] } as Record<string, number[]>)[f];
      if (has.has(`${r + a},${c + bb},${dy + cc}`)) continue;
      face(leaves, f, c - 0.5, dy, r - 0.5, c + 0.5, dy + 1, r + 0.5, t.leaves, L);
    }
    const log = new Geo(null), s = 0.5;                                     // the log that flies to the hotbar
    for (const f of ["pz", "nz", "px", "nx"]) face(log, f, -s / 2, -s / 2, -s / 2, s / 2, s / 2, s / 2, t.log + "_side", 1);
    for (const f of ["top", "bottom"]) face(log, f, -s / 2, -s / 2, -s / 2, s / 2, s / 2, s / 2, t.log + "_top", 1);
    const g = (...parts: [Geo, THREE.Material][]) => { const grp = new THREE.Group(); for (const [geo, m] of parts) grp.add(geo.mesh(m)); return grp; };
    return { stump: g([stump, this.mats.opaque]), nick: g([nick, this.mats.opaque]), top: g([top, this.mats.opaque], [leaves, this.mats.cutout]),
      log: g([log, this.mats.opaque]), leafColors: leafBits(themeAt(tr, tc)?.bits?.leaves, tr, tc) };
  }
}
