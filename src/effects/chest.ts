// A chest opening, the world rebuild (flushWorld), and the warnings when a need runs low.
import { game } from "../core/game";
import * as THREE from "three";
import { makeMob } from "../../js/models";
import { iconURL } from "../../js/textures";
import { REPLAY } from "../../js/local";
import { sound } from "../core/shared";
import { scene } from "../render/scene";
import { world } from "../render/arm";
import { isTouch } from "../input/intent";
import type { IconKind } from "../resources/items/icons";
import type { GameState, Pos } from "../core/types";

// this module's state that other modules set (one module can't assign another's let): worldDirty, needOn, needOnce
export interface ChestState {
  /** The world needs rebuilding from the state (flushWorld). */
  worldDirty: boolean;
  /** Settings → Gameplay: the low-need pop-ups, and only once a game. */
  needOn: boolean;
  needOnce: boolean;
}
export const chestState = {} as ChestState;
/** A chest opening: its group, the lid's hinge, the gold halo, the materials that fade, when it began. */
export interface ChestFx { g: THREE.Group; hinge: THREE.Group; halo: THREE.Sprite; mats: THREE.MeshBasicMaterial[]; t0: number }

// a chest opened (Pete): Craftax turns it to floor and hands over its loot at once; here a chest stays where it stood, its lid swings
// open on gold inside, light welling out of it, then it sinks away, while the loot pops up in the middle of the screen (hud.loot)
export const CHEST_MS = 2200;
export const chestFx: ChestFx[] = [];
export let chestTex: Record<string, THREE.Texture> | null = null;
export function chestOpen(r: number, c: number) {
  if (!chestTex) chestTex = Object.fromEntries(["chest_top", "chest_side", "chest_front"].map((k) => {
    const t = new THREE.TextureLoader().load(iconURL(k)); t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; return [k, t];
  }));
  const L = Math.max(0.35, world.lightAt(r, c)), shade = new THREE.Color(L, L, L);
  const tex = chestTex;
  const mat = (k: string) => new THREE.MeshBasicMaterial({ map: tex[k], color: shade, transparent: true });
  const side = mat("chest_side"), front = mat("chest_front"), top = mat("chest_top");
  // inside (Pete): the open box shows its treasure, a pixel glow of gold, and a soft halo of gold light rises out of it
  if (!tex.inside) {
    const cv = document.createElement("canvas"); cv.width = cv.height = 16;
    const g2 = cv.getContext("2d")!;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5)), n = ((x * 7 + y * 13) % 5) / 5;
      g2.fillStyle = d > 6.5 ? "#5a3412" : d > 4.5 ? (n > 0.5 ? "#c88a20" : "#a86c18") : n > 0.6 ? "#fff6c0" : n > 0.2 ? "#ffd84a" : "#f0b830";
      g2.fillRect(x, y, 1, 1);
    }
    const t = new THREE.CanvasTexture(cv); t.magFilter = t.minFilter = THREE.NearestFilter; t.colorSpace = THREE.SRGBColorSpace; tex.inside = t;
    const hv = document.createElement("canvas"); hv.width = hv.height = 64;
    const h2 = hv.getContext("2d")!, grd = h2.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, "rgba(255,230,140,1)"); grd.addColorStop(0.4, "rgba(255,200,80,.45)"); grd.addColorStop(1, "rgba(255,180,40,0)");
    h2.fillStyle = grd; h2.fillRect(0, 0, 64, 64);
    tex.halo = new THREE.CanvasTexture(hv);
  }
  const inside = new THREE.MeshBasicMaterial({ map: tex.inside, transparent: true });   // lit by its own gold: no shade
  const W = 0.86, H = 0.875, g = new THREE.Group();
  // the box (its front facing you, open at the top) and the lid, hinged along the back edge; the lid's underside is plain wood
  const box = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.62, W), [side, side, inside, top, front, side]);
  box.position.y = H * 0.31; g.add(box);
  const hinge = new THREE.Group(); hinge.position.set(0, H * 0.62, -W / 2); g.add(hinge);
  const lid = new THREE.Mesh(new THREE.BoxGeometry(W, H * 0.38, W), [side, side, top, side, side, side]);
  lid.position.set(0, H * 0.19, W / 2); hinge.add(lid);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.halo, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  halo.position.y = H * 0.62 + 0.25; halo.scale.setScalar(1.5); g.add(halo);
  g.position.set(c + 0.5, 0, r + 0.5);
  g.rotation.y = Math.atan2(game.S!.pos[1] - c, game.S!.pos[0] - r);                     // its front toward you
  scene.add(g);
  chestFx.push({ g, hinge, halo, mats: [side, front, top, inside], t0: performance.now() });
  sound.chest(c + 0.5, r + 0.5);
}
export function chestUpdate(now: number) {
  for (let i = chestFx.length - 1; i >= 0; i--) {
    const f = chestFx[i], e = (now - f.t0) / CHEST_MS;
    if (e >= 1) { scene.remove(f.g); f.g.traverse((o) => { (o as THREE.Mesh).geometry?.dispose(); }); f.halo.material.dispose(); f.mats.forEach((m) => m.dispose()); chestFx.splice(i, 1); continue; }
    const open = THREE.MathUtils.smootherstep(Math.min(1, (e - 0.08) / 0.2), 0, 1);   // a beat, then the lid flies back
    f.hinge.rotation.x = -1.9 * open + Math.sin(Math.min(1, Math.max(0, (e - 0.28) / 0.15)) * Math.PI) * 0.15;   // and bounces
    const out = THREE.MathUtils.smoothstep(e, 0.72, 1);                    // then it sinks into the floor and fades
    f.halo.material.opacity = 0.75 * open * (1 - out) * (0.85 + 0.15 * Math.sin(now / 80));   // the gold light, flickering a little
    f.g.position.y = -0.9 * out;
    f.mats.forEach((m) => (m.opacity = 1 - out));
  }
}

