// Blocky mob, player and projectile models (boxes only), with walk / flap animation and per-mob light.
import * as THREE from "three";
import { makeMaterial } from "./shading";
import { themeTint, themedModel } from "../src/themes/creatures";
import { onScreen } from "../src/themes/state";
import type { Theme } from "../src/themes/types";

export const U = 1 / 16;                                                   // one texture "pixel"
const boxGeo = new Map<string, THREE.BoxGeometry>();
function geo(w: number, h: number, d: number) {
  const k = `${w},${h},${d}`;
  if (!boxGeo.has(k)) boxGeo.set(k, new THREE.BoxGeometry(w * U, h * U, d * U));
  return boxGeo.get(k)!;
}

// pixel noise multiplied into a part's colour: fine for most mobs, grime (blotches, dark specks) for zombies
function noiseTex(seed: number, blotch: boolean) {
  const c = document.createElement("canvas"); c.width = c.height = 16;
  const g = c.getContext("2d")!;
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    let v = 0.86 + rnd() * 0.14;
    if (blotch && rnd() < 0.06) v = 0.45 + rnd() * 0.15;                // specks of rot
    const k = Math.round(255 * v);
    g.fillStyle = `rgb(${k},${k},${k})`; g.fillRect(x, y, 1, 1);
  }
  if (blotch) for (let i = 0; i < 4; i++) {                               // a few darker patches
    g.fillStyle = "rgba(0,0,0,0.22)"; g.fillRect(Math.floor(rnd() * 12), Math.floor(rnd() * 12), 2 + Math.floor(rnd() * 4), 2 + Math.floor(rnd() * 3));
  }
  const t = new THREE.CanvasTexture(c);
  t.magFilter = THREE.NearestFilter; t.minFilter = THREE.NearestFilter;
  return t;
}
const FINE = noiseTex(7, false), GRIME = noiseTex(31, true);
export const FINE_TEX = FINE;                                        // (main.ts: the first-person arm's skin and sleeve)

type Color = THREE.ColorRepresentation;
/** A part of a creature's model (exported for a theme's own parts): a box w×h×d pixels, its pivot (its bottom's middle, or its top's
 *  if opts.hang) at (x, y, z) pixels in parent, shaded like every creature (lit, hurt, laser) through model.userData.mats. glow: lit
 *  by itself. Returns its pivot, to hang more parts on. */
