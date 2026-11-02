// The game's state: meta, the state S, the HUD, the views, mobs and shots, the keys held, X placing a block, the server API.
import "../effects/hang";
import * as THREE from "three";
import { B, isSolid } from "../../js/world";
import { HOTBAR } from "../../js/hud";
import { net } from "../../js/net";
import { A, DIRV } from "./shared";
import { world } from "../render/arm";
import { aim } from "../input/aim";
import { lookDir, moveAction, placeTarget } from "../input/targets";
import { beyondReach, mobOn } from "../render/targeting";
import { WALKABLE, pathing } from "../input/pathing";
import { flash } from "../ui/hud/hint";
import { botDriving, playing } from "../ui/screens/screen";
import type { Hud } from "../../js/hud";
import type { GameState, Meta, Pos } from "./types";

// this module's state that other modules set (one module can't assign another's let): S, prevHealth, yaw, spaceQueued, clickQueued,
// doQueued, doHeld, shiftClick, rightClick, inflight, lastSend, third, pitch, tickMs, idleMs, spaceHeld, hud, pace, player, meta
export interface Game {
  /** engine/js/meta.json and the bot speeds (GET /api/meta), set at boot. */
  meta: Meta;
  /** The state now (null before the first one, and while another world loads). */
  S: GameState | null;
  /** The HUD, made at boot (js/main.ts) before any state arrives. */
  hud: Hud;
  /** The view's heading and tilt, radians. */
  yaw: number;
  pitch: number;
  /** Third person (F5). */
  third: boolean;
  /** The move pace (Settings → World), ms. */
  tickMs: number;
  /** The NOOP pace when idle, ms; -1 = never. */
  idleMs: number;
  /** The pace now: tickMs, faster while walking, slower asleep. */
  pace: number;
  /** Your own body (made on the first frame, render/player-pose). */
  player: THREE.Group | null;
  /** A step on its way to the engine. */
  inflight: boolean;
  /** When the last step was sent (performance.now()). */
  lastSend: number;
  prevHealth: number;
  /** The use key / button held, and a press not yet acted on. */
  doHeld: boolean;
  doQueued: boolean;
  spaceHeld: boolean;
  /** A Space (or Use) press not yet acted on, even if already let go. */
  spaceQueued: boolean;
  clickQueued: boolean;
  /** Shift held on the click (breaks a table or furnace). */
  shiftClick: boolean;
  /** This click places a block. */
  rightClick: boolean;
}
/** A creature or projectile drawn in the world (render/entities syncEntities). */
export interface Entity {
  model: THREE.Object3D;
  kind: string;
  /** Where its slide started and where it ends (tile centers), and when it started. */
  from: THREE.Vector3;
  to: THREE.Vector3;
  t0: number;
  hp: number;
  /** Last hit (performance.now()). */
  hurtT: number;
  /** Popping into view since then. */
  popT?: number;
  /** Staggered by a hit: when, and which way. */
  stag?: { t: number; dx: number; dz: number };
  /** A projectile's direction. */
  dir?: Pos;
  /** How far it sits lower on dirt. */
  dip?: number;
  /** When it last groaned. */
  voiceT?: number;
  /** Its health bar sprite. */
  hpBar?: THREE.Sprite;
}
/** One action to send, from keys and the E screen: the action and the way to face first. */
export interface OneShot { action: number; face?: number }
export const game = {} as Game;

// ---------- state ----------
game.meta = undefined as unknown as Meta; game.S = null; game.hud = undefined as unknown as Hud;   // (both set at boot, js/main.ts)
export const WALK_MS = 140;                                                         // the pace while a move key is held or a click-walk runs
export const view = { from: new THREE.Vector3(), to: new THREE.Vector3(), t0: 0, dur: 1 };
// overhead views, cycled with M: mode 0 = 3D, 1 = Craftax's own 2D view, 2 = a 3/4 view. on: an overhead mode is wanted; t eases 0 (eyes)
// → 1 (overhead); k eases 0 (straight down, for 2D) → 1 (the 3/4 angle); img eases the 2D image in and out
// picture: which picture the classic 2D view shows (0 none, 1 Craftax's original art, 2 a plugin's classic look: the crystal frame); orbit, el: the 3/4 camera's heading around you and its elevation (drag to orbit)
export interface Flat {
  mode: number; on: boolean; t: number; k: number; img: number; picture: number; orbit: number; el: number;
  /** A swing round a tree: the orbit it eases to (views/camera). */
  orbitGoal?: number | null;
  /** The 3/4 camera raised over a tall thing. */
  lift?: number;
}
export const flat: Flat = { mode: 0, on: false, t: 0, k: 0, img: 0, picture: 0, orbit: 0, el: Math.PI / 4 };
export const viewYaw = () => (flat.mode === 2 ? flat.orbit : flat.on ? 0 : game.yaw);    // the heading "up the screen" means: 3/4 its orbit, 2D north
game.yaw = Math.PI; game.pitch = -0.15; game.third = false; game.tickMs = 1000 / 3; game.idleMs = 1000; game.pace = 1000 / 3;   // idleMs: NOOP pace when idle; -1 = never (Settings → World)
export const mobs = new Map<string, Entity>(), shots = new Map<string, Entity>();
game.player = null;
game.inflight = false; game.lastSend = 0; game.prevHealth = 9;

