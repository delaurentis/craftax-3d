// World methods (mixed into World, src/world/core.ts): the Vaults' portcullises and door relief, column heights, the usual ground, the path
// floor's kinds, the trees' leaf cells and the voxel occupancy.
import { VOX_NY, VOX_Y0 } from "../../js/shading";
import {
  B, CEIL, FLOOR_BRICK, FLOOR_DIRT, FLOOR_STONE, GRAVES, GROUND, ITEM, PLACED_H, RELIEF, SOLID, TALL, TREES, valueNoise, vaultIron,
} from "./blocks";
import { NB, box } from "./geo";
import type { Geo } from "./geo";
import type { LeafCell, World } from "./core";
import type { GameState } from "../core/types";

export class WorldTerrain {
  // the Vaults' rusted portcullises (Pete: now and then on the longer walls; 2, 3 or 4 blocks wide, never 1; no two within 3 blocks
  // of each other): along every straight run of wall blocks facing open floor the same way, a portcullis takes W blocks with wall
  // left at both ends, at hashed spots, none of it iron, kept 3 clear blocks from any other; and now and then a great vault door, 3
  // wide and 3 tall. Built once per floor (build): "r,c,dr,dc" wall face -> the door's column 0-2, or 10 × a portcullis's width + its column
  portcullises(this: World): Map<string, number> {
    const out = new Map<string, number>(), placed: [number, number][] = [], open = (r: number, c: number) => r >= 0 && c >= 0 && r < this.H && c < this.W && !TALL.has(this.at(r, c));
    for (const [, dr, dc] of NB) {
      const lines = dr ? this.H : this.W, len = dr ? this.W : this.H;
      for (let l = 0; l < lines; l++) {
        const at = (k: number): [number, number] => (dr ? [l, k] : [k, l]);
        for (let k = 0; k < len;) {
          const ok = (i: number) => { const [r, c] = at(i); return i < len && this.at(r, c) === B.WALL && open(r + dr, c + dc) && !vaultIron(r, c); };
          if (!ok(k)) { k++; continue; }
          let e = k; while (ok(e)) e++;                                    // the run k .. e - 1
          for (let p = k + 1; p < e - 2;) {                                 // (a wall block left at each end)
            const [r0, c0] = at(p), h = Math.imul(r0 * 73856093 ^ c0 * 19349663 ^ (dr + 2) * 83492791 ^ (dc + 5) * 2971215073, 2654435761) >>> 0;
            const door = (h >>> 20) % 9 === 0, w = door ? 3 : 2 + ((h >>> 4) % 3);   // now and then a great vault door instead, 3 × 3
            const tiles = Array.from({ length: w }, (_, i) => at(p + i));
            const clear = !placed.some(([pr, pc]) => tiles.some(([r, c]) => Math.max(Math.abs(r - pr), Math.abs(c - pc)) <= 3));
            if ((door || (h >>> 8) % 6 === 0) && p + w <= e - 1 && clear && tiles.every(([r, c]) => this.height(r, c) >= 3)) {   // (both reach the third block)
              // a door's tiles by column from the viewer's left: along the run for a face toward +z or -x, against it otherwise
              // (a portcullis: 10 × its width + its column)
              tiles.forEach(([r, c], i) => { const col = dr === 1 || dc === -1 ? i : w - 1 - i; out.set(`${r},${c},${dr},${dc}`, door ? col : 10 * w + col); placed.push([r, c]); });
              p += w + 4;
            } else p++;
          }
          k = e;
        }
      }
    }
    return out;
  }
  // a vault door's relief (Pete: depth that catches the light): its wheel, bolts and rim as tiny cubes standing out of the wall face,
  // laid from the picture's pixels (u from the viewer's left, v from its top) over the three blocks; (r, c): its middle column
  doorRelief(this: World, o: Geo, r: number, c: number, dr: number, dc: number, L: number): void {
    const P = 1 / 16;
    for (const [u, v, t, tex] of RELIEF) {
      const y1 = 3 - v * P, y0 = y1 - P;
      if (dr === 1) box(o, c - 1 + u * P, y0, r + 1, c - 1 + (u + 1) * P, y1, r + 1 + t, tex, L);
      else if (dr === -1) box(o, c + 2 - (u + 1) * P, y0, r - t, c + 2 - u * P, y1, r, tex, L);
      else if (dc === 1) box(o, c + 1, y0, r + 2 - (u + 1) * P, c + 1 + t, y1, r + 2 - u * P, tex, L);
      else box(o, c - t, y0, r - 1 + u * P, c, y1, r - 1 + (u + 1) * P, tex, L);
    }
  }