export function tileCenter(p: Pos) { return new THREE.Vector3(p[1] + 0.5, 0, p[0] + 0.5); }

chestState.worldDirty = false; export let buildAt = 0, buildMs = 0;
export const propMob = (kind: string, r: number, c: number) => { const m = makeMob(kind); m.position.set(c + 0.5, 0, r + 0.5); m.userData.prop = true; m.userData.kind = kind; return m; };
export function flushWorld() {
  if (!chestState.worldDirty || !game.S) return;
  chestState.worldDirty = false;
  const t = performance.now();
  if (world.update(game.S, propMob)) { buildMs = performance.now() - t; buildAt = performance.now(); }
}
export const buildGap = () => (game.S && game.S.world && game.S.world.control === "bot" ? Math.max(250, 15 * buildMs) : 0);
setInterval(() => { if (chestState.worldDirty && performance.now() - buildAt >= buildGap()) flushWorld(); }, 200);   // (the bot paused or stopped)
// a need running low, the first time in a game (Pete): water or energy down to 2, food to 1, a pop-up says what to do; each once a
// game (a new seed, or the clock back at the start, is a new game); not for the bot or a replay; Settings → Gameplay → Show turns it off
export const NEEDS: [keyof GameState & ("drink" | "energy" | "food"), number, IconKind, string, string | (() => string)][] = [["drink", 2, "drop", "Thirsty!", "Drink some water"], ["energy", 2, "bolt", "Tired!", () => (isTouch() ? "Get some sleep" : "Push Z to sleep")], ["food", 1, "food", "Hungry!", "Get some food"]];
export let needsShown = new Set<string>(); chestState.needOn = (() => { try { return localStorage.getItem("craftax3d.needwarn") !== "0"; } catch { return true; } })();
chestState.needOnce = (() => { try { return localStorage.getItem("craftax3d.needonce") !== "0"; } catch { return true; } })();
export function needWarn(prev: GameState | null, s: GameState) {
  if (!prev || prev.seed !== s.seed || s.timestep < prev.timestep) needsShown = new Set<string>();
  if (!prev || !chestState.needOn || REPLAY || s.done || (s.world && (s.world.control === "bot" || s.world.control === "replay"))) return;
  for (const [k, low, icon, head, line] of NEEDS) {
    if ((chestState.needOnce && needsShown.has(k)) || !(s[k] <= low && prev[k] > low)) continue;   // (Once per game off: each time it drops that low)
    needsShown.add(k); if (game.hud) game.hud.need(icon, head, typeof line === "function" ? line() : line); return;              // one at a time; another that is low too shows on its next change
  }
}
