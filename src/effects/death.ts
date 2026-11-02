// Dying: falling, sinking into water or lava, the lava's fire, the death note and its cause.
import "./tunnel";
import * as THREE from "three";
import { B, isSolid } from "../../js/world";
import { $ } from "../core/shared";
import { scene } from "../render/scene";
import { hangState } from "./hang";
import { mobs } from "../core/game";
import type { GameState, Pos } from "../core/types";

/** Why health just dropped (damageCause): the words, the tombstone's icon, the needs at zero, and where the blow came from. */
export interface DamageCause {
  text: string;
  icon: string | null;
  /** The needs at zero ("food", "drop", "bolt"). */
  bars: string[];
  from?: Pos;
  shot?: boolean;
  melee?: boolean;
  /** A projectile's direction. */
  dir?: Pos;
}
/** A body falling back into water or lava: the tile's middle, splashed yet, lava, and the lava tiles it lies burning on ([x, z]). */
export interface DeathWater { x: number; z: number; splashed: boolean; lava?: boolean; fires?: [number, number][] }
/** A drop of the splash (render/player-pose). */
export interface SplashBit { m: THREE.Mesh<THREE.BoxGeometry, THREE.MeshBasicMaterial>; t0: number; v: THREE.Vector3 }
// this module's state that other modules set (one module can't assign another's let): meltHp, meltShown, lastCause, deathT, deathWater,
// deathBehind, deathSlumpK, deathSlump, deathForward, deathTimer, playerDip, slp
export interface DeathState {
  /** Into lava: the health you had stepping in, and what the hearts show as it drains (-1 none). */
  meltHp: number;
  meltShown: number;
  /** Why health last dropped. */
  lastCause: DamageCause | null;
  /** When you died (performance.now(); 0: alive). */
  deathT: number;
  deathWater: DeathWater | null;
  /** The tile behind you as you fell ([row, col]), or null. */
  deathBehind: Pos | null;
  /** Slumped against a wall: how far (0..1), and whether you are. */
  deathSlumpK: number;
  deathSlump: boolean;
  /** Fell forward. */
  deathForward: boolean;
  /** The death screen's timer. */
  deathTimer: ReturnType<typeof setTimeout> | null;
  /** How far your body sits lower in water. */
  playerDip: number;
  /** The sleep animation, 0..2 (frame loop). */
  slp: number;
}
export const deathState = {} as DeathState;

