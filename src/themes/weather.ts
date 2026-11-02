// A theme's weather (Theme.weather): snow falling, rain... made the first time its theme comes on screen, told each frame how much
// of the theme is showing (onScreen: all of it once switched, eased in and out while a transition runs), and let go once it has
// faded right out. Drawn only, like everything a theme does.
import * as THREE from "three";
import { camera, scene } from "../render/scene";
import { renderLook } from "../looks/looks";
import { game } from "../core/game";
import { onScreen } from "./state";
import type { Theme, Weather, WeatherFrame } from "./types";

const live = new Map<string, Weather>();
let last = 0;
// how much of a theme is on screen now
function share(t: Theme): number {
  const { from, to, k } = onScreen;
  if (from === to) return to === t ? 1 : 0;
  return to === t ? k : from === t ? 1 - k : 0;
}

/** Each frame (core/frame.ts), after the theme's own transition has moved on. p: where you stand; level: the floor on screen
 *  (passed in, never looked up here: a floor it can't be sure of must not count as the overworld). */
export function weatherTick(now: number, p: THREE.Vector3, level: number): void {
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0;
  last = now;
  const shown = [onScreen.from, onScreen.to].filter((t): t is Theme => !!t?.weather);
  for (const t of shown) {
    if (live.has(t.id)) continue;
    try { live.set(t.id, t.weather!(scene)); } catch (e) { console.error(`[craftax-3d] theme "${t.id}": its weather failed to start`, e); live.set(t.id, { update() {}, dispose() {} }); }
  }
  if (!live.size) return;
  const look = renderLook().id as WeatherFrame["look"];                      // (the plugin API names the three built-in looks: a plugin look draws as one)
  const blockAt = (r: number, c: number): number => {
    const S = game.S;
    return S && r >= 0 && c >= 0 && r < S.size[0] && c < S.size[1] ? S.map[r * S.size[1] + c] : -1;
  };
  for (const [id, w] of live) {
    const t = shown.find((s) => s.id === id), k = t ? share(t) : 0;
    try {
      if (k <= 0) { w.dispose(); live.delete(id); continue; }
      w.update({ dt, k, camera, player: p, level, look, blockAt });
    } catch (e) { console.error(`[craftax-3d] theme "${id}": its weather failed`, e); live.delete(id); }
  }
}
