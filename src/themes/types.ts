// The theme and set-piece slots' shapes (src/core/plugins.ts lists them). A theme changes how the world is DRAWN, never the game:
// the engine, the bots, recordings and replays are the same with any theme. A set piece is real content a scene writes into the
// engine's map when a world is made (and draws on top of it). A plugin that provides them is a "scene pack". doc/themes.md says how
// to write one.
import type * as THREE from "three";
import type { Sound } from "../sound/core";

/** A theme's sound (Theme.sounds): plays on `sound` with the effect's own arguments (where it is: x, z; a creature's kind...). */
export type SoundSpec = (sound: Sound, ...args: any[]) => unknown;

/** A tile painter: draws one 16 × 16 tile (an outline: one 64 × 64 line drawing, white lines on black) onto g. */
export type Painter = (g: CanvasRenderingContext2D) => void;
/** A tile a theme adds (Theme.tiles): painted, or another tile tinted. */
export type ThemeTile = { paint: Painter; outline?: Painter } | { from: string; tint: number };
/** A block's place in the world, for a theme to decide by: what it is, where, on which floor. */
export interface BlockAt {
  /** Craftax's block id (`B` in src/world/blocks.ts: 4 stone, 5 tree, 17 wall...). */
  block: number;
  r: number; c: number;
  /** The floor: 0 the overworld … 8 the graveyard. */
  level: number;
  /** How tall the standard game draws it, in blocks (rock rises into 1-3 block hills; 0: flat ground, water, a plant). */
  height: number;
  /** A stone the player placed (drawn 1.5 blocks tall in the standard game). */
  placed: boolean;
  /** (decorate only) How tall it is drawn right now: its theme's height, or on its way there while a wave passes. */
  top?: number;
  /** The whole floor's blocks, row by row, to look at what is near the tile (lava close by, a tree next door). */
  floor?: { readonly map: readonly number[]; readonly W: number; readonly H: number };
}
/** One box of a theme's crown: where it is, the tiles of its top, sides and bottom, and which outlined piece it is (laser and phosphor
 *  draw a line where the piece changes: a layer of needles, say). */
/** A trunk's wider foot (Theme.trunk.base): width and height in blocks. */
export interface TrunkBase { width: number; height: number }
export interface CrownBox {
  x0: number; y0: number; z0: number; x1: number; y1: number; z1: number;
  top: string; side: string; bottom: string;
  piece?: number;
}
/** A tree, for a theme's crown: its tile, its trunk's height in blocks and the light on it (0..1, for Draw.face). */
export interface TreeAt extends BlockAt {
  trunk: number;
  light: number;
  /** The overhead views' little tree (a short stub of trunk): keep the crown to about its own tile. */
  overhead?: boolean;
}
/** Which face of a block a tile is for. */
export type Face = "top" | "bottom" | "side";
/** A block's shape under a theme: only what changes. */
export interface BlockShape {
  /** Its height in blocks (solid blocks only: rock, ore, walls, tables, chests...; ground, liquids and trees keep theirs). */
  height?: number;
}
/** A creature's (or the player's) look under a theme. */
export interface CreatureStyle {
  /** Multiplies every part's color (0xffffff: unchanged). Tints crossfade. */
  tint?: number;
  /** Builds the model instead of the built-in one (call builtin() to start from it). A new model sweeps in with the wave. who: a
   *  number for this one creature, the same every time it's drawn (reloads and replays too), for a look that varies between them. */
  model?(builtin: () => THREE.Group, who: number): THREE.Group;
}
/** Sky, fog and light under a theme, eased in with the transition. */
export interface SkyStyle {
  /** Multiplies the sky, zenith, horizon and fog colors ([r, g, b], 1 = unchanged). */
  tint?: [number, number, number];
  /** The fog's [near, far] on the overworld, in blocks (the standard is [30, 140]). */
  fog?: [number, number];
  /** Multiplies the sun's (or moon's) light. */
  sun?: number;
  /** Multiplies the cave light underground. */
  cave?: number;
}
/** How much a face moves in the wind, as the standard leaves do (0 still, 1 a leaf's sway): one number, or one per corner in the
 *  order the face is drawn (a side: its two bottom corners, then its two top ones). */
