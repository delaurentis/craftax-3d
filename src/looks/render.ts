// Each frame's render in its look (and the fade between two), the eyes' lights, what blocks the 3/4 camera, the opening look and backdrop.
import "./looks";                                                      // first: it reaches render/arm.ts before quality.ts (their cycle: arm reads grass3d at load)
import * as THREE from "three";
import { setBlobs } from "../../js/models";
import { shared, EYE_LIGHTS } from "../../js/shading";
import { FullScreenQuad } from "three/addons/postprocessing/Pass.js";
import { $ } from "../core/shared";
import { camera, moon, renderer, scene, sky, stars, sun } from "../render/scene";
import { bloom, composer, outlinePass } from "./shared/outline-pass";
import { grass3d } from "../render/quality";
import { world } from "../render/arm";
import { flat, game, mobs } from "../core/game";
import { portalLook } from "../effects/tunnel";
import { FADE_MS, lookState, pageLines, passInk, setSkin, side, type Side } from "./looks";
import { look, plainLook, SIM_LOOK } from "./registry";
import { grabShot, grabThumb, snaps } from "../ui/snapshots";
import { TREE_B } from "../input/intent";
import { godHalo, godState } from "../effects/god";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import type { LookView } from "./types";

// this module's state that other modules set (one module can't assign another's let): introOn, introOrbit, camD
export interface RenderState {
  /** The opening wears the simulation's look (introLook). */
  introOn: boolean;
  /** The camera circles you slowly in the 3/4 view until you first press Play. */
  introOrbit: boolean;
  /** ?debug (cx.camD): the 3/4 camera's distance, for captures (null: the usual). */
  camD: number | null;
}
export const renderState = {} as RenderState;
/** What the sky showed before a look's render changed it (renderLooks puts it back). */
export interface Sky0 { sky: boolean; stars: boolean; sun: boolean; moon: boolean; bg: THREE.Scene["background"] }