export const keys = new Set<string>();
game.doHeld = false; game.doQueued = false; game.spaceHeld = false; game.spaceQueued = false; game.clickQueued = false; game.shiftClick = false; game.rightClick = false;   // rightClick: this click places a block (Pete)   // spaceQueued: a Space (or Use) press not yet acted on, even if already let go   // shiftClick: Shift held on the click (breaks a table or furnace)
export const oneShot: OneShot[] = [];
// X (Pete: a block to stop an enemy): a stone in the tile you face, or a crafting table without stone; the hotbar shows it (that slot
// picked for the moment), then goes back to what you held. With a block already in front of you (stone, table, furnace), X breaks it. Held: after a moment it breaks the block and places it again, over and over
// (a pickaxe to break stone; a table always breaks), till you let go. xHold: { prev: the slot you held, t: the timer }
export let xHold: { prev: number; t: ReturnType<typeof setTimeout> | null } | null = null;
export const X_SLOTS = { 7: HOTBAR.findIndex((h) => h.action === 7), 8: HOTBAR.findIndex((h) => h.action === 8) };
export function xPlace() {
  if (!game.S || game.S.done || botDriving()) return false;
  const face = lookDir(), av = game.S.available || [];
  const action = game.S.inventory.stone > 0 && av[7] !== false ? 7 : av[8] ? 8 : 0;
  if (!action) { flash(game.S.inventory.stone > 0 || game.S.inventory.wood > 1 ? "No room ahead for a block" : "Nothing to place: no stone, nor wood for a table"); return false; }
  game.hud.select(X_SLOTS[action], true);
  oneShot.push({ action, face });
  return true;
}
export const X_BLOCKS = new Set([B.STONE, B.TABLE, B.FURNACE]);                  // what X breaks when it's in front of you
export const xAhead = () => { const face = lookDir(), d = DIRV[face]; return { face, b: d && game.S ? world.at(game.S.pos[0] + d[0], game.S.pos[1] + d[1]) : -1 }; };   // (-1: no block, in no set)
// first person (Pete): X puts the block where the crosshair is, if that's a free spot within 1st person reach (walking up beside it
// first, as a click does); otherwise as before, the tile you face
export function xCross() {
  if (game.third || flat.on || flat.t !== 0) return null;
  const t = placeTarget(aim(true)); if (!t) return null;
  const [r, c] = t, b = world.at(r, c);
  if (beyondReach(r, c) || isSolid(b) || mobOn(r, c)) return null;
  return t;
}
export function xDown() {
  if (xHold || !playing() || !game.S || game.S.done || botDriving()) return;
  const t = xCross();
  if (t) {
    const action = game.S.inventory.stone > 0 ? 7 : 8, why = HOTBAR[X_SLOTS[action]].need(game.S);
    if (why && /^Need /.test(why)) { flash(game.S.inventory.stone > 0 || game.S.inventory.wood > 1 ? why : "Nothing to place: no stone, nor wood for a table"); return; }
    xHold = { prev: game.hud.sel, t: null };                                     // (let go: back to what you held)
    game.hud.select(X_SLOTS[action], true);
    pathing.pending = { r: t[0], c: t[1], action, steps: 0, far: false };          // the tick walks you beside it, then places it (reach)
    return;
  }
  const prev = game.hud.sel, { face, b } = xAhead();
  if (X_BLOCKS.has(b)) oneShot.push({ action: A.DO, face });              // a block already in front of you: X breaks it (Pete)
  else if (!xPlace()) return;
  xHold = { prev, t: setTimeout(function again() {                        // held: break it, place it, and on
    if (!xHold || !game.S || game.S.done) return;
    const { face, b } = xAhead();
    // with forward held too, a bridge (Pete): a stone onto the water or lava ahead, broken again (Craftax leaves floor where a stone
    // is mined), and you walk on onto it (the tick: no step into the water or lava meanwhile); open floor ahead: no block, you walk
    const fwd = moveAction() === face;
    if (X_BLOCKS.has(b)) oneShot.push({ action: A.DO, face }); else if (!(fwd && WALKABLE.has(b))) xPlace();
    xHold.t = setTimeout(again, 260);
  }, 450) };
}
export function xUp() {
  if (!xHold) return;
  clearTimeout(xHold.t ?? undefined);
  const prev = xHold.prev; xHold = null;
  setTimeout(() => game.hud.select(prev, true), 250);                           // back to what you held, once the block is down
}                                                          // {action, face} from keys and the E screen

export const api = <T = GameState>(path: string, body?: object) => net.api<T>(path, body);                         // net.ts: which server, which world, who you are