export type Sway = number | readonly [number, number, number, number];
/** What a theme's decorate (and a set piece's draw) builds with: faces and boxes in world units (x = column, z = row, y up; tile
 *  (r, c) spans [c, c + 1] × [r, r + 1] and the ground's top is y = 0). Laser and phosphor outline each piece (id) as one. */
export interface Draw {
  /** The tiles this call covers: rows [r0, r1), columns [c0, c1) (a chunk), or all of the map. */
  r0: number; c0: number; r1: number; c1: number;
  /** One face of the box [x0, x1] × [y0, y1] × [z0, z1]: "top", "bottom", "pz", "nz", "px" or "nx". tex: a tile name (the atlas's,
   *  or one the theme added). light: 0..1 (1 by default). sway: see Sway. sub: [u, v, size] (or [u, v, width, height]), only that part of the tile (fractions), so a box
   *  smaller than a block keeps full-size pixels (a half block: [0 or 0.5, 0 or 0.5, 0.5]). */
  face(f: string, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tex: string, light?: number, sub?: readonly number[], sway?: Sway): void;
  /** A whole box (all six faces, or the ones listed). */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, tex: string, light?: number, faces?: string[]): void;
  /** Start a new outlined piece (laser and phosphor draw lines where the piece changes); n: any number, the same n is one piece. */
  piece(n: number): void;
}
/** How a theme switches in. wave: a wave sweeps out from the player, each block easing into its new shape as it passes (the default
 *  when shapes or models change); fade: the textures crossfade everywhere at once (the default when only textures and colors do). */
export interface ThemeTransition {
  kind?: "wave" | "fade";
  /** A tile's own ease (wave) or the whole fade, ms (wave 700, fade 350). */
  duration?: number;
  /** The wave's speed, tiles a second (25). */
  speed?: number;
}

/** A theme: one way of drawing the world, picked with T (Standard → each installed theme → Standard) or in Settings. Every field but
 *  id and label is optional; leave out what stays standard. */
