// Graphics quality (ray tracing or fast), the field of view, resizing, and the 3D grass with its frame-rate watch.
import { composer, outlinePass } from "../looks/shared/outline-pass";
import { shared } from "../../js/shading";
import { REPLAY } from "../../js/local";
import { camera, renderer } from "./scene";
import { world } from "./arm";
import { flat, game } from "../core/game";
import { chestState, flushWorld } from "../effects/chest";
import { lookState } from "../looks/looks";
import { flash } from "../ui/hud/hint";
import { playing } from "../ui/screens/screen";

// this module's state that other modules set (one module can't assign another's let): fovPick
export interface Gfx {
  /** The field of view picked (Settings → Gameplay), degrees up and down. */
  fovPick: number;
}
export const gfx = {} as Gfx;

// G: ray-traced (shadows, sky occlusion, reflections) or fast
export const QUALITY = [{ name: "Ray traced", rt: 1, ratio: 1.5 }, { name: "Fast (no ray tracing)", rt: 0, ratio: 1 }];
export let quality = 0;
// the bot playing faster than 32 moves a second (Pete): the chest's loot popup shows for half the time
export function botFast(): boolean { const w = game.S && game.S.world; return !!(w && w.control === "bot" && !w.paused && (w.speed || 0) > 32); }

// the Speed page's "Ray tracing" box (was "Use shaders") is the same switch (Pete), on unless you turned it off
export function setQuality(q: number): void {
  quality = q;
  const box = document.getElementById("opt-shaders") as HTMLInputElement | null; if (box) box.checked = QUALITY[q].rt > 0;
  try { localStorage.setItem("craftax3d.shaders", QUALITY[q].rt ? "1" : "0"); } catch {}
  shared.uRT.value = QUALITY[q].rt;
  renderer.setPixelRatio(Math.min(QUALITY[q].ratio, devicePixelRatio));
  resize();
}
// Field of view (Settings → Gameplay → 1st person, Pete): degrees up and down, 60 to 110; the wider it is, the further back in its tile
// the eye sits too (up to 0.35 of a block), so the tile beside you reads less close; remembered
gfx.fovPick = (() => { try { const v = +localStorage.getItem("craftax3d.fov")!; return v >= 60 && v <= 110 ? v : 80; } catch { return 80; } })();
export const eyeBack = () => 0.35 * Math.min(1, Math.max(0, (gfx.fovPick - 60) / 50));
export function resize(): void {
  // a replay: drawn sharp enough for its video (1080 px on the short side, film.ts) however small its frame (a portrait one is phone-sized)
  if (REPLAY) renderer.setPixelRatio(Math.min(3, Math.max(Math.min(QUALITY[quality].ratio, devicePixelRatio), 1080 / Math.min(innerWidth, innerHeight))));
  renderer.setSize(innerWidth, innerHeight, false);
  composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(innerWidth, innerHeight);
  const px = Math.max(1, Math.round(renderer.getPixelRatio()));                 // laser lines about 2 CSS px wide at any density
  outlinePass.uniforms.uStep.value.set(px / (innerWidth * renderer.getPixelRatio()), px / (innerHeight * renderer.getPixelRatio()));
  outlinePass.uniforms.uRes.value.set(innerWidth * renderer.getPixelRatio(), innerHeight * renderer.getPixelRatio());
  outlinePass.uniforms.uPx.value = renderer.getPixelRatio();
  camera.aspect = innerWidth / innerHeight;
  // a tall phone: 75° up and down is only ~39° across, too close in; a little wider (85°: ~46° across). The overhead view's height
  // follows camera.fov, so it frames the same
  camera.fov = gfx.fovPick + (innerWidth < innerHeight && matchMedia("(max-width: 720px)").matches ? 10 : 0);
  camera.updateProjectionMatrix();
}
addEventListener("resize", resize);
setQuality((() => { try { return localStorage.getItem("craftax3d.shaders") === "0" ? 1 : 0; } catch { return 0; } })());
document.getElementById("opt-shaders")?.addEventListener("change", (e) => setQuality((e.target as HTMLInputElement).checked ? 0 : 1));
// 3D grass (Settings → Speed, under Ray tracing): off on a phone or a touch screen; on a desktop on, until the frame rate is low
// (grassWatch: it sinks away and stays off in this browser, "craftax3d.grass3dAuto"). Ticked or unticked in Settings: your choice
// from then on, never undone by the frame rate (Pete)
export let grass3d = false, grassChosen = false;
try {
  const v = localStorage.getItem("craftax3d.grass3d"); grassChosen = v === "1" || v === "0";
  grass3d = grassChosen ? v === "1" : !matchMedia("(max-width: 720px), (max-height: 520px), (pointer: coarse)").matches && localStorage.getItem("craftax3d.grass3dAuto") !== "off";
} catch {}
{ const b = document.getElementById("opt-grass3d") as HTMLInputElement | null; if (b) { b.checked = grass3d; b.onchange = () => { grassFade = 0; shared.uGrassK.value = 1; grass3d = b.checked; grassChosen = true; world.setGrass3d(grass3d); chestState.worldDirty = true; flushWorld(); try { localStorage.setItem("craftax3d.grass3d", grass3d ? "1" : "0"); } catch {} }; } }
// the frame rate with the grass in view (not in laser or phosphor, the classic view, a menu, a hidden tab): over GRASS_WIN ms
// windows, the first one after it comes into view skipped (shaders compiling, the world building); one under GRASS_FPS turns it off
export const GRASS_FPS = 40, GRASS_WIN = 5000, GRASS_FADE = 1500;
export const grassW = { t0: 0, n: 0, warm: false };
export let grassFade = 0;                                                         // when the sinking away began (0: not)
export function grassWatch(now: number): void {
  if (grassFade) {
    const k = 1 - (now - grassFade) / GRASS_FADE;
    shared.uGrassK.value = Math.max(0, k);
    if (k <= 0) { grassFade = 0; grass3d = false; world.setGrass3d(false); chestState.worldDirty = true; flushWorld(); shared.uGrassK.value = 1; }
    return;
  }
  if (!grass3d || grassChosen || lookState.lines || flat.picture || !playing() || document.hidden) { grassW.t0 = 0; grassW.warm = false; return; }
  if (!grassW.t0) { grassW.t0 = now; grassW.n = 0; return; }
  grassW.n++;
  if (now - grassW.t0 < GRASS_WIN) return;
  const fps = grassW.n * 1000 / (now - grassW.t0);
  grassW.t0 = now; grassW.n = 0;
  if (!grassW.warm) { grassW.warm = true; return; }
  if (fps < GRASS_FPS) grassOff(fps);
}
export function grassOff(fps: number): void {                                                   // the frame rate was low: the grass sinks away, off from now on
  if (!grass3d || grassFade) return;
  grassFade = performance.now();
  try { localStorage.setItem("craftax3d.grass3dAuto", "off"); } catch {}
  const b = document.getElementById("opt-grass3d") as HTMLInputElement | null; if (b) b.checked = false;
  flash(`3D grass off: the frame rate was low (${Math.round(fps)} fps). Settings → Speed turns it back on`);
}
