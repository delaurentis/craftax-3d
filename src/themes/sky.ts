// A theme's sky, fog and light (Theme.sky), eased in with the transition as a whole (onScreen.k), and a set piece's own fog. setSky
// (js/shading.ts) computes the standard sky from Craftax's clock and calls themeSky last; frame.ts multiplies the cave light by
// themeCave().
import type * as THREE from "three";
import { onScreen } from "./state";
import type { Theme } from "./types";

/** A set piece's fog [near, far] for the floor on screen (set by the world's build; null: the standard). */
export const sceneSky = { fog: null as [number, number] | null };
interface SkyUniforms {
  uSkyColor: { value: THREE.Color }; uZenith: { value: THREE.Color }; uHorizon: { value: THREE.Color }; uFogColor: { value: THREE.Color };
  uSunColor: { value: THREE.Color }; uFogNear: { value: number }; uFogFar: { value: number };
}
const mix = (a: number, b: number, k: number) => a + (b - a) * k;
const blend = (pick: (t: Theme | null) => number): number => {
  const { from, to, k } = onScreen;
  return from === to ? pick(to) : mix(pick(from), pick(to), k);
};
export function themeSky(u: SkyUniforms, under: boolean): void {
  if (sceneSky.fog) [u.uFogNear.value, u.uFogFar.value] = sceneSky.fog;
  const { from, to } = onScreen;
  if (!from?.sky && !to?.sky) return;
  const tint = [0, 1, 2].map((i) => blend((t) => t?.sky?.tint?.[i] ?? 1));
  for (const c of [u.uSkyColor, u.uZenith, u.uHorizon, u.uFogColor]) c.value.setRGB(c.value.r * tint[0], c.value.g * tint[1], c.value.b * tint[2]);
  u.uSunColor.value.multiplyScalar(blend((t) => t?.sky?.sun ?? 1));
  if (under) return;
  const near = u.uFogNear.value, far = u.uFogFar.value;
  u.uFogNear.value = blend((t) => t?.sky?.fog?.[0] ?? near); u.uFogFar.value = blend((t) => t?.sky?.fog?.[1] ?? far);
}
/** The cave light's multiplier underground. */
export const themeCave = (): number => blend((t) => t?.sky?.cave ?? 1);
/** How tall the 3D grass stands (1 the standard; a theme's grass.height), eased with the transition. */
export const themeGrass = (): number => blend((t) => Math.max(0, t?.grass?.height ?? 1));
