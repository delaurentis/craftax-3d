// The WebGL renderer, the scene and camera, the sky (sun, moon, stars) and the clouds.
import { $ } from "../core/shared";
import * as THREE from "three";
import { Clouds } from "../../js/clouds";
import { Sky } from "three/addons/objects/Sky.js";

// ---------- renderer, scene, camera ----------
export const canvas = $("view") as HTMLCanvasElement;
// ?spectate (local.ts): the site's /craftax copies this canvas onto its iPhone, after the frame is drawn: the buffer kept for it
export const SPECTATE = /[?&](spectate|replay)\b/.test(location.search);
export const FROM_REPLAY = !SPECTATE && /[#&]from=/.test(location.hash);    // a replay's Play in game (local.ts pickUp): straight into it, no menu   // (?replay too: a recording, record.ts; kept for its video)
export const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: SPECTATE });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
export const TOUCH_ONLY = matchMedia("(pointer: coarse)").matches && !matchMedia("(any-pointer: fine)").matches;   // a touch-only device: a phone or tablet
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(75, 1, 0.05, 3000);
camera.rotation.order = "YXZ";
scene.add(camera);

// sky: Preetham scattering by day, stars by night (the overworld only)
export const sky = new Sky();
sky.scale.setScalar(2000);
// clear air (low turbidity, little Mie haze) keeps the sky blue instead of a white glare around the sun; Preetham's own sun disc is off
// (it runs to thousands) and a small disc of ours stands in. The sky is scaled down and clamped under the bloom threshold.
sky.material.uniforms.turbidity.value = 2; sky.material.uniforms.rayleigh.value = 1.2;
sky.material.uniforms.mieCoefficient.value = 0.0012; sky.material.uniforms.mieDirectionalG.value = 0.7;
sky.material.uniforms.showSunDisc.value = 0;
sky.material.uniforms.skyGain = { value: 0.3 };
sky.material.fragmentShader = sky.material.fragmentShader
  .replace("uniform float time;", "uniform float time;\nuniform float skyGain;")
  .replace("gl_FragColor = vec4( texColor, 1.0 );", "gl_FragColor = vec4( min( texColor * skyGain, vec3( 0.8 ) ), 1.0 );");
scene.add(sky);
// the sun and the moon, made of blocks (Pete: not perfectly round): each a 16 x 16 pixel picture, drawn unsmoothed so its pixels stay square
/** One pixel of a sky disc: [r, g, b, a] bytes, or null for none. */
export type SkyPaint = (dx: number, dy: number, x: number, y: number) => number[] | null;
export function skyDisc(size: number, paint: SkyPaint): THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> {
  const N = 16, c = document.createElement("canvas"); c.width = c.height = N;
  const g = c.getContext("2d")!, img = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { const px = paint(x - 7.5, y - 7.5, x, y); if (px) img.data.set(px, (y * N + x) * 4); }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.generateMipmaps = false;
  return new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
}
// the sun: a blocky disc, white-hot inside a yellow rim, in a faint blocky glow
export const sun = skyDisc(60, (dx, dy) => {
  const r = Math.hypot(dx, dy);
  return r < 3.6 ? [255, 252, 236, 255] : r < 5.2 ? [255, 243, 196, 255] : r < 6.3 ? [255, 222, 140, 255] : r < 7.6 ? [255, 214, 130, 70] : null;
});
sun.material.color.setRGB(1.0, 0.95, 0.85);                                 // under the bloom threshold: bright, not blinding
scene.add(sun);
// the moon: always a crescent (Pete), a blocky disc with a second disc bitten out of its right side, a few grey crater pixels;
// faded in as the sun goes down
export const moon = skyDisc(70, (dx, dy, x, y) => {
  if (Math.hypot(dx, dy) >= 6.3 || Math.hypot(dx - 4.4, dy + 1) < 5.3) return null;
  const crater = (x === 5 && y === 5) || (x === 6 && y === 8) || (x === 7 && y === 11) || (x === 9 && y === 12);
  const edge = Math.hypot(dx, dy) >= 5.3;
  return crater ? [176, 172, 160, 255] : edge ? [222, 218, 204, 255] : [244, 241, 230, 255];
});
moon.material.color.setRGB(1.25, 1.25, 1.2);                                // a touch over the bloom threshold: a soft halo
scene.add(moon);
export const stars = (() => {
  const n = 1500, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u);
    p.set([Math.cos(a) * r * 1500, Math.abs(u) * 1500, Math.sin(a) * r * 1500], i * 3);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.BufferAttribute(p, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 2, sizeAttenuation: false, transparent: true, depthWrite: false }));
})();
scene.add(stars);
export const clouds = new Clouds(scene);                                          // blocky clouds drifting overhead, their shadows on the ground
