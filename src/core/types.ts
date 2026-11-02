// The game's data shapes: the engine's state (craftax-wasm's cx_state_json, what GET /api/state returns, js/local.ts adds its own
// fields), the world summary and the bot's reply inside it, the meta the engine ships (engine/js/meta.json), and the engine's API.
// Types only: nothing here runs.
import type { BotModel } from "./plugins";

/** [row, column] on the floor's map. */
export type Pos = [number, number];

/** A creature or a projectile on the current floor (cx_state_json put_mobs). `dir` only on projectiles. */
export interface Mob {
  id: number;
  /** Its name: "zombie", "cow", "arrow"... ("?" for a type the engine has no name for). */
  kind: string;
  type: number;
  pos: Pos;
  hp: number;
  dir?: Pos;
}

export interface Inventory {
  wood: number; stone: number; coal: number; iron: number; diamond: number; sapling: number;
  /** Tiers: 0 none, 1 wood, 2 stone, 3 iron, 4 diamond. */
  pickaxe: number; sword: number;
  bow: number; arrows: number;
  /** Helmet, chest, pants, boots: 0 none, 1 iron, 2 diamond. */
  armour: number[];
  torches: number; ruby: number; sapphire: number;
  /** Red, green, blue, pink, cyan, yellow. */
  potions: number[];
  books: number;
}
/** The inventory's single counts (everything but armour and potions), for lookups by name. */
export type InventoryCount = { [K in keyof Inventory]: Inventory[K] extends number ? K : never }[keyof Inventory];

/** The engine's state, as cx_state_json writes it (craftax-wasm api.c). Maps are row-major, size[0] × size[1]. */
export interface EngineState {
  seed: number;
  done: boolean;
  reward: number;
  timestep: number;
  /** The floor: 0 overworld … 8 graveyard. */
  level: number;
  /** The floor's name ("Overworld", "Gnomish Mines"...). */
  floor: string;
  map: number[];
  items: number[];
  light: number[];
  size: Pos;
  pos: Pos;
  /** 1 left, 2 right, 3 up, 4 down. */
  dir: number;
  daylight: number;
  health: number; food: number; drink: number; energy: number; mana: number;
  sleeping: boolean; resting: boolean;
  xp: number; dexterity: number; strength: number; intelligence: number;
  inventory: Inventory;
  sword_enchant: number;
  bow_enchant: number;
  armour_enchant: number[];
  /** Fireball, iceball learned. */
  spells: boolean[];
  boss_vulnerable: boolean;
  boss_spawn_turns: number;
  god: boolean;
  monsters_killed: number;
  down_ladder: Pos;
  up_ladder: Pos;
  boss_progress: number;
  score: number;
  /** The ids of the achievements earned (meta.achievements names them). */
  achievements: number[];
  melee: Mob[];
  ranged: Mob[];
  passive: Mob[];
  mob_projectiles: Mob[];
  player_projectiles: Mob[];
}

/** The bot's answer for a move, as js/local.ts builds it (a server's bot sends the same fields, some left out). */
export interface BotReply {
  /** The action's name (meta.actions). */
  action: string;
  /** Its five likeliest actions: [name, probability]. */
  top?: [string, number][];
  probs?: number[];
  /** The busiest memory units, layer by layer (null: a model with no brain output). */
  mem?: number[] | null;
  /** The memory's layout: [layers, units a layer, the first tier]. */
  memShape?: [number, number, number] | null;
  /** The policy's 51 self-sensing inputs. */
  sense?: number[];
  value?: number;
  note?: string | null;
  memPix?: unknown;
  split?: unknown;
  maps?: unknown;
  /** Only useful actions on: which ones it was allowed. */
  allowed?: boolean[] | null;
  /** A DO announced a beat before it lands (the swing shows first). */
  pending?: boolean;
}

/** Who plays a world (GET /api/worlds lists these; js/local.ts summary). */
export interface WorldSummary {
  id: string;
  name: string;
  kind: string;
  control: "human" | "bot" | "replay";
  you: boolean;
  /** The bot's name while one plays. */
  bot?: string | null;
  bot_id?: string;
  /** The model's score text ("162 / 226 (their evaluation)"). */
  bot_score?: string;
  floor: string;
  level: number;
  score: number;
  steps: number;
  done: boolean;
  watchers: number;
}