export function part(model: THREE.Object3D, parent: THREE.Object3D, w: number, h: number, d: number, color: Color, x: number, y: number, z: number, opts: { glow?: boolean; hang?: boolean } = {}) {
  const mat = makeMaterial(opts.glow ? "mobGlow" : "mob", { color, map: model.userData.tex || FINE });
  mat.userData.base = new THREE.Color(color);
  mat.userData.glow = !!opts.glow;
  model.userData.mats.push(mat);
  const m = new THREE.Mesh(geo(w, h, d), mat);
  const pivot = new THREE.Group();
  pivot.position.set(x * U, y * U, z * U);
  m.position.set(0, opts.hang ? -h * U / 2 : h * U / 2, 0);
  pivot.add(m);
  parent.add(pivot);
  return pivot;
}
// a red-hot glow sprite: one radial gradient texture, tinted per eye colour, added onto whatever is behind it
let haloTex: THREE.CanvasTexture | null = null;
const haloMats = new Map<Color, THREE.SpriteMaterial>();
/** A soft glow's sprite material in this color (a skeleton's eyes; a theme's own glowing part). */
export function haloMaterial(color: Color) {
  if (!haloTex) {
    const c = document.createElement("canvas"); c.width = c.height = 64;
    const g = c.getContext("2d")!, r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, "rgba(255,255,255,1)"); r.addColorStop(0.18, "rgba(255,255,255,0.55)"); r.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = r; g.fillRect(0, 0, 64, 64);
    haloTex = new THREE.CanvasTexture(c);
  }
  if (!haloMats.has(color)) haloMats.set(color, new THREE.SpriteMaterial({ map: haloTex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  return haloMats.get(color)!;
}
function eyes(model: THREE.Object3D, head: THREE.Object3D, w: number, y: number, z: number, color: Color = 0x111111, glow = false, gap = 2, size = 1.2) {
  part(model, head, size, size, 0.4, color, -gap, y, z, { glow });
  part(model, head, size, size, 0.4, color, gap, y, z, { glow });
}

// humanoid: proportions in pixels (8 head, 12 body, 12 legs)
/** A humanoid's look: colors (hex), proportions in pixels, and the extras it wears or carries. */
interface HumanoidLook {
  skin: number; shirt: number; legs: number; arms?: number; scale?: number; leg?: number; torso?: number; head?: number; bw?: number;
  zombie?: boolean; ribs?: boolean; skull?: boolean; eye?: number; eyeGlow?: boolean; eyeLight?: boolean; hat?: number; hat2?: boolean;
  hair?: number; horns?: number; tusks?: boolean; knight?: "sword" | "bow"; robe?: number; beard?: number; tail?: boolean; held?: number; float?: boolean;
}
function humanoid(p: HumanoidLook) {
  const s = p.scale || 1, model = new THREE.Group(), body = new THREE.Group();
  model.userData = { mats: [], limbs: [], tex: p.zombie ? GRIME : FINE };
  model.add(body);
  body.scale.setScalar(s);
  const leg = p.leg ?? 12, torso = p.torso ?? 12, head = p.head ?? 8, bw = p.bw ?? 8;
  const L = part(model, body, 4, leg, 4, p.legs, -2, leg, 0, { hang: true }), R = part(model, body, 4, leg, 4, p.legs, 2, leg, 0, { hang: true });
  if (p.ribs) {                                                      // a ribcage you can see through: spine, pelvis, rib hoops
    part(model, body, 2, torso, 1.6, p.shirt, 0, leg, -1.2);                                    // the spine, at the back
    part(model, body, bw, 2, 3.2, p.shirt, 0, leg, 0);                                          // the pelvis
    for (let i = 0; i < 4; i++) part(model, body, bw - (i === 0 ? 1 : 0), 1.2, 4, p.shirt, 0, leg + 4 + i * 2, 0);   // ribs (the lowest a little shorter)
    part(model, body, bw + 1, 1.6, 3.6, p.shirt, 0, leg + torso - 1.6, 0);                      // the collarbone across the shoulders
  } else part(model, body, bw, torso, 4, p.shirt, 0, leg, 0);
  const A = part(model, body, 3.5, torso, 3.5, p.arms ?? p.skin, -(bw / 2 + 1.75), leg + torso, 0, { hang: true });
  const B = part(model, body, 3.5, torso, 3.5, p.arms ?? p.skin, bw / 2 + 1.75, leg + torso, 0, { hang: true });
  const H = part(model, body, head, head, head, p.skin, 0, leg + torso, 0);
  if (p.zombie) {                                                    // sunken, shadowed eye sockets and a gaping mouth
    part(model, H, 2.6, 2, 0.3, 0x24361c, -head / 4, head * 0.4, head / 2 + 0.1); part(model, H, 2.6, 2, 0.3, 0x24361c, head / 4, head * 0.4, head / 2 + 0.1);
    part(model, H, 4, 1.4, 0.3, 0x1a0f0c, 0, head * 0.12, head / 2 + 0.1);
  }
  if (p.skull) {                                                     // a skull: deep sockets, a nose hole, a row of teeth over a jaw line
    part(model, H, 2.8, 2.4, 0.3, 0x1a1a1a, -head / 4, head * 0.38, head / 2 + 0.1); part(model, H, 2.8, 2.4, 0.3, 0x1a1a1a, head / 4, head * 0.38, head / 2 + 0.1);
    part(model, H, 1.2, 1.2, 0.3, 0x2a2a2a, 0, head * 0.28, head / 2 + 0.1);
    part(model, H, 5.6, 1.6, 0.3, 0x222222, 0, head * 0.06, head / 2 + 0.1);            // the mouth, dark behind the teeth
    for (let i = 0; i < 5; i++) part(model, H, 0.8, 1.2, 0.35, 0xf2f0e4, -2.2 + i * 1.1, head * 0.07, head / 2 + 0.15);
    part(model, H, 6, 0.4, 0.3, 0x9a9a92, 0, head * 0.02, head / 2 + 0.12);              // the jaw line
  }
  eyes(model, H, head, head * 0.45, head / 2 + 0.2, p.eye ?? 0x111111, !!p.eyeGlow, head / 4);
  if (p.eyeLight) {                                                  // eyes that cast light: a soft halo, and the point main.ts lights from
    const halo = new THREE.Sprite(haloMaterial(p.eye!));
    halo.position.set(0, head * 0.45 * U, (head / 2 + 1.2) * U);
    halo.scale.setScalar(head * 1.5 * U);
    halo.renderOrder = 2;
    H.add(halo);
    model.userData.eyeAt = halo;
    for (const m of model.userData.mats) m.uniforms.uEyeK.value = 0;    // its own eyes don't light its own face
  }
  if (p.hat) part(model, H, head + 1, 3, head + 1, p.hat, 0, head - 0.5, 0);
  if (p.hair) {                                                      // hair, so you can tell the back of the head from the face (Pete): a
    const o = head / 2 + 0.2, ear = new THREE.Color(p.skin).multiplyScalar(0.85).getHex();   // thatch on top, down the back to below the
    part(model, H, head + 0.8, 1.4, head + 0.8, p.hair, 0, head - 0.6, 0);                   // ears, over the sides above them, and behind
    part(model, H, head + 0.8, head - 3, 0.8, p.hair, 0, 3, -o);                              // each ear; the ears in the gap left for them
    for (const sx of [-1, 1]) {
      part(model, H, 0.8, 2.4, head + 0.8, p.hair, sx * o, head - 2.4, 0);
      part(model, H, 0.8, 2.6, 2.6, p.hair, sx * o, 3, -head / 2 + 1.1);
      part(model, H, 0.6, 2, 1.4, ear, sx * o, 3.3, -0.6);
    }
  }
  if (p.hat2) part(model, H, 3, 4, 3, p.hat!, 0, head + 2, 0);
  if (p.horns) { part(model, H, 1.5, 4, 1.5, p.horns, -head / 2, head - 1, 0); part(model, H, 1.5, 4, 1.5, p.horns, head / 2, head - 1, 0); }
  if (p.tusks) {                                             // an underbite jaw, a heavy brow, and two tusks curving up out of the jaw
    const jaw = new THREE.Color(p.skin).multiplyScalar(0.72).getHex();
    part(model, H, head - 1.5, 2.2, 2, jaw, 0, -0.4, head / 2 + 0.6);
    part(model, H, head + 0.6, 1.3, 1.2, jaw, 0, head * 0.6, head / 2 + 0.25);
    for (const sx of [-1, 1]) {
      const base = part(model, H, 1.2, 1.7, 1.2, 0xf2e8c8, sx * 1.7, -0.6, head / 2 + 1.5);
      base.rotation.set(-0.25, 0, sx * -0.18);                   // out of the jaw, leaning forward and out
      part(model, base, 0.9, 1.5, 0.9, 0xfff6dc, 0, 1.6, 0).rotation.set(0.6, 0, 0);    // the tip hooks up and back
    }
  }
  if (p.knight) {                                           // as Craftax draws them: a steel helm with a dark eye slit over a bare chin,
    const steel = 0x9a9ea6, dark = 0x2a2c30, k = p.knight;   // grey mail, a dark belt, a shield with a red cross, a sword or a bow
    part(model, H, head + 0.6, head * 0.62 + 0.4, head + 0.6, steel, 0, head * 0.38, 0);            // the helm, down over the eyes (its crown a little above the head's: level, the two tops fought)
    part(model, H, head + 0.7, 1.4, 0.3, dark, 0, head * 0.38, head / 2 + 0.35);                     // its eye slit
    part(model, H, 1, head * 0.5, 0.4, steel, 0, head * 0.12, head / 2 + 0.4);                      // the nose guard
    part(model, H, 1.6, 1.6, 1.6, steel, 0, head + 0.2, 0);                                          // a knob on top
    for (const sx of [-1, 1]) part(model, body, 4.6, 2.2, 4.6, 0xb0b4bc, sx * (bw / 2 + 1.75), leg + torso - 1.6, 0);   // pauldrons
    part(model, body, bw + 0.4, 1.4, 4.4, dark, 0, leg + 0.4, 0);                                    // the belt
    const shield = part(model, A, 1, 9, 7, 0x4a4c52, -2.3, -torso + 1.5, 0.5);                       // on the left arm, facing out
    part(model, shield, 0.4, 6, 1.4, 0xc0201a, -0.6, 1.5, 0); part(model, shield, 0.4, 1.4, 4.4, 0xc0201a, -0.6, 5.3, 0);
    if (k === "bow") {                                       // a bow: an arc of short staves, and its string
      for (let i = -3; i <= 3; i++) {
        const st = part(model, B, 0.9, 2.2, 0.9, 0x8a6430, 0.4, -torso + 1 + i * 2, 2.2 + 2.2 * Math.cos(i / 3.4 * 1.4));
        st.rotation.x = -i * 0.22;
      }
      part(model, B, 0.25, 13, 0.25, 0xe8e0c8, 0.4, -torso - 5.5, 1.4);
    } else {                                                  // a sword held out in the fist: grip, crossguard, a long bright blade
      part(model, B, 1.1, 1.1, 3, 0x5a3a1a, 0, -torso + 0.6, 1.6);
      part(model, B, 4.4, 1.2, 1, 0x8a6a2a, 0, -torso + 0.55, 3.3);
      part(model, B, 0.6, 1.5, 11, 0xdde2ea, 0, -torso + 0.4, 9.3);
    }
  }
  if (p.robe) part(model, body, bw + 1, leg, 5, p.robe, 0, 0, 0);
  if (p.beard) {                                                     // a long white beard from the chin down over the chest, and a moustache
    part(model, H, head - 2, 5, 1, p.beard, 0, -3.5, head / 2 + 0.5);
    part(model, H, head - 3.5, 2.5, 1, p.beard, 0, -5.5, head / 2 + 0.4);
    part(model, H, 5, 1, 0.6, p.beard, 0, head * 0.18, head / 2 + 0.45);
  }
  if (p.tail) part(model, body, 2, 2, 8, p.legs, 0, leg + 1, -6);
  if (p.held) part(model, B, 1, 12, 1, p.held, 0, -torso + 2, 2);
  if (p.float) { L.visible = R.visible = false; body.position.y = 3 * U; }
  model.userData.limbs = [L, R, A, B];
  model.userData.arms = [A, B];
  model.userData.head = H;
  model.userData.dims = { leg, torso, head, bw, body };               // (dressArmor fits the player's armour to these)
  model.userData.zombie = !!p.zombie;
  model.userData.float = !!p.float;
  return model;
}

// the player's armour (main.ts, from Craftax's inventory.armour: 0 none, 1 iron, 2 diamond, and armour_enchant: 0 none, 1 fire, 2 ice;
// helmet, chestplate, leggings, boots): each worn piece a shell over the part it covers, in its metal, moving with the limb; an
// enchanted one with a pulsing purple glow round its edges, its own colour untouched (Pete). main.ts pulses the glows
const ARMOUR = [0, 0xc6cad0, 0x4ee6dc];                              // iron, diamond
// its back faces: a rim round the piece, never over its colour. Four shells, each a little bigger and fainter (Pete: the one shell's
// line was too hard; a fuzzy edge, reaching further out, the suit itself not purple): [scale, opacity], pulsed together (enchPulse)
const ENCH_LAYERS = [[1.08, 0.3], [1.18, 0.22], [1.3, 0.14], [1.45, 0.07]].map(([s, a]) => ({ s, a,
  mat: new THREE.MeshBasicMaterial({ color: 0xa855ff, transparent: true, opacity: a, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide }) }));
export function enchPulse(k: number) { for (const l of ENCH_LAYERS) l.mat.opacity = l.a * k; }
export const ENCH_MATS = ENCH_LAYERS.map((l) => l.mat);                 // (main.ts: an enchanted sword's blade glows the same)
export function dressArmor(model: THREE.Object3D, tiers: number[] = [], ench: number[] = []) {
  const u = model.userData, key = [...tiers, ...ench].join(",");
  if (!u.dims || u.armorKey === key) return;
  u.armorKey = key;
  for (const pv of u.armor || []) pv.parent?.remove(pv);
  u.mats = u.mats.filter((m: THREE.ShaderMaterial) => !m.userData.armor);
  u.armor = []; u.glows = [];
  const { leg, torso, head, bw, body } = u.dims, [L, R, A, B] = u.limbs, H = u.head, boost = u.mats[0]?.uniforms.uBoost.value ?? 0;
  const pieces = new Map<string, { parent: THREE.Object3D; pvs: THREE.Object3D[] }>();                                          // an enchanted piece's parts on one limb: glowed as one (below)
  const add = (i: number, parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, hang = false) => {
    const pv = part(model, parent, w, h, d, ARMOUR[tiers[i]], x, y, z, { hang }), mesh = pv.children[0] as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    mesh.material.userData.armor = true; mesh.material.uniforms.uBoost.value = boost;   // (the player's own boost, as its other parts)
    u.armor.push(pv);
    if (ench[i]) { const k = i + ":" + parent.uuid; if (!pieces.has(k)) pieces.set(k, { parent, pvs: [] }); pieces.get(k)!.pvs.push(pv); }
  };
  if (tiers[0] > 0) {                                                                                     // helmet: open at the face
    const w = head + 1.6, f = head / 2 + 0.4;
    add(0, H, w, 3.4, w, 0, head - 0.5, 0);                                                               // the cap, over the hat
    add(0, H, w, 2.3, 0.8, 0, head * 0.65, f);                                                            // the brow, above the eyes
    add(0, H, 0.8, head * 0.7, w, -f, head * 0.3, 0); add(0, H, 0.8, head * 0.7, w, f, head * 0.3, 0);    // the sides
    add(0, H, w, head * 0.7, 0.8, 0, head * 0.3, -f);                                                      // the back
  }
  if (tiers[1] > 0) {                                                                                     // chestplate, and its shoulders
    add(1, body, bw + 1, torso + 0.4, 5, 0, leg - 0.2, 0);
    add(1, A, 4.3, 5, 4.3, 0, 0.3, 0, true); add(1, B, 4.3, 5, 4.3, 0, 0.3, 0, true);
  }
  if (tiers[2] > 0) {                                                                                     // leggings: a belt, the thighs
    add(2, body, bw + 0.8, 2.4, 4.8, 0, leg - 1.4, 0);
    add(2, L, 4.5, leg * 0.7, 4.5, 0, 0.2, 0, true); add(2, R, 4.5, leg * 0.7, 4.5, 0, 0.2, 0, true);
  }
  if (tiers[3] > 0) { add(3, L, 4.7, 3.6, 4.7, 0, -leg + 3.6, 0, true); add(3, R, 4.7, 3.6, 4.7, 0, -leg + 3.6, 0, true); }   // boots
  // a theme's clothes under a worn piece (userData.under: by piece, helmet … boots, the parts that piece covers; Tropical's shirt and
  // shorts): hidden while it's worn (Pete: the shirt showed through the chestplate), back when it's off
  const under: (THREE.Object3D[] | undefined)[] = u.under || [];
  under.forEach((list, i) => { for (const o of list || []) o.visible = !(tiers[i] > 0); });
  // the glow shells round each enchanted piece's whole outline on its limb, not round each of its boxes (Pete: the helmet's cap, brow,
  // sides and back each glowed, a band where they met, right round the middle): one box over all its parts, the shells scaled about it
  const box = new THREE.Box3(), one = new THREE.Box3(), m4 = new THREE.Matrix4();
  for (const { parent, pvs } of pieces.values()) {
    box.makeEmpty();
    for (const pv of pvs) {
      const mesh = pv.children[0] as THREE.Mesh;
      pv.updateMatrix(); mesh.updateMatrix(); mesh.geometry.computeBoundingBox();
      box.union(one.copy(mesh.geometry.boundingBox!).applyMatrix4(m4.multiplyMatrices(pv.matrix, mesh.matrix)));
    }
    const size = box.getSize(new THREE.Vector3()), geo = new THREE.BoxGeometry(size.x, size.y, size.z), at = box.getCenter(new THREE.Vector3());
    for (const l of ENCH_LAYERS) {
      const g = new THREE.Mesh(geo, l.mat); g.position.copy(at); g.scale.setScalar(l.s);
      parent.add(g); u.armor.push(g); u.glows.push(g);
    }
  }
}

/** A four-legged animal's look: colors (hex), and its spots [x, y, z, w, h]. */
/** A four-legged creature's look (a theme's creature can start from it: quadruped(look) and add its own parts to it). */
export interface QuadrupedLook { body: number; leg: number; head?: number; spotColor?: number; spots?: number[][]; headSpot?: boolean; whites?: boolean; horns?: number; snout?: number }
export function quadruped(p: QuadrupedLook) {
  const model = new THREE.Group();
  model.userData = { mats: [], limbs: [] };
  const legs = [[-3, -6], [3, -6], [-3, 6], [3, 6]].map(([x, z]) => part(model, model, 4, 8, 4, p.leg, x, 8, z, { hang: true }));
  part(model, model, 10, 9, 16, p.body, 0, 8, 0);
  // spots: [x, y, z, w, h] patches on the sides (x = ±5.1), the back (y = 17.1) or the rump (z = -8.1)
  for (const [x, y, z, w, h] of p.spots || []) {
    const side = Math.abs(x) > 5, back = y > 17, rump = z < -8;
    part(model, model, side ? 0.4 : w, back ? 0.4 : h, side ? w : rump ? 0.4 : h, p.spotColor!, x, y - (back ? 0 : h / 2), z);
  }
  const H = part(model, model, 8, 8, 6, p.head ?? p.body, 0, 12, 10);
  if (p.headSpot) { part(model, H, 4, 1.6, 0.4, p.spotColor!, -1, 6.4, 3.1); part(model, H, 0.4, 4, 3, p.spotColor!, 4.1, 3, 0); }
  if (p.whites) {                                                    // eyes with whites, so they read against a bright sky or a white face
    part(model, H, 2.6, 2.6, 0.3, 0xffffff, -2.5, 3.6, 3.1); part(model, H, 2.6, 2.6, 0.3, 0xffffff, 2.5, 3.6, 3.1);
    eyes(model, H, 8, 4.0, 3.35, 0x050505, false, 2.6, 1.6);
  } else eyes(model, H, 8, 4.5, 3.2, 0x111111, false, 2.5);
  if (p.horns) { part(model, H, 1, 3, 1, p.horns, -4.5, 6, 0); part(model, H, 1, 3, 1, p.horns, 4.5, 6, 0); }
  part(model, H, 4, 3, 1, p.snout ?? 0xb8a090, 0, 0.5, 3.4);
  model.userData.head = H;                                           // (a theme's parts go on it: antlers, a longer muzzle)
  model.userData.limbs = [legs[0], legs[3], legs[1], legs[2]];
  return model;
}

function bat() {
  const model = new THREE.Group();
  model.userData = { mats: [], limbs: [], bat: true };
  const body = new THREE.Group(); body.position.y = 14 * U; model.add(body);
  part(model, body, 4, 5, 3, 0x3a2a22, 0, -2, 0);
  const H = part(model, body, 5, 5, 5, 0x4a3628, 0, 2, 0);
  eyes(model, H, 5, 2.5, 2.6, 0xff3030, true, 1.2);
  const l = part(model, body, 9, 0.6, 5, 0x2a1e18, -2, 1, 0), r = part(model, body, 9, 0.6, 5, 0x2a1e18, 2, 1, 0);
  l.children[0].position.x = -4.5 * U; r.children[0].position.x = 4.5 * U;
  model.userData.wings = [l, r];
  return model;
}

function snail() {
  const model = new THREE.Group();
  model.userData = { mats: [], limbs: [] };
  part(model, model, 5, 3, 14, 0xc8b070, 0, 0, 1);
  part(model, model, 8, 8, 8, 0x9a5a2a, 0, 3, -1);
  part(model, model, 4, 4, 8.4, 0xc08040, 0, 5, -1);
  const H = part(model, model, 4, 4, 4, 0xc8b070, 0, 2, 7);
  part(model, H, 0.8, 4, 0.8, 0xc8b070, -1.2, 4, 0); part(model, H, 0.8, 4, 0.8, 0xc8b070, 1.2, 4, 0);
  part(model, H, 1.2, 1.2, 1.2, 0x111111, -1.2, 8, 0); part(model, H, 1.2, 1.2, 1.2, 0x111111, 1.2, 8, 0);
  return model;
}

function blob(color: number, eye: number) {                                            // deep thing: a dark slime with a gaping maw
  const model = new THREE.Group();
  model.userData = { mats: [], limbs: [], bob: true };
  part(model, model, 14, 12, 14, color, 0, 0, 0);
  part(model, model, 8, 3, 0.5, 0x0a0a0a, 0, 3, 7);
  eyes(model, model, 14, 8, 7.1, eye, true, 3);
  for (const x of [-5, 0, 5]) part(model, model, 2, 6, 2, color, x, 12, -3);
  return model;
}

function elemental(core: number, shell: number) {
  const model = new THREE.Group();
  model.userData = { mats: [], limbs: [], bob: true, spin: true };
  const c = new THREE.Group(); c.position.y = 14 * U; model.add(c);
  part(model, c, 8, 8, 8, core, 0, -4, 0, { glow: true });
  for (const [x, y, z] of [[7, 0, 0], [-7, 0, 0], [0, 0, 7], [0, 0, -7], [0, 7, 0], [0, -9, 0]]) part(model, c, 4, 4, 4, shell, x, y - 2, z, { glow: true });
  eyes(model, c, 8, 1, 4.2, 0x111111, true, 2);
  model.userData.core = c;
  return model;
}

const MOBS: Record<string, () => THREE.Group> = {
  zombie: () => humanoid({ skin: 0x5a9a48, shirt: 0x2a8a9a, legs: 0x3a3a8a, zombie: true }),
  skeleton: () => humanoid({ skin: 0xd8d8d0, shirt: 0xc8c8c0, legs: 0xc0c0b8, bw: 6, held: 0x7a5a30, zombie: false, skull: true, eye: 0xff2a10, eyeGlow: true, eyeLight: true, ribs: true }),
  cow: () => quadruped({ body: 0xf0eee8, leg: 0xe8e6e0, spotColor: 0x151515, horns: 0xd8d0c0, snout: 0xe8a0a8, whites: true, headSpot: true,
    spots: [[5.1, 13, -3, 6, 5], [5.1, 11, 4, 4, 3], [-5.1, 12, 1, 7, 5], [-5.1, 14, -5, 3, 3], [0, 17.1, -1, 6, 5], [0, 17.1, 5, 3, 3], [2, 13, -8.1, 4, 4]] }),
  bat: () => bat(),
  snail: () => snail(),
  gnome_warrior: () => humanoid({ skin: 0xe0b090, shirt: 0x8a3a2a, legs: 0x5a3a20, hat: 0xc02020, hat2: true, scale: 0.65, held: 0x9a9a9a }),
  gnome_archer: () => humanoid({ skin: 0xe0b090, shirt: 0x3a6a2a, legs: 0x5a3a20, hat: 0x2a8a2a, hat2: true, scale: 0.65, held: 0x7a5a30 }),
  orc_soldier: () => humanoid({ skin: 0x5a7a2a, shirt: 0x6a5a4a, legs: 0x3a3028, tusks: true, scale: 1.1, held: 0x8a8a8a }),
  orc_mage: () => humanoid({ skin: 0x5a7a2a, shirt: 0x5a2a7a, legs: 0x3a1a4a, robe: 0x4a1a6a, tusks: true, hat: 0x3a1a5a, hat2: true }),
  lizard: () => humanoid({ skin: 0x3a8a3a, shirt: 0x4a9a3a, legs: 0x2a6a2a, tail: true, eye: 0xf0d020, scale: 0.9 }),
  kobold: () => humanoid({ skin: 0xa0502a, shirt: 0x7a3a1a, legs: 0x5a2a10, horns: 0xe0d0b0, scale: 0.7, eye: 0xffd040, eyeGlow: true, held: 0x8a8a8a }),
  knight: () => humanoid({ skin: 0xe2c48c, shirt: 0x8a8e96, legs: 0x6e727a, arms: 0x8a8e96, eye: 0x202020, knight: "sword" }),
  knight_archer: () => humanoid({ skin: 0xe2c48c, shirt: 0x8a8e96, legs: 0x6e727a, arms: 0x8a8e96, eye: 0x202020, knight: "bow" }),
  troll: () => humanoid({ skin: 0x6a7a6a, shirt: 0x5a6a5a, legs: 0x4a5a4a, scale: 1.45, tusks: true, held: 0x6a4a2a }),
  deep_thing: () => blob(0x2a1a3a, 0x40ff80),
  pigman: () => humanoid({ skin: 0xe8a0a0, shirt: 0xb07a3a, legs: 0x7a4a2a, tusks: true, held: 0xf0c030 }),
  fire_elemental: () => elemental(0xffa020, 0xff4010),
  frost_troll: () => humanoid({ skin: 0xc0e0f0, shirt: 0xa0c8e0, legs: 0x80a8c8, scale: 1.45, tusks: true, eye: 0x2060ff, eyeGlow: true }),
  ice_elemental: () => elemental(0xa0e8ff, 0x40a0f0),
  player: () => humanoid({ skin: 0xd8a888, shirt: 0x3a7ab0, legs: 0x3a3a6a, hair: 0x4a3020 }),
  necromancer: () => humanoid({ skin: 0x5a5a5a, shirt: 0x1a1020, legs: 0x1a1020, robe: 0x1a1020, hat: 0x2a1030, hat2: true, eye: 0xa020ff, eyeGlow: true, scale: 1.3, held: 0x6a3a8a }),
  necromancer_vulnerable: () => humanoid({ skin: 0x9a9a9a, shirt: 0x6a4a8a, legs: 0x6a4a8a, robe: 0x6a4a8a, hat: 0x7a5a9a, hat2: true, eye: 0xffffff, eyeGlow: true, scale: 1.3 }),
  // what's left of him (main.ts startUnmake, Pete): a skeleton in his robe and hat, his staff still in hand
  necromancer_bones: () => humanoid({ skin: 0xd8d8d0, shirt: 0xc8c8c0, legs: 0xc0c0b8, bw: 6, skull: true, ribs: true, eye: 0x1a1a1a, robe: 0x1a1020, hat: 0x2a1030, hat2: true, held: 0x6a3a8a, scale: 1.3 }),
};

// a soft dark disc on the ground: mobs are not in the voxel grid, so this is their shadow
const blobTex = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 64;
  const g = c.getContext("2d")!, gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, "rgba(0,0,0,0.55)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
})();
const blobMat = new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false });
export function setBlobs(on: boolean) { blobMat.visible = on; }
const blobGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);

