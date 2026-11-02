// Tropical's characters, built on the game's own models so they walk the same: skeletons in grass skirts; zombies in faded Hawaiian
// shirts, open at the collar, and board shorts; you in your own blue, plain, and dark blue shorts, a little tanned; and pigs for cows.
import * as THREE from "three";
import { part } from "craftax-3d/plugin";
import { S } from "./tiles";

type G = CanvasRenderingContext2D;
type Mat = THREE.ShaderMaterial & { userData: { base?: THREE.Color } };
// a part's color, base and shown (the game's creature materials keep both)
const recolor = (mat: Mat, hex: number) => { mat.userData.base?.setHex(hex); (mat.uniforms?.uColor?.value as THREE.Color | undefined)?.setHex(hex); };
const WHITE = 0xffffff, SKIRT = [0x6fae3a, 0x88c24a, 0x5a9a30, 0x9cc95a, 0xb8b060];

// ---- textures for clothes (part() paints a part with the model's texture while it's set: Winter's flannel does the same) ----
const canvasTex = (draw: (g: G) => void) => {
  const cv = document.createElement("canvas"); cv.width = cv.height = S;
  draw(cv.getContext("2d")!);
  const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace;
  return t;
};
const SHIRTS = [["#1e8fa8", "#f4f0e0", "#f2c230"], ["#d23a2e", "#fff4e0", "#2e7a3a"], ["#f08a24", "#ffffff", "#2a6ab0"], ["#3a4fb0", "#ffd84a", "#f0f0f0"], ["#2e9a5a", "#ff7aa8", "#fff2c0"]];
const RED_SHIRTS = new Set([1]), BLUE_SHORTS = new Set([0]);             // (SHIRTS' red; the shorts' navy, below: no red ones any more)
// you (Pete): your own blue, plain (no flowers), over shorts in your own dark blue (your pants, cut short), and a little tanned
const YOUR_SHIRT = "#3a7ab0", YOUR_SHORTS = "#3a3a6a", SKIN = 0xd8a888, TAN = 0xc89070;
// the zombies' clothes a little faded (Pete: lower saturation): each pixel 35 % of the way to its own gray
const mute = (g: G, k = 0.35) => {
  const img = g.getImageData(0, 0, S, S), d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const y = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    for (let j = 0; j < 3; j++) d[i + j] = Math.round(d[i + j] + (y - d[i + j]) * k);
  }
  g.putImageData(img, 0, 0);
};
// made on first use (the page has a canvas to spare by then)
let tex: { shirts: THREE.CanvasTexture[]; shorts: THREE.CanvasTexture[]; yourShirt: THREE.CanvasTexture; yourShorts: THREE.CanvasTexture } | null = null;
function clothes() {
  if (tex) return tex;
  const shirts = SHIRTS.map(([bg, petal, mid], i) => canvasTex((g) => {   // hibiscus on a bright ground, a leaf here and there
    g.fillStyle = bg; g.fillRect(0, 0, S, S);
    const flower = (x: number, y: number) => {
      g.fillStyle = petal; for (const [a, b] of [[0, -1], [-1, 0], [1, 0], [0, 1], [-1, -1], [1, 1]]) g.fillRect((x + a + S) % S, (y + b + S) % S, 1, 1);
      g.fillStyle = mid; g.fillRect(x, y, 1, 1);
    };
    flower(3, 3); flower(11, 6); flower(5, 12); flower(13, 13);
    g.fillStyle = "rgba(20,60,20,0.75)"; g.fillRect(8, 1, 2, 1); g.fillRect(1, 8, 1, 2); g.fillRect(9, 10, 2, 1);
    if (i % 2) { g.fillStyle = "rgba(255,255,255,0.12)"; g.fillRect(0, 0, S, 1); }
    mute(g);
  }));
  // board shorts: plain, or one broad stripe down the side (the tile repeats on every face, so thin stripes multiplied); no red and
  // white (Pete), no green (it read as bare zombie legs)
  const shorts = ([["#1a3a8a", null], ["#1f8a8a", null], ["#1a1a1a", null], ["#5a3a8a", "#ffe24a"]] as [string, string | null][]).map(([bg, stripe]) => canvasTex((g) => {
    g.fillStyle = bg; g.fillRect(0, 0, S, S);
    if (stripe) { g.fillStyle = stripe; g.fillRect(10, 0, 5, S); }
    mute(g);
  }));
  const plain = (c: string) => canvasTex((g) => { g.fillStyle = c; g.fillRect(0, 0, S, S); });
  return (tex = { shirts, shorts, yourShirt: plain(YOUR_SHIRT), yourShorts: plain(YOUR_SHORTS) });
}

// ---- skeletons: a grass skirt, strips hanging from a straw waistband (pixels inside the humanoid's body; legs `leg` tall) ----
export function skeleton(builtin: () => THREE.Group, who: number): THREE.Group {
  const m = builtin(), { leg, bw, body } = m.userData.dims;
  const top = leg + 2, n = 20, rx = bw / 2 + 2.2, rz = 3.2;
  part(m, body, bw + 3, 1.4, 5, 0xc8a860, 0, top - 1.4, 0);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2, len = 7 + ((i * 7 + who) % 3);
    const s = part(m, body, 1.3, len, 0.4, SKIRT[(i * 3 + who) % SKIRT.length], Math.sin(a) * rx, top - 0.6, Math.cos(a) * rz, { hang: true });
    s.rotation.order = "YXZ"; s.rotation.y = a; s.rotation.x = -0.16;
  }
  return m;
}

