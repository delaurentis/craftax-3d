// What a set piece rising clears away (src/scenes/rise.ts), going up only: a tree in its way bursts into pixel dust where it stands
// (the felled tree's dust, js/fell.ts, without the fall or the log flying to you), a rock in the open breaks apart (the mining burst,
// without the piece flying to the hotbar). A rock under a building isn't broken: it stretches up into the walls (rise.ts).
import * as THREE from "three";
import { bursts, felling, world } from "../render/arm";
import { scene } from "../render/scene";
import { shared } from "../render/shading/uniforms";
import { sound } from "../core/shared";
import { B, SOLID } from "../world/blocks";
import type { FallingTree, TreeDust } from "../../js/fell-types";

const DUST_MS = 1100, SOUND_GAP = 450;                             // (ms: one rock's sound at a time, not a crash of dozens)
let heard = 0;
const dusts: { root: THREE.Group; dust: TreeDust; t0: number }[] = [];

/** The tree on (r, c), block b, bursting into dust. */
function treeDust(b: number, r: number, c: number, now: number): void {
  const outline = shared.uOutline.value > 0.5, phos = shared.uPhos.value > 0.5;
  if (outline && !phos) return;                                      // (laser: no loose dust, its outline pass misreads it)
  const parts = world.treeParts(b, 0.55, [1, 0], world.lightAt(r, c), !!world.flat, r * world.W + c);
  parts.log.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
  const root = new THREE.Group();
  root.position.set(c + 0.5, 0, r + 0.5); root.add(parts.stump, parts.nick, parts.top);
  scene.add(root);
  const e = { root, fire: b === B.FIRE_TREE, leafMat: world.mats.cutout, leafC: parts.leafColors } as unknown as FallingTree;   // (burst reads only these)
  const dust = felling.burst(e, phos);
  root.visible = false;
  dusts.push({ root, dust, t0: now });
}

/** The rock on (r, c), block b, breaking apart (nothing for you: it isn't mined). */
function rockBreak(b: number, r: number, c: number, now: number): void {
  const tex = world.blockTex(b) ?? SOLID[b]?.side;
  if (!tex) return;
  bursts.rock(tex, r, c, world.height(r, c) || 1, now, null);
  const e = bursts.list[bursts.list.length - 1];
  if (e?.piece) { scene.remove(e.piece); e.piece = undefined; }    // (its piece would fly to the hotbar)
  if (now - heard >= SOUND_GAP) { heard = now; sound.rockBreak(c + 0.5, r + 0.5); }
}

/** What rise.ts calls as the wave reaches a tile it clears. */
export const riseFx = { tree: treeDust, rock: rockBreak };

/** Each frame: the dust drifting and fading, then gone. */
export function riseFxTick(now: number): void {
  for (const d of [...dusts]) {
    const ts = now - d.t0;
    felling.drift(d.dust, ts, now);
    if (ts < DUST_MS) continue;
    if (d.dust.solid) { for (const p of d.dust.pts) scene.remove(p.m!); d.dust.geo!.dispose(); d.dust.mats!.forEach((m) => m.dispose()); }
    else if (d.dust.points) { scene.remove(d.dust.points); d.dust.points.geometry.dispose(); d.dust.points.material.dispose(); }
    scene.remove(d.root); d.root.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
    dusts.splice(dusts.indexOf(d), 1);
  }
}
