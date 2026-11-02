// Snow falling (the Winter theme's weather): a box of flakes round you that follows you about, each flake drifting down at its own
// pace and swaying a little, coming back in at the top once it reaches the ground. On the overworld only (underground the snow
// stops), eased in and out with the theme; one point each, moved on the CPU (1,200 of them: nothing to a phone).
import * as THREE from "three";
import type { Weather } from "craftax-3d/plugin";

const N = 1200, SIZE = 34, TOP = 14;                                  // flakes; the box: SIZE tiles across, TOP blocks high
const INK = { color: 0xffffff, laser: 0xff2a18, phosphor: 0x2aff5a };   // (laser and phosphor: their own ink, as the other effects)

/** The Winter theme's snowfall. */
export function snowfall(scene: THREE.Scene): Weather {
  const pos = new Float32Array(N * 3), fall = new Float32Array(N), phase = new Float32Array(N);
  let placed = false, t = 0;
  for (let i = 0; i < N; i++) { fall[i] = 0.7 + Math.random() * 0.8; phase[i] = Math.random() * Math.PI * 2; }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: INK.color, size: 0.075, sizeAttenuation: true, transparent: true, depthWrite: false, fog: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false; points.visible = false; points.renderOrder = 3;
  scene.add(points);
  return {
    update({ dt, k, player, level, look }) {
      // laser and phosphor draw outlines, not light: no see-through there (it would corrupt their surface ids), on or off
      const solid = look !== "color";
      points.visible = level === 0 && (solid ? k >= 0.5 : k > 0.01);
      if (!points.visible) return;
      if (mat.transparent === solid) { mat.transparent = !solid; mat.depthWrite = solid; mat.needsUpdate = true; }
      mat.color.setHex(INK[look]); mat.opacity = solid ? 1 : 0.9 * k;
      const cx = player.x, cz = player.z, h = SIZE / 2;
      if (!placed) {                                                  // the first time: scattered through the whole box
        placed = true;
        for (let i = 0; i < N; i++) pos.set([cx + (Math.random() - 0.5) * SIZE, Math.random() * TOP, cz + (Math.random() - 0.5) * SIZE], i * 3);
      }
      t += dt;
      const wrap = (v: number, c: number) => c - h + ((((v - c + h) % SIZE) + SIZE) % SIZE);   // (stays in the box round you as you walk)
      for (let i = 0; i < N; i++) {
        const j = i * 3, a = t * 0.9 + phase[i];
        let y = pos[j + 1] - fall[i] * dt;
        if (y < 0) y += TOP;
        pos[j] = wrap(pos[j] + (Math.sin(a) * 0.3 + 0.15) * dt, cx);
        pos[j + 1] = y;
        pos[j + 2] = wrap(pos[j + 2] + Math.cos(a * 0.8) * 0.25 * dt, cz);
      }
      geo.attributes.position.needsUpdate = true;
    },
    dispose() { scene.remove(points); geo.dispose(); mat.dispose(); },
  };
}
