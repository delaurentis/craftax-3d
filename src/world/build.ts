// World methods (mixed into World, src/world/core.ts): build, the world's meshes chunk by chunk, and the crafting table's tools.
import { FLOOR_DIRTS, FLOOR_STONES, LAVA_TILES, STONE_VARIANTS } from "../../js/textures";
import { VOX_NY, blockLightTexture, shared, voxelTexture } from "../../js/shading";
import {
  B, CEIL, CHUNK, CROSS, DIRT_DIP, FIRE_BARK, FLAT_TRUNK, FLOOR_DIRT, FLOOR_STONE, FOUNTAIN_RIM, FOUNTAIN_WATER, GRASS_TOPS, GRAVES,
  GRAVE_FLOOR, GRAVE_WALLS, GROUND, ITEM, LEAF_SWAY, LIQUID_TOP, ORE, SEWER_FLOOR, SEWER_WALLS, SEWER_WET, SOLID, SWAY, TALL, TREES, UP,
  VAULT_IRON, WALL_VARIANTS, grassField, grassHash, isSolid, valueNoise, vaultIron,
} from "./blocks";
import { CROWN_Y, Geo, NB, STUB_W, addCrown, face, geoState, pixBox, waterGrid } from "./geo";
import { crownPicked, shapeLow, shapeRun, themeCrown, themeDecorate, themeGrass, themeHeights, themeRemap } from "../themes/blocks";
import { makeDraw } from "../themes/draw";
import { crownsMorphing, drawCrown, drawMorph, stampCrown, standardCrown, standardTop } from "../themes/crowns";
import { onScreen, trunkBase, trunkInset } from "../themes/state";
import { sceneSky } from "../themes/sky";
import { placementFor } from "../scenes/active";
import type { Remap } from "./geo";
import type { CrownBox, Theme } from "../themes/types";
import type { Tex } from "./blocks";
import type { Chunk, LeafCell, MakeProp, World } from "./core";
import type { GameState } from "../core/types";
import * as THREE from "three";

/** Sets the laser-art piece id of every Geo being built. */
type SetIds = (v: number) => void;
/** A voxel or block-light texture's pixels (voxelTexture, blockLightTexture: bytes). */
interface TexImage { width: number; height: number; depth?: number; data: Uint8Array }

