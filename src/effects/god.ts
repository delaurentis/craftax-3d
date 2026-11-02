// ?god and ?debug: the warp to any floor, the ghost, the glow, the nuke.
import "../ui/hud/layout";
import * as THREE from "three";
import { shared } from "../../js/shading";
import { net } from "../../js/net";
import { $, sound } from "../core/shared";
import { camera, scene } from "../render/scene";
import { bones, bursts } from "../render/arm";
import { api, game, keys, mobs, view } from "../core/game";
import { apply } from "../core/apply";
import { pixTex, setAlpha } from "./victory";
import { DUST, playerPos } from "../render/entities";
import { lookState, shockwave } from "../looks/looks";
import { pathing } from "../input/pathing";
import { flash } from "../ui/hud/hint";
import { unlockPointer } from "../ui/screens/screen";
import type { GameState } from "../core/types";
import type { Entity } from "../core/game";

// this module's state that other modules set (one module can't assign another's let): godGlow
export interface GodState {
  /** ?god, G: you shine like a god. */
  godGlow: boolean;
}
export const godState = {} as GodState;
/** A creature model's material (js/models): shading.js's, with its uniforms. */
type MobMat = THREE.ShaderMaterial;

// ?debug only: L (for level) warps to any floor (this world, on that floor's ladder: a real change to the game)
export const FLOORS = ["Overworld", "Dungeon", "Gnomish Mines", "Sewers", "Vaults", "Troll Mines", "Fire Realm", "Ice Realm", "Graveyard"];
export function warpOpen() { return $("warp")?.classList.contains("on"); }
export function closeWarp() { $("warp")?.classList.remove("on"); }
export function openWarp() {
  if (!net.local) { flash("Warp only works on a game running in this browser"); return; }
  let el = $("warp");
  if (!el) {
    el = document.createElement("div"); el.id = "warp"; el.className = "screen";
    el.innerHTML = `<div class="menu"><h2 style="margin:0">Warp to floor (debug)</h2>`
      + FLOORS.map((n, i) => `<button class="mc" data-floor="${i}">${i} · ${n}</button>`).join("") + `<button class="mc" data-floor="-1">Cancel</button></div>`;
    el.onclick = async (e) => {
      const b = (e.target as Element).closest<HTMLElement>("[data-floor]");
      if (!b && e.target !== el) return;
      closeWarp();
      if (!b || +b.dataset.floor! < 0) return;
      try { apply(await api("/api/debug/floor", { level: +b.dataset.floor! })); flash("Warped to " + FLOORS[+b.dataset.floor!]); }
      catch (err) { flash("Warp failed: " + (err as Error).message); }
    };
    document.body.append(el);
  }
  unlockPointer(); keys.clear();
  el.classList.add("on");
}
// ?god only: N (for nuke) blows up every monster on screen (not the necromancer, not cows, bats or snails): the engine kills them
// (kills as a sword's, counted toward the ladder), and each bursts apart here, flung out and up, then crumbles as a skeleton's bones do
// ?god, G: you shine like a god, wherever you go: a warm white light from you on everything in the scene (shading.ts uGodL), your body
// luminous and pulsing, a golden halo around you and a pool of light at your feet, all following you every frame
godState.godGlow = false; export let glowShown = false, godHalo: THREE.Group | null = null;
export let ghost: { x: number; z: number } | null = null;                                                            // ?god's ghost: { x, z } where you drift (Shift+G)
export const GHOST_TINT = new THREE.Color(0.75, 0.88, 1.0);
export function setGhost(on: boolean) {
  if (on && game.S) { const q = playerPos(performance.now()); ghost = { x: q.x, z: q.z }; pathing.pending = null; keys.clear(); flash("Ghost: drift through walls, touching nothing (Shift+G: back)"); }
  else if (!on && ghost) {
    // back in a body where the ghost is (Pete): the engine puts you on that tile, or the nearest one you could stand on
    const r = Math.floor(ghost.z), c = Math.floor(ghost.x);
    ghost = null;
    if (net.local) api("/api/debug/place", { r, c }).then((st) => { apply(st); view.from.copy(view.to); view.t0 = 0;   /* (there at once, no slide from where the body was) */ flash("Back in a body"); }).catch((e: Error) => flash("Couldn't land: " + e.message));
    else flash("Back in your body");
    if (game.player && !godState.godGlow) for (const m of (game.player.userData.mats || []) as MobMat[]) if (m.uniforms?.uEmissive) m.uniforms.uEmissive.value = 0;   // (its glow gone)
  }
  if (game.player && !lookState.lines) setAlpha(game.player, ghost ? 0.4 : 1);                   // half there
}
export function godFx(p: THREE.Vector3, now: number) {
  const pulse = 0.5 + 0.5 * Math.sin(now / 420);
  shared.uGodL.value.set(p.x, 1.4, p.z, godState.godGlow ? 3.0 + 0.4 * pulse : 0);
  if (godState.godGlow && !godHalo) {
    const radial = (stops: [number, string][]) => pixTex(64, 64, (g) => { const r = g.createRadialGradient(32, 32, 1, 32, 32, 32); for (const [k, c] of stops) r.addColorStop(k, c); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
    const add = { transparent: true, blending: THREE.AdditiveBlending, depthWrite: false };
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial([[0, "rgba(255,250,225,0.95)"], [0.35, "rgba(255,225,140,0.45)"], [1, "rgba(255,200,90,0)"]]), ...add }));
    halo.position.y = 1.0; halo.scale.set(3.2, 4.2, 1);
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshBasicMaterial({ map: radial([[0, "rgba(255,240,200,0.6)"], [0.4, "rgba(255,220,150,0.22)"], [1, "rgba(255,200,120,0)"]]), ...add }));
    pool.rotation.x = -Math.PI / 2; pool.position.y = 0.03;
    godHalo = new THREE.Group(); godHalo.add(halo, pool); godHalo.userData = { halo, pool };
    scene.add(godHalo);
  }
  if (godHalo) {
    godHalo.visible = godState.godGlow;
    godHalo.position.set(p.x, p.y || 0, p.z);
    godHalo.userData.halo.visible = game.player!.visible;                          // (first person: no halo in your face, the light still on all around)
    godHalo.userData.halo.material.opacity = 0.75 + 0.25 * pulse;
    godHalo.userData.pool.material.opacity = 0.8 + 0.2 * pulse;
  }
  if (godState.godGlow || glowShown) for (const m of game.player!.userData.mats as MobMat[]) m.uniforms.uEmissive.value = godState.godGlow ? 1.5 + 0.5 * pulse : 0;
  glowShown = godState.godGlow;
}
export async function nuke() {
  const now = performance.now(), v = new THREE.Vector3(), hit: [string, Entity][] = [];
  for (const [k, e] of mobs) {
    if (k[0] === "p") continue;
    v.copy(e.model.position).setY(0.8).project(camera);
    if (v.z < 1 && Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && camera.position.distanceTo(e.model.position) < 40) hit.push([k, e]);
  }
  if (!hit.length) { flash("Nuke: no monsters on screen"); return; }
  let s: GameState;
  try { s = await api("/api/debug/nuke", { cells: hit.map(([, e]) => [Math.floor(e.to.z), Math.floor(e.to.x)]) }); }
  catch (err) { flash("Nuke failed: " + (err as Error).message); return; }
  for (const [k, e] of hit) {                                                // (out of the map first: apply would lay them down dead)
    mobs.delete(k);
    bursts.puff(e.model.position.x, e.model.position.z, now, 1.8);
    shockwave(e.model.position.clone().setY(0.8), 2, e.model);
    sound.kill(e.model.position.x, e.model.position.z, e.kind);
    bones.start(e.model, 0, 0, now, { blast: true, colors: DUST[e.kind] || DUST.any });
  }
  sound.boom(game.S!.pos[1] + 0.5, game.S!.pos[0] + 0.5);
  apply(s);
  flash(`Nuked ${s.nuked} ${s.nuked === 1 ? "monster" : "monsters"}`);
}
