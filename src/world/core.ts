// The World class (js/world.ts re-exports it): the map's state, what changed between two states, placed stone; its other methods live in
// terrain.ts, build.ts, shapes.ts and light.ts, mixed into its prototype here, before anything can use it; the interface World
// below merges their types into the class.
import * as THREE from "three";
import { atlas } from "../../js/textures";
import { makeMaterial } from "../../js/shading";
import { mixin } from "../core/mixin";
import { B, CEIL, CHUNK, DIRT_DIP, FLAT_TRUNK, FLOOR_DIRT, TRUNK } from "./blocks";
import { WorldTerrain } from "./terrain";
import { WorldBuild } from "./build";
import { WorldShapes } from "./shapes";
import { WorldLight } from "./light";
import type { GameState } from "../core/types";
import type { Placement } from "../themes/types";
import { onScreen } from "../themes/state";

/** One fountain basin (build): its middle, the half-width of its water, and its tile. */
export interface Fountain { x: number; z: number; half: number; r: number; c: number }
/** One built chunk (build): its meshes and props, its fountains, and its meshes by kind (shown or hidden by the view: setFlat). */
export interface Chunk {
  meshes: THREE.Mesh[]; props: THREE.Object3D[]; fountains: Fountain[];
  crowns: THREE.Mesh[]; tops: THREE.Mesh[]; trunks: THREE.Mesh[]; stubs: THREE.Mesh[]; tufts: THREE.Mesh[]; blooms: THREE.Mesh[];
  /** Every crown in it a theme's own (WorldBuild.build: kept when a tree is felled): the level and themes they were drawn under, and its trees then. */
  ownCrowns?: string; crownTrees?: Set<number>;
}
/** A light source's flood-filled reach (lightSources): the tile it is on, the tiles it reaches and their levels. */
export interface LightSource { at: number; cells: Int32Array; levels: Float32Array; torch: boolean; seed: number }
/** A drop and its ripple ring over one fountain (updateFountains). */
export interface FountainFx {
  f: Fountain; spring: boolean; drops: { m: THREE.Mesh; k: number; ph: number }[]; rings: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>[];
  ox: number; oz: number; period: number;
}
/** Makes a prop on a tile (the Necromancer): its kind, tile and light. */
export type MakeProp = (kind: string, r: number, c: number, L: number) => THREE.Object3D;
/** A leaf cell (leaves): its tile and height, texture and light, and the tree's tile. */
export type LeafCell = [number, number, number, string, number, number, number];

/** The methods mixed in from terrain.ts, build.ts, shapes.ts and light.ts (declaration merging: one type, the whole World). */
export interface World extends WorldTerrain, WorldBuild, WorldShapes, WorldLight {}

export class World {
  declare scene: THREE.Object3D;
  declare group: THREE.Group;
  declare mats: Record<"opaque" | "cutout" | "water" | "glow" | "fountain", THREE.ShaderMaterial>;
  /** The map, items and light the meshes were built from (null: build again). */
  declare key: string | null;
  declare props: THREE.Group;
  /** Torches turned phosphor green (greenTorches): tile → when, their flames, and the green share of the block light. */
  declare greenAt: Map<number, number>;
  declare greenFlames: Map<number, THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>>;
  declare lightGreen: Float32Array | null;
  // set by update (before the first one, unset)
  /** The floor's size, rows × columns. */
  declare H: number;
  declare W: number;
  declare map: number[];
  declare items: number[];
  declare light: number[];
  declare level: number;
  /** The heights drawn (a theme's, eased in: src/themes/blocks.ts), and the standard ones (heights). */
  declare h: Float32Array;
  declare stdH: Float32Array;
  /** A scene's set piece in this floor (src/scenes/active.ts), or null. */
  declare piece: Placement | null;
  /** The last state and prop maker update() built from (a theme's wave builds again from them). */
  declare lastS?: GameState;
  declare lastProp?: MakeProp;
  /** The path floor's kinds (floorKinds) and their memo for this world and level. */
  declare floors: Uint8Array;
  declare floorMemo?: { key: string; memo: Uint8Array };
  /** The floor's usual ground (ground). */
  declare base: number;
  declare chunks?: Map<number, Chunk>;
  /** The Vaults' portcullises and doors (portcullises), on that floor only. */
  declare portc: Map<string, number> | null;
  declare flowerSeed: number;
  declare flowery: number;
  declare flowerCols: number[];
  /** Every chunk's meshes by kind (build). */
  declare crowns: THREE.Mesh[];
  declare tops: THREE.Mesh[];
  declare trunks: THREE.Mesh[];
  declare stubs: THREE.Mesh[];
  declare tufts: THREE.Mesh[];
  declare blooms: THREE.Mesh[];
  declare fountains?: Fountain[];
  declare fx?: { built: Fountain[]; group: THREE.Group; items: FountainFx[] };
  /** The overhead 2D view's trees shown (setFlat). */
  declare flat: boolean;
  declare sources?: LightSource[];
  declare grass3d?: boolean;
  /** A theme switch building the world again a chunk at a time (src/themes/transition.ts): grow the grass anew, as a whole build does. */
  declare regrow?: boolean;
  /** The next build is a full one. */
  declare fullNext?: boolean;
  /** The ladder down is sealed (too few kills). */
  declare sealed?: boolean;
  /** Placed stone (notePlaced): the game it is for, its last step and seed, and the tiles (level * 10000 + tile), all and a bot's. */
  declare lastStep?: number;
  declare placedId: string | number;
  declare placed: Set<number>;
  /** Tombstones a replay draws as floor though its engine still has them (the way into the victory portal: src/effects/victory.ts). */
  cleared?: Set<number>;
  declare placedBot: Set<number>;
  declare lastSeed: number | null;

