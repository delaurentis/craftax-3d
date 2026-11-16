// The split screen (a replay's keyframes, replay.html): the world drawn in two looks at once, a line between them (src/replay/
// split-sweep.ts moves it). render.ts draws both looks as a fade does, then keeps each on its side of the line; this module holds
// the line and the mask that cuts along it.
import * as THREE from "three";
import { flat } from "../core/game";
import { lookState, side, type Side } from "./looks";
import { builtInView, drawn, look, viewOf } from "./registry";
import type { SplitNow } from "../core/types";
import type { Look } from "./types";

/** The split in force (src/replay/recording.ts sets it every frame of a replay), or null. */
export const splitState = { now: null as SplitNow | null };

/** The mask: tA and tB, A on the line's near side, B beyond (the side its normal faces), a pixel-soft edge. uC: a point on the line,
 *  uN: its normal, both in the picture's height units from its top left; uOff: the line pushed along its normal. */
export const splitMat = new THREE.ShaderMaterial({
  uniforms: { tA: { value: null }, tB: { value: null }, uC: { value: new THREE.Vector2() }, uN: { value: new THREE.Vector2(0, 1) }, uOff: { value: 0 }, uAsp: { value: 1 }, uPx: { value: 0.001 } },
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
  fragmentShader: `uniform sampler2D tA, tB; uniform vec2 uC, uN; uniform float uOff, uAsp, uPx; varying vec2 vUv;
    void main() {
      float d = dot(vec2(vUv.x * uAsp, 1.0 - vUv.y) - uC, uN) - uOff;
      gl_FragColor = mix(texture2D(tA, vUv), texture2D(tB, vUv), smoothstep(-uPx, uPx, d));
    }`,
  depthTest: false, depthWrite: false,
});

/** The other look's side (drawn beyond the line) and its ink, the mask set for a w × h picture: null when there's nothing to split
 *  (none, the same picture both sides, the classic 2D view, the other side pushed off screen). */
export function splitSide(w: number, h: number): { other: Side; ink: Look | null } | null {
  const s = splitState.now, L = s && look(s.look);
  if (!s || !L || flat.mode === 1 || flat.picture || s.push >= 1) return null;
  const on = side(), r = drawn(L, viewOf(flat.mode)).r;
  const other: Side = { lines: L.lines, post: r && !builtInView(r) && !r.draw ? r : null };
  const ink = L.over ? L : null;
  if (other.lines === on.lines && other.post === on.post && ink === (on.lines ? lookState.skin : null)) return null;   // (the same picture)
  const asp = w / h, a = (s.ang * Math.PI) / 180, n = new THREE.Vector2(Math.sin(a), Math.cos(a)), c = new THREE.Vector2(s.x * asp, s.y);
  // the push: as far as the farthest corner on the side it goes toward
  const ds = [[0, 0], [asp, 0], [0, 1], [asp, 1]].map(([x, y]) => (x - c.x) * n.x + (y - c.y) * n.y);
  const u = splitMat.uniforms;
  u.uC.value.copy(c); u.uN.value.copy(n); u.uAsp.value = asp; u.uPx.value = 1 / h;
  u.uOff.value = s.push > 0 ? s.push * Math.max(...ds) : -s.push * Math.min(...ds);
  return { other, ink };
}
