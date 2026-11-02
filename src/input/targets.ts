// What a click or key means where you are: the 2D aim, the tool previewed, water and the sea, placing, the move a key makes.
import "../views/views";
import * as THREE from "three";
import { B, isSolid } from "../../js/world";
import { HOTBAR } from "../../js/hud";
import { pixelText } from "../../js/pixeltitle";
import { $, A, DIRV, sound } from "../core/shared";
import { camera } from "../render/scene";
import { world } from "../render/arm";
import { flat, game, keys, mobs, viewYaw } from "../core/game";
import { aimState, crossClick } from "./aim";
import { view2d } from "../looks/looks";
import { WALK, WALKABLE, reach } from "./pathing";
import { MINED, isTouch } from "./intent";
import { botDriving, locked } from "../ui/screens/screen";
import { arrowTurn, opt } from "../ui/screens/options";
import type { AimHit } from "../world/shapes";
import type { OneShot } from "../core/game";
import type { Pos } from "../core/types";

// this module's state that other modules set (one module can't assign another's let): saltyGoal
export interface Targets {
  /** The shore a click on the sea walks you to ([row, col]; null none). */
  saltyGoal: Pos | null;
}
export const targets = {} as Targets;

// the tile under the mouse in the 2D image (object-fit: contain, 16 px tiles, the player at row 4, column 5 of the 9 × 11 map)
export function aim2D(): AimHit | null {
  if (!aimState.pointer || !view2d.naturalWidth) return null;
  const s = Math.min(innerWidth / view2d.naturalWidth, innerHeight / view2d.naturalHeight), tile = 16 * s;
  const left = (innerWidth - view2d.naturalWidth * s) / 2, top = (innerHeight - view2d.naturalHeight * s) / 2;
  const col = Math.floor(((aimState.pointer.x + 1) / 2 * innerWidth - left) / tile), row = Math.floor(((1 - aimState.pointer.y) / 2 * innerHeight - top) / tile);
  if (row < 0 || row >= 9 || col < 0 || col >= 11) return null;
  const r = game.S!.pos[0] + row - 4, c = game.S!.pos[1] + col - 5;
  for (const [k, e] of mobs) if (Math.floor(e.to.z) === r && Math.floor(e.to.x) === c) return { r, c, mob: true, key: k, normal: null };
  return { r, c, floor: !isSolid(world.at(r, c)), normal: null };
}