/** The world as GET /api/state carries it (`state.world`): the summary and the bot's settings and last reply. */
export interface WorldInfo extends WorldSummary {
  speed: number;
  paused: boolean;
  bot_reply: BotReply | null;
  temp: number | null;
  useful: boolean | null;
  crystal_stamp: boolean;
  bot_kind: string | null;
}

/** What GET /api/state (and every POST that changes the game) returns: the engine's state and what the game adds to it. */
export interface GameState extends EngineState {
  /** The engine's own map, kept when the boss's tile is redrawn (js/local.ts state). */
  engine_map?: number[];
  /** Bumped on every change (GET /api/state?since=t answers { same: true } when nothing changed). */
  t: number;
  game_id: string;
  /** How many games this browser has played. */
  games: number;
  world?: WorldInfo;
  /** Which actions would change anything now. */
  available?: boolean[];
  /** POST /api/debug/nuke: how many died. */
  nuked?: number;
}

/** engine/js/meta.json, with the bot speeds the game offers. */
export interface Meta {
  blocks: string[];
  items: string[];
  actions: string[];
  achievements: Record<string, string>;
  floors: string[];
  melee: string[];
  ranged: string[];
  passive: string[];
  speeds?: number[];
}

/** One game in the engine (engine/js/craftax.mjs Game). The optional methods are missing from older engine builds. */
export interface CraftaxGame {
  reset(seed: number): void;
  /** True when this step ended the episode. */
  step(action: number): boolean;
  readonly done: boolean;
  readonly reward: number;
  readonly score: number;
  state(): EngineState;
  obs(): Float32Array;
  mask(): boolean[];
  available(): boolean[];
  useful?(): boolean[];
  face(direction: number): void;
  intoLava?(direction: number): boolean;
  hurt?(amount: number): boolean;
  shove?(dr: number, dc: number): boolean;
  teleport(level: number): void;
  place(row: number, col: number): boolean;
  god?(on?: boolean): void;
  bossSet?(hits: number): boolean;
  killAt?(row: number, col: number): boolean;
  /** Moves the creature on (row, col) of a floor to (toRow, toCol) (a set piece clearing its ground): true if it moved. */
  moveMob?(level: number, row: number, col: number, toRow: number, toCol: number): boolean;
  save(): Uint8Array;
  load(bytes: Uint8Array): void;
  playOn?(on?: boolean): void;
  free(): void;
}

export interface CraftaxEngine {
  version: string;
  newGame(flags: number): CraftaxGame;
}

/** engine/js/craftax.mjs's exports. */
export interface CraftaxModule {
  loadCraftax(options?: object): Promise<CraftaxEngine>;
  FLAGS: { SINGLE_STEP: number; KEEP_DEAD: number; ACTION_MASK: number };
}

/** A bot in the registry (public/models.json), a plugin's, or one of your own (agent.ts myAgents). */
export interface ModelEntry extends BotModel {
  id: string;
  name: string;
  /** The ONNX file, relative to the game's folder or a URL; a plugin bot's own file. */
  onnx?: string;
  file?: string;
  kind?: string;
  /** The observation it takes ("packed843"). */
  obs?: string;
  /** Your own agent. */
  mine?: boolean;
  /** Its Craftax score as text ("162 / 226 (their evaluation)"). */
  score?: string;
  temperature?: number;
  usefulOnly?: boolean;
  stamp?: unknown;
  /** Its recurrent tensors: input, output, shape. */
  state?: { in: string; out: string; shape: number[] }[];
  /** The memory output the brain view shows, and its layers. */
  brain?: { output: string; layers?: number };
  prev_action?: string;
  /** The file's size, for the model cache. */
  bytes?: number;
  /** The ways to run it (craftax-agents' players: its ONNX file, its MinGRU player...), the first that fits the device playing. */
  players?: import("craftax-agents").PlayerSpec[];
  about?: string; by?: string; license?: string; source?: string;
}

/** A bot's answer to one move (agent-worker.ts act; a plugin's worker may add its own pictures). */
export interface ActResult {
  action: number;
  probs: number[];
  value: number;
  /** How long the model took to think (ms). */
  ms?: number;
  sense?: number[];
  mem?: number[];
  memShape?: [number, number, number];
  memPix?: unknown;
  split?: unknown;
  maps?: unknown;
}

