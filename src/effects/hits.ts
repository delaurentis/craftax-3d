// Hits and their effects: knockback, trampled grass, sealed doors' glow, the Necromancer's shield and glow.
import "../ui/screens/panel";
import * as THREE from "three";
import { B } from "../../js/world";
import { shared } from "../../js/shading";
import { REPLAY } from "../../js/local";
import { net } from "../../js/net";
import { $, DIRV, sound } from "../core/shared";
import { camera, scene } from "../render/scene";
import { grass3d } from "../render/quality";
import { bursts, world } from "../render/arm";
import { api, flat, game, mobs } from "../core/game";
import { apply } from "../core/apply";
import { lookState } from "../looks/looks";
import { hints, isSealed } from "../ui/hud/hint";
import { botDriving } from "../ui/screens/screen";
import type { GameState } from "../core/types";

/** A stagger of your own body: when, the push (x, z), how far and how long, and whether it kicks the view (render/player-pose). */
export interface PlayerStag { t: number; dx: number; dz: number; amp: number; ms: number; kick: boolean }
// this module's state that other modules set (one module can't assign another's let): lastMow, bossHitT, shakeT, playerStag, cursorFree,
// necroShield, nextGroan, nextFarMoan
export interface HitState {
  /** The last tile of grass cut, and when. */
  lastMow: { r: number; c: number; t: number } | null;
  /** The Necromancer last hit (performance.now()). */
  bossHitT: number;
  /** The view's shake since then. */
  shakeT: number;
  playerStag: PlayerStag | null;
  /** The cursor shown as a crosshair (render/targeting); null before the first frame. */
  cursorFree: boolean | null;
  /** His purple glow (made the first time he's protected, necroFx). */
  necroShield: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial> | null;
  /** When the next creature groan and far moan may play. */
  nextGroan: number;
  nextFarMoan: number;
}
export const hitState = {} as HitState;
/** A blow's view tilt: when, which way it rolls (±1), and the push. */
export interface Reel { t: number; roll: number; dx: number; dz: number }