export const dirTo = (r: number, c: number) => {
  const dr = r - game.S!.pos[0], dc = c - game.S!.pos[1];
  if (Math.abs(dr) + Math.abs(dc) !== 1) return 0;
  return dc === -1 ? 1 : dc === 1 ? 2 : dr === -1 ? 3 : 4;
};
// Preview the bump's tool (Gameplay, off by default; Pete): with Attack on bump and the Hand, Pickaxe or Sword slot in hand, the slot the
// next bump forward would use for what you face is picked already: the sword for a mob, the pickaxe for stone and ores, the hand for the
// rest (only tools you own, as the bump does). Every frame, on the tile the view faces (first person: where you look, not the way you
// last stepped; overhead and 3/4: the way you face), but only when that target changes: open ground changes nothing, the tool stays
// till something new to hit is in front of you, and a slot you pick yourself stays too (Pete)
export let previewAt = "";
export function previewTool() {
  if (!game.S || !opt.preview || !opt.bump || isTouch() || botDriving() || !HOTBAR[game.hud.sel].tool) { previewAt = ""; return; }
  const d = lookDir(); if (!DIRV[d]) return;
  const r = game.S.pos[0] + DIRV[d][0], c = game.S.pos[1] + DIRV[d][1], b = r >= 0 && c >= 0 && r < game.S.size[0] && c < game.S.size[1] ? game.S.map[r * game.S.size[1] + c] : undefined;
  const mob = [...mobs.values()].some((e) => Math.floor(e.to.z) === r && Math.floor(e.to.x) === c);
  if (!mob && (b === undefined || WALKABLE.has(b))) { previewAt = ""; return; }   // open ground: keep what's in hand
  let want = mob || ([B.NECROMANCER, B.NECROMANCER_VULNERABLE] as (number | undefined)[]).includes(b) ? "sword" : MINED.has(b as number) ? "pickaxe" : "hand";
  if (want !== "hand" && !(game.S.inventory[want as "sword" | "pickaxe"] > 0)) want = "hand";
  const key = `${r},${c},${want}`;
  if (key === previewAt) return;
  previewAt = key;
  const i = HOTBAR.findIndex((h) => h.tool === want);
  if (i >= 0 && i !== game.hud.sel) game.hud.select(i, true);
}
export function lookDir() {                                                        // the cardinal the camera faces (in 2D: the way you last moved)
  if (flat.on && game.S) return game.S.dir || 3;
  const fx = -Math.sin(game.yaw), fz = -Math.cos(game.yaw);
  return Math.abs(fx) > Math.abs(fz) ? (fx > 0 ? 2 : 1) : fz > 0 ? 4 : 3;
}
export const drinkable = (b: number) => b === B.WATER || b === B.FOUNTAIN;                 // a fountain's basin drinks as water does (Spam, Hold, Space)
export function waterDir() {                                                      // a neighbouring water tile or fountain, the one nearest the view first
  const look = lookDir();
  const order = [look, ...[1, 2, 3, 4].filter((d) => d !== look)];
  for (const d of order) if (drinkable(world.at(game.S!.pos[0] + DIRV[d][0], game.S!.pos[1] + DIRV[d][1]))) return d;
  return 0;
}
// the sea beyond the overworld's edge is drawn but not in the game. A click on it walks you to the shore nearest that point; you
// find out there (Pete): TOO SALTY! in big pixel letters that bob and wave at you, taunting
export let saltyT = 0; targets.saltyGoal = null;
export function seaClicked(): { done?: boolean; walk?: OneShot | null } | null {
  if (!game.S || game.S.level || !aimState.pointer || locked() || crossClick() || flat.mode === 1 && flat.t > 0.5) return null;
  const o = camera.position, d = new THREE.Vector3(aimState.pointer.x, aimState.pointer.y, 0.5).unproject(camera).sub(o).normalize();
  if (d.y >= -1e-6) return null;
  const t = (-0.15 - o.y) / d.y, x = o.x + d.x * t, z = o.z + d.z * t;     // where it meets the water's surface (world.ts LIQUID_TOP)
  if (x >= 0 && z >= 0 && x < world.W && z < world.H) return null;
  // the shore: the walkable tile nearest the edge point the click points at
  const r0 = THREE.MathUtils.clamp(Math.floor(z), 0, world.H - 1), c0 = THREE.MathUtils.clamp(Math.floor(x), 0, world.W - 1);
  let best: Pos | null = null, bd = 1e9;
  for (let r = r0 - 5; r <= r0 + 5; r++) for (let c = c0 - 5; c <= c0 + 5; c++) {
    if (!WALKABLE.has(world.at(r, c))) continue;
    const dd = (r - r0) ** 2 + (c - c0) ** 2;
    if (dd < bd) { bd = dd; best = [r, c]; }
  }
  if (!best || (best[0] === game.S.pos[0] && best[1] === game.S.pos[1])) { tooSalty(); return { done: true }; }
  targets.saltyGoal = best;
  return { walk: reach(best[0], best[1], WALK) };
}
export function tooSalty(splashed = false) {                                        // splashed: its splash already played (the dip at the edge)
  if (performance.now() < saltyT) return;
  saltyT = performance.now() + 3000;
  $("salty")?.remove();
  const el = document.createElement("div");
  el.id = "salty";
  [..."TOO SALTY!"].forEach((ch, i) => {
    if (ch === " ") { el.append(Object.assign(document.createElement("span"), { className: "gap" })); return; }
    const cv = document.createElement("canvas");
    cv.dataset.pixelSize = "6"; cv.dataset.pixelFlat = ""; cv.style.animationDelay = `${-i * 0.12}s`;
    pixelText(cv, ch); el.append(cv);
  });
  document.body.append(el);
  if (!splashed && game.S) sound.splash?.(game.S.pos[1] + 0.5, game.S.pos[0] + 0.5);   // never the hurt (Pete): the sea's splash, and the words
  setTimeout(() => el.remove(), 2800);
}
export function placeTarget(hit: AimHit | null): Pos | null {                                                 // where a click puts the selected block
  if (!hit || hit.mob) return null;
  let t: Pos = hit.floor ? [hit.r, hit.c]                                         // open ground, water, lava: on it (Craftax decides what is allowed)
    : hit.normal ? [hit.r + hit.normal[0], hit.c + hit.normal[1]]            // the side of a block: the tile in front of that side
    : Math.abs(game.S!.pos[0] - hit.r) >= Math.abs(game.S!.pos[1] - hit.c)                // its top: the tile on your side of it
      ? [hit.r + Math.sign(game.S!.pos[0] - hit.r), hit.c] : [hit.r, hit.c + Math.sign(game.S!.pos[1] - hit.c)];
  return t[0] === game.S!.pos[0] && t[1] === game.S!.pos[1] ? null : t;
}

// ---------- the tick: choose one Craftax action ----------
export function moveAction(turnOnly = false) {                                     // relative to the view; in 2D, W is up the screen
  if (!turnOnly && (keys.has("ShiftLeft") || keys.has("ShiftRight"))) return 0;   // Shift + a move key: a turn on the spot (keydown), no step
  const yw = viewYaw(), fx = -Math.sin(yw), fz = -Math.cos(yw), rx = -fz, rz = fx;
  let x = 0, z = 0;
  // overhead, the arrows walk too (unless they only turn: Settings → Gameplay); a turn on the spot reads them either way (Pete: with
  // Arrows set, the bird's-eye arrows did nothing, this left them out of the turn too)
  const k = (key: string, arrow: string) => keys.has(key) || (flat.on && (turnOnly || arrowTurn !== "arrows") && keys.has(arrow));
  if (k("KeyW", "ArrowUp")) { x += fx; z += fz; }
  if (k("KeyS", "ArrowDown")) { x -= fx; z -= fz; }
  if (k("KeyD", "ArrowRight")) { x += rx; z += rz; }
  if (k("KeyA", "ArrowLeft")) { x -= rx; z -= rz; }
  if (Math.hypot(x, z) < 0.1) return 0;
  return Math.abs(x) > Math.abs(z) ? (x > 0 ? A.RIGHT : A.LEFT) : z > 0 ? A.DOWN : A.UP;
}