// the outfit on a humanoid: the shirt, untucked, short sleeves, shorts to the knee, bare legs below and a V at the neck in its skin
// (the shirt, sleeves and V go under a chestplate and the shorts under leggings: userData.under, hidden while those are worn, as the
// game dresses its armour: js/models.ts dressArmor)
function dress(m: THREE.Group, shirt: THREE.Texture, shorts: THREE.Texture, skin: number): THREE.Group {
  const { leg, torso, bw, body } = m.userData.dims, [L, R, A, B] = m.userData.limbs as THREE.Object3D[], own = m.userData.tex;
  const chest: THREE.Object3D[] = [], legs: THREE.Object3D[] = [];
  m.userData.tex = shirt;
  chest.push(part(m, body, bw + 0.8, torso - 0.6, 4.8, WHITE, 0, leg + 0.4, 0));                         // the shirt, worn untucked
  for (const arm of [A, B]) chest.push(part(m, arm, 4.3, torso * 0.42, 4.3, WHITE, 0, 0.2, 0, { hang: true }));   // short sleeves
  for (const l of [L, R]) recolor((l.children[0] as THREE.Mesh).material as Mat, skin);                   // bare legs below the shorts
  m.userData.tex = shorts;
  for (const l of [L, R]) legs.push(part(m, l, 4.4, leg * 0.55, 4.4, WHITE, 0, 0.2, 0, { hang: true }));   // board shorts, to the knee
  m.userData.tex = own;
  const neck = leg + torso - 0.2;                                                                         // the shirt's top edge
  for (const [w, i] of [[3.6, 1], [2.4, 2], [1.2, 3]]) chest.push(part(m, body, w, 0.8, 0.3, skin, 0, neck - i * 0.8, 2.45));   // worn open: a V at the neck
  m.userData.under = [undefined, chest, legs];                                                            // (helmet, chestplate, leggings)
  return m;
}
// ---- zombies: a Hawaiian shirt and board shorts; no red shirt over blue shorts (Pete: Fourth of July, not tropical): the next pair ----
export function zombie(builtin: () => THREE.Group, who: number): THREE.Group {
  const t = clothes(), shirt = (who >>> 2) % t.shirts.length;
  let shorts = (who >>> 4) % t.shorts.length;
  if (RED_SHIRTS.has(shirt) && BLUE_SHORTS.has(shorts)) shorts = (shorts + 1) % t.shorts.length;
  return dress(builtin(), t.shirts[shirt], t.shorts[shorts], 0x5a9a48);                                  // (green: a zombie's skin)
}
// ---- you: the game's skin (face, hands) a shade redder and darker, and the outfit ----
export function you(builtin: () => THREE.Group): THREE.Group {
  const t = clothes(), m = builtin();
  m.traverse((o) => {
    const mat = (o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).material as Mat) : null;
    if (mat?.userData?.base?.getHex() === SKIN) recolor(mat, TAN);
  });
  return dress(m, t.yourShirt, t.yourShorts, TAN);
}

// ---- pigs, for cows: pink all over, no horns or spots, a big snout, floppy ears, a curly tail ----
const PINK = 0xf2a6b4, PINK_D = 0xe08a9c, SNOUT = 0xd8788c;
export function pig(builtin: () => THREE.Group): THREE.Group {
  const m = builtin(), H = m.userData.head as THREE.Object3D;
  m.traverse((o) => {
    const mat = (o as THREE.Mesh).isMesh ? ((o as THREE.Mesh).material as Mat) : null, base = mat?.userData?.base;
    if (!mat || !base) return;
    const hex = base.getHex();
    if (hex === 0x151515 || hex === 0xd8d0c0) { o.visible = false; return; }                 // spots and horns: gone
    if (hex === 0x050505 || hex === 0x111111 || hex === 0xffffff) return;                    // eyes stay
    recolor(mat, hex === 0xe8a0a8 ? SNOUT : hex === 0xe8e6e0 ? PINK_D : PINK);
  });
  part(m, H, 5, 4, 1.6, SNOUT, 0, 0.2, 3.6);                                                 // the snout, bigger, its nostrils
  part(m, H, 1, 1.2, 0.3, 0x8a3a4a, -1.1, 1.6, 4.4); part(m, H, 1, 1.2, 0.3, 0x8a3a4a, 1.1, 1.6, 4.4);
  for (const s of [-1, 1]) { const e = part(m, H, 3, 0.8, 2.6, PINK_D, s * 3, 7.4, 1); e.rotation.z = s * -0.5; e.rotation.x = 0.4; }   // ears, flopping forward
  const t1 = part(m, m, 1, 1, 2, PINK_D, 0, 15, -8.6); part(m, t1, 1, 2, 1, PINK_D, 0, 0, -1.4);  // a curly tail
  return m;
}
