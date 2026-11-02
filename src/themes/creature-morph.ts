// A creature changing model with a theme (CreatureStyle.model: Winter's cows into reindeer), morphing as the wave passes its tile
// instead of popping: both models' boxes, measured in the creature's own space, each of the new model's paired with the old box
// nearest it (and an old box nobody took with the new box nearest it), each pair one box whose place, size and color go from the
// old to the new by the tile's progress, eased in and out. So legs stay legs and the body the body, antlers grow up out of the head,
// a snout stretches and a cow's spots sink into the coat. Back again the same way. Once the tile is through, the real model takes
// over (transition.ts swapModels).
import * as THREE from "three";
import { makeMaterial } from "../../js/shading";

interface Part { c: THREE.Vector3; s: THREE.Vector3; color: THREE.Color; map: THREE.Texture | null }
// a fresh model's coloured boxes, in its own space (it stands at the origin, unturned, at rest)
function partsOf(model: THREE.Object3D): Part[] {
  model.updateMatrixWorld(true);
  const out: Part[] = [], box = new THREE.Box3();
  model.traverse((o) => {
    const m = o as THREE.Mesh, mat = m.material as THREE.ShaderMaterial | undefined;
    if (!m.isMesh || !mat?.userData?.base) return;                    // (its colored parts: not the shadow blob or a halo)
    m.geometry.computeBoundingBox();
    box.copy(m.geometry.boundingBox!).applyMatrix4(m.matrixWorld);
    out.push({ c: box.getCenter(new THREE.Vector3()), s: box.getSize(new THREE.Vector3()), color: (mat.userData.base as THREE.Color).clone(), map: mat.uniforms?.map?.value ?? null });
  });
  return out;
}
const nearest = (p: Part, list: Part[]) => list.reduce((best, q) => (q.c.distanceToSquared(p.c) < best.c.distanceToSquared(p.c) ? q : best), list[0]);
const UNIT = new THREE.BoxGeometry(1, 1, 1);
const ease = (k: number) => k * k * (3 - 2 * k);

/** A model morphing from one creature model to another: set(k) places it, 0 the old model … 1 the new one. It animates (lit, hurt)
 *  like any creature: its materials are in userData.mats. */
export function morphModel(from: THREE.Object3D, to: THREE.Object3D): THREE.Group {
  const A = partsOf(from), B = partsOf(to), g = new THREE.Group();
  g.userData = { mats: [], limbs: [], morph: true };
  if (!A.length || !B.length) return g;
  const used = new Set<Part>(), pairs: [Part, Part][] = [];
  for (const b of B) { const a = nearest(b, A); used.add(a); pairs.push([a, b]); }       // each new box from the old one nearest it
  for (const a of A) if (!used.has(a)) pairs.push([a, nearest(a, B)]);                    // an old box nobody took: into the nearest new one
  const meshes = pairs.map(([a, b]) => {
    const mat = makeMaterial("mob", { color: a.color, map: b.map ?? a.map });
    mat.userData.base = a.color.clone(); mat.userData.glow = false;
    g.userData.mats.push(mat);
    const m = new THREE.Mesh(UNIT.clone(), mat);                      // (its corners moved, not the mesh scaled: the shader's normals stay unit)
    m.frustumCulled = false;
    g.add(m);
    return m;
  });
  const c = new THREE.Vector3(), s = new THREE.Vector3(), base = UNIT.attributes.position.array as Float32Array;
  g.userData.set = (k: number) => {
    const e = ease(Math.max(0, Math.min(1, k)));
    pairs.forEach(([a, b], i) => {
      const m = meshes[i], mat = m.material as THREE.ShaderMaterial, pos = m.geometry.attributes.position;
      c.lerpVectors(a.c, b.c, e); s.lerpVectors(a.s, b.s, e);
      for (let v = 0; v < pos.count; v++) pos.setXYZ(v, c.x + base[v * 3] * s.x, c.y + base[v * 3 + 1] * s.y, c.z + base[v * 3 + 2] * s.z);
      pos.needsUpdate = true;
      (mat.userData.base as THREE.Color).lerpColors(a.color, b.color, e);
      mat.uniforms.uColor?.value.copy(mat.userData.base);
    });
  };
  g.userData.set(0);
  return g;
}
