// The arm's swing, and hanging over lava's edge: the heat, the lean, letting go.
import "../render/arm";
import { recorder } from "../../js/record";
import { net } from "../../js/net";
import { A, sound } from "../core/shared";
import { api, game } from "../core/game";
import { apply } from "../core/apply";
import { flash } from "../ui/hud/hint";
import { botDriving } from "../ui/screens/screen";
import type * as THREE from "three";
import type { OneShot } from "../core/game";

/** Hanging over lava: the way to it (1-4), your square, the last heart lost (performance.now()). */
export interface Hang { d: number; r: number; c: number; hurtT: number }
// this module's state that other modules set (one module can't assign another's let): swingT, toolKey, hang, lavaHeld, hangOut, sweatT,
// teeterDir, scorchT
export interface HangState {
  /** The arm's swing began (performance.now(); -1 none). */
  swingT: number;
  /** The tool in hand and its tier and enchantment, as last drawn ("" none yet). */
  toolKey: string;
  hang: Hang | null;
  /** A move key still down since its press. */
  lavaHeld: boolean;
  /** How far out you lean (0..1, eased in the frame). */
  hangOut: number;
  /** The last sweat drops flew (render/player-pose). */
  sweatT: number;
  /** The way you lean (1-4; 0 none yet). */
  teeterDir: number;
  /** The last scorch (the screen's red flash). */
  scorchT: number;
}
export const hangState = {} as HangState;
/** A drop of sweat flying off you (render/player-pose): its mesh, when it flew, its speed. */
export interface Sweat { m: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>; t0: number; v: THREE.Vector3 }

hangState.swingT = -1; hangState.toolKey = "";
// lava's edge (Pete: too easy to walk in by accident; then: hanging over it, hearts going, till you pull back or step in): a try at
// stepping into lava (a fresh key press toward it, or a click on lava from its edge; a click from farther only walks you to the edge)
// leaves you hanging out over it, arms wheeling, sweating, a heart lost now and one every HANG_HURT_MS (local.ts /api/scorch). From
// there: a fresh press toward the lava (or a click on it) steps in; any other press or click pulls you back; with your last heart you
// lose your grip and fall in. hang: { d: the way to the lava, r, c: your square, hurtT }; hangOut: how far out you lean (0..1, eased in
// the frame); lavaHeld: a move key still down since its press
hangState.hang = null; hangState.hangOut = 0; hangState.teeterDir = 0; hangState.lavaHeld = false; hangState.scorchT = -1e9; hangState.sweatT = 0; export let sweat: Sweat[] = [];
export const HANG_HURT_MS = 1500;
export function scorch() {
  hangState.scorchT = performance.now(); sound.hurt?.(); recorder.ui({ e: "scorch" });
  if (net.local) api("/api/scorch", {}).then(apply).catch(() => {});     // (a play server has no scorch: you hang, unhurt)
}
export function hangStart(d: number): OneShot | null {
  hangState.hang = { d, r: game.S!.pos[0], c: game.S!.pos[1], hurtT: performance.now() }; hangState.teeterDir = d;
  recorder.ui({ e: "hang", d });                                           // (a recording shows the hang too: Pete)
  flash("Hanging over the lava! Back away, or step in");
  if (game.S!.health <= 1) { hangState.hang = null; return { action: d }; }               // no heart to spare: straight in
  scorch();
  return game.S!.dir === d ? null : { action: A.NOOP, face: d };
}
// every tick while hanging: the heat takes a heart now and then; the last one and you fall
export function hangTick(): OneShot | undefined {
  if (!hangState.hang) return undefined;
  if (game.S!.done || botDriving() || game.S!.pos[0] !== hangState.hang.r || game.S!.pos[1] !== hangState.hang.c) { hangState.hang = null; recorder.ui({ e: "letgo" }); return undefined; }
  if (performance.now() - hangState.hang.hurtT < HANG_HURT_MS) return undefined;
  const d = hangState.hang.d;
  if (game.S!.health <= 1) { hangState.hang = null; recorder.ui({ e: "letgo" }); return { action: d }; }   // your grip goes
  hangState.hang.hurtT = performance.now(); scorch();
  return undefined;
}
export function hangLetGo() { if (hangState.hang) recorder.ui({ e: "letgo" }); hangState.hang = null; }                                       // (pulled back: hangOut eases you back in the frame)
