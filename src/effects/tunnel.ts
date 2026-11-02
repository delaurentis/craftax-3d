// Through the portal: the 2D pixel tunnel, the 3D tunnel and the fall onto the new world, the portal's look.
import { endUnmake, portalT, unmakeFx, victory } from "./victory";
import * as THREE from "three";
import { shared, makeMaterial } from "../../js/shading";
import { tunnel2D } from "../../js/art2d";
import { net } from "../../js/net";
import { $, sound } from "../core/shared";
import { camera, scene } from "../render/scene";
import { bursts, world } from "../render/arm";
import { api, flat, game } from "../core/game";
import { apply } from "../core/apply";
import { inkLook, lookState, view2d } from "../looks/looks";
import { simCaption } from "../looks/phosphor/caption";
import { refresh2D } from "../views/views";
import { flash } from "../ui/hud/hint";
import { play } from "../ui/screens/screen";
import { clearEntities } from "../ui/hud/buttons";
import { hitState } from "./hits";

// this module's state that other modules set (one module can't assign another's let): spawnDrop
export interface TunnelState {
  /** Out of the tunnel: dropped from the sky onto your spawn, since t0 (null: not falling). */
  spawnDrop: { t0: number } | null;
}
export const tunnelState = {} as TunnelState;

// through the portal in the original 2D art: the view becomes a pixel tunnel of the portal's green speckle (art2d.ts tunnel2D) for
// TUNNEL_MS, the caption typed over it, the new world loaded meanwhile; then the new Overworld, in the same art, "A new world..."
export let tunnel2DOn = false;
export async function enterPortal2D(wait: (ms: number) => Promise<void>) {
  tunnel2DOn = true;
  const t0 = performance.now(), tick = setInterval(() => { view2d.src = tunnel2D((performance.now() - t0) / 1000); }, 70);
  view2d.src = tunnel2D(0);
  setTimeout(() => simCaption(["The simulation", "contains", "infinite worlds."], TUNNEL_MS - 400), 200);
  try { apply(await api("/api/reset", { seed: (Math.random() * 2 ** 31) | 0 })); } catch (e) { flash((e as Error).message); }
  clearEntities(); scene.remove(victory.portal!); victory.portal = null; victory.portalAt = null; victory.victorySeed = null; victory.sparks = null; shared.uPortalL.value.w = 0;
  endUnmake(); world.resetGreen();
  $("victory")!.classList.remove("on", "going", "fade");
  await wait(Math.max(0, TUNNEL_MS - (performance.now() - t0)));
  clearInterval(tick); tunnel2DOn = false; refresh2D();
  victory.entering = false;
  play();
  simCaption("A new world...", 3200, "12%");
  setTimeout(() => $("pcap")?.classList.add("white"), 1600);
}
export const GLYPHS = "0123456789ABCDEF<>/\\#$%&*+=:;{}[]|~^ABCDEFGHJKLMNPQRSTUVWXYZ";
// the tunnel (Pete: real phosphor, never a picture of it): real geometry far below the world, a tube of small blocks in a helix,
// thousands of them in six meshes so neighbours differ and the code-art pass outlines every one; it lights itself (shading.ts TUNNEL:
// rings of light rushing along it, spiral bands round it), spins as you fall, and the camera rides down it for TUNNEL_MS
export const DIVE_MS = 1000, TUNNEL_MS = 3000, TUN_Y = -400;
export let tunnel: { group: THREE.Group; t0: number; len: number } | null = null;
// out of the tunnel (Pete): you fall out of the sky onto your spawn point, the camera and you together, gathering speed like a real
// fall and looking down at the ground coming up; the landing jolts the view, a thud and a puff of dust
export const DROP_MS = 1500, DROP_H = 45;
tunnelState.spawnDrop = null;
export function dropFx(now: number) {
  const k = Math.min(1, (now - tunnelState.spawnDrop!.t0) / DROP_MS), h = DROP_H * (1 - k * k);   // falling: slow at first, then fast
  camera.position.y += h;
  if (game.player) game.player.position.y += h;
  if (flat.t === 0) camera.rotateX(-0.9 * (1 - k) * (1 - k));                 // looking down at where you'll land
  if (k >= 1) {
    tunnelState.spawnDrop = null; hitState.shakeT = now; sound.land?.();
    if (game.S) bursts.puff(game.S.pos[1] + 0.5, game.S.pos[0] + 0.5, now, 1.2);
  }
}
export function mergeBoxes(list: THREE.BufferGeometry[]) {                                               // the boxes as one geometry (no BufferGeometryUtils here)
  let nv = 0, ni = 0;
  for (const g of list) { nv += g.attributes.position.count; ni += g.index!.count; }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2), idx = new Uint32Array(ni);
  let v = 0, i = 0;
  for (const g of list) {
    pos.set(g.attributes.position.array, v * 3); nor.set(g.attributes.normal.array, v * 3); uv.set(g.attributes.uv.array, v * 2);
    for (let k = 0; k < g.index!.count; k++) idx[i + k] = g.index!.array[k] + v;
    v += g.attributes.position.count; i += g.index!.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3)); out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2)); out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