export class WorldBuild {
  // the world's geometry, in 16 × 16 chunks: `dirty` (chunk numbers) rebuilds only those (a block mined or placed, a tree felled: the
  // update below names the chunks near it), else all of it and the ocean beyond (Pete: the whole map at once took 50-120 ms on a
  // laptop, several times that on a phone, and froze taps while the bot played)
  build(this: World, makeProp: MakeProp, s: GameState | null | undefined, dirty: Set<number> | null = null): void {
    geoState.realm = this.level === 6 ? "fire_" : this.level === 7 ? "ice_" : this.level === 5 ? "troll_" : "";   // (the Troll Mines: darker, mossy rock, Pete)
    const { H, W } = this, NC = Math.ceil(W / CHUNK), NR = Math.ceil(H / CHUNK);
    if (!dirty || !this.chunks) {
      for (const m of this.group.children.filter((m): m is THREE.Mesh => (m as THREE.Mesh).isMesh)) { m.geometry.dispose(); this.group.remove(m); }
      this.props.clear(); this.chunks = new Map(); dirty = null;
    }
    this.stdH = this.heights();
    this.h = themeHeights(this, this.stdH);                         // (a theme's shapes, eased in by a wave: src/themes/blocks.ts)
    // a scene's set piece in this floor, found from the map (src/scenes/active.ts): drawn over it, its fog
    const piece = this.piece = placementFor({ level: this.level, seed: s?.seed ?? 0, size: [H, W], map: this.map, items: this.items }, `${this.key}|${s?.seed}`);
    sceneSky.fog = piece?.fog ?? null;
    if (!dirty || !this.portc) this.portc = this.level === 4 ? this.portcullises() : null;   // (after the heights: they need them)
    // this world's flower colours: three of the 16 (textures.ts flower_colors), picked by its seed (Pete)
    this.flowerSeed = Math.imul((s?.seed ?? 0) ^ 0x2f6b9d, 2654435761) >>> 0;
    // how flowery this world is (Pete), 0 to 2, by its seed: about one world in five has next to none, the odd one plenty
    // (Pete, later: flowers in about half the worlds): half have none at all, the rest 0.6 to 2
    { const q = (Math.imul(this.flowerSeed ^ 0x7f4a7c15, 0x9e3779b1) >>> 8) / 16777216; this.flowery = q < 0.5 || onScreen.to?.flowers === false ? 0 : 0.6 + 2.8 * (q - 0.5); }   // (a theme's flowers: false, none)
    { let q = this.flowerSeed; const pick: number[] = []; while (pick.length < 3) { q = Math.imul(q ^ (q >>> 15), 2246822519) >>> 0; if (!pick.includes(q % 16)) pick.push(q % 16); } this.flowerCols = pick; }
    this.floors = this.floorKinds(s);
    const base = this.ground(), under = this.level > 0, ceilTex = this.level === 6 ? "obsidian" : this.level === 7 ? "ice" : "stone";
    this.base = base;
    const leafCells = this.leaves();
    const occ = this.occupancy(leafCells), occAt = (x: number, y: number, z: number) => (piece?.solid?.(Math.floor(x), Math.floor(y), Math.floor(z)) ? 1 : this.occAt(occ, Math.floor(x), Math.floor(y), Math.floor(z)));
    // the voxel and block-light textures: refilled in place when the size is the same (a new texture each build cost a slow frame)
    const keep = <T extends THREE.DataTexture | THREE.Data3DTexture>(u: { value: T | null }, t: T) => {
      const o = u.value, oi = o?.image as TexImage, ti = t.image as TexImage;
      if (o && oi.width === ti.width && oi.height === ti.height && (oi.depth || 1) === (ti.depth || 1)) { oi.data.set(ti.data); o.needsUpdate = true; }
      else { o?.dispose(); u.value = t; }
    };
    keep(shared.uVox, voxelTexture(occ, W, H)); shared.uVoxSize.value.set(W, VOX_NY, H);
    this.lightSources();
    keep(shared.uBlock, blockLightTexture(this.blockLight(0), W, H, this.lightGreen)); shared.uMapSize.value.set(W, H);
    let fountainsMoved = !dirty;
    for (const k of dirty ? [...dirty] : Array.from({ length: NR * NC }, (_, i) => i)) {
      const old = this.chunks.get(k);
      // a chunk built again for a change in it (a tree chopped, a block placed): its grass and flowers stay as they are (Pete: nothing
      // regrown, no new grass where the tree stood), only a whole build makes them anew
      const keepGrass = !!(dirty && old && this.grass3d && !this.fullNext && !this.regrow);
      // its trees' crowns kept too (Pete: a felled palm's chunk, 18 palms drawn again, froze the game ~60-240 ms) when every crown in it
      // is a theme's own (drawn tree by tree: a standard crown hides its faces against its neighbour's, so one gone would leave holes),
      // the themes on screen are the same and no tree has come: the felled tree's faces are taken out (keepTrees), the rest stand
      const R0 = Math.floor(k / NC) * CHUNK, C0 = (k % NC) * CHUNK, R1 = Math.min(H, R0 + CHUNK), C1 = Math.min(W, C0 + CHUNK);
      const crownKey = `${this.level}|${onScreen.from?.id ?? ""}|${onScreen.to?.id ?? ""}|${geoState.themed}`, treesNow: number[] = [];
      for (let r = R0; r < R1; r++) for (let c = C0; c < C1; c++) if (TREES[this.at(r, c)]) treesNow.push(r * W + c);
      const keepCrowns = !!(dirty && old && !this.fullNext && old.ownCrowns === crownKey && !crownsMorphing() && treesNow.every((i) => old.crownTrees!.has(i)));
      if (old) {
        for (const m of old.meshes) {
          if (keepGrass && (old.tufts.includes(m) || old.blooms.includes(m))) continue;
          if (keepCrowns && (old.crowns.includes(m) || old.tops.includes(m))) continue;
          m.geometry.dispose(); this.group.remove(m);
        }
        for (const p of old.props) this.props.remove(p);
        if (old.fountains.length) fountainsMoved = true;
      }
      const rec: Chunk = { meshes: [], props: [], fountains: [], crowns: [], tops: [], trunks: [], stubs: [], tufts: keepGrass ? old!.tufts : [], blooms: keepGrass ? old!.blooms : [] };
      if (keepGrass) rec.meshes.push(...old!.tufts, ...old!.blooms);
      this.chunks.set(k, rec);
      const o = new Geo(occAt), cut = new Geo(null), wat = new Geo(null), fwat = new Geo(null), glow = new Geo(null), trunks = new Geo(occAt), stubs = new Geo(occAt), tufts = new Geo(null), blooms = new Geo(null);   // tufts: the grass (a setting), blooms: flowers (laser: both hidden, main.ts)
      tufts.grow = blooms.grow = 3;                                        // (shading.ts: grass sinks away far from you; a flower's petals 4+, below)
      trunks.noRows = stubs.noRows = true;                   // outline art: a trunk is one piece with vertical bark lines, no block rows
      trunks.grow = 1; stubs.grow = 2;                       // the full-size trees shrink into the overhead ones (uShrink), which shrink in after them
      // outline art: lines where these ids change: one per ground or liquid type (a field stays dark), one per tile for blocks and items
      const ids: SetIds = (v) => { for (const G of [o, cut, wat, fwat, glow, trunks, stubs, tufts, blooms]) G.id = v; };
      const remap = (m: Remap | null) => { for (const G of [o, cut, wat, fwat, glow, trunks, stubs, tufts, blooms]) G.remap = m; };   // (a theme's tiles)
      for (let r = R0; r < R1; r++) for (let c = C0; c < C1; c++) {
        if (piece?.covers?.(r, c)) continue;                     // (the set piece stands there instead)
        const b = this.at(r, c), L = this.lightAt(r, c), x0 = c, x1 = c + 1, z0 = r, z1 = r + 1, hh = this.height(r, c);
        remap(themeRemap(this, r, c));
        o.tree = shapeRun.ends ? [c + 0.5, r + 0.5] : null;      // (stones moving: each face knows its own tile, so a whole face moves as one)
        const g = b in GROUND ? b : base;
        ids((g + 1) * 4096);
        // ground slab under everything that is not a liquid or a full-height column
        if (b !== B.WATER && b !== B.LAVA && !(TALL.has(b))) {
          let gt: { top: string; side: string; bottom: string } = GROUND[g];
          if (this.level === 8 && g === B.PATH) { const d = GRAVE_FLOOR[(Math.imul(r * 2654435761 ^ c * 40503, 2246822519) >>> 8) % GRAVE_FLOOR.length]; gt = { top: d, side: "grave_dirt", bottom: "grave_dirt" }; }
          // the Gnomish and Troll Mines (Pete): the floor bare rock, not the dungeon's paving: a stone variant per tile (the Troll Mines'
          // own mossy rock, now and then one mostly moss)
          if (this.level === 3 && g === B.PATH) gt = { top: SEWER_FLOOR[(Math.imul(r * 2654435761 ^ c * 40503 ^ 77, 2246822519) >>> 8) % SEWER_FLOOR.length], side: "stone", bottom: "stone" };   // the Sewers: wet paving
          if ((this.level === 2 || this.level === 5) && g === B.PATH) {
            const h = Math.imul(r * 83492791 ^ c * 19349663 ^ this.level * 2971215073, 2654435761) >>> 0;
            gt = { top: this.level === 5 && h % 7 === 0 ? (h & 1024 ? "troll_mossy" : "troll_mossy2") : STONE_VARIANTS[(h >>> 8) % STONE_VARIANTS.length], side: "stone", bottom: "stone" };
          }
          if (g === B.GRASS) gt = { ...gt, top: GRASS_TOPS[(grassHash(r, c) >>> 8) % GRASS_TOPS.length] };
          if (this.level === 6 && g === B.PATH) gt = { ...gt, top: "fire_path" };   // the Fire Realm: reddish bricks (Pete)
          { const fk = this.floors?.[r * W + c]; if (g === B.PATH && fk === FLOOR_STONE) gt = { top: FLOOR_STONES[(Math.imul(r * 2654435761 ^ c * 40503 ^ 0x2545f491, 2246822519) >>> 8) % FLOOR_STONES.length], side: "stone", bottom: "stone" }; else if (g === B.PATH && fk === FLOOR_DIRT) { const t = FLOOR_DIRTS[(Math.imul(r * 2654435761 ^ c * 40503 ^ 0x6c8e9cf5, 2246822519) >>> 8) % FLOOR_DIRTS.length]; gt = { top: t, side: t, bottom: t }; } }
          const itm = this.items[r * W + c], pit = itm === ITEM.LADDER_DOWN || itm === ITEM.LADDER_DOWN_BLOCKED;
          // bare dirt lies a pixel lower than the stone and grass round it (Pete: so their edges show), with the step down drawn
          const dip = g === B.PATH && this.floors?.[r * W + c] === FLOOR_DIRT ? DIRT_DIP : 0;
          if (dip) for (const [f, dr, dc] of NB) {
            const nb = this.at(r + dr, c + dc);
            if (nb === B.WATER || nb === B.LAVA || nb === B.OOB || (nb === B.PATH && this.floors[(r + dr) * W + c + dc] === FLOOR_DIRT)) continue;
            const side = nb === B.GRASS ? "grass_side" : "stone", sub = [0, 1 - dip, 1, dip];   // (the neighbour's top edge: grass shows its green)
            const opp = ({ pz: "nz", nz: "pz", px: "nx", nx: "px" } as Record<string, string>)[f];                       // facing in, toward the dirt
            const X0 = f === "px" ? x1 : x0, X1 = f === "nx" ? x0 : x1, Z0 = f === "pz" ? z1 : z0, Z1 = f === "nz" ? z0 : z1;
            // right on the tile's edge (Pete: set a hair inside it, a dotted line of the sky showed through the slit along the top)
            face(o, opp, X0, -dip, Z0, X1, 0.002, Z1, side, this.lightAt(r + dr, c + dc), null, sub);
          }
          if (!pit) face(o, "top", x0, -1, z0, x1, -dip, z1, gt.top, L);
          else for (const [a0, b0, a1, b1] of [[0, 0, 1, 0.1], [0, 0.9, 1, 1], [0, 0.1, 0.1, 0.9], [0.9, 0.1, 1, 0.9]])   // a rim round the pit
            face(o, "top", x0 + a0, -1, z0 + b0, x0 + a1, 0, z0 + b1, gt.top, L);
          for (const [f, dr, dc] of NB) {
            const nb = this.at(r + dr, c + dc);
            if (nb === B.WATER || nb === B.LAVA || (r + dr < 0 || c + dc < 0 || r + dr >= H || c + dc >= W)) face(o, f, x0, -1, z0, x1, 0, z1, gt.side, this.lightAt(r + dr, c + dc));
          }
        }
        ids(b in GROUND || b in CROSS || b === B.WATER || b === B.LAVA ? (b + 1) * 4096 : (b + 1) * 4096 + 1 + r * W + c);
        if (b === B.WATER || b === B.LAVA) {
          const bed = this.level === 0 ? "sand" : "stone";
          face(o, "top", x0, -2, z0, x1, -1, z1, bed, L * 0.8);
          if (b === B.WATER) waterGrid(wat, x0, z0, x1, z1, 0.25, L);
          else face(glow, "top", x0, -1, z0, x1, LIQUID_TOP, z1, LAVA_TILES[(Math.imul(r * 73856093 ^ c * 19349663, 2654435761) >>> 8) % 4], 1);   // each its own stage of the bubbling (textures.ts LAVA_TILES)
        }
        if (b in SOLID) {
          const t = SOLID[b], ins = t.inset || 0, y1 = hh;          // (heights: a column's, or the block's own h; a theme may change it)
          const X0 = x0 + ins, X1 = x1 - ins, Z0 = z0 + ins, Z1 = z1 - ins;
          const frontFace = t.front && (NB.find(([, dr, dc]) => !isSolid(this.at(r + dr, c + dc))) || NB[0])[0];
          const mine = b === B.STONE && !under && this.placed?.has(r * W + c);   // a stone you placed: one big stone, no rows or cracks in laser
          let T: { top: string; side: Tex } = mine ? { top: "placed_stone", side: "placed_stone" } : t;
          if (b === B.STONE && !mine) {                        // rock: a stone variant per block (same colour, its own laser line art)
            const pick = (ya: number) => {
              const h = Math.imul(r * 19349663 ^ c * 83492791 ^ this.level * 73856093 ^ (Math.floor(ya) + 11) * 2971215073, 2654435761) >>> 0;
              if (this.level === 5 && h % 9 === 0) return h & 512 ? "troll_mossy" : "troll_mossy2";   // the Troll Mines: now and then mostly moss (Pete)
              return STONE_VARIANTS[(h >>> 8) % STONE_VARIANTS.length];
            };
            T = { top: pick(9), side: pick };
          }
          if (ORE.has(b) && y1 > 1) {                          // ore in a tall column: mining it gives one, so only one block of the column
            // shows the ore, the top, middle or bottom one (fixed per tile); the rest is plain rock (Pete)
            const rows = Math.ceil(y1 - 1e-6), pickRow = (Math.imul(r * 2654435761 ^ c * 40503 ^ this.level * 97, 2246822519) >>> 8) % 3;
            const oreAt = [rows - 1, Math.floor((rows - 1) / 2), 0][pickRow];   // that block, counted up from the floor
            const rock = (ya: number) => STONE_VARIANTS[(Math.imul(r * 19349663 ^ c * 83492791 ^ this.level * 73856093 ^ (Math.floor(ya) + 11) * 2971215073, 2654435761) >>> 8) % STONE_VARIANTS.length];
            T = { top: oreAt === rows - 1 ? t.top : rock(9), side: (ya: number) => (Math.floor(ya + 1e-6) === oreAt ? t.side : rock(ya)) };
          }
          if (b === B.WALL || (this.level === 8 && b === B.WALL_MOSS)) {   // dungeon walls vary block by block up the wall: a fixed pick per block, about a quarter plain
            const list = this.level === 8 ? GRAVE_WALLS : this.level === 3 ? SEWER_WALLS : WALL_VARIANTS;   // (the Graveyard: its own near-black bricks, Pete)
            const iron = this.level === 4 && vaultIron(r, c);
            const pick = (ya: number) => {
              const hv = Math.imul(r * 73856093 ^ c * 19349663 ^ this.level * 83492791 ^ (Math.floor(ya) + 7) * 2971215073, 2654435761) >>> 0;
              if (iron) return VAULT_IRON[(hv >>> 8) % 3];
              const t = list[(hv >>> 8) % list.length], row = Math.floor(ya + 1e-6);
              // the Sewers: the bottom two blocks of a wall wet, wettest at its foot (textures.ts soak)
              return this.level === 3 && row <= 1 && SEWER_WET.has(t) ? t + (row <= 0 ? "_wet0" : "_wet1") : t;
            };
            T = { top: pick(9), side: pick };
          }
          o.noRows = mine;
          // a column that meets the ceiling underground still gets its top: from inside the cave it faces away (culled, unseen), but
          // from above (overhead and 3/4, ceiling hidden) the rock reads as solid mass instead of thin wall faces over a black void
          if (b === B.FOUNTAIN) {                              // a basin: a stone rim, its inner walls, and real water inside
            const m = FOUNTAIN_RIM, a0 = X0 + m, a1 = X1 - m, b0 = Z0 + m, b1 = Z1 - m, yb = FOUNTAIN_WATER - 0.2;
            for (const [p0, q0, p1, q1] of [[X0, Z0, X1, b0], [X0, b1, X1, Z1], [X0, b0, a0, b1], [a1, b0, X1, b1]]) face(o, "top", p0, 0, q0, p1, y1, q1, "smooth_stone", L);
            face(o, "pz", a0, yb, b0 - m, a1, y1, b0, "smooth_stone", L * 0.8); face(o, "nz", a0, yb, b1, a1, y1, b1 + m, "smooth_stone", L * 0.8);
            face(o, "px", a0 - m, yb, b0, a0, y1, b1, "smooth_stone", L * 0.8); face(o, "nx", a1, yb, b0, a1 + m, y1, b1, "smooth_stone", L * 0.8);
            waterGrid(fwat, a0, b0, a1, b1, (a1 - a0) / 3, L, FOUNTAIN_WATER);
            rec.fountains.push({ x: (X0 + X1) / 2, z: (Z0 + Z1) / 2, half: (a1 - a0) / 2, r, c });
          } else face(o, "top", X0, 0, Z0, X1, y1, Z1, T.top, under && y1 >= CEIL ? L * 0.7 : L);
          for (const [f, dr, dc] of NB) {
            const inMap = r + dr >= 0 && c + dc >= 0 && r + dr < H && c + dc < W;
            const nh = TALL.has(this.at(r + dr, c + dc)) ? (inMap ? shapeLow((r + dr) * W + c + dc, this.height(r + dr, c + dc)) : this.height(r + dr, c + dc)) : 0;   // (stones moving: as tall the whole way)
            if (nh >= y1 && !ins && r + dr >= 0 && c + dc >= 0 && r + dr < H && c + dc < W) continue;        // hidden behind a neighbour
            const nb = this.at(r + dr, c + dc), wet = nb === B.WATER || nb === B.LAVA || nb === B.OOB;
            let side: Tex = f === frontFace ? t.front! : T.side;
            const gate = this.level === 4 && b === B.WALL && !nh && !wet && y1 >= 2 ? this.portc?.get(`${r},${c},${dr},${dc}`) : undefined;
            if (gate !== undefined) {                          // the Vaults: a portcullis, or a vault door's column, in the wall
              const rest = side, of = (ya: number) => (typeof rest === "function" ? rest(ya) : rest);
              const name = gate >= 20 ? `pcul_${Math.floor(gate / 10)}_${gate % 10}` : `vdoor_${gate}`;
              side = (ya: number) => { const row = Math.floor(ya + 1e-6); return row >= 0 && row <= 2 ? name + row : of(ya); };
              if (gate === 1) this.doorRelief(o, r, c, dr, dc, this.lightAt(r + dr, c + dc));   // (once, from the middle column)
            }
            face(o, f, X0, ins ? 0 : wet ? -1 : nh, Z0, X1, y1, Z1, side, this.lightAt(r + dr, c + dc));
          }
          o.noRows = false;
          if (b === B.TABLE) this.tableTools(o, x0, z0, L, ids, r * W + c);
        }
        if (b in TREES) {                                      // trunks in their own meshes: full height, and 2 blocks for the 2D view
          const t = TREES[b], w = trunkInset(b === B.TREE);
          trunks.tree = stubs.tree = [c + 0.5, r + 0.5]; trunks.farId = stubs.farId = 79 * 4096 + 1 + r * W + c;   // far: one piece, apart from its crown
          // a fire tree's bark: one of three flame-channelled versions a block up its trunk, so no two blocks repeat (Pete)
          const side = (fi: number): Tex => (b === B.FIRE_TREE ? (ya: number) => FIRE_BARK[(Math.imul(r * 73856093 ^ c * 19349663 ^ (Math.floor(ya) + 3) * 83492791 ^ fi * 2971215073, 2654435761) >>> 8) % 3] : t.log + "_side");
          const th = this.trunkH(r, c), foot = trunkBase(b === B.TREE, r, c), fh = foot ? Math.min(foot.h, th - 0.25) : 0;
          // a theme's wider foot (trunk.base): its own box up to fh, the trunk on it from there (its top ring a ledge)
          if (foot && fh > 0) ["top", "pz", "nz", "px", "nx"].forEach((f, fi) => face(trunks, f, x0 + foot.inset, 0, z0 + foot.inset, x1 - foot.inset, fh, z1 - foot.inset, f === "top" ? t.log + "_top" : side(fi), L));
          ["top", "pz", "nz", "px", "nx"].forEach((f, fi) => face(trunks, f, x0 + w, fh > 0 ? fh : 0, z0 + w, x1 - w, th, z1 - w, f === "top" ? t.log + "_top" : side(fi), L));
          // (a fire tree's crown has no flame tongues on top any more: Pete, they looked bad; its bark and leaves still glow)
          // the overhead views' stub: a theme's own height (trunk.stub) and foot too
          const sh = this.stubH(r, c), sfoot = trunkBase(b === B.TREE, r, c, true), sfh = sfoot ? Math.min(sfoot.h, sh - 0.25) : 0;
          if (sfoot && sfh > 0) for (const f of ["top", "pz", "nz", "px", "nx"]) face(stubs, f, x0 + sfoot.inset, 0, z0 + sfoot.inset, x1 - sfoot.inset, sfh, z1 - sfoot.inset, f === "top" ? t.log + "_top" : t.log + "_side", L);
          for (const f of ["top", "pz", "nz", "px", "nx"]) face(stubs, f, x0 + STUB_W, sfh > 0 ? sfh : 0, z0 + STUB_W, x1 - STUB_W, sh, z1 - STUB_W, f === "top" ? t.log + "_top" : t.log + "_side", L);
          trunks.tree = stubs.tree = trunks.farId = stubs.farId = null;
        }
        if (b === B.GRASS && !this.items[r * W + c] && themeGrass(this, r, c)) {
          const h = Math.imul(grassHash(r, c) ^ this.flowerSeed, 0x27d4eb2d) >>> 0, P = 1 / 16;   // (where: this world's own, by its seed, Pete)
          // how grassy it is here (Pete): a smooth field over the map by the seed, 0 over about half of it (a tuft now and then), rising
          // through sparse and thicker grass to meadows in the middle of the grassy areas, the tiles there covered in tall grass
          // and how tall (Pete), a field of its own by the seed: short grass over a good part of the map, and now and then (rare) a
          // stand of tall grass halfway up you, thick as a meadow; tl: 0 short .. 1 as before, up to 2 in the tall stands
          const hf = valueNoise(r, c, 9, this.flowerSeed ^ 0x1b873593), tall = Math.max(0, Math.min(1, (hf - 0.88) / 0.05));
          const tl = tall > 0 ? 1 + tall : hf < 0.42 ? 0 : Math.min(1, (hf - 0.42) / 0.15);
          const d = Math.max(grassField(r, c, this.flowerSeed), 0.85 * tall), u = (h >>> 8) % 1000 / 1000;
          const lush = d > 0.75 && u < 0.85;
          // tufts on the tile: none where the field is thin (Pete: a few lone shoots on a tile looked sad), so grass starts as a real
          // edge of a grassy area, most tiles there with a tuft or more
          const n = lush ? 5 + ((h >>> 5) & 3) : d < 0.15 ? 0 : u < 0.35 + 0.6 * d ? 2 + +(d > 0.35) + ((h >>> 5) & 1) : 0;   // (two tufts at least)
          tufts.tree = [c + 0.5, r + 0.5];                     // (the tile it grows on: trodden grass lies down, shading.ts)
          // shoots: a tuft or two of blades, half a pixel thick, swaying a little; in a meadow, 5 to 8 of them, taller, the tile over
          // (only with 3D grass on, Pete: off, none are built at all)
          if (this.grass3d && !keepGrass) for (let k = 0; k < n; k++) {
            let q = Math.imul(h ^ (k + 1) * 0x9e3779b1, 2246822519) >>> 0;
            const rn = (m: number) => { q = Math.imul(q ^ (q >>> 15), 2246822519) >>> 0; return q % m; };
            const cx = lush ? 1 + rn(14) : 3 + rn(10), cz = lush ? 1 + rn(14) : 3 + rn(10), used = new Set<number>();
            for (let m = tl > 1 ? 7 + rn(5) : lush ? 4 + rn(4) : 3 + rn(4); m > 0; m--) {   // (a tall stand: thicker tufts)
              const bx = Math.max(0, Math.min(15, cx + rn(4) - 1)), bz = Math.max(0, Math.min(15, cz + rn(4) - 1)), col = rn(16);
              // mostly short, now and then a tall one (Pete: all one height read stiff): the height skewed low
              const top = tl > 1 ? 7 + Math.round(7 * (tl - 1)) : Math.round((1 + 0.5 * tl) * (lush ? 4 : 2 + d)), f = rn(1000) / 1000;
              const bh = Math.min(15, 2 + Math.floor((tl > 1 ? Math.sqrt(f) : f * f) * (top - 1)));   // (a tall stand: mostly tall)
              if (used.has(bx * 16 + bz)) continue;
              used.add(bx * 16 + bz);
              const bx0 = x0 + (bx + 0.5) * P, bz0 = z0 + (bz + 0.5) * P, wt = 0.6 + 0.09 * bh;   // its tip sways a pixel or so (Pete: stiff; tall, sea grass)
              // a blade in stepped mini blocks, as the pixel art goes (Pete): a whole pixel at its foot, half a pixel higher up, each step
              // set a little further out from the tuft's middle; each step sways as high as it is
              const ox = bx - cx + 0.5 + (rn(3) - 1) * 0.5, oz = bz - cz + 0.5 + (rn(3) - 1) * 0.5, on = Math.hypot(ox, oz) || 1, lean = (0.4 + 0.22 * bh) * P;
              const steps = Math.min(4, Math.ceil(bh / 2));                // (a step per 2 pixels: a short blade one or two)
              // (Pete: the steps floated apart): each sits on the one below, never shifted past that one's top, so the blade is one piece
              for (let sI = 0, y0 = 0, pcx = bx0, pcz = bz0, ph = P / 2; sI < steps; sI++) {
                // (Pete: points and odd angles aren't pixel art): two widths only, a whole pixel below and half above, and each step's
                // shift snapped to a quarter pixel, so the blade climbs in square steps
                const y1 = Math.round(bh * (sI + 1) / steps), half = (sI < steps / 2 || steps === 1 ? 1 : 0.5) * P / 2, km = (y0 + y1) / 2 / bh;
                const room = Math.max(0, ph - half) + 0.25 * P, q4 = P / 4;
                let dx = bx0 + ox / on * lean * km * km - pcx, dz = bz0 + oz / on * lean * km * km - pcz;
                const dl = Math.hypot(dx, dz); if (dl > room) { dx *= room / dl; dz *= room / dl; }
                dx = Math.round(dx / q4) * q4; dz = Math.round(dz / q4) * q4;
                const cxs = pcx + dx, czs = pcz + dz; pcx = cxs; pcz = czs; ph = half;
                const sub = [col * P, y0 * P, P, (y1 - y0) * P], wb = wt * y0 / bh, wu = wt * y1 / bh;
                for (const f of ["pz", "nz", "px", "nx"]) face(tufts, f, cxs - half, y0 * P, czs - half, cxs + half, y1 * P, czs + half, "grass_blade", L, [wb, wb, wu, wu], sub);
                face(tufts, "top", cxs - half, y0 * P, czs - half, cxs + half, y1 * P, czs + half, "grass_blade", L, [wu, wu, wu, wu], sub);
                y0 = y1;
              }
            }
          }
          // flowers, now and then (Pete: on stems, in 3D; their colours per world): a stem, and on it a head of pixel cubes, a plus or a
          // ring of petals round a centre, in one of this world's three petal colours (textures.ts flower_colors)
          blooms.tree = [c + 0.5, r + 0.5]; blooms.grow = 3;
          let fq = Math.imul(h ^ this.flowerSeed, 0x85ebca6b) >>> 0;
          const fr = (m: number) => { fq = Math.imul(fq ^ (fq >>> 13), 0xc2b2ae35) >>> 0; return fq % m; };
          // mostly in patches (Pete): a field of its own by the seed, its peaks a few tiles across, thick with flowers in the middle;
          // elsewhere a lone one now and then
          const pk = Math.max(0, Math.min(1, (valueNoise(r, c, 5, this.flowerSeed ^ 0x9b05688c) - (0.9 - 0.08 * this.flowery)) / 0.1));   // (a flowery world: more patches)
          // (Pete, later: where there's more grass, not on bare ground): they need grass round them, more the grassier, but not tall stands
          // (Pete, later still: mainly in the tall grass): a tall stand is where they grow most, a meadow a few, and elsewhere only
          // in their patches, now and then; a world without flowers has none anywhere
          const gr = Math.min(1, d / 0.4);
          const fp = !this.flowery ? 0 : tl > 1 ? 0.18 * (tl - 1) * this.flowery : lush ? 0.03 * this.flowery : gr * (0.004 * this.flowery + 0.25 * pk);
          let prevF: [number, number, number] | null = null;                                                    // (a second flower on the tile: not crowding the first, Pete)
          if (this.grass3d && !keepGrass && fr(1000) < fp * 1000) for (let k = 1 + +(fr(3) === 0); k > 0; k--) {
            let fx = 3 + fr(10), fz = 3 + fr(10), sh = tl > 1 ? 7 + fr(8) : 2 + fr(4) + fr(3) * fr(4);
            const col = this.flowerCols[fr(3)], ring = fr(3) === 0, sw = 0.45;
            if (prevF) {
              // beside the first: its heads 4 pixels or more apart, or else their heights 4 or more apart (one standing over the other)
              if (Math.max(Math.abs(fx - prevF[0]), Math.abs(fz - prevF[1])) < 4) { fx = prevF[0] < 8 ? Math.min(12, prevF[0] + 5) : Math.max(3, prevF[0] - 5); }
              if (Math.abs(sh - prevF[2]) < 4 && Math.hypot(fx - prevF[0], fz - prevF[1]) < 6) sh = prevF[2] >= 7 ? prevF[2] - 4 : prevF[2] + 4;
            }
            prevF = [fx, fz, sh];
            const X = x0 + fx * P, Z = z0 + fz * P, Y = sh * P;   // (in tall grass, up through it; Pete: all one height: from a low one in the grass to a tall one now and then)
            pixBox(blooms, X, 0, Z, P, Y, P, "grass_blade", [fr(16) * P, 0, P, Y], L, sw);
            const petal = [col * P, 15 * P, P, P], centre = [col * P, 4 * P, P, P];
            pixBox(blooms, X, Y, Z, P, P, P, "flower_colors", centre, L, sw, true);
            // its petals fold shut at night (Pete): when, 0..1, by the area it's in (neighbours close together) and a little its own
            blooms.tree = [X + P / 2, Z + P / 2];
            blooms.grow = 4 + Math.min(0.99, 0.75 * valueNoise(r, c, 6, this.flowerSeed ^ 0x3c6ef372) + 0.25 * fr(100) / 100);
            for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if ((dx || dz) && (ring || !(dx && dz)))
              pixBox(blooms, X + dx * P, Y, Z + dz * P, P, P, P, "flower_colors", petal, L, sw, true);
            blooms.tree = [c + 0.5, r + 0.5]; blooms.grow = 3;
          }
        }
        if (b in CROSS) {
          const t = CROSS[b], m = 0.15, y1 = b === B.ICE_SHRUB ? 0.8 : 0.9;
          cut.quad([[x0 + m, 0, z0 + m], [x1 - m, 0, z1 - m], [x1 - m, y1, z1 - m], [x0 + m, y1, z0 + m]], t, L, UP, null, SWAY);
          cut.quad([[x1 - m, 0, z0 + m], [x0 + m, 0, z1 - m], [x0 + m, y1, z1 - m], [x1 - m, y1, z0 + m]], t, L, UP, null, SWAY);
        }
        if (b === B.STALAGMITE) {
          for (const [y0, y1, w] of [[0, 0.8, 0.12], [0.8, 1.5, 0.24], [1.5, 2, 0.34]])
            for (const f of ["top", "pz", "nz", "px", "nx"]) face(o, f, x0 + w, y0, z0 + w, x1 - w, y1, z1 - w, "stone", L);
          // the stalactite above it: a closed shape, its top too (from the 3/4 view, ceiling hidden, it was an open box missing an edge)
          for (const [y0, y1, w] of [[2.4, 3, 0.2], [2.0, 2.4, 0.34]]) for (const f of ["top", "bottom", "pz", "nz", "px", "nx"]) face(o, f, x0 + w, y0, z0 + w, x1 - w, y1, z1 - w, "stone", L);
        }
        if (GRAVES.has(b) && !this.cleared?.has(r * W + c)) {
          const w = b === B.GRAVE2 ? 0.32 : 0.25, hgt = b === B.GRAVE3 ? 0.6 : 0.9;
          for (const f of ["top", "pz", "nz", "px", "nx"]) face(o, f, x0 + w, 0, z0 + 0.4, x1 - w, hgt, z1 - 0.4, f === "pz" ? "grave" : "smooth_stone", L);
          face(o, "top", x0 + 0.2, 0, z0 + 0.6, x1 - 0.2, 0.08, z1 - 0.05, "dirt", L);
        }
        themeDecorate(this, o, r, c, hh);                        // (a theme's extra geometry on this tile)
        // the Necromancer; once beaten (playing on, ?god), his tile is still his in the engine (it blocks you), so what's drawn there is
        // what he left, a low heap of bones, never him standing again (a rebuild, a theme switching, put his model back: Pete)
        if ((b === B.NECROMANCER || b === B.NECROMANCER_VULNERABLE) && s?.achievements?.includes(49)) {
          for (const [a0, b0, a1, b1, h] of [[0.2, 0.25, 0.75, 0.7, 0.14], [0.3, 0.35, 0.6, 0.6, 0.24], [0.55, 0.2, 0.85, 0.45, 0.1], [0.15, 0.6, 0.4, 0.85, 0.08]])
            for (const f of ["top", "pz", "nz", "px", "nx"]) face(o, f, x0 + a0, 0, z0 + b0, x0 + a1, h, z0 + b1, "smooth_stone", L);
        } else if (b === B.NECROMANCER || b === B.NECROMANCER_VULNERABLE) { const p = makeProp(b === B.NECROMANCER ? "necromancer" : "necromancer_vulnerable", r, c, L); this.props.add(p); rec.props.push(p); }
        // ceiling over every open tile underground
        ids(90 * 4096);
        if (under && this.level !== 8 && hh < CEIL) face(o, "bottom", x0, CEIL, z0, x1, CEIL + 1, z1, ceilTex, L * 0.7);

        const it = this.items[r * W + c];
        ids((60 + it) * 4096 + 1 + r * W + c);
        if (it === ITEM.TORCH) {
          const w = 0.44;
          for (const f of ["pz", "nz", "px", "nx"]) face(o, f, x0 + w, 0, z0 + w, x1 - w, 0.55, z1 - w, "log_side", L);
          for (const f of ["top", "pz", "nz", "px", "nx"]) face(glow, f, x0 + 0.42, 0.55, z0 + 0.42, x1 - 0.42, 0.7, z1 - 0.42, "lava", 1);
        } else if (it === ITEM.LADDER_DOWN || it === ITEM.LADDER_DOWN_BLOCKED) {
          // a real pit: stone walls going down into the dark, the ladder on its far wall, its top poking out over the rim
          const D = -1.6, m = 0.1, Ld = L * 0.55;
          face(o, "pz", x0 + m, D, z0, x1 - m, 0, z0 + m, "stone", Ld); face(o, "nz", x0 + m, D, z1 - m, x1 - m, 0, z1, "stone", Ld);
          face(o, "px", x0, D, z0 + m, x0 + m, 0, z1 - m, "stone", Ld); face(o, "nx", x1 - m, D, z0 + m, x1, 0, z1 - m, "stone", Ld);
          face(o, "top", x0 + m, D - 0.1, z0 + m, x1 - m, D, z1 - m, "hole", 0.3);
          const lz = z0 + m + 0.02;
          cut.quad([[x0 + 0.22, D, lz], [x1 - 0.22, D, lz], [x1 - 0.22, D + 1, lz], [x0 + 0.22, D + 1, lz]], "ladder", Ld, [0, 0, 1]);
          cut.quad([[x0 + 0.22, D + 1, lz], [x1 - 0.22, D + 1, lz], [x1 - 0.22, 0.35, lz], [x0 + 0.22, 0.35, lz]], "ladder", L, [0, 0, 1], null, null, false, [0, 0, 1, 0.95]);
          // sealed (Craftax: this floor's kills short, Pete): a grate over the pit, its purple glow over it (main.ts sealFx)
          if (it === ITEM.LADDER_DOWN_BLOCKED || (it === ITEM.LADDER_DOWN && this.sealed)) face(cut, "top", x0 + 0.1, 0, z0 + 0.1, x1 - 0.1, 0.02, z1 - 0.1, "bars", L);
        } else if (it === ITEM.LADDER_UP) {
          const top = under ? CEIL : 3;
          // a real wooden ladder, solid from every side (Pete: seen edge-on a flat one vanished): two square rails and thin round-ish rungs
          const bx = (a0: number, y0: number, b0: number, a1: number, y1: number, b1: number) => { for (const f of ["top", "bottom", "pz", "nz", "px", "nx"]) face(o, f, a0, y0, b0, a1, y1, b1, "planks", L); };
          const zA = z0 + 0.45, zB = z0 + 0.55;
          bx(x0 + 0.14, 0, zA, x0 + 0.24, top, zB); bx(x1 - 0.24, 0, zA, x1 - 0.14, top, zB);              // the rails
          for (let y = 0.2; y < top - 0.1; y += 0.2) bx(x0 + 0.24, y, z0 + 0.475, x1 - 0.24, y + 0.05, z0 + 0.525);   // five rungs a block
          if (under) face(o, "bottom", x0 + 0.1, CEIL - 0.004, z0 + 0.1, x1 - 0.1, CEIL, z1 - 0.1, "hole", 1);
        }
      }
      remap(null); o.tree = null;
      if (piece?.draw) { const id0 = o.id; piece.draw(makeDraw(o, R0, C0, R1, C1, 120)); o.id = id0; }   // the set piece's part in this chunk
      // canopies (this chunk's trees): the full 3 × 3 crowns, and for the overhead 2D view one leaf block per tree so a tree covers
      // just its own tile
      const crowns = new Geo(null), tops = new Geo(null);
      crowns.id = tops.id = 77 * 4096;                                       // a canopy is one piece
      // a theme's own crowns (Winter's firs): the trees whose theme draws one, by tile, and their leaf cells left out; while a switch
      // changes crowns, every tree's old crown morphing into its new one instead (src/themes/crowns.ts)
      const morph = crownsMorphing(), own = new Map<number, CrownBox[] | null>(), cellsOf = new Map<number, LeafCell[]>();
      const ownCrown = (tr: number, tc: number) => {
        const i = tr * W + tc;
        if (!own.has(i)) own.set(i, themeCrown(this, tr, tc, this.trunkH(tr, tc), this.lightAt(tr, tc)));
        return own.get(i)!;
      };
      const crownId = (tr: number, tc: number) => 77 * 4096 + 1 + (tr * W + tc) * 8;   // outline art: each tree's canopy as its tiers
      let allOwn = true;                                                     // (every crown here a theme's own: keepCrowns next time)
      for (const cell of keepCrowns ? [] : leafCells.values()) {
        const [rr, cc, dy, tex, L, tr, tc] = cell;
        if (tr < R0 || tr >= R1 || tc < C0 || tc >= C1) continue;
        if (morph) { const k = tr * W + tc; if (!cellsOf.has(k)) cellsOf.set(k, []); cellsOf.get(k)!.push(cell); continue; }
        if (ownCrown(tr, tc)) continue;
        crowns.id = crownId(tr, tc) + dy;
        crowns.tree = [tc + 0.5, tr + 0.5]; crowns.grow = 1.25; // shrinks toward its own trunk (.25: a crown)
        crowns.remap = themeRemap(this, tr, tc);                 // (a theme's tiles: its tree's, snow on the crown, say)
        for (const f of ["top", "bottom", "pz", "nz", "px", "nx"]) {
          const [dr, dc, ddy] = ({ top: [0, 0, 1], bottom: [0, 0, -1], pz: [1, 0, 0], nz: [-1, 0, 0], px: [0, 1, 0], nx: [0, -1, 0] } as Record<string, number[]>)[f];
          const n = leafCells.get(`${rr + dr},${cc + dc},${dy + ddy}`);
          if (n && !ownCrown(n[5], n[6])) continue;                     // (a neighbour's leaves: unless its theme drew its own crown)
          face(crowns, f, cc, dy, rr, cc + 1, dy + 1, rr + 1, tex, L, LEAF_SWAY);
        }
      }
      if (!keepCrowns) for (let r = R0; r < R1; r++) for (let c = C0; c < C1; c++) {
        const t = TREES[this.at(r, c)];
        if (!t) continue;
        const L = this.lightAt(r, c), th = this.trunkH(r, c), seed = r * W + c;
        tops.tree = crowns.tree = [c + 0.5, r + 0.5]; tops.remap = crowns.remap = themeRemap(this, r, c);
        if (morph) {                                                   // (.4: a crown morphing, src/render/shading/shaders.ts)
          const { from, to } = onScreen, full = (th0: Theme | null) => themeCrown(this, r, c, th, L, false, th0) ?? standardCrown(cellsOf.get(seed) ?? []);
          const top = (th0: Theme | null) => themeCrown(this, r, c, this.stubH(r, c), L, true, th0) ?? standardTop(r, c, seed, t.leaves);
          crowns.grow = 1.4; drawMorph(crowns, full(from), full(to), c + 0.5, r + 0.5, L, crownId(r, c));
          tops.grow = 2.4; drawMorph(tops, top(from), top(to), c + 0.5, r + 0.5, L, 77 * 4096 + 1 + seed * 8);
          continue;
        }
        const little = themeCrown(this, r, c, this.stubH(r, c), L, true);
        if (!little || !ownCrown(r, c)) allOwn = false;
        tops.grow = 2.25;
        const tp = little && crownPicked(this, r, c, this.stubH(r, c), L, true);   // (a prebuilt crown: copied, not drawn again)
        if (tp) stampCrown(tops, tp.tpl, tp.turn, c + 0.5, r + 0.5, L, 77 * 4096 + 1 + seed * 8);
        else if (little) drawCrown(tops, little, L, 77 * 4096 + 1 + seed * 8);
        else addCrown(tops, c, CROWN_Y, r, seed, t.leaves, L, LEAF_SWAY);
        const mine = ownCrown(r, c);
        const mp = mine && crownPicked(this, r, c, th, L, false);
        if (mine) { crowns.grow = 1.25; if (mp) stampCrown(crowns, mp.tpl, mp.turn, c + 0.5, r + 0.5, L, crownId(r, c)); else drawCrown(crowns, mine, L, crownId(r, c)); }
      }
      const add = (g: Geo, mat: THREE.Material, list?: THREE.Mesh[]) => {
        if (!g.i.length) return;
        const m = g.mesh(mat);
        if (mat === this.mats.water || mat === this.mats.fountain) m.renderOrder = 2;
        this.group.add(m); rec.meshes.push(m); if (list) list.push(m);
      };
      if (keepCrowns) {
        const stand = new Set(treesNow);
        for (const [from, to] of [[old!.crowns, rec.crowns], [old!.tops, rec.tops]] as const) for (const m of from) {
          const m2 = keepTrees(m, stand, W);
          if (m2 !== m) { m.geometry.dispose(); this.group.remove(m); }
          if (m2) { if (m2 !== m) this.group.add(m2); rec.meshes.push(m2); to.push(m2); }
        }
      } else { add(crowns, this.mats.cutout, rec.crowns); add(tops, this.mats.cutout, rec.tops); }
      if (!morph && (keepCrowns || allOwn)) { rec.ownCrowns = crownKey; rec.crownTrees = new Set(treesNow); }
      add(trunks, this.mats.opaque, rec.trunks); add(stubs, this.mats.opaque, rec.stubs); add(tufts, this.mats.cutout, rec.tufts); add(blooms, this.mats.cutout, rec.blooms);
      for (const [geo, mat] of [[o, this.mats.opaque], [cut, this.mats.cutout], [wat, this.mats.water], [fwat, this.mats.fountain], [glow, this.mats.glow]] as [Geo, THREE.Material][]) add(geo, mat);
      if (rec.fountains.length) fountainsMoved = true;
    }
    const all = [...this.chunks.values()];
    for (const k of ["crowns", "tops", "trunks", "stubs", "tufts", "blooms"] as const) this[k] = all.flatMap((c) => c[k] || []);
    if (fountainsMoved) this.fountains = all.flatMap((c) => c.fountains);   // (a new array: the fountains' effects are made again)
    this.setFlat(this.flat);
    if (dirty) return;
    if (piece?.beyond) { const g = new Geo(occAt); piece.beyond(makeDraw(g, 0, 0, H, W, 121)); if (g.i.length) this.group.add(g.mesh(this.mats.opaque)); }   // (a set piece past the edge)
    // beyond the map: ocean on the overworld, bedrock underground (with a full build only: it never changes)
    const wat = new Geo(null);
    wat.id = (B.WATER + 1) * 4096;
    if (!under) {                                            // unit cells near the map so the swell shows, big flat quads beyond
      const R = 200, M = 40;
      for (const [a, b2, c2, d2] of [[-M, -M, W + M, 0], [-M, H, W + M, H + M], [-M, 0, 0, H], [W, 0, W + M, H]]) waterGrid(wat, a, b2, c2, d2, 1, 1);
      for (const [a, b2, c2, d2] of [[-R, -R, W + R, -M], [-R, H + M, W + R, H + R], [-R, -M, -M, H + M], [W + M, -M, W + R, H + M]]) {
        wat.quad([[a, LIQUID_TOP, d2], [c2, LIQUID_TOP, d2], [c2, LIQUID_TOP, b2], [a, LIQUID_TOP, b2]], "water", 1, UP);
      }
    }
    if (wat.i.length) { const m = wat.mesh(this.mats.water); m.renderOrder = 2; this.group.add(m); }
  }