// theme: whose model to build (src/themes; by default the theme picked)
// who: this one creature (src/render/entities.ts whoOf), for a theme's look that varies between them
export function makeMob(kind: string, theme: Theme | null = onScreen.to, who = 0) {
  const m = themedModel(kind, theme, MOBS[kind] || MOBS.zombie, who);
  m.userData.who = who;
  const blob = new THREE.Mesh(blobGeo, blobMat);
  blob.position.y = 0.015; blob.scale.setScalar(kind === "troll" || kind === "frost_troll" ? 1.3 : 0.95);
  m.add(blob);
  m.userData.kind = kind;
  m.userData.walk = 0;
  return m;
}

const HURT = new THREE.Color(1, 0.15, 0.1);
const PROJ: Record<string, [number, number, number, number, boolean]> = { arrow: [0x8a6a40, 0.06, 0.06, 0.6, false], dagger: [0xc0c0c8, 0.08, 0.04, 0.45, false], fireball: [0xff4a12, 0.32, 0.32, 0.32, true],
  iceball: [0x90e0ff, 0.32, 0.32, 0.32, true], slimeball: [0x60d040, 0.3, 0.3, 0.3, true] };
export function makeProjectile(kind: string) {
  const [c, w, h, d, glow] = PROJ[kind] || PROJ.arrow;
  const g = new THREE.Group();
  g.userData = { mats: [], limbs: [], spin: glow };
  const mat = makeMaterial(glow ? "mobGlow" : "mob", { color: c });
  mat.userData.base = new THREE.Color(c); mat.userData.glow = glow;
  if (kind === "fireball") mat.uniforms.uEmissive.value = 0.85;      // orange-red, not blown out to white (Pete)
  g.userData.mats.push(mat);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.y = 0.9;
  g.add(m);
  if (!glow) { const tip = new THREE.Mesh(new THREE.BoxGeometry(w * 1.8, h * 1.8, 0.1), mat); tip.position.set(0, 0.9, d / 2); g.add(tip); }
  g.userData.inner = m;
  return g;
}