// glowing eyes light what's around them: the nearest few pairs go to the shaders as point lights, flickering a little
export const eyeAt = new THREE.Vector3();
export function eyeLights(now: number) {
  const lit: { p: THREE.Vector3; d: number; k: number }[] = [];
  for (const e of mobs.values()) {
    const h = e.model.userData.eyeAt as THREE.Object3D | undefined;
    if (h && e.model.parent) lit.push({ p: h.getWorldPosition(new THREE.Vector3()), d: h.getWorldPosition(eyeAt).distanceToSquared(camera.position), k: e.model.id });
  }
  lit.sort((a, b) => a.d - b.d);
  const L = shared.uEyeL.value;
  for (let i = 0; i < EYE_LIGHTS; i++) {
    const l = lit[i];
    if (!l) { L[i].w = 0; continue; }
    L[i].set(l.p.x, l.p.y, l.p.z, 0.85 + 0.15 * Math.sin(now / 90 + l.k * 1.7) * Math.sin(now / 37 + l.k));
  }
}
// does a wall stand between the 3/4 camera (elevation el, heading orbit, distance D) and you? March from your head to the camera,
// blocked when a point is inside a block column (its drawn height; open ground is 0)
export function blocked(p: THREE.Vector3, el: number, orbit: number, D: number) {
  const ce = Math.cos(el), cx = p.x + Math.sin(orbit) * ce * D, cy = 0.5 + Math.sin(el) * D, cz = p.z + Math.cos(orbit) * ce * D;
  const hy = 1.2, n = 40;
  for (let i = 3; i < n; i++) {
    const t = i / n, x = p.x + (cx - p.x) * t, y = hy + (cy - hy) * t, z = p.z + (cz - p.z) * t;
    const r = Math.floor(z), c = Math.floor(x);
    if (r === game.S!.pos[0] && c === game.S!.pos[1]) continue;
    if (y < world.height(r, c)) return true;
  }
  return false;
}
// 3/4: a tree between the camera and you (trunk, or its crown, both shrunk as the 3/4 view draws them: the crown about 1.6 wide
// round the trunk, 1.5-3.4 up)
export function treeBlocks(p: THREE.Vector3, el: number, orbit: number, D: number) {
  const ce = Math.cos(el), cx = p.x + Math.sin(orbit) * ce * D, cy = 0.5 + Math.sin(el) * D, cz = p.z + Math.cos(orbit) * ce * D;
  const hy = 1.0, n = 40;
  for (let i = 2; i < n; i++) {
    const t = i / n, x = p.x + (cx - p.x) * t, y = hy + (cy - hy) * t, z = p.z + (cz - p.z) * t;
    if (y > 3.4) break;                                                     // above every crown from here on (the ray climbs)
    const r0 = Math.floor(z), c0 = Math.floor(x);
    for (let r = r0 - 1; r <= r0 + 1; r++) for (let c = c0 - 1; c <= c0 + 1; c++) {
      if (!TREE_B.has(world.at(r, c))) continue;
      const dx = Math.abs(x - c - 0.5), dz = Math.abs(z - r - 0.5);
      if ((dx < 0.8 && dz < 0.8 && y > 1.5) || (dx < 0.25 && dz < 0.25)) return true;
    }
  }
  return false;
}
// the render state of one look: the line frame draws ids for the outline pass, with no sky, no soft shadows and its own bloom
export function applyLook(on: boolean, sky0: Sky0) {
  for (const e of mobs.values()) if (e.model.userData.eyeAt) e.model.userData.eyeAt.visible = !on;   // halos are soft blends too
  shared.uOutline.value = on ? 1 : 0;
  outlinePass.enabled = on;
  const flat = shared.uThemeGrass.value <= 0.001;                        // (a theme with no grass, Winter: hidden once sunk, or they'd flicker on the ground)
  for (const m of world.tufts || []) m.visible = !on && grass3d && !flat;   // grass blades: a setting (off by default, Pete); none in the line looks
  for (const m of world.blooms || []) m.visible = !on && !flat;          // flowers: no shapes in the line looks (Pete)
  portalLook(on);
  if (godHalo) godHalo.visible = godState.godGlow && !on;                           // ?god's halo and pool: soft blends too (a green ring of code round you)
  setBlobs(!on);                                                           // mob shadows are soft blends: they would draw outlines
  renderer.toneMapping = on ? THREE.NoToneMapping : THREE.ACESFilmicToneMapping;
  world.mats.water.blending = on ? THREE.NoBlending : THREE.NormalBlending;
  world.mats.fountain.blending = world.mats.water.blending;    // the lines: water writes its id and distance, unblended
  const b = plainLook(on).bloom!;                                          // the render's own bloom (src/looks/color, laser)
  bloom.threshold = b.threshold; bloom.strength = b.strength; bloom.radius = b.radius;
  (bloom.highPassUniforms as Record<string, THREE.IUniform<number>>).smoothWidth.value = b.knee;
  bloom.compositeMaterial.uniforms.bloomSat.value = b.sat;
  sky.visible = stars.visible = sun.visible = moon.visible = false;
  if (!on) { sky.visible = sky0.sky; stars.visible = sky0.stars; sun.visible = sky0.sun; moon.visible = sky0.moon; }
  scene.background = on ? null : sky0.bg;
}
export const fadeTarget = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
const copyMat = new THREE.ShaderMaterial({
  uniforms: { tA: { value: null }, tB: { value: null }, k: { value: 0 } },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
  fragmentShader: "uniform sampler2D tA, tB; uniform float k; varying vec2 vUv; void main() { gl_FragColor = mix(texture2D(tA, vUv), texture2D(tB, vUv), k); }",
  depthTest: false, depthWrite: false,
});
export const copyQuad = new FullScreenQuad(copyMat);
// a renderer's post pass (types.ts PostPass), made the first time it draws, last in the composer (after the output pass: display
// colors): its shader's post() over each point, the picture point-sampled in uScale blocks first (scale)
const postPasses = new Map<LookView, ShaderPass>();
function postPass(r: LookView) {
  let p = postPasses.get(r);
  if (p) return p;
  p = new ShaderPass(new THREE.ShaderMaterial({                            // (a material: the plugin's own uniform objects, not copies)
    uniforms: { tDiffuse: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: { value: 0 }, uScale: { value: 1 }, ...r.post?.uniforms },
    vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uScale; varying vec2 vUv;
      ${r.post?.shader ?? "vec3 post(vec3 c, vec2 uv) { return c; }"}
      void main() {
        vec2 uv = uScale > 1.0 ? (floor(vUv * uRes / uScale) + 0.5) * uScale / uRes : vUv;
        gl_FragColor = vec4(post(texture2D(tDiffuse, uv).rgb, uv), 1.0);
      }`,
    depthTest: false, depthWrite: false,
  }));
  p.enabled = false; composer.addPass(p); postPasses.set(r, p);
  return p;
}
// one side's render: the line frame or color, and its post pass on (every other one off)
function renderSide(s: Side, sky0: Sky0, now: number) {
  applyLook(s.lines, sky0);
  for (const p of postPasses.values()) p.enabled = false;
  if (s.post) {
    const p = postPass(s.post), u = p.uniforms, b = composer.readBuffer;
    p.enabled = true; u.uRes.value.set(b.width, b.height); u.uTime.value = now / 1000; u.uScale.value = Math.max(1, Math.round((s.post.scale ?? 1) * renderer.getPixelRatio()));
  }
  composer.render();
}
export function renderLooks(now: number) {
  const sky0: Sky0 = { sky: sky.visible, stars: stars.visible, sun: sun.visible, moon: moon.visible, bg: scene.background };
  const f = lookState.fade, to = side();
  if (f && now - f.t0 < FADE_MS) {
    const a = THREE.MathUtils.smoothstep((now - f.t0) / FADE_MS, 0, 1);
    // color's side first, then the lines' (a fade between two of one kind: from, then to)
    const [A, B] = f.from.lines !== to.lines && f.from.lines ? [to, f.from] : [f.from, to];
    composer.renderToScreen = false;                                         // (the composer sets its last pass's renderToScreen itself)
    renderSide(A, sky0, now);
    const sz = composer.readBuffer;
    if (fadeTarget.width !== sz.width || fadeTarget.height !== sz.height) fadeTarget.setSize(sz.width, sz.height);
    copyMat.uniforms.tA.value = composer.readBuffer.texture; copyMat.uniforms.k.value = 0;
    renderer.setRenderTarget(fadeTarget); copyQuad.render(renderer);           // keep the first image while the second renders
    renderSide(B, sky0, now);
    copyMat.uniforms.tA.value = fadeTarget.texture; copyMat.uniforms.tB.value = composer.readBuffer.texture;
    copyMat.uniforms.k.value = B === to ? a : 1 - a;
    renderer.setRenderTarget(null); copyQuad.render(renderer);
    composer.renderToScreen = true;
  } else {
    lookState.fade = null;
    renderSide(to, sky0, now);
  }
  sky.visible = sky0.sky; stars.visible = sky0.stars; sun.visible = sky0.sun; moon.visible = sky0.moon; scene.background = sky0.bg;
  if (snaps.thumbWanted) grabThumb();
  if (snaps.shotWanted) grabShot();
}
// the opening (Pete): the world's first frames in the simulation's look (SIM_LOOK, phosphor), out of the backdrop's code, fading to
// colour a second or two later; only the render (the outline pass), the menu and HUD keep their own look. Not when another look was already chosen. The camera meanwhile
// circles you slowly in the 3/4 view until you first press Play (introOrbit, frame)
renderState.introOrbit = true; renderState.introOn = false;
renderState.camD = null;                                                            // ?debug (cx.camD): the 3/4 camera's distance, for captures
export function introLook(on: boolean) {
  if (on) {
    if (lookState.lines || lookState.skin || lookState.post || flat.picture) return;
    const L = look(SIM_LOOK)!;
    renderState.introOn = true; lookState.lines = true; lookState.fade = null; lookState.skin = L.over ? L : null;
    passInk(lookState.skin);
    return;
  }
  if (!renderState.introOn) return;
  renderState.introOn = false;
  if (pageLines()) return;                                                 // a look picked meanwhile (B): it's already in charge
  lookState.fade = { t0: performance.now(), from: side() }; lookState.lines = false;
  setTimeout(() => { if (!lookState.lines) setSkin(null); }, FADE_MS);
}
// the menu's backdrop (index.html #backdrop: a picture of another world, up while this one loads): once the live world has drawn it
// fades away, the world (in phosphor for its first moments, introLook) coming up through it
export const MIN_STILL = 1500;                                                     // ms from the page's start (Pete: 1-2 s)
export function backdropReveal() {
  const el = $("backdrop");
  if (!el || el.classList.contains("going") || !document.body.classList.contains("ready")) return;
  el.classList.add("going");
  setTimeout(() => el.remove(), 650);
  if (renderState.introOn) setTimeout(() => introLook(false), 1000);                   // then the green fades to colour (Pete: a short spell)
}
