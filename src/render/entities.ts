// Creatures and projectiles in the scene: their health bars, syncing them with the state, kills, the player's position.
import "../effects/death";
import * as THREE from "three";
import { drawHeart } from "../../js/hud";
import { sound } from "../core/shared";
import { scene } from "./scene";
import { bones, bursts, dying } from "./arm";
import { game, mobs, view } from "../core/game";
import { tileCenter } from "../effects/chest";
import { shockwave } from "../looks/looks";
import type { Entity } from "../core/game";
import type { Mob } from "../core/types";

// this module's state that other modules set (one module can't assign another's let): mobBarsOn
export interface Entities {
  /** Mob health bars shown (Settings → Gameplay → Show; remembered). */
  mobBarsOn: boolean;
}
export const entities = {} as Entities;

// Mob health (Settings → Gameplay → Show, Pete; off unless switched on, remembered): a mob below full health (you've hit it) carries
// a row of the hearts bar's own hearts over its head, a heart for every 2 of its health (at most 10: a big one's hearts hold more),
// full, half or empty; gone at full health or dead. Craftax's mob health, by kind (craftax.h *_health)
export const MOB_HP: Record<string, number> = { zombie: 5, gnome_warrior: 7, orc_soldier: 9, lizard: 11, knight: 12, troll: 20, pigman: 20, frost_troll: 24,
  skeleton: 3, gnome_archer: 5, orc_mage: 6, kobold: 8, knight_archer: 12, deep_thing: 4, fire_elemental: 14, ice_elemental: 16, cow: 3, bat: 4, snail: 6 };
entities.mobBarsOn = (() => { try { return localStorage.getItem("craftax3d.mobhp") !== "0"; } catch { return true; } })();   // on unless turned off (Pete: the default for new players)
// (its own object in the scene, following the mob, not a part of its model: the Target highlight measures the model, and a dying
// mob's model crumbles)
export const barBox = new THREE.Box3(), barred = new Set<Entity>();
export function sweepBars(): void {                                                     // a mob gone (killed, despawned, another floor): its hearts go too
  if (!barred.size) return;
  const live = new Set(mobs.values());
  for (const e of barred) if (!live.has(e)) { const b = e.hpBar!; scene.remove(b); b.material.map!.dispose(); b.material.dispose(); barred.delete(e); }
}
export function mobBar(e: Entity): void {
  const max = MOB_HP[e.kind], show = entities.mobBarsOn && max && e.hp > 0 && e.hp < max - 0.01;
  let b = e.hpBar;
  if (!show) { if (b) b.visible = false; return; }
  const n = Math.min(10, Math.ceil(max / 2)), per = max / n, W = n * 10 - 1;
  if (!b) {
    const cv = document.createElement("canvas"); cv.width = W; cv.height = 9;
    const tex = new THREE.CanvasTexture(cv); tex.magFilter = tex.minFilter = THREE.NearestFilter; tex.colorSpace = THREE.SRGBColorSpace;
    b = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
    b.renderOrder = 6; b.userData.cv = cv;
    b.userData.top = barBox.setFromObject(e.model).max.y - e.model.position.y + 0.38;   // over its head, as it stands
    b.scale.set(0.2 * W / 9, 0.2, 1);                                   // a heart 0.2 of a block tall (Pete: bigger)
    scene.add(b); e.hpBar = b; barred.add(e);
  }
  b.position.set(e.model.position.x, e.model.position.y + b.userData.top, e.model.position.z);
  if (b.userData.hp !== e.hp) {
    b.userData.hp = e.hp;
    const g = (b.userData.cv as HTMLCanvasElement).getContext("2d")!; g.clearRect(0, 0, W, 9);
    for (let i = 0; i < n; i++) drawHeart(g, Math.max(0, Math.min(1, (e.hp - i * per) / per)) >= 1 ? 1 : (e.hp - i * per) / per >= 0.5 ? 0.5 : 0, i * 10, 0);
    b.material.map!.needsUpdate = true;
  }
  b.visible = true;
}
// a number for one creature, the same each time it's drawn: its slot (Craftax's) on this floor of this world, so a reload or a replay
// gives it again (a theme's look that varies between creatures: one reindeer in ten has a glowing nose)
const whoOf = (cls: string, id: number) => (Math.imul((game.S?.seed ?? 0) ^ Math.imul((game.S?.level ?? 0) + 1, 0x9e3779b1) ^ Math.imul(id + 1, 0x85ebca6b) ^ cls.charCodeAt(0), 0xc2b2ae35) >>> 0);
export function syncEntities(map: Map<string, Entity>, list: Iterable<[string, Mob]>, make: (kind: string, theme?: undefined, who?: number) => THREE.Object3D, reset: boolean, now: number): void {
  const seen = new Set<string>();
  for (const [cls, m] of list) {
    const key = cls + m.id;
    seen.add(key);
    let e: Entity | null | undefined = map.get(key);
    if (e && e.kind !== m.kind) { scene.remove(e.model); map.delete(key); e = null; }
    const to = tileCenter(m.pos);
    // Craftax reuses a mob's slot: one despawns and another spawns in it, same kind, the same step. A "move" of more than a few tiles
    // is that (Pete: cows seemed to jump far): the old one crumbles where it stood, the new one puffs into view, no slide between them
    // A slot whose health went UP is a new one too (Craftax only sets a mob's health when it spawns): the one you killed fell where it
    // stood, and the target you were hitting is gone with it, not the cow that took its slot (Pete: one kill became a cow-killing spree)
    if (e && map === mobs && !reset && m.hp > e.hp + 1e-3) {
      if (!killed(e, now)) { if (game.S && Math.hypot(e.to.z - game.S.pos[0] - 0.5, e.to.x - game.S.pos[1] - 0.5) < 14) bones.start(e.model, 0, 0, now, { lying: true, colors: DUST[e.kind] || DUST.any }); else scene.remove(e.model); }
      map.delete(key); e = null;
    } else if (e && map === mobs && !reset && e.to.distanceTo(to) > 3.5) {
      if (game.S && Math.hypot(e.to.z - game.S.pos[0] - 0.5, e.to.x - game.S.pos[1] - 0.5) < 14) bones.start(e.model, 0, 0, now, { lying: true, colors: DUST[e.kind] || DUST.any });
      else scene.remove(e.model);
      map.delete(key); e = null;
    }
    if (!e) {
      const model = make(m.kind, undefined, whoOf(cls, m.id));
      model.position.copy(to);
      scene.add(model);
      e = { model, kind: m.kind, from: to.clone(), to: to.clone(), t0: now, hp: m.hp, hurtT: 0 };
      if (map === mobs && !reset && game.S && Math.hypot(m.pos[0] - game.S.pos[0], m.pos[1] - game.S.pos[1]) < 14) {   // a mob appears: a puff of dust, it pops up
        bursts.puff(to.x, to.z, now); e.popT = now; model.scale.setScalar(0.01);
      }
      if (m.dir) { const d = m.dir; e.model.rotation.y = Math.atan2(d[1], d[0]); }
      map.set(key, e);
      if (cls === "x" && !reset && game.S && Math.hypot(m.pos[0] - game.S.pos[0], m.pos[1] - game.S.pos[1]) < 10) {
        sound.whoosh(m.kind, to.x, to.z);                                     // an enemy shot: and the archer is seen to loose it
        let best: Entity | null = null, bd = 1.6;
        for (const [k, s] of mobs) if (k[0] === "r") { const d = s.to.distanceTo(to); if (d < bd) { bd = d; best = s; } }
        if (best) (best as Entity).model.userData.attackT = now / 1000;   // (set in the loop: TS does not narrow it back from null)
      }
    } else if (!to.equals(e.to)) {
      e.from.copy(e.model.position).setY(0); e.to.copy(to); e.t0 = now;
      if (reset) e.from.copy(to);
      // a knight's armour clanks as it walks (Pete), if it is near
      else if (map === mobs && game.S && String(e.kind).startsWith("knight") && Math.hypot(to.x - game.S.pos[1] - 0.5, to.z - game.S.pos[0] - 0.5) < 10) sound.armorStep(to.x, to.z);
    }
    if (m.hp < e.hp) {                                                      // hit: a flash, a thud and a stagger away from you
      e.hurtT = now;
      if (map === mobs && game.S) {
        sound.hit(e.model.position.x, e.model.position.z, e.kind);
        shockwave(e.model.position.clone().setY(0.8), 1, e.model);
        const dx = e.to.x - game.S.pos[1] - 0.5, dz = e.to.z - game.S.pos[0] - 0.5, n = Math.hypot(dx, dz) || 1;
        e.stag = { t: now, dx: dx / n, dz: dz / n };
      }
    }
    e.hp = m.hp; e.dir = m.dir;
  }
  for (const [k, e] of map) if (!seen.has(k)) {
    if (reset || map !== mobs) scene.remove(e.model);
    else if (!killed(e, now)) {                                              // gone without a kill (it despawned): it crumbles to dust where it stood
      if (game.S && Math.hypot(e.to.z - game.S.pos[0] - 0.5, e.to.x - game.S.pos[1] - 0.5) < 14) bones.start(e.model, 0, 0, now, { lying: true, colors: [0xc8c2b4, 0x8a8478] });
      else scene.remove(e.model);
    }
    map.delete(k);
  }
}