  constructor(scene: THREE.Object3D) {
    this.scene = scene;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mats = { opaque: makeMaterial("opaque", { map: atlas }), cutout: makeMaterial("cutout", { map: atlas }),
      water: makeMaterial("water", { map: atlas }), glow: makeMaterial("glow", { map: atlas }), fountain: makeMaterial("fountain", { map: atlas }) };
    this.key = "";
    this.props = new THREE.Group();
    this.group.add(this.props);
    this.greenAt = new Map(); this.greenFlames = new Map(); this.lightGreen = null;   // torches turned phosphor green (greenTorches)
  }

  at(r: number, c: number): number { return r < 0 || c < 0 || r >= this.H || c >= this.W ? B.OOB : this.map[r * this.W + c]; }
  height(r: number, c: number): number { return r < 0 || c < 0 || r >= this.H || c >= this.W ? (this.level ? CEIL : 0) : this.h[r * this.W + c]; }
  // a tree's trunk height (Pete: not all the same in first person): mostly TRUNK (3 blocks bare under the crown), a quarter of them a
  // block taller, one in twelve a block shorter, fixed per tile; underground (under the ceiling) all the same
  trunkH(r: number, c: number): number {
    if (this.level) return TRUNK;
    const h = (Math.imul((r * 73856093) ^ (c * 19349663) ^ 0x5bd1e995, 2654435761) >>> 8) % 12;
    const std = h < 3 ? TRUNK + 1 : h === 3 ? TRUNK - 1 : TRUNK, own = onScreen.to?.trunk?.height;
    if (!own) return std;
    try { const v = Math.round(own(r, c, std)); return v >= 1 && v <= 12 ? v : std; } catch { return std; }   // (a theme's bug: the standard height)
  }
  /** The overhead views' trunk on (r, c): FLAT_TRUNK, or the theme's own (trunk.stub). */
  stubH(r: number, c: number): number {
    const own = this.level ? undefined : onScreen.to?.trunk?.stub;   // (as trunkH: by tile, so a tree being felled keeps it)
    if (!own) return FLAT_TRUNK;
    try { const v = own(r, c); return v >= 0.5 && v <= 4 ? v : FLAT_TRUNK; } catch { return FLAT_TRUNK; }
  }
  lightAt(r: number, c: number): number {
    if (!this.level) return 1;
    if (r < 0 || c < 0 || r >= this.H || c >= this.W) return 0.03;
    return 0.03 + 0.97 * Math.min(1, this.light[r * this.W + c] / 255) ** 0.8;
  }

  // stone the player placed (a tile that became stone between steps): drawn as a 1.75-block wall to hide behind. Craftax does
  // not record who placed a block, so the client does, per world (saved, so a reload keeps the walls tall)
  // (per game, not per seed: Try Again on the same seed brought back the last try's mined rock as "placed" brick walls, Pete; and a
  // game that starts over, its step going back, starts with none)
  notePlaced(s: GameState): void {
    // (the code falls back to the seed when a state has no game_id)
    const id = (s.game_id as string | undefined) ?? s.seed, restart = this.lastStep != null && s.timestep < this.lastStep;
    this.lastStep = s.timestep;
    if (this.placedId !== id || restart) {
      this.placedId = id; this.placed = new Set(); this.placedBot = new Set();
      if (!restart) try { this.placed = new Set(JSON.parse(localStorage.getItem("craftax3d.placed." + id) || "[]") as number[]); this.placedBot = new Set(JSON.parse(localStorage.getItem("craftax3d.placedbot." + id) || "[]") as number[]); } catch {}
      if (id !== s.seed) try { localStorage.removeItem("craftax3d.placed." + s.seed); } catch {}   // (the old per-seed list: wrong for a new try)
      if (restart) { try { localStorage.removeItem("craftax3d.placed." + id); localStorage.removeItem("craftax3d.placedbot." + id); } catch {} this.lastSeed = null; }
    }
    if (!this.map || this.lastSeed !== s.seed || this.level !== s.level) { this.lastSeed = s.seed; return; }
    let changed = false;
    for (let i = 0; i < s.map.length; i++) {
      const k = s.level * 10000 + i;
      // (who placed it: a bot's walls are part of the world as you find it, and pave the floor by them, floorKinds; yours don't, Pete)
      if (s.map[i] === B.STONE && this.map[i] !== B.STONE) { this.placed.add(k); if (s.world?.control === "bot") this.placedBot.add(k); changed = true; }
      else if (s.map[i] !== B.STONE && this.placed.has(k)) { this.placed.delete(k); this.placedBot.delete(k); changed = true; }
    }
    if (changed) try { localStorage.setItem("craftax3d.placed." + this.placedId, JSON.stringify([...this.placed])); localStorage.setItem("craftax3d.placedbot." + this.placedId, JSON.stringify([...this.placedBot])); } catch {}
  }