  // the crafting table's tools lying on its top: a hammer (handle and iron head) and a saw (blade and grip), each its own laser piece
  tableTools(this: World, geo: Geo, x0: number, z0: number, L: number, ids: SetIds, cell: number): void {
    const box = (a: number, y0: number, b: number, c: number, y1: number, d: number, tex: string) => { for (const f of ["top", "pz", "nz", "px", "nx"]) face(geo, f, x0 + a, y0, z0 + b, x0 + c, y1, z0 + d, tex, L); };
    ids(70 * 4096 + 1 + cell * 2);
    box(0.16, 1, 0.58, 0.62, 1.05, 0.65, "log_side");                        // hammer handle
    box(0.56, 1, 0.47, 0.7, 1.11, 0.76, "furnace_side");                     // hammer head
    ids(70 * 4096 + 2 + cell * 2);
    box(0.2, 1, 0.2, 0.7, 1.02, 0.36, "smooth_stone");                      // saw blade
    box(0.68, 1, 0.17, 0.86, 1.07, 0.39, "log_side");                        // saw grip
  }
}

// a chunk's crowns (or overhead tops) with only the faces of the trees still standing (`stand`: their tiles, r * W + c, from each
// face's aTree, the tile's middle): the same mesh when none went, null when none are left. Every face is a quad: 4 vertices, 6
// indices, in order (Geo.quad); kept faces are copied a run at a time
function keepTrees(m: THREE.Mesh, stand: Set<number>, W: number): THREE.Mesh | null {
  const g = m.geometry, tree = g.getAttribute("aTree").array as Float32Array, idx = g.index!.array, nq = tree.length / 8, runs: number[][] = [];
  let kept = 0;
  for (let q = 0; q < nq; q++) {
    if (!stand.has((tree[q * 8 + 1] - 0.5) * W + tree[q * 8] - 0.5)) continue;
    const last = runs[runs.length - 1];
    if (last && last[1] === q) last[1] = q + 1; else runs.push([q, q + 1]);
    kept++;
  }
  if (kept === nq) return m;
  if (!kept) return null;
  const out = new THREE.BufferGeometry();
  for (const [name, a] of Object.entries(g.attributes)) {
    const s = a.itemSize * 4, src = a.array as Float32Array, dst = new Float32Array(kept * s);
    let j = 0;
    for (const [q0, q1] of runs) { dst.set(src.subarray(q0 * s, q1 * s), j * s); j += q1 - q0; }
    out.setAttribute(name, new THREE.BufferAttribute(dst, a.itemSize));
  }
  const ix = new Uint32Array(kept * 6);
  let j = 0;
  for (const [q0, q1] of runs) for (let q = q0; q < q1; q++, j++) for (let e = 0; e < 6; e++) ix[j * 6 + e] = idx[q * 6 + e] - (q - j) * 4;
  out.setIndex(new THREE.BufferAttribute(ix, 1)); out.computeBoundingSphere();
  const n = new THREE.Mesh(out, m.material);
  n.renderOrder = m.renderOrder; n.visible = m.visible; n.frustumCulled = m.frustumCulled;
  return n;
}
