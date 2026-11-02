// Winter's cows are reindeer: the game's four-legged creature in a brown coat with dark legs, a pale chest and throat, a longer
// muzzle with a dark nose, and branching antlers. About one in ten (each its own, by the creature's number) has a glowing red nose: lit
// by itself, a soft halo pulsing round it, and lighting the night near it as a skeleton's eyes do.
import * as THREE from "three";
import { haloMaterial, part, quadruped, U } from "craftax-3d/plugin";

const COAT = 0x6e4a2e, LEGS = 0x3a2a1e, HEAD = 0x5e3e26, CHEST = 0xd8ccb4, NOSE = 0x1a1410, RED = 0xff2a1a, ANTLER = 0xc8b48c;
const MUZZLE = 3;                                                     // how far the muzzle stands out from the face, pixels

/** A reindeer (CreatureStyle.model for the cow). who: the creature's own number (one in ten has the red nose). */
export function reindeer(_builtin: () => THREE.Group, who: number): THREE.Group {
  const m = quadruped({ body: COAT, leg: LEGS, head: HEAD, snout: HEAD }), H = m.userData.head as THREE.Object3D;
  part(m, m, 8, 6, 0.4, CHEST, 0, 9, 8.1); part(m, H, 6, 2, 0.4, CHEST, 0, 0, 3.1);                 // the pale chest and throat
  part(m, H, 4, 3, MUZZLE, HEAD, 0, 0.3, 3 + MUZZLE / 2);                                          // the muzzle
  const red = who % 10 === 3;
  part(m, H, 3, 2, 1, red ? RED : NOSE, 0, 1.4, 3 + MUZZLE + 0.5, { glow: red });                 // its nose at the tip
  for (const s of [-1, 1]) {                                          // a beam up from each side of the head, tines off it, a fork at the top
    part(m, H, 1, 7, 1, ANTLER, 2.5 * s, 7, -1);
    part(m, H, 3, 1, 1, ANTLER, 4 * s, 10, -1); part(m, H, 1, 1, 3, ANTLER, 2.5 * s, 12, 0.5);
    part(m, H, 2, 1, 1, ANTLER, 3.5 * s, 14, -1); part(m, H, 1, 2, 1, ANTLER, 4.5 * s, 14, -1);
  }
  if (red) {                                                          // the glow: a halo, pulsing, and the point the night is lit from
    const halo = new THREE.Sprite(haloMaterial(RED)), size = 5 * U, ph = (who % 628) / 100;
    halo.position.set(0, 2.4 * U, (3 + MUZZLE + 1.4) * U); halo.scale.setScalar(size); halo.renderOrder = 2;
    halo.onBeforeRender = () => halo.scale.setScalar(size * (0.85 + 0.15 * Math.sin(performance.now() / 450 + ph)));
    H.add(halo);
    m.userData.eyeAt = halo;
    for (const mat of m.userData.mats) mat.uniforms.uEyeK.value = 0;  // (its own glow doesn't light its own face)
  }
  return m;
}
