// Lighting: one shader for blocks, water, glow and mobs. Every pixel ray-traces the floor's voxel grid (a 3D texture) toward the sun
// for its shadow and along five short rays for how much sky it sees; torches and lava add warm block light from a flood-filled
// 2D map; water gets waves, Fresnel sky reflection and a sun glint. Output is linear HDR for the bloom + filmic tone-mapping passes.
// The shader source is in src/render/shading/shaders.ts and the shared uniforms in uniforms.ts; this module makes the materials.
import * as THREE from "three";
import { CLOUD_SPAN, VOX_Y0, VOX_NY, EYE_LIGHTS, shared } from "../src/render/shading/uniforms";
import { vert, frag } from "../src/render/shading/shaders";
import { themes } from "../src/themes/state";
import { themeSky } from "../src/themes/sky";
export { CLOUD_SPAN, VOX_Y0, VOX_NY, EYE_LIGHTS, shared };

export function makeMaterial(kind: string, opts: { map?: THREE.Texture | null; color?: THREE.ColorRepresentation } = {}) {
  const defines: Record<string, string> = {};
  const world = !kind.startsWith("mob");
  if (world) defines.WORLD = "";
  if (world && themes().length) defines.THEMES = "";                  // (a theme can switch: blend the old tiles into the new, src/themes)
  if (opts.map) defines.USE_MAP = "";
  if (kind === "cutout") Object.assign(defines, { CUTOUT: "", DOUBLE: "", WIND: "" });
  if (kind === "water" || kind === "fountain") Object.assign(defines, { WATER: "", DOUBLE: "" });
  if (kind === "fountain") defines.FOUNTAIN = "";                     // a fountain's water: clear and bright, as outdoors, even in a cave
  if (kind === "glow") defines.GLOW = "";
  const m = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, defines,
    uniforms: {
      ...shared, map: { value: opts.map || null }, uColor: { value: new THREE.Color(opts.color ?? 0xffffff) },
      uEmissive: { value: kind === "glow" ? 2.6 : kind === "mobGlow" ? 2.2 : 0 }, uVisU: { value: 1 }, uAlpha: { value: 1 }, uXfade: { value: new THREE.Vector2(0, 0) }, uEyeK: { value: 1 }, uBoost: { value: 0 }, uAimed: { value: 0 },
      uId: { value: 1 + Math.floor(Math.random() * 1e6) },                // outline art: each mob part is its own outlined piece
    },
    transparent: kind === "water" || kind === "fountain", depthWrite: kind !== "water" && kind !== "fountain",
    side: kind === "cutout" || kind === "water" || kind === "fountain" ? THREE.DoubleSide : THREE.FrontSide,
  });
  if (!opts.map) delete m.uniforms.map;
  return m;
}

// the floor as voxels for the shader: occupancy 0..1 (leaves ≈ 0.55), x = column, y = layer from VOX_Y0, z = row
export function voxelTexture(occ: ArrayLike<number>, W: number, H: number) {
  const data = new Uint8Array(W * VOX_NY * H);
  for (let z = 0; z < H; z++) for (let y = 0; y < VOX_NY; y++) for (let x = 0; x < W; x++)
    data[x + y * W + z * W * VOX_NY] = Math.round(255 * occ[(z * W + x) * VOX_NY + y]);
  const t = new THREE.Data3DTexture(data, W, VOX_NY, H);
  t.format = THREE.RedFormat; t.type = THREE.UnsignedByteType;
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

// warm block light: flood-filled from torches and lava through open tiles, a level lost per tile (the usual block-light rule)
// r: the light level; g: how much of it is phosphor green (torches the victory portal turned, world.greenTorches)
export function blockLightTexture(levels: ArrayLike<number>, W: number, H: number, green: ArrayLike<number> | null = null) {
  const data = new Uint8Array(W * H * 2);
  for (let i = 0; i < W * H; i++) { data[2 * i] = Math.round(255 * Math.min(1, levels[i] / 8)); data[2 * i + 1] = green ? Math.round(255 * green[i]) : 0; }
  const t = new THREE.DataTexture(data, W, H, THREE.RGFormat, THREE.UnsignedByteType);
  t.minFilter = t.magFilter = THREE.LinearFilter;
  t.unpackAlignment = 1;
  t.needsUpdate = true;
  return t;
}

// sun, sky and fog from Craftax's clock: daylight peaks at phase 0.2 of the 300-step day and is darkest at 0.7
const C = (r: number, g: number, b: number) => new THREE.Color(r, g, b);
export function setSky(phase: number, daylight: number, under: boolean) {
  const a = (phase - 0.2) * Math.PI * 2;
  const sun = new THREE.Vector3(Math.sin(a), Math.cos(a), 0.3).normalize();
  const u = shared;
  u.uUnder.value = under ? 1 : 0;
  if (under) {
    u.uSunY.value = 1;                                                          // (underground: no flowers to close)
    u.uSunColor.value.setRGB(0, 0, 0);
    u.uFogColor.value.setRGB(0, 0, 0); u.uFogNear.value = 5; u.uFogFar.value = 24;
    themeSky(u, true);
    return sun;
  }
  u.uSunY.value = sun.y;
  const elev = sun.y, warm = 1 - THREE.MathUtils.smoothstep(elev, 0.0, 0.45);
  if (elev > -0.08) {
    u.uSunDir.value.copy(sun);
    u.uSunColor.value.copy(C(1, 0.93, 0.82).lerp(C(1.0, 0.42, 0.16), warm)).multiplyScalar(2.4 * THREE.MathUtils.smoothstep(elev, -0.08, 0.12));
  } else {
    u.uSunDir.value.copy(sun).negate();                                         // moonlight
    u.uSunColor.value.copy(C(0.35, 0.45, 0.8)).multiplyScalar(0.45);
  }
  const d = THREE.MathUtils.clamp(daylight, 0, 1);
  u.uSkyColor.value.copy(C(0.03, 0.04, 0.09)).lerp(C(0.42, 0.55, 0.85), d);
  u.uZenith.value.copy(C(0.01, 0.015, 0.04)).lerp(C(0.18, 0.38, 0.85), d);
  // the horizon (and the fog that fades the far world into it) darkens with the sky itself: once the sun is down the sky above is
  // black and starry, so a lit dusk haze along the horizon would glow under it (Pete: "shouldn't it fade to darkness")
  const dh = d * THREE.MathUtils.smoothstep(elev, -0.16, 0.06);
  u.uHorizon.value.copy(C(0.02, 0.03, 0.06)).lerp(C(0.68, 0.8, 0.95).lerp(C(0.95, 0.55, 0.35), warm * 0.7), dh);
  u.uFogColor.value.copy(u.uHorizon.value);
  u.uFogNear.value = 30; u.uFogFar.value = 140;
  themeSky(u, false);                                                  // (a theme's sky and fog, a set piece's fog: src/themes/sky.ts)
  return sun;
}
