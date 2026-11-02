// Winter's zombies, dressed for the cold: a lumberjack's flannel shirt over their own, in a big red and black check (a few shades
// of red, by the creature's own number), ripped: a torn hem, a rip showing the shirt beneath, one sleeve torn
// short. About one in ten wears a red knit beanie, folded at the brim, with a pom-pom. Their skin a little bluer with the cold. Built
// on the game's own zombie, so it walks and reaches as before (the sleeves are on its arms).
import * as THREE from "three";
import { part } from "craftax-3d/plugin";

const SKIN = 0x5a9a48, COLD = 0x5a8f8a, WHITE = 0xffffff, SHIRT = 0x5a6a5a;
const HAT = 0xc0302a, BRIM = 0xa82822, POM = 0xf0ece0;
// the checks: [light, dark], all red and black, a few shades of red
const CHECKS: [string, string][] = [["#b02a22", "#1c1414"], ["#9a2420", "#1a1212"], ["#c03428", "#201616"]];

// a buffalo check, 16 × 16: squares of the color, of black, and where the two cross a dark mix of them; a little woven grain
const plaids = new Map<number, THREE.CanvasTexture>();
function plaid(k: number): THREE.CanvasTexture {
  let t = plaids.get(k);
  if (t) return t;
  const [light, dark] = CHECKS[k], c = document.createElement("canvas"); c.width = c.height = 16;
  const g = c.getContext("2d")!, mix = new THREE.Color(light).lerp(new THREE.Color(dark), 0.55).getStyle();
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const a = (x >> 2) & 1, b = (y >> 2) & 1;
    g.fillStyle = a && b ? dark : a || b ? mix : light;
    g.fillRect(x, y, 1, 1);
    if ((x + y) % 3 === 0) { g.fillStyle = "rgba(0,0,0,0.12)"; g.fillRect(x, y, 1, 1); }   // (the weave)
  }
  t = new THREE.CanvasTexture(c);
  t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  plaids.set(k, t);
  return t;
}

/** A zombie in a torn flannel shirt, now and then a red beanie (CreatureStyle.model for the zombie). who: the creature's own number. */
export function zombie(builtin: () => THREE.Group, who: number): THREE.Group {
  const m = builtin(), H = m.userData.head as THREE.Object3D, [A, B] = m.userData.arms as THREE.Object3D[];
  const { leg, torso, head, bw, body } = m.userData.dims as { leg: number; torso: number; head: number; bw: number; body: THREE.Object3D };
  for (const mat of m.userData.mats) if ((mat.userData.base as THREE.Color).getHex() === SKIN) { mat.userData.base.setHex(COLD); mat.uniforms.uColor.value.setHex(COLD); }   // (colder)
  // the flannel: its parts white, the check in their texture (part() takes the model's texture while it's set)
  const own = m.userData.tex;
  m.userData.tex = plaid((who >>> 3) % CHECKS.length);
  part(m, body, bw + 0.8, torso - 1, 4.8, WHITE, 0, leg + 1, 0);
  for (const [x, w] of [[-bw / 2 + 0.6, 1.2], [-1, 1.6], [bw / 2 - 1, 1.4]]) part(m, body, w, 1, 5, WHITE, x, leg + 0.3, 0);   // the torn hem
  for (const [arm, torn] of [[A, (who & 1) === 0], [B, (who & 1) === 1]] as const) part(m, arm, 4, torn ? torso * 0.5 : torso * 0.85, 4, WHITE, 0, 0, 0, { hang: true });   // sleeves, one torn short
  m.userData.tex = own;
  part(m, body, 2, 2.4, 0.3, SHIRT, -1.5, leg + torso * 0.45, 2.45);                              // a rip: the shirt showing
  if (who % 10 === 7) {                                               // one in ten: a red beanie, its brim folded, a pom-pom
    part(m, H, head + 0.8, 3, head + 0.8, HAT, 0, head - 1.6, 0);
    part(m, H, head + 1.2, 1.6, head + 1.2, BRIM, 0, head - 2.4, 0);
    part(m, H, 2.4, 2.4, 2.4, POM, 0, head + 1.2, 0);
  }
  return m;
}
