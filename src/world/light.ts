// World methods (mixed into World, src/world/core.ts): block light from torches and lava, its flicker, the victory's green torches, and the
// fountains' drips and springs.
import * as THREE from "three";
import { shared } from "../../js/shading";
import { B, CEIL, FOUNTAIN_WATER, ITEM, SOLID, TALL } from "./blocks";
import { NB, greenFlameTex } from "./geo";
import type { World } from "./core";

export class WorldLight {
  // block light levels 0..8 spread from torches (8) and lava (6) through open tiles, one level per tile
  // each light source's reach, flood-filled through open tiles (walls stop it), a level lost per tile: {cells, levels, torch, seed}
  lightSources(this: World): void {
    const { H, W } = this;
    this.sources = [];
    for (let i = 0; i < W * H; i++) {
      // torches: on the dungeon floors (many torches) short pools; elsewhere (your own torches at night, the mines) they reach farther
      const pool = this.level === 1 || this.level === 3 || this.level === 4;
      const e = this.items[i] === ITEM.TORCH ? (pool ? 6 : 8) : this.map[i] === B.LAVA ? 6 : this.map[i] === B.ENCH_FIRE ? 4 : 0;
      if (!e) continue;
      const lv = new Map<number, number>([[i, e]]), q = [i];
      for (let k = 0; k < q.length; k++) {
        const a = q[k], r = (a / W) | 0, c = a % W, l = lv.get(a)!;
        if (l <= 1) continue;
        for (const [, dr, dc] of NB) {
          const rr = r + dr, cc = c + dc, j = rr * W + cc;
          if (rr < 0 || cc < 0 || rr >= H || cc >= W || (lv.get(j) || 0) >= l - 1) continue;
          lv.set(j, l - 1);
          if (!TALL.has(this.map[j]) && !(this.map[j] in SOLID)) q.push(j);
        }
      }
      this.sources.push({ at: i, cells: Int32Array.from(lv.keys()), levels: Float32Array.from(lv.values()), torch: this.items[i] === ITEM.TORCH, seed: (i * 2654435761) % 1000 / 1000 });
    }
  }

