// Clouds (Pete 3a8b, d829, 7fc4): blocky clouds over the overworld, drifting on the wind. Each is a shaped blob of
// one-tile blocks (a few overlapping lobes with a ragged edge, domed: thicker toward its middle), 10-34 tiles across, on one of three
// layers well apart in height. They live in a SPAN x SPAN tile patch of sky that wraps: one slot per SLOT tiles each way, at most one
// cloud a slot, so they don't clump. Their shadows: each cloud's blocks projected down the sun's ray onto a ground map (one texel a
// tile, redrawn as the sun moves); the shader (shading.ts cloudShade) reads it, so the shadows sweep over the ground. How cloudy it
// is drifts with Craftax's clock: some days a few, some nearly overcast. ?cloud=0..1 pins the cover. At night they go dark grey.
import * as THREE from "three";
import { shared, CLOUD_SPAN as SPAN } from "./shading";

const SLOT = 42, NS = Math.floor(SPAN / SLOT);           // slots a side
const LAYERS = [22, 33, 44];                              // the cloud layers' bases: far apart (Pete)
const GROUND = 1;                                         // the shadow map is the shadows at this height (the shader corrects the rest)
const WIND = new THREE.Vector2(0.45, 0.12);               // tiles a second

/** A cloud: where it sits in the wrapping patch, its layer, its rank (it shows while the cover is above it), and its cells [x, z, thickness]. */
interface Cloud { x: number; z: number; y: number; rank: number; cells: [number, number, number][] }
// every slot's cloud, fixed (seeded: the same skies every load); which ones show depends on the cover (`rank` under it)
function makeClouds(): Cloud[] {
  let s = 0x9e3779b9;
  const rnd = () => { s = (s + 0x6d2b79f5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const out: Cloud[] = [];
  for (let sj = 0; sj < NS; sj++) for (let si = 0; si < NS; si++) {
    const a = 5 + Math.floor(rnd() * 12), b = Math.max(4, Math.round(a * (0.45 + rnd() * 0.4)));   // half-sizes: 10-34 by 8-28 tiles
    // lobes: the main body and two to four more inside it, so each cloud has a shape of its own, not an oval
    const lobes = [[0, 0, a * 0.75, b * 0.75]];
    for (let n = 2 + Math.floor(rnd() * 3); n > 0; n--) {
      const t = rnd() * Math.PI * 2, r = 0.35 + rnd() * 0.3;
      lobes.push([Math.cos(t) * a * 0.45, Math.sin(t) * b * 0.45, a * r + 1, b * r + 1]);
    }
    // a ragged edge: a coarse random lattice (every 4 tiles), smoothly sampled
    const G = 4, gw = Math.ceil(2 * a / G) + 2, gd = Math.ceil(2 * b / G) + 2, g = Array.from({ length: gw * gd }, rnd);
    const noise = (x: number, z: number) => {
      const fx = (x + a) / G, fz = (z + b) / G, x0 = Math.floor(fx), z0 = Math.floor(fz), u = fx - x0, v = fz - z0;
      const at = (i: number, j: number) => g[Math.min(gd - 1, j) * gw + Math.min(gw - 1, i)];
      return (at(x0, z0) * (1 - u) + at(x0 + 1, z0) * u) * (1 - v) + (at(x0, z0 + 1) * (1 - u) + at(x0 + 1, z0 + 1) * u) * v;
    };
    const cells: [number, number, number][] = [];
    for (let z = -b; z < b; z++) for (let x = -a; x < a; x++) {
      let m = Infinity;
      for (const [cx, cz, ra, rb] of lobes) m = Math.min(m, ((x + 0.5 - cx) / ra) ** 2 + ((z + 0.5 - cz) / rb) ** 2);
      m += (noise(x, z) - 0.5) * 0.7;
      if (m < 1) cells.push([x + a, z + b, m < 0.2 ? 3 : m < 0.55 ? 2 : 1]);   // domed: up to three blocks thick in the middle
    }
    out.push({
      x: si * SLOT + 2 + rnd() * Math.max(0, SLOT - 4 - 2 * a), z: sj * SLOT + 2 + rnd() * Math.max(0, SLOT - 4 - 2 * b),
      y: LAYERS[Math.floor(rnd() * LAYERS.length)] + Math.floor(rnd() * 2), rank: rnd(), cells,
    });
  }
  return out;
}

const vert = /* glsl */ `
varying vec3 vN;
varying vec3 vW;
void main() {
  vN = normal;
  vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const frag = /* glsl */ `
uniform vec3 uSunDir, uSunColor, uSkyColor, uFogColor;
uniform float uFogNear, uFogFar, uOutline, uDay;
varying vec3 vN;
varying vec3 vW;
void main() {
  if (uOutline > 0.5) discard;                             // laser and phosphor: no sky, so no clouds
  vec3 n = normalize(vN);
  // white tops in the sun, softer sides, grey undersides (the sky's light, less its blue)
  vec3 sky = mix(vec3(dot(uSkyColor, vec3(0.3, 0.5, 0.2))), uSkyColor, 0.3);
  vec3 light = uSunColor * (0.25 + 0.45 * max(dot(n, uSunDir), 0.0)) * (0.6 + 0.4 * max(n.y, 0.0)) + sky * (0.95 + 0.45 * n.y) + 0.03;
  vec3 col = vec3(0.96, 0.97, 1.0) * light;
  // night: dark grey (Pete), a touch lighter on top, not the moonlight's blue
  col = mix(vec3(0.05, 0.052, 0.058) * (0.75 + 0.25 * n.y), col, smoothstep(0.05, 0.6, uDay));
  col = mix(col, uFogColor, smoothstep(uFogNear * 1.6, uFogFar * 1.1, length(vW.xz - cameraPosition.xz)));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

export class Clouds {
  declare all: Cloud[];
  /** The ground's shadow map, one texel a tile, and its texture. */
  declare data: Uint8Array;
  declare tex: THREE.DataTexture;
  declare day: { value: number };
  declare mesh: THREE.InstancedMesh;
  /** How far the wind has carried them (wraps at the patch). */
  declare off: THREE.Vector2;
  declare m: THREE.Matrix4;
  /** The sun and cover the shadow map was drawn for. */
  declare sunAt: THREE.Vector3;
  declare coverAt0: number;
  /** ?cloud=: the cover pinned, else null. */
  declare pin: number | null;
  declare cover: number;
  constructor(scene: THREE.Object3D) {
    this.all = makeClouds();
    this.data = new Uint8Array(SPAN * SPAN);
    this.tex = new THREE.DataTexture(this.data, SPAN, SPAN, THREE.RedFormat, THREE.UnsignedByteType);
    this.tex.wrapS = this.tex.wrapT = THREE.RepeatWrapping;
    this.tex.magFilter = this.tex.minFilter = THREE.LinearFilter;   // a tile of soft edge
    this.tex.unpackAlignment = 1;
    shared.uCloud.value = this.tex;
    const u = shared;
    const mat = new THREE.ShaderMaterial({
      uniforms: { uSunDir: u.uSunDir, uSunColor: u.uSunColor, uSkyColor: u.uSkyColor, uFogColor: u.uFogColor, uFogNear: u.uFogNear, uFogFar: u.uFogFar, uOutline: u.uOutline, uDay: this.day = { value: 1 } },
      vertexShader: vert, fragmentShader: frag,
    });
    const geo = new THREE.BoxGeometry(1, 1, 1).translate(0.5, 0.5, 0.5);
    this.mesh = new THREE.InstancedMesh(geo, mat, this.all.reduce((n, c) => n + c.cells.length, 0));
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    scene.add(this.mesh);
    this.off = new THREE.Vector2();
    this.m = new THREE.Matrix4();
    this.sunAt = new THREE.Vector3(); this.coverAt0 = -1;
    const q = new URLSearchParams(location.search).get("cloud");
    this.pin = q !== null && q !== "" && isFinite(+q) ? THREE.MathUtils.clamp(+q, 0, 1) : null;
    this.cover = 0;
  }
  // how cloudy, from Craftax's clock (steps): two slow swells, so clear spells and heavy ones come and go over a few days
  coverAt(ts: number, seed: number) {
    if (this.pin !== null) return this.pin;
    const a = (seed % 997) * 0.37;
    return THREE.MathUtils.clamp(0.32 + 0.26 * Math.sin(ts / 420 + a) + 0.18 * Math.sin(ts / 131 + 2.3 * a), 0.03, 0.85);
  }
  // the ground map: every showing cloud's cells, slid down the sun's ray from its own height to GROUND
  shadows(sun: THREE.Vector3) {
    const D = this.data;
    D.fill(0);
    if (sun.y >= 0.03) {
      const kx = -sun.x / sun.y, kz = -sun.z / sun.y;
      for (const c of this.all) {
        if (c.rank >= this.cover) continue;
        const sx = Math.round(c.x + kx * (c.y - GROUND)), sz = Math.round(c.z + kz * (c.y - GROUND));
        for (const [cx, cz] of c.cells) {
          const x = (((sx + cx) % SPAN) + SPAN) % SPAN, z = (((sz + cz) % SPAN) + SPAN) % SPAN;
          D[z * SPAN + x] = 255;
        }
      }
    }
    this.tex.needsUpdate = true;
  }
  update(dt: number, cam: THREE.Vector3, ts: number, seed: number, under: boolean, day = 1) {
    this.day.value = day;
    this.mesh.visible = !under;
    shared.uCloudK.value = under ? 0 : 1;
    if (under) return;
    this.cover = this.coverAt(ts, seed);
    shared.uSkyColor.value.multiplyScalar(1 - 0.2 * this.cover);       // a grey day's sky light is a little dimmer (setSky resets it each frame)
    const sun = shared.uSunDir.value;
    if (this.cover !== this.coverAt0 || sun.distanceToSquared(this.sunAt) > 1e-5) { this.coverAt0 = this.cover; this.sunAt.copy(sun); this.shadows(sun); }
    this.off.addScaledVector(WIND, dt);
    this.off.set(((this.off.x % SPAN) + SPAN) % SPAN, ((this.off.y % SPAN) + SPAN) % SPAN);
    shared.uCloudP.value.set(this.off.x, GROUND, this.off.y);
    // the boxes: each showing cloud at its copy nearest the camera (the patch wraps)
    let k = 0;
    for (const c of this.all) {
      if (c.rank >= this.cover) continue;
      const x = c.x + this.off.x, z = c.z + this.off.y;
      const wx = x + Math.round((cam.x - x) / SPAN) * SPAN, wz = z + Math.round((cam.z - z) / SPAN) * SPAN;
      for (const [cx, cz, h] of c.cells) {
        this.m.makeScale(1, h, 1).setPosition(wx + cx, c.y, wz + cz);
        this.mesh.setMatrixAt(k++, this.m);
      }
    }
    this.mesh.count = k;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
