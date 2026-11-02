// The camera each frame: first or third person, the 2D and 3/4 flights, quakes and jolts, the arm.
import "../render/player-pose";
import * as THREE from "three";
import { CEIL } from "../../js/world";
import { shared } from "../../js/shading";
import { $, DIRV, EYE } from "../core/shared";
import { memoryFrame } from "./memory";
import { camera } from "../render/scene";
import { eyeBack } from "../render/quality";
import { arm, armMat, knuckle, sleeve, tool, world } from "../render/arm";
import { hangState } from "../effects/hang";
import { flat, game } from "../core/game";
import { QUAKE_MS, necroQuakeT, portalDive, victory } from "../effects/victory";
import { DIVE_MS, dropFx, tunnel, tunnelCam, tunnelState } from "../effects/tunnel";
import { aimState } from "../input/aim";
import { QUARTER_Q, TOP_Q, qEuler, qPos, qQuat, topPos, view2d } from "../looks/looks";
import { blocked, renderState, treeBlocks } from "../looks/render";
import { birdDist, birdSwing, pointerState } from "../input/pointer";
import { lookTouch } from "../input/touch";
import { hitState, reelView } from "../effects/hits";

/** What frame() knows about you this frame (core/frame): underground, the climb's lift, the walk's bob, sinking in lava, a fall,
 * lying asleep (0..1), the opening's circling, and the light at a point. */