  // the light levels now (0..8 a tile, the brightest source wins): a torch flickers on its own clock, mostly a small waver with
  // now and then a deep dip where the flame nearly gutters; lava and fire tables glow steadily
  blockLight(this: World, now: number): Float32Array {
    const lv = new Float32Array(this.W * this.H), gv = new Float32Array(this.W * this.H), t = now / 1000;
    for (const s of this.sources || []) {
      let k = 1;
      const ga = s.torch && this.greenAt.get(s.at), g = ga ? Math.min(1, Math.max(0, (now - ga) / 600)) : 0;   // turning green over 0.6 s
      if (s.torch) {
        const p = s.seed * 97.3;
        k = 0.88 + 0.06 * Math.sin(t * 9.1 + p) + 0.04 * Math.sin(t * 23.7 + p * 2.1);
        const gust = Math.sin(t * 0.83 + p * 3.7) * Math.sin(t * 1.37 + p * 5.1);       // slow, irregular: a gutter now and then
        if (gust > 0.55) k *= 1 - 0.65 * Math.min(1, (gust - 0.55) / 0.25) * (0.7 + 0.3 * Math.sin(t * 31 + p));
      } else k = 0.95 + 0.05 * Math.sin(t * 1.3 + s.seed * 40);
      k *= 1 + 0.45 * g;                                                     // a turned torch burns brighter (Pete: to see a little more)
      if (s.torch && this.level === 8) k *= 1.2;                             // the Graveyard's torches burn a little brighter (Pete)
      for (let n = 0; n < s.cells.length; n++) { const v = s.levels[n] * k, j = s.cells[n]; if (v > lv[j]) { lv[j] = v; gv[j] = g; } }
    }
    this.lightGreen = gv;
    return lv;
  }
  // the victory portal's arrival (Pete): the floor's torches turn phosphor green one by one at random over a few seconds, flame and
  // light, and burn brighter. resetGreen: a new world or floor
  greenTorches(this: World, now: number): void {
    for (const s of this.sources || []) if (s.torch && !this.greenAt.has(s.at)) this.greenAt.set(s.at, now + 300 + Math.random() * 5500);
  }
  resetGreen(this: World): void {
    this.greenAt.clear();
    for (const f of this.greenFlames.values()) this.group.remove(f);
    this.greenFlames.clear();
  }
  // per frame: a green flame over each turned torch's own (the flame is baked into the floor's mesh: this one, a little bigger, hides it)
  updateGreenFlames(this: World, now: number): void {
    if (this.greenFlames.size) { const t = greenFlameTex(); t.offset.y = (now / 900) % 1; t.offset.x = Math.sin(now / 260) * 0.06; }   // its pixels drift up, flickering
    for (const [at, ga] of this.greenAt) {
      if (now < ga) continue;
      let f = this.greenFlames.get(at);
      if (!f) {
        f = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.17, 0.19), new THREE.MeshBasicMaterial({ map: greenFlameTex(), color: new THREE.Color(1.4, 1.9, 1.4), toneMapped: false, transparent: true }));
        f.position.set((at % this.W) + 0.5, 0.63, Math.floor(at / this.W) + 0.5);
        this.group.add(f); this.greenFlames.set(at, f);
      }
      const p = (at * 97.3) % 10;
      f.scale.y = 1.06 + 0.06 * Math.sin(now / 110 + p) + 0.04 * Math.sin(now / 43 + p * 2);   // (never shorter than the orange one under it, Pete)
      f.material.opacity = Math.min(1, (now - ga) / 600);
    }
  }
  // per frame: the flickering light into the shaders' block-light texture
  // the fountains' water comes from somewhere (Pete): each one, by a hash of where it is, has drips falling from the ceiling (under
  // ground) or a little spring bubbling up in the middle; a ripple ring where each drop lands. Built lazily, moved every frame.
  updateFountains(this: World, now: number): void {
    if (!this.fountains) return;
    if (this.fx?.built !== this.fountains) {
      if (this.fx) this.group.remove(this.fx.group);
      const group = new THREE.Group(), drop = new THREE.SphereGeometry(0.018, 6, 4), ringG = new THREE.RingGeometry(0.85, 1, 20);
      const dropM = new THREE.MeshBasicMaterial({ color: 0xbfe0ff, transparent: true, opacity: 0.6, depthWrite: false });   // small, see-through beads
      const items = this.fountains.map((f) => {
        const h = Math.imul(f.r * 73856093 ^ f.c * 19349663 ^ this.level * 83492791, 2654435761) >>> 0;
        const spring = this.level === 0 || h % 3 === 0, n = spring ? 14 : 2;
        const drops = Array.from({ length: n }, (_, i) => { const m = new THREE.Mesh(drop, dropM); group.add(m); return { m, k: i, ph: ((h >>> (4 + i * 3)) % 97) / 97 }; });
        const rings = Array.from({ length: n }, () => {
          const m = new THREE.Mesh(ringG, new THREE.MeshBasicMaterial({ color: 0xcfe6ff, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
          m.rotation.x = -Math.PI / 2; group.add(m); return m;
        });
        const ox = ((h >>> 8) % 100 / 100 - 0.5) * f.half, oz = ((h >>> 16) % 100 / 100 - 0.5) * f.half;   // where the ceiling drips
        return { f, spring, drops, rings, ox, oz, period: spring ? 0.75 : 1.6 + (h % 7) * 0.25 };
      });
      this.fx = { built: this.fountains, group, items };
      this.group.add(group);
    }
    const t = now / 1000, wy = FOUNTAIN_WATER + 0.01;
    for (const it of this.fx.items) it.drops.forEach((d, i) => {
      const u = ((t / it.period + d.ph + i / it.drops.length) % 1 + 1) % 1, ring = it.rings[i];
      if (it.spring) {                                   // a spring: drops leap from the middle and fall back, landing round it
        // a small jet: beads thrown up from the centre in a tight spray, falling back close by (a bubbling spring, not a sprinkler)
        const a = d.ph * 6.283 + i * 2.4, reach = it.f.half * (0.12 + 0.28 * d.ph) * u, up = (0.16 + 0.12 * d.ph) * 4 * u * (1 - u);
        d.m.position.set(it.f.x + Math.cos(a) * reach, wy + up, it.f.z + Math.sin(a) * reach);
        d.m.visible = true;
        const land = (u + 0.92) % 1, lr = it.f.half * (0.12 + 0.28 * d.ph);   // its ripple, just after it lands
        ring.position.set(it.f.x + Math.cos(a) * lr, wy, it.f.z + Math.sin(a) * lr);
        ring.scale.setScalar(0.015 + land * 0.08); ring.material.opacity = land < 0.4 ? 0.35 * (1 - land / 0.4) : 0;
      } else {                                           // a drip: from the ceiling, falling faster and faster, then its ripple
        const top = CEIL - 0.05, fall = 0.6, y = u < fall ? top - (top - wy) * (u / fall) ** 2 : wy;
        d.m.position.set(it.f.x + it.ox + i * 0.07, y, it.f.z + it.oz - i * 0.05);
        d.m.visible = u < fall;
        const k = u < fall ? -1 : (u - fall) / (1 - fall);
        ring.position.set(it.f.x + it.ox + i * 0.07, wy, it.f.z + it.oz - i * 0.05);
        ring.scale.setScalar(0.03 + Math.max(0, k) * 0.22); ring.material.opacity = k < 0 ? 0 : 0.55 * (1 - k);
      }
    });
  }
  updateLight(this: World, now: number): void {
    const tex = shared.uBlock.value;
    if (!tex || !this.sources || !this.sources.length) return;
    const lv = this.blockLight(now), d = tex.image.data!, gv = this.lightGreen!;
    for (let i = 0; i < lv.length; i++) { d[2 * i] = Math.round(255 * Math.min(1, lv[i] / 8)); d[2 * i + 1] = Math.round(255 * gv[i]); }
    tex.needsUpdate = true;
  }
}