/** A loaded bot (agent.ts loadAgent): its registry entry and its worker's controls. */
export interface Agent extends ModelEntry {
  reset(): void;
  /** A copy of its memory tensors (saved with the world). */
  getMemory(): Promise<unknown[]>;
  setMemory(mem: unknown[]): void;
  /** The action played was another (yours, while it watched). */
  took(action: number): void;
  act(obs: ArrayLike<number>, mask: ArrayLike<boolean>, temp: number): Promise<ActResult>;
  close(): void;
}

/** One change made to the engine (js/local.ts `op`), as a recording keeps it and a replay applies it. */
export type EngineOp =
  | { k: "load"; snap: string; seed: number; god: boolean }
  /** As POST /api/step: face f (1-4), then up to n steps of action a. */
  | { k: "step"; f: number; a: number; n: number }
  /** A bot move. */
  | { k: "a"; a: number }
  | { k: "reply"; r: BotReply | null }
  | { k: "who"; who: "human" | "bot"; bot?: string | null }
  | { k: "hurt" }
  | { k: "shove"; dr: number; dc: number }
  | { k: "floor"; level: number }
  | { k: "place"; r: number; c: number }
  | { k: "boss"; hits: number }
  | { k: "kill"; cells: Pos[] };
/** A moment the engine doesn't keep (js/record.ts `ui`): hanging over the lava (d: the way), letting go, the scorch, the brain panel. */
export interface UiOp { k: "ui"; e: string; d?: number | string | null }
/** An op in a recording, at t ms from its start. */
export type RecOp = (EngineOp | UiOp) & { t: number };

/** Where a recording begins (js/local.ts record): the engine's version, the seed, the snapshot, who plays. */
export interface RecHead {
  version: string;
  seed: number;
  /** The engine's whole state, base64. */
  snap: string;
  god?: boolean;
  who?: string;
  bot?: string | null;
  reply?: BotReply | null;
}
/** The camera at a moment (js/record.ts CAM): view mode, look, heading, the 3/4 orbit, the hotbar slot, the lit square. */
export interface Cam {
  yaw: number | null; pitch: number; mode: number; look: string; orbit: number; el: number; sel: number;
  /** [x, z, top, lo, on], or 0 for none. */
  aim: number[] | number;
  /** The theme on screen (its id; null or absent: Standard, and every recording from before themes). */
  theme?: string | null;
}
/** A camera sample: [t, ...the CAM fields in order]. */
export type CamRow = [number, ...(number | string | number[] | null)[]];
/** A keyframe (replay.html): from t on, this view and look, the camera framed by hand (fixed), the brain panel's size. */
export interface CamKey {
  t: number; mode?: number; look?: string; yaw?: number; pitch?: number; orbit?: number; el?: number; fixed?: boolean; rec?: boolean; brain?: string;
  /** From t on, this theme (its id; null: Standard); absent: the recorded one. */
  theme?: string | null;
  /** Read off the recorded camera (firstKey), not set by hand. */
  auto?: boolean;
}
/** A recording (.cxreplay): see js/record.ts. */
export interface Recording extends RecHead {
  id?: string;
  format: string;
  v: number;
  created: string;
  /** Its length, ms. */
  dur: number;
  device?: unknown;
  ops: RecOp[];
  camCols?: string[];
  cam: CamRow[];
  /** The trims, camera keys, what the HUD shows (replay.html side: inv, status...), the frame's orientation ("landscape", "portrait"). */
  edits: { in: number; out: number | null; keys: CamKey[]; show?: Record<string, boolean>; orient?: string;
    /** The keyframes have been read off the recorded camera once (replay page firstKey). */
    seeded?: boolean };
  /** Cut before the ending (no spoilers). */
  secret?: boolean;
  /** Put on the web (the replay page's Share): its id and address, and the edits it went up with (edits changed since: again). */
  shared?: { id: string; url: string; sig: string };
}

/** A world in My Worlds (js/local.ts, IndexedDB): its snapshot and picture, and the bot's memory when it was current. */
export interface SaveRecord {
  id: string; name: string; seed: number; version: string; updated: number; floor: string; score: number; steps: number; done: boolean;
  snap: Uint8Array; thumb: string | null; mem?: { model: string; step: number; data: unknown[] }; checkpoint?: unknown;
}
// any: a request's JSON body, read field by field (| 0, +, !!) as a game server reads it (js/local.ts routes)
export type ApiBody = Record<string, any>;