// a mob that vanished near you was killed (Craftax only despawns mobs far away): it falls over dead. A cow is only ever eaten from
// the tile next to you, and its steak comes to you; anything else may have been shot, so up to 6 tiles off counts.
export const DUST: Record<string, number[]> = { zombie: [0x6a9a4a, 0x3c4a30], cow: [0xf0ece0, 0x5a3a20], any: [0xa89a88, 0x5a5048] };   // the dust a body leaves, by kind
export function killed(e: Entity, now: number): boolean {
  const S = game.S!;
  const dist = Math.abs(e.to.z - S.pos[0] - 0.5) + Math.abs(e.to.x - S.pos[1] - 0.5), cow = e.kind === "cow";
  if (dist > (cow ? 1.01 : 6.01)) return false;
  const yaw = e.model.rotation.y, px = S.pos[1] + 0.5 - e.model.position.x, pz = S.pos[0] + 0.5 - e.model.position.z;
  if (e.kind === "skeleton") bones.start(e.model, S.pos[1] + 0.5, S.pos[0] + 0.5, now);    // a skeleton falls into a heap of bones
  else dying.start(e.model, px * Math.cos(yaw) - pz * Math.sin(yaw) > 0 ? 1 : -1, now, cow,    // roll away from the player
    (m: THREE.Object3D, t: number) => bones.start(m, 0, 0, t, { lying: true, colors: DUST[e.kind] || DUST.any }));   // then fades away into its dust (Pete: no sinking)
  sound.kill(e.model.position.x, e.model.position.z, e.kind);               // the killing blow: heavy, in the mob's own voice (a cow: no angry moo over the eating)
  shockwave(e.model.position.clone().setY(0.8), 1.5, e.model);              // a kill: a bigger wave
  return true;
}

export function playerPos(now: number): THREE.Vector3 {
  const a = Math.min(1, (now - view.t0) / view.dur);
  return view.from.clone().lerp(view.to, a);
}