export interface Theme {
  id: string;
  /** For the flash ("Theme: <label>") and Settings. */
  label: string;
  /** Its icon on the replay page's keyframe row: an inline SVG (drawn 16 × 16; a 20 × 20 pixel grid suits it), or a letter or two.
   *  Without one the row shows a T. */
  icon?: string;
  /** The theme a player starts in until they pick one (the last plugin to ask wins). */
  default?: boolean;
  transition?: ThemeTransition;
  /** Repaints tiles the game already has (block faces, and the item icons i_sword, i_torch...: the atlas names in
   *  src/resources/blocks/painters/). The geometry is unchanged, so this alone crossfades. */
  paint?: Record<string, Painter>;
  /** Tiles the theme adds, by a name of its own: their color picture and, for laser and phosphor, an optional line drawing; or a
   *  copy of a tile the game has (from) with its colors multiplied by tint (0xRRGGBB; its line drawing too): Tropical's volcanic rock. */
  tiles?: Record<string, ThemeTile>;
  /** Picks the tile a block face is drawn with, by name (return undefined: keep it). Called while a chunk builds, per face and, up a
   *  tall side, per block: row counts the blocks from the ground (0 the bottom one; a top face: the top block's row). */
  tile?(name: string, at: BlockAt, face: Face, row: number): string | undefined;
  /** With 3D grass on: whether a grass tile grows its blades (and flowers): false for none there (Tropical: none near the sand).
   *  Asked as a chunk builds, of the theme on screen. */
  grassAt?(at: BlockAt): boolean;
  /** false: no wildflowers in the grass (Tropical). */
  flowers?: boolean;
  /** A block's shape (return undefined: keep it). */
  shape?(at: BlockAt): BlockShape | undefined;
  /** Extra geometry on a tile (lamps on a wall, a roof on a house): drawn as the wave reaches the tile. */
  decorate?(at: BlockAt, d: Draw): void;
  /** A tree's crown instead of the standard leaf tiers: its boxes (world units), or undefined to keep the standard one. Asked for
   *  both the full-size tree and the overhead views' little one (at.overhead), and for a felled tree's. The game draws them (a face
   *  two boxes share is left out), sways them in the wind and, as a switch's wave passes the tree, morphs the old crown's boxes into
   *  the new one's (src/themes/crowns.ts). */
  crown?(at: TreeAt): CrownBox[] | undefined;
  /** Prebuilt crowns (Pete: a handful, reused, so a world's trees cost next to nothing to draw): which one this tree wears, by key,
   *  turned by quarter turns about the trunk (undefined: crown() as above). The game asks crown() once per key (and view and trunk
   *  height), with the first tree that picks it, keeps it for the session and copies it into place for every other: so crown() must
   *  give the same crown for any tree with that key, its randomness seeded from the key, not the tile. */
  crownPick?(at: TreeAt): { key: string; turn?: number } | undefined;
  /** An item's icon drawn from another tile, by the tile it has (stone: "ruin_cut", the Ruins' cut stone). */
  icons?: Record<string, string>;
  /** Its own names for things, by the game's id (cow: "reindeer"): used wherever the player reads one (achievements, how you died...),
   *  never in the game's data, recordings or bots (src/themes/names.ts). */
  names?: Record<string, string>;
  /** The colors of the loose bits under this theme: a felled tree's leaves bursting (two: its crown's, Winter's needles and snow),
   *  the clippings when grass is hit (Winter's: snow). */
  bits?: { leaves?: [number, number] | ((r: number, c: number) => [number, number]); grass?: number[] };   // (leaves: or each tree its own, by where it stands: Autumn's)
  /** The ordinary trees' trunks (not the fire trees'), on the overworld: width in blocks (0.6 the standard), and each tree's height
   *  in blocks by its tile (standard: the game's own, 3 to 5; kept to 1..12). The crown sits on it (TreeAt.trunk). Switches with the
   *  theme, not eased. stub: the overhead views' short trunk's height by tile (standard 2; kept to 0.5..4). base: a foot wider than the
   *  rest (width and height in blocks, the height kept under the trunk's), for every tree or by tile and view (overhead: the stub's;
   *  null: none on that one). */
  trunk?: {
    width?: number;
    height?(r: number, c: number, standard: number): number;
    stub?(r: number, c: number): number;
    base?: TrunkBase | ((r: number, c: number, overhead: boolean) => TrunkBase | null | undefined);
  };
  /** The 3D grass (a setting): its blades' and flowers' height, 1 the standard, 0 none; eased in and out with the transition. */
  grass?: { height?: number };
  /** Creatures by kind ("cow", "zombie", "skeleton"... js/models.ts MOBS). */
  creatures?: Record<string, CreatureStyle>;
  /** You (third person, and the arm in first person keeps the standard). */
  player?: CreatureStyle;
  sky?: SkyStyle;
  /** Something in the air while the theme is on screen: snow falling, rain, drifting leaves (weather.ts runs it). Called once, the
   *  first time the theme comes on screen, with the 3D scene to add its objects to; let go (dispose) once it has faded right out. */
  weather?(scene: THREE.Scene): Weather;
  /** Its own picture for the classic 2D view instead of Craftax's original art (return false: draw the original after all). */
  classic?(state: Record<string, unknown>, img: HTMLImageElement, refresh: () => void): boolean;
  /** Its own sounds, by the game's name for one (the effects src/sound/gate.ts lists: "moo", "hit", "kill", "groan"...; "hit:cow" for
   *  one creature's, the name and its kind): a function that plays the replacement with the game's sound building blocks (tone, burst,
   *  vox... on `sound`), given the effect's own arguments, or null for silence. */
  sounds?: Record<string, SoundSpec | null>;
}

/** What a theme's weather is told each frame. */
export interface WeatherFrame {
  /** Seconds since the last frame (at most 0.1). */
  dt: number;
  /** How much the theme is on screen: 0 … 1, eased in and out with its transition. */
  k: number;
  /** The camera the frame is drawn from, and where you stand (world units: x = column, z = row, y up). */
  camera: THREE.Camera;
  player: THREE.Vector3;
  /** The floor on screen: 0 the overworld … 8 the graveyard. */
  level: number;
  /** The look (M): "color", or "laser" and "phosphor", which draw outlines, not light: no see-through, and their own ink. */
  look: "color" | "laser" | "phosphor";
  /** The block on the floor on screen at row r, column c (Craftax's id, `B` in src/world/blocks.ts: 5 a tree...), -1 off the map: for
   *  weather that comes from somewhere in the world (leaves dropping from the trees). */
  blockAt(r: number, c: number): number;
}
/** A theme's weather: moved on each frame while the theme is on screen. */
export interface Weather {
  update(f: WeatherFrame): void;
  /** Takes its objects out of the scene and frees them (the theme has faded right out; weather() makes it again if it comes back). */
  dispose(): void;
}