// death: the body falls backward over FALL_MS (in first person the view drops and tips up to the sky); a banner for deaths we watch
export const FALL_MS = 1100;
// into lava (Pete: a little slower, so the flames reach your head before the end): MELT_MS to sink, the head under at 70 %, then
// its fire alone for the last beat; meltHp: the health you had stepping in, drained on the hearts as you go (meltShown: what they show)
export const MELT_MS = 3300;
export const lavaDeath = (s: GameState | null) => !!(s && s.done && s.health <= 0 && s.map && s.map[s.pos[0] * s.size[1] + s.pos[1]] === B.LAVA);
export const dieMs = (s: GameState) => (lavaDeath(s) ? MELT_MS : deathState.deathWater ? SINK_MS : FALL_MS);
// a body falling back into water: deathWater { x, z: the water tile's middle, splashed }, set at the death (apply); it hits the water a
// little past halfway through the fall, splashes, and sinks out of sight over the rest of SINK_MS before the screen
deathState.playerDip = 0;
deathState.deathWater = null; export let splash: SplashBit[] = []; deathState.deathSlump = false; deathState.deathForward = false; deathState.deathBehind = null; deathState.deathSlumpK = 0;
export const leanable = (b: number) => isSolid(b) && b !== B.DARKNESS && b !== B.OOB && b !== B.INVALID;   // something to slump against (not unseen darkness)
export const mobOnTile = (r: number, c: number) => [...mobs.values()].some((e) => Math.floor(e.to.z) === r && Math.floor(e.to.x) === c);
export const SINK_MS = 2600, HIT_AT = FALL_MS * 0.55;
deathState.meltHp = 0; deathState.meltShown = -1;
// the fire as you sink into lava (frame, melt 0..1): a ring of short flame tongues at the lava's skin, eating whatever of you is
// still going under (Pete: not up to your head), glowing (bright enough to bloom, as lava does); once you are gone, a low flicker.
// burnK: how loud the burning is (sound.ambient), up as you go in, down as you're gone
export let lavaFlame: THREE.Group | null = null, lavaTex: THREE.CanvasTexture | null = null, burnK = 0;
export function lavaFire(melt: number, p: { x: number; z: number }, now: number, spread = 1) {                              // spread: wider, for a body lying in it
  burnK = melt ? Math.min(1, melt * 1.6) : 0;
  if (!melt) { if (lavaFlame) lavaFlame.visible = false; return; }
  if (!lavaFlame) {
    const cv = document.createElement("canvas"); cv.width = cv.height = 16;
    const g = cv.getContext("2d")!;
    for (let i = 0; i < 16; i++) for (let j = 0; j < 16; j++) {
      const k = Math.random();
      g.fillStyle = k > 0.88 ? "#fff2a0" : k > 0.6 ? "#ffb020" : k > 0.28 ? "#ff6a10" : "#c02a08"; g.fillRect(i, j, 1, 1);
    }
    lavaTex = new THREE.CanvasTexture(cv);
    lavaTex.magFilter = lavaTex.minFilter = THREE.NearestFilter; lavaTex.wrapS = lavaTex.wrapT = THREE.RepeatWrapping;
    const mat = new THREE.MeshBasicMaterial({ map: lavaTex, color: new THREE.Color(3.2, 2.0, 1.0), toneMapped: false, transparent: true, opacity: 0.92, side: THREE.DoubleSide, depthWrite: false });
    const flame = lavaFlame = new THREE.Group();
    for (let i = 0; i < 7; i++) {                                           // round the body where it meets the lava
      const a = (i / 7) * Math.PI * 2, w = 0.13 + 0.05 * (i % 3);
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1, w), mat); m.position.set(Math.cos(a) * 0.24, 0, Math.sin(a) * 0.2); m.userData.h = 0.75 + 0.25 * ((i * 5) % 3); flame.add(m);
    }
    for (const [x, z, w, h] of <[number, number, number, number][]>[[0, 0, 0.3, 1], [0.08, -0.06, 0.16, 1.35], [-0.09, 0.07, 0.14, 1.15]]) {   // the head's fire: once it's under, all that is left
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1, w), mat); m.position.set(x, 0, z); m.userData.h = h; m.userData.head = true; flame.add(m);
    }
    scene.add(lavaFlame);
  }
  lavaTex!.offset.y = (now / 700) % 1; lavaTex!.offset.x = Math.sin(now / 230) * 0.08;
  lavaFlame.visible = true;
  lavaFlame.position.set(p.x, 0, p.z); lavaFlame.scale.set(spread, 1, spread);
  // the ring flares up as you step in and burns round you as you sink; as your head goes under (70 %) it gives way to the head's own
  // fire, alone on the lava for the last beat before the screen (Pete)
  const ring = THREE.MathUtils.smoothstep(melt, 0, 0.15) * (1 - THREE.MathUtils.smoothstep(melt, 0.66, 0.76));
  const head = THREE.MathUtils.smoothstep(melt, 0.6, 0.72);
  lavaFlame.children.forEach((m, i) => {
    const k = m.userData.head ? 0.62 * head : 0.42 * ring;
    const h = Math.max(0.01, m.userData.h * k * (1 + 0.3 * Math.sin(now / (70 + i * 23) + i * 1.7)));
    m.visible = h > 0.02;
    m.scale.y = h; m.position.y = h / 2;
  });
}
// a body fallen back into lava (Pete): fire over each lava tile it lies on, flaring as it hits and burning as it sinks; the lava death's
// own flames, a copy for each tile
export const bodyFires: THREE.Group[] = [];
export function bodyFire(k: number, spots: [number, number][], now: number) {
  if (k > 0 && !lavaFlame) { lavaFire(0.01, { x: 0, z: 0 }, now); lavaFlame!.visible = false; }
  const flame = lavaFlame as THREE.Group | null;                            // (lavaFire made it, just above)
  if (flame) while (bodyFires.length < spots.length) { const g = flame.clone(); scene.add(g); bodyFires.push(g); }
  burnK = Math.max(burnK, k ? Math.min(1, k * 1.6) : 0);
  if (k > 0 && lavaTex) { lavaTex.offset.y = (now / 700) % 1; lavaTex.offset.x = Math.sin(now / 230) * 0.08; }
  const ring = THREE.MathUtils.smoothstep(k, 0, 0.12) * (1 - THREE.MathUtils.smoothstep(k, 0.8, 1));
  bodyFires.forEach((g, j) => {
    g.visible = k > 0 && j < spots.length; if (!g.visible) return;
    g.position.set(spots[j][0], 0, spots[j][1]); g.scale.set(1.8, 1, 1.8);
    g.children.forEach((m, i) => {
      const h = Math.max(0.01, m.userData.h * (m.userData.head ? 0.5 : 0.45) * ring * (1 + 0.3 * Math.sin(now / (70 + i * 23) + i * 1.7 + j)));
      m.visible = h > 0.02; m.scale.y = h; m.position.y = h / 2;
    });
  });
}
deathState.slp = 0;                                                             // the sleep animation, 0..2 (frame loop)
deathState.deathT = 0; deathState.deathTimer = null;
export function deathNote(title: string, sub: string) {
  let el = $("deathnote") as (HTMLElement & { _t?: ReturnType<typeof setTimeout> }) | null;
  if (!el) {
    el = document.createElement("div"); el.id = "deathnote";
    el.style.cssText = "position:fixed;left:50%;top:26%;transform:translateX(-50%);text-align:center;pointer-events:none;z-index:6;"
      + "transition:opacity .6s;font-family:inherit";
    document.body.appendChild(el);
  }
  el.innerHTML = `<div style="font-size:40px;color:#ff5555;text-shadow:3px 3px 0 #3f1010">${title}</div>`
    + `<div style="font-size:15px;color:#ffd0a0;text-shadow:2px 2px 0 #3f3f3f;margin-top:6px">${sub}</div>`;
  const note = el;
  note.style.opacity = "1";
  clearTimeout(note._t); note._t = setTimeout(() => (note.style.opacity = "0"), 4500);
}