export interface CameraPose {
  under: boolean; climbY: number; bob: number; melt: number; fall: number; lie: number; opening: boolean;
  lightAt(x: number, z: number): number;
}
// frame(), the camera: first or third person, the eye in a fall or the lava, the 2D and 3/4 flights, the quakes and jolts, the arm
export function placeCamera(now: number, dt: number, p: THREE.Vector3, { under, climbY, bob, melt, fall, lie, opening, lightAt }: CameraPose) {
  if (game.third) {
    const back = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion).multiplyScalar(4);
    camera.position.copy(p).setY(EYE + climbY).add(back);
    camera.position.y = Math.min(camera.position.y, under ? CEIL - 0.2 : 50);
  } else camera.position.set(p.x + Math.sin(game.yaw) * eyeBack(), EYE + bob + climbY, p.z + Math.cos(game.yaw) * eyeBack());   // a little back in the tile (Field of view)
  if (hangState.hangOut > 0.01 && !game.S!.done && !game.third && flat.t === 0 && DIRV[hangState.teeterDir]) {   // first person, hanging: the eye out over the lava, swaying
    const out = hangState.hangOut, sway = Math.sin(now / 95) * 0.04 * out;
    camera.position.x += DIRV[hangState.teeterDir][1] * (0.35 * out + sway); camera.position.z += DIRV[hangState.teeterDir][0] * (0.35 * out + sway); camera.position.y -= 0.18 * out;
  }
  if (melt && !game.third && flat.t === 0) camera.position.y = EYE + (0.12 - EYE) * THREE.MathUtils.smootherstep(Math.min(1, melt / 0.7), 0, 1);   // first person: the eye sinks to the lava's skin, in the fire
  if ((fall || lie) && !game.third && flat.t === 0) {                           // first person: the eye drops back to the ground, looking up
    const k = Math.max(fall, lie), roll = fall ? 0.3 * fall : 0.08 * lie;  // asleep: lying straight, a little head tilt
    camera.position.x += Math.sin(game.yaw) * 1.1 * k; camera.position.z += Math.cos(game.yaw) * 1.1 * k;
    camera.position.y = EYE + (0.28 - EYE) * k;
    camera.rotation.set(game.pitch + (1.25 - game.pitch) * k, game.yaw, roll);
  }
  // 2D switch: fly up to straight overhead, framed like Craftax's image (13 rows tall with the inventory, the player 2 rows above
  // its centre, north up), then fade the image in; the reverse on the way back
  flat.t = THREE.MathUtils.clamp(flat.t + (flat.on ? dt : -dt) / 1.1, 0, 1);
  // overhead, a tree is one tile: the full-size trees shrink toward that size as the camera rises, on the camera's own easing (u
  // below), so they land as it does (Pete: they shrank after it, then jumped); halfway they swap for the overhead trees scaled up to
  // the same size, which go on shrinking to their own (shading.ts aGrow 2), and back the other way on the way down
  if ((flat.t > 0.4) !== world.flat) world.setFlat(flat.t > 0.4);
  { const g = THREE.MathUtils.smootherstep(flat.t, 0, 0.8); shared.uShrink.value.set(1 - 0.5 * g, 1 - 0.45 * g); }
  // (k: 1 on the 3/4 path, 0 overhead: only the classic 2D view goes overhead; first person ↔ 3/4 stays on the orbit, below)
  // (first person holds k on the way down, so a descent from overhead stays overhead's; from first person, k starts where it's going)
  flat.k = flat.t === 0 ? (flat.mode === 1 ? 0 : 1) : flat.mode === 0 ? flat.k : THREE.MathUtils.clamp(flat.k + (flat.mode === 2 ? dt : -dt) / 0.9, 0, 1);
  if (flat.t > 0) {
    const u = THREE.MathUtils.smootherstep(flat.t, 0, 0.8), k = THREE.MathUtils.smootherstep(flat.k, 0, 1);
    topPos.set(p.x, 6.5 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), p.z + 2);
    // 3/4: up and behind you on the orbit (heading flat.orbit, 0 = south of you looking north), looking down at flat.el; when a wall
    // stands between the camera and you, it lifts toward overhead just enough to see you (eased), and settles back once clear
    const D = renderState.camD ?? (innerWidth > innerHeight && innerHeight <= 520 ? 7.4 : 9.2) * birdDist;   // a phone on its side: a little closer (upright is right as it is); Settings: Camera distance
    if (flat.mode === 2) {
      // a tree hiding you: swing round the orbit to the nearest heading with a clear view (a wall still lifts the camera, below)
      if (birdSwing && flat.orbitGoal == null && !lookTouch && !pointerState.press && treeBlocks(p, flat.el, flat.orbit, D)) {   // (Settings: Swing round trees)
        // (the opening's circling: only on round, ahead past the tree; swinging back each frame fought the circling, Pete)
        for (const off of opening ? [0.35, 0.7, 1.05, 1.4, 1.75] : [0.35, -0.35, 0.7, -0.7, 1.05, -1.05, 1.4, -1.4, 1.75, -1.75]) {
          if (!treeBlocks(p, flat.el, flat.orbit + off, D)) { flat.orbitGoal = flat.orbit + off; break; }
        }
      }
      if (flat.orbitGoal != null) {
        flat.orbit += (flat.orbitGoal - flat.orbit) * Math.min(1, dt * 3);
        if (Math.abs(flat.orbitGoal - flat.orbit) < 0.01) flat.orbitGoal = null;
      }
      let need = 0;
      for (const lift of [0, 0.12, 0.25, 0.38, 0.52, 0.66, 0.8, 1.0, 1.2]) {
        need = Math.min(lift, 1.45 - flat.el);
        if (!blocked(p, flat.el + need, flat.orbit, D)) break;
      }
      flat.lift = (flat.lift || 0) + (need - (flat.lift || 0)) * Math.min(1, dt * (need > (flat.lift || 0) ? 6 : 2));
    } else flat.lift = 0;
    const el = flat.el + (flat.lift || 0), ce = Math.cos(el);
    topPos.lerp(qPos.set(p.x + Math.sin(flat.orbit) * ce * D, 0.5 + Math.sin(el) * D, p.z + Math.cos(flat.orbit) * ce * D), k);
    QUARTER_Q.setFromEuler(qEuler.set(-el, flat.orbit, 0));
    if (k > 0.999 && u < 1) {
      // first person ↔ 3/4 (Pete: it went up overhead and back down): along the orbit itself, the heading turning from your eyes' to
      // the orbit's as the camera backs out and rises (or closes in and drops): from behind you it glides straight into your eyes,
      // from in front it swings round as it comes
      const fx = camera.rotation.x, fz = camera.rotation.z, fy = camera.rotation.y;
      const o = fy + Math.atan2(Math.sin(flat.orbit - fy), Math.cos(flat.orbit - fy)) * u, e = el * u, d = D * u, cd = Math.cos(e);
      camera.position.lerp(qPos.set(p.x, 0.5, p.z), u).add(qPos.set(Math.sin(o) * cd * d, Math.sin(e) * d, Math.cos(o) * cd * d));
      camera.quaternion.setFromEuler(qEuler.set(fx + (-el - fx) * u, o, fz * (1 - u)));
    } else {
      camera.position.lerp(topPos, u);
      camera.quaternion.slerp(qQuat.slerpQuaternions(TOP_Q, QUARTER_Q, k), u);
    }
  }
  flat.img = THREE.MathUtils.clamp(flat.img + (flat.mode === 1 && flat.picture && flat.t > 0.7 ? dt : -dt) / 0.3, 0, 1);
  view2d.classList.toggle("solid", flat.mode === 1 && flat.picture > 0);       // the original art hides the 3D world entirely
  // the memory strip, down both sides of the 2D image, when a plugin draws one (src/views/memory.ts; original art: white on black, laser: red)
  const memShow = flat.mode === 1 && flat.picture > 0 && flat.img > 0.5 && view2d.naturalWidth > 0;
  const memSc = memShow ? Math.min(innerWidth / view2d.naturalWidth, innerHeight / view2d.naturalHeight) : 0;
  memoryFrame(memShow, memShow ? (innerWidth - view2d.naturalWidth * memSc) / 2 : 0, flat.picture === 2, now);
  view2d.style.opacity = String(flat.img);
  // the original art: a faint highlight on the tile under the mouse (the same tile a click acts on, see aim2D)
  const hov = $("hover2d")!, art2dOn = flat.mode === 1 && flat.picture > 0 && flat.img > 0.5 && aimState.pointer && view2d.naturalWidth && game.S;
  if (art2dOn) {
    const sc = Math.min(innerWidth / view2d.naturalWidth, innerHeight / view2d.naturalHeight), tile = 16 * sc;
    const left = (innerWidth - view2d.naturalWidth * sc) / 2, top = (innerHeight - view2d.naturalHeight * sc) / 2;
    const col = Math.floor(((aimState.pointer!.x + 1) / 2 * innerWidth - left) / tile), row = Math.floor(((1 - aimState.pointer!.y) / 2 * innerHeight - top) / tile);   // (art2dOn: a pointer)
    const show = row >= 0 && row < 9 && col >= 0 && col < 11 && !(row === 4 && col === 5);
    hov.style.display = show ? "block" : "none";
    if (show) Object.assign(hov.style, { left: left + col * tile + "px", top: top + row * tile + "px", width: tile + "px", height: tile + "px" });
  } else hov.style.display = "none";
  $("bars")!.style.visibility = flat.mode === 1 && flat.picture === 2 && flat.img > 0.5 ? "hidden" : "";   // the red frame draws its own bars
  arm.visible = !game.third && flat.t === 0;
  if (hitState.playerStag && hitState.playerStag.kick && now - hitState.playerStag.t < hitState.playerStag.ms && flat.t === 0) {   // shot: the head snaps back and tilts
    const u = (now - hitState.playerStag.t) / hitState.playerStag.ms, k = Math.sin(Math.min(1, u * 1.6) * Math.PI) * (1 - u);
    camera.rotateX(0.16 * k); camera.rotateZ(0.08 * k * (hitState.playerStag.dx >= 0 ? 1 : -1));
  }
  let quake = hitState.bossHitT ? 1 - Math.min(1, (now - hitState.bossHitT) / 900) : 0;       // the Necromancer hit: the whole view quakes, longer and harder
  if (necroQuakeT && now - necroQuakeT < QUAKE_MS) quake = Math.max(quake, 0.85 * Math.min(1, (QUAKE_MS - (now - necroQuakeT)) / 600));   // his death: on and on, then dying away
  if (quake > 0) {
    const a = 0.24 * quake * quake;
    camera.position.x += (Math.random() - 0.5) * a; camera.position.y += (Math.random() - 0.5) * a; camera.position.z += (Math.random() - 0.5) * a;
    camera.rotateZ((Math.random() - 0.5) * a * 0.5);
  }
  if (portalDive && victory.portal) {                                                // walking into the portal: the camera glides into its face
    const k = THREE.MathUtils.smootherstep(Math.min(1, (now - portalDive.t0) / DIVE_MS), 0, 1);
    const face = victory.portal.localToWorld(new THREE.Vector3(0, 2, 0));
    portalDive.from ??= { p: camera.position.clone(), q: camera.quaternion.clone() };
    // straight on toward its face from wherever you came (a camera: lookAt points its -z; a plain Object3D's +z had the view spin
    // round 180 degrees, Pete)
    const look = new THREE.PerspectiveCamera(); look.position.copy(portalDive.from.p); look.lookAt(face);
    camera.position.lerpVectors(portalDive.from.p, face, k * 0.92);
    camera.quaternion.slerpQuaternions(portalDive.from.q, look.quaternion, Math.min(1, k * 1.6));
  }
  if (tunnel) tunnelCam(now);
  if (tunnelState.spawnDrop) dropFx(now);
  const jolt = hitState.shakeT ? 1 - Math.min(1, (now - hitState.shakeT) / 320) : 0;          // hit: a short jolt of the camera, fading out
  if (jolt > 0) {
    const a = 0.07 * jolt * jolt;
    camera.position.x += (Math.random() - 0.5) * a; camera.position.y += (Math.random() - 0.5) * a; camera.position.z += (Math.random() - 0.5) * a;
    camera.rotateZ((Math.random() - 0.5) * a * 0.6);
  }
  reelView(now);
  for (const m of [armMat, sleeve, knuckle, ...(tool.userData.mats || [])]) m.uniforms.uVisU.value = lightAt(p.x, p.z);   // (the tool's own list: its meshes sit in a group, Pete: it froze)
  const sw = hangState.swingT > 0 ? Math.min(1, (now - hangState.swingT) / 220) : 1;
  arm.rotation.x = 0.25 - Math.sin(sw * Math.PI) * 0.9;
  arm.position.y = -0.3 + bob * 0.5;
}