  // 3D grass (Settings, main.ts): off, no blades are built; switched on, the whole map is built again once, with them
  // (and the flowers with it, Pete; the cutout material compiles its grass code only while it's on: GRASS3D, shading.ts)
  setGrass3d(on: boolean): void {
    on = !!on; if (on === !!this.grass3d && this.mats.cutout.defines.GRASS3D !== undefined === on) return;
    this.grass3d = on;
    if (on) this.mats.cutout.defines.GRASS3D = ""; else delete this.mats.cutout.defines.GRASS3D;
    this.mats.cutout.needsUpdate = true;
    this.key = null; this.fullNext = true;                                   // (built again: with them, or without, freeing their buffers)
  }
  update(s: GameState, makeProp: MakeProp): boolean {
    this.lastS = s; this.lastProp = makeProp;
    this.notePlaced(s);
    const sealed = s.monsters_killed < 8;                                    // the ladder down sealed: its grate comes and goes with it
    if (sealed !== this.sealed) { this.sealed = sealed; this.key = null; this.fullNext = true; }
    const key = s.level + "|" + s.map.join(",") + "|" + s.items.join(",") + "|" + s.light.join(",");
    if (key === this.key) return false;
    this.key = key;
    // what changed, as chunks: every chunk within 4 tiles of a changed tile (a column's height follows its distance to open ground,
    // up to 3, and a crown reaches its neighbours); a new floor, a new size, or a change all over (the light at dusk) is a full build
    let dirty: Set<number> | null = null;
    if (this.map && this.level === s.level && this.H === s.size[0] && this.W === s.size[1]) {
      const { H, W } = this, NC = Math.ceil(W / CHUNK), set = new Set<number>();
      let n = 0;
      for (let i = 0; i < H * W && n <= 200; i++) {
        if (s.map[i] === this.map[i] && s.items[i] === this.items[i] && s.light[i] === this.light[i]) continue;
        n++;
        const r = (i / W) | 0, c = i % W;
        for (let rr = Math.max(0, r - 4); rr <= Math.min(H - 1, r + 4); rr += 4) for (let cc = Math.max(0, c - 4); cc <= Math.min(W - 1, c + 4); cc += 4)
          set.add(Math.floor(rr / CHUNK) * NC + Math.floor(cc / CHUNK));
        for (const [rr, cc] of [[Math.max(0, r - 4), Math.max(0, c - 4)], [Math.min(H - 1, r + 4), Math.min(W - 1, c + 4)], [Math.max(0, r - 4), Math.min(W - 1, c + 4)], [Math.min(H - 1, r + 4), Math.max(0, c - 4)]])
          set.add(Math.floor(rr / CHUNK) * NC + Math.floor(cc / CHUNK));
      }
      if (n <= 200) dirty = set;
    }
    if (this.fullNext) { dirty = null; this.fullNext = false; }              // (3D grass switched on: every chunk again, with its blades)
    [this.H, this.W] = s.size;
    this.map = s.map; this.items = s.items; this.light = s.light; this.level = s.level;
    const base = this.base;
    this.build(makeProp, s, dirty);
    if (dirty && this.base !== base) this.build(makeProp, s);   // the usual ground changed: it is under every tree, so all of it
    return true;
  }
  floorAt(r: number, c: number): number { return this.floors?.[r * this.W + c] || 0; }
  dipAt(x: number, z: number): number { const r = Math.floor(z), c = Math.floor(x); return this.at(r, c) === B.PATH && this.floorAt(r, c) === FLOOR_DIRT ? DIRT_DIP : 0; }
}
mixin(World, WorldTerrain, WorldBuild, WorldShapes, WorldLight);