// ---------- set pieces ----------
/** A side of the map, for a set piece that stands on an edge (orient() in src/scenes/orient.ts turns its own layout to it). */
export type Side = "north" | "east" | "south" | "west";
export type Tile = readonly [number, number];
/** One floor as the engine generated it, read-only: what a set piece decides its placement by. */
export interface GeneratedLevel {
  /** The floor: 0 the overworld … 8 the graveyard. */
  readonly level: number;
  /** The world's seed (the player's: a set piece never changes it). */
  readonly seed: number;
  /** Rows, columns. */
  readonly size: Tile;
  /** Block ids, row by row (`B` in src/world/blocks.ts). */
  readonly map: readonly number[];
  /** The items layer, row by row: 0 none, 1 torch, 2 ladder down, 3 ladder up, 4 ladder down (sealed). */
  readonly items: readonly number[];
  readonly ladderDown: Tile | null;
  readonly ladderUp: Tile | null;
  /** The creatures standing on this floor as generated. */
  readonly creatures: readonly { readonly kind: string; readonly pos: Tile }[];
  /** Where the player stands on this floor when they arrive (on the overworld: where the game starts). */
  readonly spawn: Tile;
}
/** A set piece in one floor: what it wrote, and how it draws. place() returns one for a new world, recognize() the same for a
 *  world it finds again (a save, a recording, a replay), from the map alone. */
export interface Placement {
  /** What recognize() needs to find it again and draw it the same (the side it chose, say). Kept with nothing else: recognize()
   *  must be able to rebuild it from the map. */
  readonly data?: Readonly<Record<string, unknown>>;
  /** Blocks written into the engine's map when the world is made (place() only; recognize() leaves them out). */
  readonly writes?: readonly { r: number; c: number; block: number }[];
  /** Creatures to move aside before the writes (CraftaxGame.moveMob, by the creature's own movement rule). A creature that can't
   *  move there keeps its tile, and the write onto it is left out. */
  readonly moves?: readonly { from: Tile; to: Tile }[];
  /** Tiles the standard drawing leaves out (the building stands there instead). */
  covers?(r: number, c: number): boolean;
  /** A path tile drawn as stone paving, never bare dirt. */
  paved?(r: number, c: number): boolean;
  /** Its geometry in one chunk (d.r0 … d.c1): draw only what starts in those tiles. */
  draw?(d: Draw): void;
  /** What lies outside the map (drawn once, with a whole build). */
  beyond?(d: Draw): void;
  /** A block of it at voxel (x, y, z), for shadows and corner shading. */
  solid?(x: number, y: number, z: number): boolean;
  /** Its own fog [near, far] (a far-off campus wants less). */
  fog?: [number, number];
}
/** Set pieces: a scene's real content. Active when the page says ?scene=<id> (or `default`); its worlds then keep their own saves
 *  (craftax3d.scene.<id>.*), apart from the player's own. recognize() runs whatever the page, so a recording shows it anywhere. */
export interface SetPieces {
  id: string;
  label: string;
  /** The scene the game starts in without ?scene= (its worlds are still apart from the standard game's). */
  default?: boolean;
  /** The theme its worlds start in, whatever the player's setting (Surprise me too): a theme's id, or "standard". Left out, or a
   *  theme not installed: the player's own. */
  theme?: string;
  /** Tiles its drawing uses, as a theme's `tiles` (in the atlas whether or not the scene is on: a recording may show it anywhere). */
  tiles?: Record<string, { paint: Painter; outline?: Painter }>;
  /** A new world: each floor as generated (all nine, in order). Return its placement, or null to leave the floor as it is. */
  place(level: GeneratedLevel): Placement | null;
  /** A world being drawn (any floor, any page): is this set piece in it? Decide from the map and items alone. */
  recognize(level: Omit<GeneratedLevel, "creatures" | "spawn">): Placement | null;
}