// Why health just dropped. Craftax doesn't say, so read it off the state: lava underfoot, a melee mob beside you, an enemy projectile
// that was on or next to your tile, or a need at zero (Craftax drains health while food, water or energy is empty). An attack wins
// the death message over a need.
deathState.lastCause = null;
export const near = (a: Pos, b: Pos) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1])) <= 1;
export const MOB_DEATH: Record<string, string> = { zombie: "Killed by a zombie", skeleton: "Killed by skeleton", gnome_warrior: "Killed by a gnome", gnome_archer: "Killed by a gnome",
  orc_soldier: "Killed by an orc", orc_mage: "Killed by orc mage", lizard: "Killed by a lizard", kobold: "Killed by a kobold", knight: "Killed by a knight",
  knight_archer: "Killed by a knight", troll: "Killed by a troll", frost_troll: "Killed by a troll", deep_thing: "Killed by the deep", pigman: "Killed by a pigman",
  fire_elemental: "Burned by fire", ice_elemental: "Frozen by ice", necromancer: "Necromancer wins", necromancer_vulnerable: "Necromancer wins" };
export function damageCause(prev: GameState, s: GameState): DamageCause {
  const bars: string[] = [];
  if (s.food <= 0) bars.push("food");
  if (s.drink <= 0) bars.push("drop");
  if (s.energy <= 0) bars.push("bolt");
  if (performance.now() - hangState.scorchT < 2000) return { text: "Scorched by lava", icon: "fireball", bars };   // hanging at lava's edge (hangStart)
  // every cause fits the tombstone: none longer than "Died of exhaustion" (Pete)
  const needText: Record<string, string> = { food: "Starved", drop: "Died of thirst", bolt: "Died of exhaustion" };
  if (s.map[s.pos[0] * s.size[1] + s.pos[1]] === B.LAVA) return { text: "Burned up in lava", icon: "fireball", bars };
  const shot = [...prev.mob_projectiles, ...s.mob_projectiles].find((m) => near(m.pos, s.pos) || near(m.pos, prev.pos));
  if (shot) {
    const icon = shot.kind === "fireball" || shot.kind === "iceball" ? shot.kind : "arrow";
    const text = (<Record<string, string>>{ arrow: "Shot by an arrow", dagger: "Hit by a dagger", fireball: "Hit by a fireball", iceball: "Hit by an iceball", slimeball: "Hit by a slimeball" })[shot.kind] || "Shot from afar";
    return { text, icon, bars, from: shot.pos, shot: true, dir: shot.dir };
  }
  const mob = [...s.melee, ...prev.melee].find((m) => near(m.pos, s.pos));
  if (mob) return { text: MOB_DEATH[mob.kind] || "Killed by monster", icon: "sword", bars, from: mob.pos, melee: true };
  if (bars.length) return { text: needText[bars[0]], icon: null, bars };
  return { text: "Health ran out", icon: null, bars };
}