  // column heights: overworld stone rises into hills (distance from open ground, up to 3 blocks); underground everything tall meets the ceiling
  heights(this: World): Float32Array {
    const { H, W } = this, h = new Float32Array(H * W), d = new Int32Array(H * W).fill(1e6), q: number[] = [];
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const b = this.at(r, c), i = r * W + c;
      if (!TALL.has(b)) { h[i] = b in SOLID ? SOLID[b].h || 1 : b === B.STALAGMITE ? 2 : 0; d[i] = 0; q.push(i); }
    }
    for (let k = 0; k < q.length; k++) {
      const i = q[k], r = (i / W) | 0, c = i % W;
      for (const [, dr, dc] of NB) {
        const rr = r + dr, cc = c + dc, j = rr * W + cc;
        if (rr >= 0 && cc >= 0 && rr < H && cc < W && d[j] > d[i] + 1) { d[j] = d[i] + 1; q.push(j); }
      }
    }
    for (let i = 0; i < H * W; i++) if (TALL.has(this.map[i])) {
      h[i] = this.level ? CEIL : Math.min(3, Math.max(1, d[i]));
      if (!this.level && this.placed?.has(i)) h[i] = Math.max(h[i], PLACED_H);
    }
    return h;
  }

  ground(this: World): number {                                                 // the floor's usual ground, drawn under trees, plants and props
    const n: Record<number, number> = {};
    for (const b of this.map) if (b in GROUND) n[b] = (n[b] || 0) + 1;
    return +Object.keys(n).sort((a, b) => n[+b] - n[+a])[0] || B.PATH;
  }
  // the floor of the open path tiles (Pete), where the floor has no look of its own (the overworld, the Dungeon, the Vaults): stone
  // brick round a ladder and along brick walls (they always win), plain stone right by lava (its 8 neighbours), and further off more and more of it bare dirt,
  // in patches by the seed. 1 brick, 2 stone, 3 dirt per tile (0: not a path floor); stepping on dirt sounds of earth (main.ts)
  floorKinds(this: World, s: GameState | null | undefined): Uint8Array {
    const { H, W } = this, out = new Uint8Array(H * W);
    if (![0, 1, 4].includes(this.level) || !this.items) return out;     // (the overworld, the Dungeon, the Vaults: the others have their own floors)
    const ladders: [number, number][] = [];
    // how far to the nearest of some blocks, in steps (diagonals count as one), up to `max`
    const dist = (is: (b: number, i: number) => boolean, max: number) => {
      const d = new Float32Array(H * W).fill(99), q: number[] = [];
      for (let i = 0; i < H * W; i++) if (is(this.map[i], i)) { d[i] = 0; q.push(i); }
      for (let h = 0; h < q.length; h++) {
        const i = q[h], r = (i / W) | 0, c = i % W;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr, cc = c + dc, j = rr * W + cc;
          if ((dr || dc) && rr >= 0 && cc >= 0 && rr < H && cc < W && d[j] > d[i] + 1) { d[j] = d[i] + 1; if (d[j] < max) q.push(j); }
        }
      }
      return d;
    };
    for (let i = 0; i < H * W; i++) { const it = this.items[i]; if (it === ITEM.LADDER_DOWN || it === ITEM.LADDER_UP || it === ITEM.LADDER_DOWN_BLOCKED) ladders.push([(i / W) | 0, i % W]); }
    const lavaD = dist((b) => b === B.LAVA, 8);
    // brick walls the world was born with only: no placed stone, yours or a bot's, changes any floor (Pete: the ground can't change
    // because a brick was placed or taken away)
    const wallD = dist((b) => b === B.WALL || b === B.WALL_MOSS, 3);
    const seed = Math.imul((s?.seed ?? 0) ^ this.level * 0x9e3779b1 ^ 0x51f15e, 2654435761) >>> 0;
    // and a floor once seen keeps its look for this world and level: a tile freed by mining gets one, none is redrawn after
    const mk = seed + ":" + this.placedId;
    if (this.floorMemo?.key !== mk || this.floorMemo.memo.length !== H * W) this.floorMemo = { key: mk, memo: new Uint8Array(H * W) };
    const memo = this.floorMemo.memo;
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const i = r * W + c;
      if (this.map[i] !== B.PATH) continue;
      if (memo[i]) { out[i] = memo[i]; continue; }
      // the signs that someone was here, a ladder or a brick wall, win: brick floor round a ladder and along a brick wall, 2 deep
      if (wallD[i] <= 2 || ladders.some(([lr, lc]) => Math.hypot(lr - r, lc - c) <= 3.5)) out[i] = FLOOR_BRICK;
      else if (lavaD[i] <= 1 || this.piece?.paved?.(r, c)) out[i] = FLOOR_STONE;   // (a set piece's square: stone paving)
      else out[i] = valueNoise(r, c, 4, seed) < Math.min(0.85, 0.1 + 0.12 * (lavaD[i] - 1)) ? FLOOR_DIRT : FLOOR_STONE;
      memo[i] = out[i];
    }
    return out;
  }

  // leaf cells of every tree: a 3 × 3 ring around the trunk top, a 3 × 3 layer above, a plus on top
  leaves(this: World): Map<string, LeafCell> {
    const cells = new Map<string, LeafCell>();
    for (let r = 0; r < this.H; r++) for (let c = 0; c < this.W; c++) {
      const t = TREES[this.at(r, c)];
      if (!t) continue;
      const th = this.trunkH(r, c);
      for (let dy = th - 1; dy <= th + 1; dy++) for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (dy === th + 1 && dr && dc) continue;
        if (dy === th - 1 && !dr && !dc) continue;
        const rr = r + dr, cc = c + dc;
        if (this.height(rr, cc) > dy) continue;
        cells.set(`${rr},${cc},${dy}`, [rr, cc, dy, t.leaves, this.lightAt(rr, cc), r, c]);   // r, c: the tree it belongs to
      }
    }
    return cells;
  }

  // what each voxel blocks, for the shader's rays and the corner AO: blocks 1, leaves 0.55, small props less
  occupancy(this: World, leafCells: Map<string, LeafCell>): Float32Array {
    const { H, W } = this, occ = new Float32Array(W * H * VOX_NY), under = this.level > 0;
    const set = (r: number, c: number, y: number, v: number) => { const k = y - VOX_Y0; if (k >= 0 && k < VOX_NY) occ[(r * W + c) * VOX_NY + k] = Math.max(occ[(r * W + c) * VOX_NY + k], v); };
    for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
      const b = this.at(r, c), liquid = b === B.WATER || b === B.LAVA;
      set(r, c, -2, 1);
      if (!liquid) set(r, c, -1, 1);
      if (TALL.has(b) || b in SOLID) for (let y = 0; y < Math.ceil(this.height(r, c)); y++) set(r, c, y, 1);   // (heights() holds a solid block's own h)
      if (b in TREES) for (let y = 0, th = this.trunkH(r, c); y < th; y++) set(r, c, y, 0.9);
      if (b === B.STALAGMITE) { set(r, c, 0, 0.7); set(r, c, 1, 0.6); set(r, c, 2, 0.4); }
      if (GRAVES.has(b)) set(r, c, 0, 0.35);
      if (b === B.NECROMANCER || b === B.NECROMANCER_VULNERABLE) { set(r, c, 0, 0.5); set(r, c, 1, 0.5); }
      if (under && this.level !== 8) for (let y = CEIL; y < CEIL + 3; y++) set(r, c, y, 1);
    }
    for (const [rr, cc, dy] of leafCells.values()) if (rr >= 0 && cc >= 0 && rr < H && cc < W) set(rr, cc, dy, 0.55);
    const solid = this.piece?.solid;                                 // a set piece's blocks (src/scenes): they cast shadows too
    if (solid) for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) for (let y = 0; y < VOX_Y0 + VOX_NY; y++) if (solid(c, y, r)) set(r, c, y, 1);
    return occ;
  }
  occAt(this: World, occ: Float32Array, x: number, y: number, z: number): number {
    if (y < VOX_Y0) return 1;
    if (y >= VOX_Y0 + VOX_NY) return 0;
    if (x < 0 || z < 0 || x >= this.W || z >= this.H) return this.level ? 1 : y < -1 ? 1 : 0;
    return occ[(z * this.W + x) * VOX_NY + y - VOX_Y0];
  }
}
