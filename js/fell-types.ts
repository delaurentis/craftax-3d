// The shapes js/fell.ts keeps for each effect in flight (a felled tree, a burst, a dying mob, a heap of bones). Types only.
import type * as THREE from "three";

/** A mesh whose material may be the game's shader (its uniforms) or a plain three.js one. */
export type FxMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material & { uniforms?: Record<string, THREE.IUniform> }>;
/** A burst of dust specks: a point cloud, or (phosphor) solid little cubes. */
export interface FxSpeck { at: THREE.Vector3; v: THREE.Vector3; leaf?: boolean; m?: THREE.Mesh; life?: number }
export interface TreeDust { solid?: boolean; points?: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>; geo?: THREE.BoxGeometry; mats?: THREE.Material[]; pts: FxSpeck[]; last: number }
export interface FallingTree {
  root: THREE.Group; pivot: THREE.Group; nick: THREE.Object3D; stump: THREE.Object3D; log: THREE.Group | null; fr: number; fc: number;
  t0: number; logT0: number; fire: boolean; leafMat: THREE.Material;
  /** Its leaves' dust colors under a theme (a theme's own crown), else the standard green. */
  leafC?: [number, number];
  clock?: number; last?: number; from?: THREE.Vector3; dust?: TreeDust; arrived?: boolean;
}
export interface Bit { m: THREE.Mesh; v: THREE.Vector3; spin: THREE.Vector3; ground: number }
export interface BurstFx {
  bits: Bit[]; t0: number; last: number; life: number; fade: [number, number];
  piece?: THREE.Mesh; key?: string | null; from?: THREE.Vector3; mat?: THREE.MeshBasicMaterial; float?: boolean;
  rise?: number; wait?: number; fly?: number; clock?: number; arrived?: boolean;
}
export interface DyingMob {
  model: THREE.Object3D; side: number; drop: boolean; dust: ((model: THREE.Object3D, now: number) => void) | null;
  t0: number; y0: number; steak: THREE.Group | null; steakT0: number; from: THREE.Vector3 | null;
}
export interface BonePiece { m: FxMesh; rest: boolean; keep: boolean; delay: number; v: THREE.Vector3; spin: THREE.Vector3; ground: number; box: THREE.Vector3; s0: THREE.Vector3 }
export interface BoneDust { points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>; parts: { at: THREE.Vector3; born: number; v: THREE.Vector3 }[] }
export interface BoneSpecks { geo: THREE.BoxGeometry; mats: THREE.Material[]; parts: { m: THREE.Mesh; born: number; life: number; v: THREE.Vector3 }[] }
export interface BoneHeap {
  more: number; pieces: BonePiece[]; lying: boolean; restT: number; t0: number; skip: number; last: number; dust: BoneDust | null;
  colors: [THREE.Color, THREE.Color]; clock?: number; specks?: BoneSpecks;
}
/** Bones.start's options: lying (a body already down: it crumbles where it is), blast (flung apart), the dust's colors, more dust. */
export interface BonesOpts { lying?: boolean; blast?: boolean; colors?: THREE.ColorRepresentation[]; more?: number }
