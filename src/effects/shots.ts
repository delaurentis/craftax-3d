// Fireballs and iceballs: their glow and trails.
import "../core/apply";
import * as THREE from "three";
import { scene } from "../render/scene";
import { shots } from "../core/game";
import { inkLook } from "../looks/looks";

// fireballs and iceballs (Pete: a ball of fire, not a sphere): a glow round each, and a trail of puffs left in the air behind it, each
// fading and shrinking, fire burning from yellow to deep red, ice from white to pale blue
export const SHOT_GLOW: Record<string, [string, string, string]> = { fireball: ["255,230,120", "255,120,30", "200,40,10"], iceball: ["255,255,255", "170,230,255", "80,170,255"] };
export const glowTex: Record<string, THREE.CanvasTexture> = {}, trail: { p: THREE.Sprite; t0: number }[] = [];
export function shotGlowTex(kind: string) {
  // laser and phosphor (Pete: no solid glow there, outlines only): a thin ring in the frame's own red or green, hollow
  const L = inkLook(), ring = L.lines ? L.spark?.rgb : undefined, key = kind + (ring ? L.id : "");
  if (glowTex[key]) return glowTex[key];
  const cv = document.createElement("canvas"); cv.width = cv.height = 64;
  if (ring) {                                                                // (a finer canvas: the ring a quarter as thick, Pete)
    cv.width = cv.height = 128;
    const g = cv.getContext("2d")!;
    g.strokeStyle = `rgba(${ring},1)`; g.lineWidth = 2;
    g.beginPath(); g.arc(64, 64, 56, 0, Math.PI * 2); g.stroke();
    return (glowTex[key] = new THREE.CanvasTexture(cv));
  }
  const [a, b, c] = SHOT_GLOW[kind];
  const g = cv.getContext("2d")!, r = g.createRadialGradient(32, 32, 1, 32, 32, 32);
  r.addColorStop(0, `rgba(${a},1)`); r.addColorStop(0.35, `rgba(${b},0.7)`); r.addColorStop(1, `rgba(${c},0)`);
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  return (glowTex[key] = new THREE.CanvasTexture(cv));
}
export function shotFx(now: number) {
  for (const e of shots.values()) {
    if (!SHOT_GLOW[e.kind]) continue;
    const u = e.model.userData;
    if (!u.halo) {
      u.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: shotGlowTex(e.kind), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      u.halo.position.y = 0.9; e.model.add(u.halo);
    }
    const s = 1.5 + 0.25 * Math.sin(now / 60 + e.model.id), tex = shotGlowTex(e.kind);
    if (u.halo.material.map !== tex) { u.halo.material.map = tex; u.halo.material.needsUpdate = true; }   // (the look switched)
    u.halo.scale.set(s, s, 1); u.halo.visible = !inkLook().lines;                                 // the line looks: no halo, the trail's rings say it
    if (!u.puffAt || now - u.puffAt > 28) {                                  // a puff where it is now
      u.puffAt = now;
      const p = new THREE.Sprite(new THREE.SpriteMaterial({ map: shotGlowTex(e.kind), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      p.position.set(e.model.position.x + (Math.random() - 0.5) * 0.08, e.model.position.y + 0.9 + (Math.random() - 0.5) * 0.08, e.model.position.z + (Math.random() - 0.5) * 0.08);
      scene.add(p); trail.push({ p, t0: now });
    }
  }
  for (let i = trail.length - 1; i >= 0; i--) {
    const { p, t0 } = trail[i], k = (now - t0) / 420;
    if (k >= 1) { scene.remove(p); p.material.dispose(); trail.splice(i, 1); continue; }
    const s = 0.9 * (1 - k) + 0.15;
    p.scale.set(s, s, 1); p.material.opacity = 0.8 * (1 - k) * (1 - k); p.position.y += 0.004;
  }
}