// animate one model: moving → limbs swing; k = Craftax's visibility at its tile (the shader does sun, sky and torches); hurt flashes red
export function animate(model: THREE.Object3D, t: number, moving: boolean, k: number, hurt: boolean) {
  const u = model.userData;
  u.walk = moving ? u.walk + 0.25 : u.walk * 0.85;
  const sw = Math.sin(t * 10) * 0.7 * Math.min(1, u.walk);
  if (u.limbs.length === 4) {
    u.limbs[0].rotation.x = sw; u.limbs[1].rotation.x = -sw;
    if (u.arms) {
      if (u.zombie) for (const a of u.arms) a.rotation.x = -Math.PI / 2;
      else { u.limbs[2].rotation.x = -sw; u.limbs[3].rotation.x = sw; }
    } else { u.limbs[2].rotation.x = -sw; u.limbs[3].rotation.x = sw; }
  }
  // an attack (u.attackT, seconds): a zombie swings its outstretched arms up and down, anyone else chops (or draws a bow) with the right arm
  const at = t - (u.attackT ?? -9);
  if (u.arms && at >= 0 && at < 0.35) {
    const k = Math.sin((at / 0.35) * Math.PI);
    if (u.zombie) for (const a of u.arms) a.rotation.x = -Math.PI / 2 - 0.9 * k;
    else u.arms[1].rotation.x = -2.1 * k;
  }
  if (u.wings) { const f = Math.sin(t * 22) * 0.8; u.wings[0].rotation.z = f; u.wings[1].rotation.z = -f; model.children[0].position.y = (14 + Math.sin(t * 4) * 3) * U; }
  if (u.bob) model.position.y = Math.abs(Math.sin(t * 5)) * 0.08;
  if (u.float) model.children[0].position.y = (3 + Math.sin(t * 3) * 1.5) * U;
  if (u.core) u.core.rotation.y = t * 2;
  if (u.inner && u.spin) u.inner.rotation.set(t * 6, t * 4, 0);
  const tint = u.kind ? themeTint(u.kind, model.position.x, model.position.z) : null;   // (a theme's tint for its kind)
  for (const m of u.mats) {
    m.uniforms.uVisU.value = m.userData.glow ? 1 : k;
    m.uniforms.uColor.value.copy(m.userData.base);
    if (tint) m.uniforms.uColor.value.multiply(tint);
    if (hurt) m.uniforms.uColor.value.lerp(HURT, 0.6);
  }
}
