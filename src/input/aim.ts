// Aiming: what a click acts on (the crosshair or the mouse cursor).
import { playerPos } from "../render/entities";
import * as THREE from "three";
import { EYE } from "../core/shared";
import { camera } from "../render/scene";
import { world } from "../render/arm";
import { flat, game, mobs } from "../core/game";
import { aim2D } from "./targets";
import { isTouch } from "./intent";
import { locked } from "../ui/screens/screen";
import type { AimHit } from "../world/shapes";

// this module's state that other modules set (one module can't assign another's let): pointer, pointerMoveT
export interface AimState {
  /** The cursor in normalized device coordinates (null: not over the view yet). */
  pointer: { x: number; y: number } | null;
  /** When the mouse last moved (performance.now()). */
  pointerMoveT: number;
  /** When a finger last tapped the view (touch.ts; 0: none, or a finger down on it since). */
  tapT: number;
}
export const aimState = {} as AimState;

// ---------- aiming ----------
export const ray = new THREE.Vector3();
// what a click acts on: with pointer lock, what the crosshair is on; without it, what is under the mouse cursor
aimState.pointer = null;                                                          // the cursor in normalized device coordinates
aimState.pointerMoveT = 0;                                                        // when the mouse last moved (bird's-eye: a still cursor stops lighting, Pete)
aimState.tapT = 0;
export const IDLE_AIM_MS = 3000;
// Click at the crosshair (Settings → Gameplay → Click, Pete): in first person a click acts on what the crosshair is on, wherever the
// mouse is, captured or not; off unless switched on, remembered (a touch screen: a tap is always where it lands)
export let crossAim = true;                                                        // always, in first person (Pete): its Settings switch is hidden for now
export const crossClick = () => crossAim && !game.third && !flat.on && flat.t === 0 && !isTouch();
export function aim(center?: boolean): AimHit | null {                                                      // center: the crosshair's line, even with the mouse free
  if (!game.S) return null;
  if (flat.mode === 1 && flat.picture && flat.t > 0.5) return aim2D();          // over the 2D image; the overhead 3D world aims by ray
  const o = camera.position.clone(), free = !center && !crossClick() && !locked() && aimState.pointer;
  if (free) ray.set(free.x, free.y, 0.5).unproject(camera).sub(o).normalize();
  else {
    if (game.third) o.copy(playerPos(performance.now())).setY(EYE);
    ray.set(0, 0, -1).applyQuaternion(camera.quaternion);
  }
  const REACH = free || flat.on ? 80 : 40;                                   // far clicks walk you there
  let best: AimHit | null = world.raycast(o, ray, REACH, flat.t === 0);                     // overhead the trees shrink to a tile: trunks only
  if (best) best.y = o.y + ray.y * best.t!;                                   // where on it: which cube of a tall stack (cubeOf)
  // mobs: a 0.8-wide box at their drawn position, as tall as the model (2.1 at least: head to toe, a troll's whole height too); a click
  // or tap (not the crosshair) gets a looser one, 0.3 more each way
  const pad = free ? 0.3 : 0;
  for (const [k, e] of mobs) {
    const top = (e.model.userData.aimTop as number | undefined) ?? (e.model.userData.aimTop = Math.max(2.1, new THREE.Box3().setFromObject(e.model).max.y - e.model.position.y));
    const p = e.model.position, b = new THREE.Box3(new THREE.Vector3(p.x - 0.4 - pad, 0, p.z - 0.4 - pad), new THREE.Vector3(p.x + 0.4 + pad, top + pad, p.z + 0.4 + pad));
    const hit = new THREE.Ray(o, ray).intersectBox(b, new THREE.Vector3());
    if (hit) {
      const t = hit.distanceTo(o);
      if (t <= REACH && (!best || t < best.t!)) best = { r: Math.floor(e.to.z), c: Math.floor(e.to.x), t, mob: true, key: k, normal: null };
    }
  }
  // still no mob, a tap close to one on screen (within 36 px of its middle, as on a phone a fingertip is wide) takes it, unless a
  // block stands in front of it
  if (free && !(best && best.mob)) {
    let near: AimHit | null = null, nd = 36;
    for (const [k, e] of mobs) {
      const m = e.model.position.clone().setY(0.9), t = m.distanceTo(o);
      if (t > REACH || (best && !best.floor && best.t! < t - 0.5)) continue;
      const sp = m.clone().project(camera); if (sp.z > 1) continue;
      const dx = (sp.x - free.x) * innerWidth / 2, dy = (sp.y - free.y) * innerHeight / 2, dd = Math.hypot(dx, dy);
      if (dd < nd) { nd = dd; near = { r: Math.floor(e.to.z), c: Math.floor(e.to.x), t, mob: true, key: k, normal: null }; }
    }
    if (near) best = near;
  }
  if (best) best.point = o.clone().addScaledVector(ray, best.t!);
  return best;
}
