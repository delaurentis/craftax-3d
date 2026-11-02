// The shader's shared inputs: the voxel grid's extent, the eye-light count, and the uniforms every material shares (one object,
// so setting a value once reaches them all: the sun, the sky, time, the looks).
import * as THREE from "three";
import { outlineAtlas, LAVA_V } from "../../../js/textures";
import { fromAtlas, themeOutlines } from "../../themes/atlas";

export const CLOUD_SPAN = 256;                              // clouds.ts: the wrapping patch of sky, tiles a side
export const VOX_Y0 = -2, VOX_NY = 8;                        // voxel layers cover y ∈ [-2, 6)

export const EYE_LIGHTS = 8;
export const shared = {
  uVox: { value: null as THREE.Data3DTexture | null }, uVoxSize: { value: new THREE.Vector3(48, VOX_NY, 48) }, uVoxOrigin: { value: new THREE.Vector3(0, VOX_Y0, 0) },
  uBlock: { value: null as THREE.DataTexture | null }, uMapSize: { value: new THREE.Vector2(48, 48) },
  uSunDir: { value: new THREE.Vector3(0.3, 0.9, 0.2).normalize() }, uSunColor: { value: new THREE.Color(3, 2.9, 2.7) },
  uSkyColor: { value: new THREE.Color(0.35, 0.5, 0.8) }, uZenith: { value: new THREE.Color(0.2, 0.4, 0.9) }, uHorizon: { value: new THREE.Color(0.65, 0.78, 0.95) },
  uCaveColor: { value: new THREE.Color(0.2, 0.22, 0.28) }, uUnder: { value: 0 }, uRT: { value: 1 }, uTime: { value: 0 }, uOutline: { value: 0 }, uPhos: { value: 0 }, uOutlineMap: { value: outlineAtlas }, uPlayer: { value: new THREE.Vector3() }, uShrink: { value: new THREE.Vector2(1, 1) }, uSunY: { value: 1 }, uTrample: { value: null as THREE.Texture | null }, uTrampleSz: { value: new THREE.Vector2(1, 1) }, uGrassK: { value: 1 }, uThemeGrass: { value: 1 }, uCrownSwap: { value: 0 },
  uFogColor: { value: new THREE.Color(0.65, 0.78, 0.95) }, uFogNear: { value: 30 }, uFogFar: { value: 120 },
  // glowing eyes that light their surroundings (skeletons): world position and strength (w = 0: unused), set each frame by main.ts
  uEyeL: { value: Array.from({ length: EYE_LIGHTS }, () => new THREE.Vector4()) },
  uLadder: { value: new THREE.Vector4() },        // the floor's ladder up, which Craftax lights: x, z, radius, on (main.ts)
  uGodL: { value: new THREE.Vector4() },          // ?god's G: you glow, lighting the whole scene: your x, y, z and strength (0: off)
  uSealL: { value: new THREE.Vector4() },        // a sealed ladder's violet light, spilling onto the floor and walls round it (main.ts sealFx)
  uNecroL: { value: new THREE.Vector4() },        // the Necromancer's force field: its violet light on the floor round him (x, y, z, strength)
  uTunnel: { value: new THREE.Vector4() },        // the victory tunnel (main.ts startTunnel): its axis x, y; w: riding it
  uPortalL: { value: new THREE.Vector4() },       // the victory portal's blue-green light: its middle x, y, z and strength (0: none)
  uAim: { value: new THREE.Vector4() },          // the aimed square: its column, row, top height, brightness (0: none)
  uAimSz: { value: new THREE.Vector2(1, 1) },  // its width across x and z: a tile, or (a bird's-eye tree) its crown as drawn
  uAimLo: { value: -10 },
  uAimB: { value: new THREE.Vector4(0, 0, -1, -1) },   // a second box lit with it, x0 z0 x1 z1 (empty: x1 < x0): a bird's-eye tree's crown
  uAimBY: { value: new THREE.Vector2(0, 0) },           // its bottom and top
  uAimGain: { value: 1 },
  uAimTint: { value: new THREE.Vector3(1, 1, 1) },     // its colour: white, or green with the green target box (main.ts)                               // how strongly it lights: more for a tree (Pete: its dark leaves barely showed)                        // its bottom: above the ground for a mob or a ladder, so only that lights up
  uLavaF: { value: 0 },                          // lava's animation frame (main.ts); the atlas rows its frames sit in (textures.ts LAVA_V)
  uLavaV: { value: new THREE.Vector2(...LAVA_V) },
  // the clouds' shadows (clouds.ts): their ground map, its drift x, z and the height y it is drawn for, and on (0: underground)
  uCloud: { value: null as THREE.Texture | null }, uCloudP: { value: new THREE.Vector3(0, 24, 0) }, uCloudK: { value: 0 },
  // a theme switching (src/themes/transition.ts; compiled only with a theme installed: THREE's THEMES define): the atlas being left,
  // each tile's progress (a texel a tile), on while it runs; the laser drawings of the tiles themes add, and whether there are any
  uMapFrom: { value: fromAtlas as THREE.Texture }, uThemeP: { value: null as THREE.Texture | null }, uThemeOn: { value: 0 },
  uShapeK: { value: null as THREE.Texture | null }, uShapeOn: { value: 0 },   // (stones rising or sinking with a switch: transition.ts)
  uThemeOut: { value: themeOutlines.tex as THREE.Texture }, uThemeOutOn: { value: 0 },
};

// water swell: four directional waves in world xz; returns (height, dh/dx, dh/dz). The vertex shader moves the surface with it and the
// fragment shader takes its normal from the same sum, so the lighting follows the waves you see.
