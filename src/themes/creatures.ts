// Creatures and you under a theme (Theme.creatures, Theme.player): the model a kind is built with (js/models.ts makeMob asks here),
// and its tint now, eased by the progress of the tile it stands on (animate multiplies it in each frame).
import * as THREE from "three";
import { onScreen, styleOf, tileP } from "./state";
import type { Theme } from "./types";

const ca = new THREE.Color(), cb = new THREE.Color(), out = new THREE.Color();
/** The tint to multiply a creature of this kind by at world (x, z), or null for none. */
export function themeTint(kind: string, x: number, z: number): THREE.Color | null {
  const { from, to } = onScreen, a = styleOf(from, kind)?.tint, b = styleOf(to, kind)?.tint;
  if (a === undefined && b === undefined) return null;
  ca.set(a ?? 0xffffff); cb.set(b ?? 0xffffff);
  return out.copy(ca).lerp(cb, from === to ? 1 : tileP(z, x));
}
/** A kind's model under a theme: the theme's own, built from the built-in one, or the built-in. */
export function themedModel(kind: string, theme: Theme | null, builtin: () => THREE.Group, who = 0): THREE.Group {
  const make = styleOf(theme, kind)?.model;
  let m: THREE.Group;
  try { m = make ? make(builtin, who) : builtin(); } catch (e) { console.error(`[craftax-3d] theme "${theme?.id}": the ${kind} model failed`, e); m = builtin(); }
  m.userData.mats ??= []; m.userData.limbs ??= [];             // (animate reads them)
  m.userData.theme = theme?.id ?? null;
  return m;
}
/** Does either theme on screen build its own model for this kind (a wave swaps it as it passes)? */
export const modelChanges = (kind: string): boolean => !!(styleOf(onScreen.from, kind)?.model || styleOf(onScreen.to, kind)?.model);