hitState.cursorFree = null; hitState.nextGroan = 0; hitState.nextFarMoan = 0; hitState.shakeT = 0; hitState.playerStag = null;
// hit (Pete): the view tilts away from the blow (a roll, fading in 0.45 s), and you stagger for a moment, swaying as at lava's edge.
// Knockback (Settings → Gameplay → Bump, off unless switched on; a mod, human play only, your own world in the browser): a second hit
// while you're still staggering throws you back a tile, away from it, if that tile is open (local.ts /api/shove, by the walking rule)
export const REEL_MS = 900;
export let reel: Reel | null = null;                                                            // { t, roll: ±1, dx, dz }
export let knockOn = (() => { try { return localStorage.getItem("craftax3d.knockback") === "1"; } catch { return false; } })();
($("opt-knockback") as HTMLInputElement).checked = knockOn;
$("opt-knockback")!.onchange = (e) => { knockOn = (e.target as HTMLInputElement).checked; try { localStorage.setItem("craftax3d.knockback", knockOn ? "1" : "0"); } catch {} };
export function hitReel(dx: number, dz: number, s: GameState) {
  const now = performance.now(), staggering = reel && now - reel.t < REEL_MS;
  // which way to roll: the blow's push against the view's right (yaw: the camera looks along -sin, -cos)
  const right = dx * Math.cos(game.yaw) - dz * Math.sin(game.yaw);
  reel = { t: now, roll: right >= 0 ? -1 : 1, dx, dz };
  if (!staggering || !knockOn || !net.local || REPLAY || botDriving() || s.done) return;
  const [dr, dc] = Math.abs(dz) >= Math.abs(dx) ? [Math.sign(dz), 0] : [0, Math.sign(dx)];
  if (dr || dc) api("/api/shove", { dr, dc }).then(apply).catch(() => {});
}
export function reelView(now: number) {                                                    // the frame: the tilt and the sway, first person
  if (!reel || game.third || flat.t > 0) return;
  const a = (now - reel.t) / REEL_MS;
  if (a >= 1) { reel = null; return; }
  const tilt = Math.min(1, a * 9) * (1 - THREE.MathUtils.smoothstep(a, 0.1, 0.5));   // in fast, out by half way
  const sway = Math.sin((now - reel.t) / 95) * (1 - a) * (1 - a);           // the stagger: side to side, dying away
  camera.rotateZ(reel.roll * 0.22 * tilt + 0.05 * sway);
  camera.position.x += Math.cos(game.yaw) * 0.06 * sway; camera.position.z -= Math.sin(game.yaw) * 0.06 * sway;
}
// the Necromancer (Pete): while protected, a purple glow round him, breathing; when hit (bossHitT, apply), he rumbles where he stands
// trodden grass (Pete: it clipped through you and the creatures): the tile you or a creature stands on has its grass pressed flat
// (shading.ts), and it stands up again slowly once left, over TRAMPLE_MS. A texel a tile, sent each frame (a few KB)
export const TRAMPLE_MS = 12000, MOWN_MS = 90000;
export let tramT: (Float64Array & { level?: number }) | null = null, mowT: Float64Array | null = null, tramTex: THREE.DataTexture | null = null, tramW = 0, tramH = 0;
// grass hit (Pete): its blades and flowers cut down to the ground, growing back over MOWN_MS (g of the same texture)
export function mow(r: number, c: number) {
  if (!grass3d) return;                                                      // (no 3D grass: nothing to cut)
  if (mowT && r >= 0 && c >= 0 && r < tramH && c < tramW) mowT[r * tramW + c] = performance.now();
  bursts.clippings(r, c, performance.now()); sound.grassCut(c + 0.5, r + 0.5);   // (Pete: a sound, and the clippings)
  hitState.lastMow = { r, c, t: performance.now() };
}
hitState.lastMow = null;
export function trampleFx(now: number, p: THREE.Vector3) {
  if (!game.S || !grass3d) return;                                                // (no 3D grass: nothing to trample, Pete)
  const W = game.S.size[1], H = game.S.size[0];
  if (!tramTex || tramW !== W || tramH !== H || tramT!.level !== game.S.level) {
    tramW = W; tramH = H; tramT = new Float64Array(W * H).fill(-1e9); tramT!.level = game.S.level; mowT = new Float64Array(W * H).fill(-1e9);
    tramTex?.dispose();
    tramTex = new THREE.DataTexture(new Uint8Array(W * H * 4), W, H, THREE.RGBAFormat);
    tramTex.minFilter = tramTex.magFilter = THREE.NearestFilter;
    shared.uTrample.value = tramTex; shared.uTrampleSz.value.set(W, H);
  }
  const tr = tramT!, mw = mowT!, tex = tramTex!;
  const at = (x: number, z: number) => { const c = Math.floor(x), r = Math.floor(z); if (r >= 0 && c >= 0 && r < H && c < W) tr[r * W + c] = now; };
  at(p.x, p.z);
  for (const e of mobs.values()) at(e.model.position.x, e.model.position.z);
  const d = tex.image.data as Uint8Array;
  for (let i = 0; i < W * H; i++) {
    const k = Math.max(0, Math.min(1, 1 - (now - tr[i] - 400) / TRAMPLE_MS));   // (pressed flat at once, held a moment, then rising)
    d[i * 4] = Math.round(255 * k * k * (3 - 2 * k));
    const g = Math.max(0, Math.min(1, 1 - (now - mw[i]) / MOWN_MS));
    d[i * 4 + 1] = Math.round(255 * Math.min(1, g * 1.4));                   // (cut, then growing back, the last of it quickly)
  }
  tex.needsUpdate = true;
}
// a sealed ladder down (Pete): the necromancer's purple glow over its grate, a force field, pulsing; gone the moment it opens. Only
// when you try it (Pete: not always on): a click on it or a try at going down flares it for SEAL_GLOW ms, fading out at the end
export const SEAL_GLOW = 2500;
export let sealCards: THREE.Group[] = [], sealOf: number[] | null = null;
export function sealFx(now: number) {
  if (!game.S || !game.S.items) return;
  if (sealOf !== game.S.items) {                                                  // (the tiles: looked for once a state)
    sealOf = game.S.items;
    const at: [number, number, number][] = [];
    for (let i = 0; i < game.S.items.length; i++) if (isSealed(game.S, game.S.items[i])) at.push([Math.floor(i / game.S.size[1]), i % game.S.size[1], i]);
    while (sealCards.length < at.length) {
      const cv = document.createElement("canvas"); cv.width = cv.height = 64;
      // the whole square lit (Pete), brightest in the middle, softening only at its edges
      const g = cv.getContext("2d")!, img = g.createImageData(64, 64);
      for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) {
        const u = Math.abs(x - 31.5) / 32, v = Math.abs(y - 31.5) / 32, e = Math.max(u, v), m = Math.hypot(u, v) / Math.SQRT2, o = 4 * (y * 64 + x);
        img.data[o] = 200 - 70 * m; img.data[o + 1] = 120 - 80 * m; img.data[o + 2] = 255 - 40 * m;
        img.data[o + 3] = 255 * (0.9 - 0.4 * m) * Math.min(1, (1 - e) / 0.15);
      }
      g.putImageData(img, 0, 0);
      const mat = () => new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(cv), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
      // flat on the grate and no bigger than it (Pete: on the seal only, nothing standing up; world.ts draws the grate 0.1 to 0.9)
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), mat()); pool.rotation.x = -Math.PI / 2; pool.position.y = 0.04;
      const grp = new THREE.Group(); grp.add(pool); grp.userData = { pool }; grp.renderOrder = 3;
      scene.add(grp); sealCards.push(grp);
    }
    sealCards.forEach((g, k) => { g.userData.on = k < at.length; g.userData.i = at[k] ? at[k][2] : -1; if (at[k]) g.position.set(at[k][1] + 0.5, 0, at[k][0] + 0.5); });
  }
  const b = 0.5 + 0.5 * Math.sin(now / 420), age = now - hints.sealGlowT;
  const f = age < 0 || age > SEAL_GLOW ? 0 : Math.min(1, age / 150, (SEAL_GLOW - age) / 800);   // (in fast, out slowly)
  // and its light, cast out past the grate onto the ground and up the walls round it while it glows (Pete): the nearest one to you
  let near: THREE.Group | null = null, nd = 1e9;
  if (f > 0 && !lookState.lines) for (const g of sealCards) if (g.userData.on) { const d = Math.hypot(g.position.x - game.S!.pos[1] - 0.5, g.position.z - game.S!.pos[0] - 0.5); if (d < nd) { nd = d; near = g; } }
  if (near) shared.uSealL.value.set(near.position.x, 0.35, near.position.z, (1.1 + 0.4 * b) * f); else shared.uSealL.value.w = 0;
  for (const g of sealCards) {
    g.visible = g.userData.on && g.userData.i === hints.sealGlowAt && !lookState.lines && f > 0;   // (only the ladder you tried)                             // (laser/phosphor: no blended glow over its colours, as his halo)
    if (!g.visible) continue;
    g.userData.pool.material.opacity = (0.65 + 0.35 * b) * f;
  }
}
hitState.bossHitT = 0; hitState.necroShield = null; export let shieldHitT = 0;
// a blow at him while he's protected (Pete): the glow flares up, a force-field thrum, and you're thrown back a little, staggering
// within your own tile (the engine doesn't move you: Craftax ignores the blow)
export function shieldRepel(dir: number) {
  const d = DIRV[dir];
  if (!d || !game.S || game.S.level !== 8 || game.S.boss_vulnerable || world.at(game.S.pos[0] + d[0], game.S.pos[1] + d[1]) !== B.NECROMANCER) return;
  const now = performance.now();
  shieldHitT = now;
  hitState.playerStag = { t: now, dx: -d[1], dz: -d[0], amp: 0.38, ms: 420, kick: true };
  sound.forceField?.(game.S.pos[1] + 0.5 + d[1], game.S.pos[0] + 0.5 + d[0]);
}
export let necroWaveT = 0;                                                         // phosphor: the last swell of his outline (necroFx)
// the Necromancer's own glow (phosphor): his surfaces lit from within (shading.ts uEmissive), 0 his own look; each material's own value kept
export function necroGlow(n: THREE.Object3D, k: number) {
  if (n.userData.glowK === k) return;
  n.userData.glowK = k;
  n.traverse((obj) => { const o = obj as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>, u = o.isMesh && o.material?.uniforms?.uEmissive; if (!u) return; o.material.userData.em0 ??= u.value; u.value = k > 0 ? Math.max(o.material.userData.em0, k) : o.material.userData.em0; });
}
