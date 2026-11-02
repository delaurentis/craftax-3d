// Phosphor's effects on the outline pass: the code art's glyph atlas, its shockwaves where something is hit, the Necromancer's code
// (his silhouette's mask and his shield's chaos).
import * as THREE from "three";
import { camera, renderer, scene } from "../../render/scene";
import { outlinePass } from "../shared/outline-pass";
import { world } from "../../render/arm";
import { playerPos } from "../../render/entities";
import { hitState, shieldHitT } from "../../effects/hits";

// a shockwave in phosphor at a point of the world (or the screen's middle, for a hit on you in first person): up to four at once
export let shockN = 0;
// model: the thing hit; its silhouette is drawn once into one of four small masks, and the wave is its outline swelling outward
export const shockMasks = [0, 1, 2, 3].map(() => new THREE.WebGLRenderTarget(480, 300));
export const maskMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
export function drawMask(model: THREE.Object3D, rt: THREE.WebGLRenderTarget) {
  const hidden: THREE.Object3D[] = [];
  scene.traverse((o) => { if (((o as THREE.Mesh).isMesh || (o as THREE.Sprite).isSprite || (o as THREE.Points).isPoints || (o as THREE.Line).isLine) && o.visible) { hidden.push(o); o.visible = false; } });
  const mine: THREE.Object3D[] = []; model.traverse((o) => { if ((o as THREE.Mesh).isMesh && hidden.includes(o)) { o.visible = true; mine.push(o); } });
  const bg = scene.background, cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
  scene.background = null; scene.overrideMaterial = maskMat;
  renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(scene, camera);
  renderer.setRenderTarget(null); renderer.setClearColor(cc, ca);
  scene.overrideMaterial = null; scene.background = bg;
  for (const o of hidden) o.visible = true;
}
export const necroMask = new THREE.WebGLRenderTarget(480, 300);
export let necroMaskAt = 0;
// on: phosphor is the look in view (off, his code is cleared)
export function necroCode(now: number, on: boolean) {
  const u = outlinePass.uniforms;
  const n = on && world.props.children.find((m) => /^necromancer/.test((m.userData.kind as string | undefined) || "") && m.visible);
  if (!n) { u.uNecro.value.w = 0; return; }
  const c = n.position.clone().setY(1.4).project(camera);
  if (c.z > 1) { u.uNecro.value.w = 0; return; }
  const shield = n.userData.kind === "necromancer" ? 1 : 0;
  const f = shieldHitT ? Math.max(0, 1 - (now - shieldHitT) / 700) : 0, bossHitT = (hitState as { bossHitT?: number | null }).bossHitT, q = bossHitT ? Math.max(0, 1 - (now - bossHitT) / 900) : 0;   // (effects/hits, still JavaScript, types its state as {})
  u.uNecro.value.set(c.x * 0.5 + 0.5, c.y * 0.5 + 0.5, shield * (0.85 + 0.15 * Math.sin(now / 420)), 1);
  u.uNecroW.value = Math.max(f, q, shield * 0.12);
  if (now - necroMaskAt > 60) { necroMaskAt = now; drawMask(n, necroMask); u.uMaskN.value = necroMask.texture; }
}
export function shockwave(pos: THREE.Vector3 | null, strength = 1, model: THREE.Object3D | null = null) {
  let x = 0.5, y = 0.45;
  if (pos) { const v = pos.clone().project(camera); if (v.z > 1) return; x = v.x * 0.5 + 0.5; y = v.y * 0.5 + 0.5; }
  const k = shockN++ % 4, u = outlinePass.uniforms;
  u.uShape.value[k] = model ? 1 : 0;
  if (model) { drawMask(model, shockMasks[k]); u["uMask" + k].value = shockMasks[k].texture; }
  u.uShock.value[k].set(x, y, performance.now() / 1000, strength);
  u.uShockW.value[k].copy(pos || playerPos(performance.now()));
}
{ // code art's glyphs (the shader's indices): space, strokes | - / \ ( ) _ =, then fills by weight, as in Shellcaster's asciiEngine
  const chars = " |-/\\()_=:;.,+~*e%oxse0a968#B&@O", w = 32, h = 48, cv = document.createElement("canvas");
  cv.width = chars.length * w; cv.height = h;
  const g = cv.getContext("2d")!; g.fillStyle = "#000"; g.fillRect(0, 0, cv.width, cv.height);
  g.fillStyle = "#fff"; g.font = `600 40px ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace`; g.textAlign = "center"; g.textBaseline = "middle";
  [...chars].forEach((ch, i) => g.fillText(ch, i * w + w / 2, h / 2 + 2));
  const tex = new THREE.CanvasTexture(cv); tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter;   // drawn small: mipmapped
  outlinePass.uniforms.uGlyphs.value = tex;
}
