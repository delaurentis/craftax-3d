// The Necromancer's effects each frame; where creatures are looked at, the sleeping pose.
import { hitState, necroGlow, shieldHitT } from "./hits";
import * as THREE from "three";
import { B, isSolid } from "../../js/world";
import { shared } from "../../js/shading";
import { camera, scene } from "../render/scene";
import { world } from "../render/arm";
import { game } from "../core/game";
import { victory } from "./victory";
import { inkLook, lookState } from "../looks/looks";

/** Asleep: which way you lie, and slumped against a wall (no open tile behind). */
export interface SleepPose { yaw: number; slump: boolean }
// this module's state that other modules set (one module can't assign another's let): followDir, ladderFor, sleepPose
export interface Necro {
  /** The facing the camera last followed while watching (frame.ts); null none yet. */
  followDir: number | null;
  /** The floor ("level:seed") the lit ladder up was found for. */
  ladderFor: string;
  sleepPose: SleepPose | null;
}
export const necro = {} as Necro;

export function necroFx(now: number) {
  const n = world.props.children.find((m) => /^necromancer/.test(m.userData.kind || ""));
  if (n) {
    n.userData.home ??= n.position.clone();
    const q = hitState.bossHitT ? 1 - Math.min(1, (now - hitState.bossHitT) / 900) : 0;
    n.position.copy(n.userData.home);
    if (q > 0) { n.position.x += (Math.random() - 0.5) * 0.18 * q; n.position.z += (Math.random() - 0.5) * 0.18 * q; n.position.y += Math.random() * 0.06 * q; }
  }
  if (victory.victorySeed !== null && game.S && victory.victorySeed === game.S.seed) {                // beaten: whatever the world rebuilds of him stays hidden (he's dust)
    for (const m of world.props.children) if (/^necromancer/.test(m.userData.kind || "")) m.visible = false;
    if (hitState.necroShield) hitState.necroShield.visible = false;
    shared.uNecroL.value.w = 0;
    return;
  }
  const on = !!n && n.userData.kind === "necromancer";                       // protected (the pale one can be hit: no shield)
  if (!hitState.necroShield && on) {
    // a soft purple glow (Pete: just a glow, no cage): a camera-facing sprite, a radial fade from a bright violet heart to nothing
    const cv = document.createElement("canvas"); cv.width = cv.height = 128;
    const g = cv.getContext("2d")!, grd = g.createRadialGradient(64, 64, 4, 64, 64, 64);
    grd.addColorStop(0, "rgba(200,120,255,0.95)"); grd.addColorStop(0.35, "rgba(150,60,255,0.55)"); grd.addColorStop(0.7, "rgba(110,30,220,0.18)"); grd.addColorStop(1, "rgba(90,20,200,0)");
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    // an upright card that turns to face you round the vertical only (a sprite tips back with a raised view, and its tilted lower half
    // reached out through you standing in front of him: Pete saw it on the back of his head)
    hitState.necroShield = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    hitState.necroShield.renderOrder = 3;
    scene.add(hitState.necroShield);
  }
  if (!on) shared.uNecroL.value.w = 0;
  const shield = hitState.necroShield;
  if (!shield) return;
  shield.visible = on;
  if (!on || !n) return;
  const b = 0.5 + 0.5 * Math.sin(now / 420);
  const f = shieldHitT ? Math.max(0, 1 - (now - shieldHitT) / 700) : 0;      // a blow: it flares, bigger and far brighter, then settles
  // centred on his body (Pete: it sat off to one side): the middle of his drawn bounds, found once, not his tile's corner or his staff
  if (!n.userData.mid) { const bb = new THREE.Box3().setFromObject(n), c = bb.getCenter(new THREE.Vector3()); n.userData.mid = { x: c.x - n.position.x, z: c.z - n.position.z, h: bb.max.y - bb.min.y }; }
  const mx = n.userData.home.x + n.userData.mid.x * 0.5, mz = n.userData.home.z + n.userData.mid.z * 0.5;   // (half: the staff pulls the box)
  // a halo round all of him, feet to hat, and he a darkness inside it (Pete): he is drawn after the glow (his meshes in the
  // transparent pass, later than it, fully opaque), so his body covers it and it shows only round his outline
  // Laser and phosphor (Pete: the screen went black): those looks write surface ids and distances into the colour and alpha, and a
  // blended (transparent-pass) body or an additive glow over them corrupts that; there he stays opaque and the halo is off
  const over = !lookState.lines;
  if (over) necroGlow(n, 0);                                                 // (colour: his own look)
  if (n.userData.overGlow !== over) {
    n.userData.overGlow = over;
    n.traverse((obj) => { const o = obj as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>; if (o.isMesh && o.material?.uniforms) { o.renderOrder = over ? 4 : 0; o.material.transparent = over; o.material.depthWrite = true; o.material.needsUpdate = true; } });
  }
  if (!over) {                                                               // (Pete: in phosphor it was blinding) no halo; phosphor
    shield.visible = false;                                             // draws real light, so a pool of it stays there
    const fl = Math.max(shieldHitT ? 1 - (now - shieldHitT) / 700 : 0, hitState.bossHitT ? 1 - (now - hitState.bossHitT) / 900 : 0, 0);
    // phosphor (Pete: his field there all the time, and he almost white with it, blazing white when hit): his body itself glows,
    // steady, and the pool round him is strong and steady, both flaring on a blow
    const ni = inkLook().necro;                                                // (a look without: he stays dark, no pool)
    shared.uNecroL.value.set(n.userData.home.x, 0.7, n.userData.home.z, ni ? ni.light * (1 + 2 * fl) : 0);
    necroGlow(n, ni ? ni.glow + ni.flare * fl : 0);
    return;
  }
  // upright through his middle, a touch behind it: nothing standing in front of him passes through it, and the floor can't hide it
  const away = new THREE.Vector3(mx - camera.position.x, 0, mz - camera.position.z).normalize().multiplyScalar(0.15);
  const w = (3.0 + 0.2 * b) * (1 + 0.45 * f), h = (3.9 + 0.25 * b) * (1 + 0.45 * f);
  shield.position.set(mx + away.x, h / 2 - 0.1, mz + away.z);
  shield.rotation.set(0, Math.atan2(camera.position.x - mx, camera.position.z - mz), 0);
  shield.scale.set(w, h, 1);
  shield.material.opacity = Math.min(1, 0.45 + 0.3 * b + 0.6 * f);
  shield.material.color.setScalar(1 + 2.2 * f * f);
  // its light on the floor round him (shading.ts uNecroL), a steady violet pool that floods out much brighter on a blow
  shared.uNecroL.value.set(mx, 0.7, mz, (1.5 + 0.6 * b) * (1 + 4 * f));
}
export const MOB_LOOK: Record<string, number> = { cow: 0.7, snail: 0.35, bat: 1.1, gnome_warrior: 0.9, gnome_archer: 0.9, kobold: 1.0 };   // where to look on a short mob
necro.followDir = null;
necro.ladderFor = "";
// asleep: which way to lie. The body lies back from the feet into the tile behind, so that tile must be open (not a block, water or
// lava): your own facing first, then a quarter turn either way, then about. None open: slump against one of the walls
necro.sleepPose = null;
export const poseBox = new THREE.Box3();
export function poseFor(cur: number): SleepPose {
  const base = Math.round(cur / (Math.PI / 2)) * (Math.PI / 2);
  const blocked = (ph: number) => {
    const r = game.S!.pos[0] + Math.round(-Math.cos(ph)), c = game.S!.pos[1] + Math.round(-Math.sin(ph)), b = world.at(r, c);
    return isSolid(b) || b === B.WATER || b === B.LAVA;
  };
  const turns = [0, Math.PI / 2, -Math.PI / 2, Math.PI].map((t) => base + t);
  const free = turns.find((ph) => !blocked(ph));
  return free !== undefined ? { yaw: free, slump: false } : { yaw: turns.find(blocked) ?? base, slump: true };
}