export function startTunnel() {
  const group = new THREE.Group(), R = 2.6, PER = 26, N = 150, GAP = 0.55, sets = Array.from({ length: 6 }, (): THREE.BoxGeometry[] => []);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < N; i++) for (let j = 0; j < PER; j++) {
    const a = (j / PER) * Math.PI * 2 + i * 0.09, h = ((i * 73856093 ^ j * 19349663) >>> 0) % 1000 / 1000;   // a helix: each ring turned on
    const r = R + (h - 0.5) * 0.5;                                                                       // a little, rough and uneven
    const g = new THREE.BoxGeometry(0.5, 0.28, 0.42);
    m4.compose(p.set(Math.cos(a) * r, Math.sin(a) * r, -i * GAP), q.setFromEuler(e.set(0, 0, a + Math.PI / 2)), sc.set(1 + h * 0.6, 1, 1 + (1 - h) * 0.4));
    g.applyMatrix4(m4);
    sets[(i * 5 + j * 2) % 6].push(g);
  }
  for (const list of sets) {
    const mat = makeMaterial("mob", { color: 0x9affb0 }); mat.defines.STILL = ""; mat.defines.TUNNEL = ""; mat.side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(mergeBoxes(list), mat); mesh.frustumCulled = false; group.add(mesh);
    for (const g of list) g.dispose();
  }
  const x = game.S ? game.S.pos[1] + 0.5 : 24, z = game.S ? game.S.pos[0] + 0.5 : 24;
  group.position.set(x, TUN_Y, z);
  scene.add(group);
  shared.uTunnel.value.set(x, TUN_Y, 0, 1);
  tunnel = { group, t0: performance.now(), len: N * GAP };
}
export function endTunnel() {
  if (!tunnel) return;
  scene.remove(tunnel.group);
  for (const m of tunnel.group.children as THREE.Mesh<THREE.BufferGeometry, THREE.Material>[]) { m.geometry.dispose(); m.material.dispose(); }
  shared.uTunnel.value.w = 0; tunnel = null;
}
export function tunnelCam(now: number) {                                                // per frame while riding: the camera falls down it as it spins
  const tn = tunnel!;
  const t = (now - tn.t0) / 1000, k = Math.min(1, t / (TUNNEL_MS / 1000));
  tn.group.rotation.z = t * 0.6;
  const along = -(4 + (tn.len - 14) * (k * k * 0.4 + k * 0.6));     // speeding up
  camera.position.set(tn.group.position.x + Math.sin(t * 1.3) * 0.5, TUN_Y + Math.cos(t * 1.1) * 0.4, tn.group.position.z + along);
  camera.lookAt(tn.group.position.x + Math.sin(t * 1.3 + 0.8) * 0.9, TUN_Y + Math.cos(t * 1.1 + 0.8) * 0.7, camera.position.z - 8);   // it bends
  camera.rotateZ(t * 0.25);
  shared.uPlayer.value.copy(camera.position);                            // (code art: near is near the camera here)
}
// laser and phosphor read the frame as surface ids and light levels (shading.ts), so the portal's soft blends would write nonsense there:
// the gem flecks' additive alpha lifted their brick's light a notch (one square brighter, Pete) and the veil drew as a dark hole. In the
// line looks the gems, haze and pool hide, and the veil writes itself as a glowing surface (b > 2: the outline pass fills it like lava,
// churning green code in phosphor, Pete: green and bright, as it normally looks)
export const veilLineMat = new THREE.ShaderMaterial({
  uniforms: { uPlayer: shared.uPlayer, uTime: shared.uTime, uPhos: shared.uPhos }, side: THREE.DoubleSide,
  vertexShader: "varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }",
  fragmentShader: `uniform vec3 uPlayer; uniform float uTime, uPhos; varying vec3 vW;
    void main() {
      float ly = vW.y * 1.4 + 0.3 * sin(vW.x * 1.7 + uTime * 0.9), lf = abs(fract(ly + uTime * 0.12) - 0.5), lw = fwidth(ly);
      gl_FragColor = vec4(0.37, 0.61, uPhos > 0.5 ? 3.5 : 2.0 + 0.99 * (1.0 - smoothstep(lw * 1.2, lw * 2.6, lf)), clamp(distance(vW, uPlayer) / 64.0, 0.0, 0.999) + 7.0);   // phosphor: b 3.5 = the portal (the outline pass's code art)
    }`,
});
export function portalLook(on: boolean) {
  if (!victory.portal) return;
  const u = victory.portal.userData;
  u.glow.visible = u.pool.visible = !on;
  for (const g of u.gems) g.visible = !on;
  u.veil.material = on ? veilLineMat : u.veil.userData.mat;
}
export function victoryFx(now: number) {                                                    // frame loop: the portal rises and ripples; the sparks fly
  unmakeFx(now);
  if (victory.portal) {
    const u = Math.min(1, (now - portalT) / 1000);
    victory.portal.scale.setScalar(Math.max(0.01, u));
    const v = victory.portal.userData.veil, g = v.userData.cv.getContext("2d"), t = now / 600;
    if (!v.userData.at || now - v.userData.at > 70) {                        // inside (Pete): the phosphor look's characters, a grid of them in
      v.userData.at = now;                                                   // place, changing and shifting, their brightness in slow waves
      const W2 = v.userData.cv.width, H2 = v.userData.cv.height, C = 12, Rn = 24;
      const cells = v.userData.cells ??= Array.from({ length: C * Rn }, () => GLYPHS[(Math.random() * GLYPHS.length) | 0]);
      for (let k = 0; k < 14; k++) cells[(Math.random() * cells.length) | 0] = GLYPHS[(Math.random() * GLYPHS.length) | 0];   // a few change
      if (Math.random() < 0.08) { const r = (Math.random() * Rn) | 0; const row = cells.splice(r * C, C); row.unshift(row.pop()); cells.splice(r * C, 0, ...row); }   // a row shifts
      g.fillStyle = "#010a03"; g.fillRect(0, 0, W2, H2);
      g.font = "bold 8px ui-monospace, Menlo, monospace"; g.textBaseline = "top";
      g.shadowColor = "#2aff5a"; g.shadowBlur = 4;                           // each character haloed in its own green (Pete: glow more)
      for (let r = 0; r < Rn; r++) for (let c = 0; c < C; c++) {
        const k = 0.5 + 0.5 * Math.sin(r * 0.5 - t * 1.3 + Math.sin(c * 0.7 + t * 0.4) * 1.5);
        g.fillStyle = k > 0.8 ? "#e0ffe4" : `rgba(70,255,110,${0.5 + 0.5 * k})`;
        g.fillText(cells[r * C + c], c * 8, r * 8);
      }
      g.shadowBlur = 0;
      v.userData.tex.needsUpdate = true;
    }
    victory.portal.userData.glow.material.opacity = 0.55 + 0.25 * Math.sin(now / 350);
    if (flat.mode === 1 && flat.picture === 1 && net.local && now - (victory.portal.userData.drawn2D || 0) > 150) { victory.portal.userData.drawn2D = now; refresh2D(); }   // the 2D view: its portal flickers too
    victory.portal.userData.glow.position.z = victory.portal.worldToLocal(camera.position.clone()).z >= 0 ? -1.2 : 1.2;   // the haze on the far side from you
    victory.portal.userData.pool.material.opacity = 0.75 + 0.25 * Math.sin(now / 350 + 1);
    const lp = victory.portal.localToWorld(new THREE.Vector3(0, 2.5, 1));            // its light on the arena, swelling as it opens, pulsing
    shared.uPortalL.value.set(lp.x, lp.y, lp.z, u * (1.6 + 0.4 * Math.sin(now / 350)));
    // its hum (sound.ts portalHum): silent past 8 tiles, swelling as you come close (Pete: quieter, none from further away)
    const pp = victory.portal.localToWorld(new THREE.Vector3(0, 2, 0)), dist = Math.hypot(pp.x - sound.listener.x, pp.z - sound.listener.z);
    sound.portalHum?.(u * Math.pow(Math.max(0, 1 - dist / 8), 2), pp.x, pp.z);
  } else sound.portalHum?.(0, 0, 0);
  const cv = $("victory-sparks") as HTMLCanvasElement | null;
  if (!victory.sparks || !cv) return;
  if (cv.width !== innerWidth) { cv.width = innerWidth; cv.height = innerHeight; }
  const g = cv.getContext("2d")!, el = now - victory.sparks.t0;
  g.clearRect(0, 0, cv.width, cv.height);
  if (el < 2400 && Math.random() < 0.14) {                                   // a burst beside the words up top: 40 sparks in a ring
    const x = cv.width * (0.3 + Math.random() * 0.4), y = 100 + Math.random() * 90, hue = [262, 276, 290, 304][(Math.random() * 4) | 0];   // purples, violet to magenta (Pete: not yellow)
    for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2, v = 2 + Math.random() * 3; victory.sparks.list.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, hue }); }
  }
  victory.sparks.list = victory.sparks.list.filter((p) => (p.life -= 0.012) > 0);
  for (const p of victory.sparks.list) {
    p.x += p.vx; p.y += p.vy; p.vy += 0.05; p.vx *= 0.985;
    const hue = inkLook().spark?.hue ?? p.hue;                                 // the look's own ink (Pete): phosphor all green, laser all red
    g.fillStyle = `hsla(${hue},100%,${(lookState.lines ? 50 : 60) + 30 * p.life}%,${p.life})`; g.fillRect(Math.round(p.x / 3) * 3, Math.round(p.y / 3) * 3, 4, 4);   // pixel sparks
  }
}
