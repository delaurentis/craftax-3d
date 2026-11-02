// Felling: Craftax turns a chopped tree into grass on the one DO that gives the wood. The client then plays it out on a copy of the
// tree: the notch shows on the side you hit from, the top hinges over away from you, lands and turns to dust, and the stump flies to the hotbar.
import * as THREE from "three";
import { animate } from "./models";
import { makeMaterial, shared } from "./shading";
import type { World } from "./world";
import { themeAt } from "../src/themes/state";
import type { Theme } from "../src/themes/types";
import type { Bit, BoneHeap, BonePiece, BonesOpts, BurstFx, DyingMob, FallingTree, FxMesh, FxSpeck, TreeDust } from "./fell-types";

// the effects' budget (main.ts, Settings → Speed): amount scales every burst's particle count (0 = none); time < 1 plays them faster,
// as when the bot plays several times faster than real time; off: the bot is so fast none are worth drawing
export const fx: { amount: number; time: number; off: boolean; target: ((key: string) => { x: number; y: number } | null | undefined) | null; arrive: ((key: string) => void) | null } = { amount: 1, time: 1, off: false, target: null, arrive: null };   // target(key): where a gathered piece flies on screen; arrive(key): it got there (main.ts)
const fxN = (n: number) => (fx.off ? 0 : Math.round(n * fx.amount));
const DUST_MS = 900;                                                     // (shortened: Pete wanted the dust gone sooner)
const CUT_Y = 0.55, NOTCH_MS = 250, FALL_MS = 950, BOUNCE_MS = 260, REST_MS = 300, SINK_MS = 500, LOG_MS = 520, MAX_A = 1.45;
const ease = (u: number) => u * u;                                               // a falling tree speeds up like a dropped one

export class Felling {
  declare scene: THREE.Object3D; declare world: World; declare camera: THREE.Camera; declare list: FallingTree[]; declare onLand?: (tree: THREE.Object3D) => void;
  constructor(scene: THREE.Object3D, world: World, camera: THREE.Camera) { this.scene = scene; this.world = world; this.camera = camera; this.list = []; }

  // b: the tree's block type, (r, c) its tile, from: the player's tile (the fall goes away from it), L: its light
  start(b: number, r: number, c: number, from: number[], L: number, now: number) {
    const dr = Math.sign(from[0] - r), dc = Math.sign(from[1] - c);
    const toward = Math.abs(dr) >= Math.abs(dc) && dr ? [dr, 0] : [0, dc || 1];    // the side facing the player
    const parts = this.world.treeParts(b, CUT_Y, toward, L, this.world.flat, r * this.world.W + c);   // overhead: the short tree, as drawn
    const root = new THREE.Group(), pivot = new THREE.Group();
    root.position.set(c + 0.5, 0, r + 0.5);
    const fr = -toward[0], fc = -toward[1];                              // fall direction
    pivot.position.set(fc * 0.3, CUT_Y, fr * 0.3);                       // hinge: the far edge of the cut
    parts.top.position.set(-fc * 0.3, -CUT_Y, -fr * 0.3);
    pivot.add(parts.top);
    root.add(parts.stump, parts.nick, pivot);
    this.scene.add(root);
    parts.log.traverse((m) => (m as THREE.Mesh).geometry?.dispose());                    // (the stump flies to the hotbar now, not a separate log)
    this.list.push({ root, pivot, nick: parts.nick, stump: parts.stump, log: null, fr, fc, t0: now, logT0: -1, fire: b === 28, leafMat: this.world.mats.cutout, leafC: parts.leafColors });
  }

  update(now: number) {
    for (const e of [...this.list]) {
      e.clock = (e.clock ?? 0) + (now - (e.last ?? e.t0)) / fx.time; e.last = now;   // animation time (see Bones)
      const t = e.clock, tf = t - NOTCH_MS, land = FALL_MS, tb = tf - land;
      let a = 0;
      if (tf > 0) a = tf < land ? MAX_A * ease(tf / land) : MAX_A - (tb < BOUNCE_MS ? 0.08 * Math.sin((Math.PI * tb) / BOUNCE_MS) : 0);
      e.nick.visible = tf <= 0;                                          // the core snaps as the top goes
      if (e.fc) e.pivot.rotation.z = -e.fc * a; else e.pivot.rotation.x = e.fr * a;
      if (tb > 0 && e.logT0 < 0) {                                       // landed: the stump pulls out of the ground and flies to the hotbar (Pete)
        e.logT0 = now; this.onLand?.(e.root);
        const fly = new THREE.Group(), at = new THREE.Vector3();
        e.root.updateMatrixWorld(true); e.stump.getWorldPosition(at);
        fly.position.set(at.x, CUT_Y / 2, at.z); this.scene.add(fly);
        fly.add(e.stump); e.stump.position.set(0, -CUT_Y / 2, 0);          // spun about its middle, not its foot
        e.log = fly; e.from = fly.position.clone();
      }   // landed (main.ts: phosphor's wave)
      const ts = tb - BOUNCE_MS - REST_MS;
      // then it bursts into pixel dust where it lies (Pete): leaves into green (a fire tree's into embers), the wood into brown; the
      // laser views keep the old sink (loose points garble their outline pass)
      const phos = shared.uPhos.value > 0.5;
      if (ts > 0 && (shared.uOutline.value < 0.5 || phos)) {                // phosphor too (Pete): as a few solid specks it can draw
        if (!e.dust) { e.dust = this.burst(e, phos); e.root.visible = false; }   // (no particles at all: it just vanishes)
        this.drift(e.dust, ts, now);
      } else if (ts > 0) { const u = Math.min(1, ts / SINK_MS); e.root.position.y = -2.2 * u * u; e.root.scale.setScalar(1 - 0.5 * u); }
      if (e.logT0 >= 0) this.flyLog(e, now);
      if (ts > (e.dust ? DUST_MS : SINK_MS) && (e.logT0 < 0 || now - e.logT0 > LOG_MS)) this.end(e);
    }
  }

  burst(e: FallingTree, solid = false): TreeDust {
    e.root.updateMatrixWorld(true);
    const meshes: FxMesh[] = [], bb = new THREE.Box3(), size = new THREE.Vector3();
    e.root.traverse((o) => { if ((o as THREE.Mesh).isMesh && o.visible !== false) meshes.push(o as FxMesh); });
    const leafC = e.fire ? [0xf08a30, 0x9a3010] : e.leafC ?? [0x5aa034, 0x2a5a18], woodC = [0x8a5a30, 0x4a2e16];
    const pts: FxSpeck[] = [], cols: number[] = [], c = new THREE.Color();
    for (const m of meshes) {
      if (!m.geometry.attributes.position?.count) continue;
      bb.setFromObject(m); bb.getSize(size);
      const leaf = m.material === e.leafMat, [c1, c2] = leaf ? leafC : woodC;
      // phosphor (solid): many specks about a character each, a scatter of noise (Pete)
      const n = fxN(solid ? (leaf ? 150 : 40) : THREE.MathUtils.clamp(Math.round(size.x * size.y * size.z * (leaf ? 80 : 420)), 50, leaf ? 1100 : 320));   // colour: chunky specks, plenty (Pete)
      for (let i = 0; i < n; i++) {
        pts.push({ at: new THREE.Vector3(THREE.MathUtils.lerp(bb.min.x, bb.max.x, Math.random()), THREE.MathUtils.lerp(bb.min.y, bb.max.y, Math.random()),
          THREE.MathUtils.lerp(bb.min.z, bb.max.z, Math.random())), v: new THREE.Vector3((Math.random() - 0.5) * 0.8, leaf ? -0.2 + Math.random() * 0.8 : 0.1 + Math.random() * 0.5, (Math.random() - 0.5) * 0.8) });
        c.set(c1).lerp(new THREE.Color(c2), Math.random()); cols.push(c.r, c.g, c.b);
        if (solid) pts[pts.length - 1].leaf = leaf;
      }
    }
    if (solid) {                                                         // phosphor: little cubes, each colour one outlined material
      const geo = new THREE.BoxGeometry(0.035, 0.035, 0.035), mats: Record<string, THREE.ShaderMaterial> = { true: makeMaterial("mob", { color: leafC[0] }), false: makeMaterial("mob", { color: woodC[0] }) };
      for (const p of pts) { p.m = new THREE.Mesh(geo, mats[String(p.leaf)]); p.m.position.copy(p.at); p.life = 300 + Math.random() * 500; this.scene.add(p.m); }
      return { solid: true, geo, mats: Object.values(mats), pts, last: performance.now() };
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(pts.flatMap((p) => [p.at.x, p.at.y, p.at.z])), 3));
    g.setAttribute("color", new THREE.BufferAttribute(new Float32Array(cols), 3));
    const points = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, depthWrite: false }));
    points.frustumCulled = false; this.scene.add(points);
    return { points, pts, last: performance.now() };
  }

  drift(d: TreeDust, ts: number, now: number) {
    const dt = Math.min(0.05, (now - d.last) / 1000);
    d.last = now;
    if (d.solid) {
      for (const p of d.pts) {
        p.m!.visible = ts < p.life!;
        p.v.x += (Math.random() - 0.5) * 0.8 * dt; p.v.z += (Math.random() - 0.5) * 0.8 * dt; p.m!.position.addScaledVector(p.v, dt);
      }
      return;
    }
    const pos = d.points!.geometry.attributes.position;
    d.pts.forEach((p, k) => {
      p.v.x += (Math.random() - 0.5) * 0.8 * dt; p.v.z += (Math.random() - 0.5) * 0.8 * dt;   // a little wind
      p.at.addScaledVector(p.v, dt); pos.setXYZ(k, p.at.x, p.at.y, p.at.z);
    });
    pos.needsUpdate = true;
    d.points!.material.opacity = 1 - THREE.MathUtils.smoothstep(ts, DUST_MS * 0.35, DUST_MS);
  }

  // the stump: from where it stood, an arc up and into the bottom of the view (the hotbar), shrinking as it goes
  flyLog(e: FallingTree, now: number) {
    flyToHotbar(e.log!, e.from!, this.camera, (now - e.logT0) / LOG_MS, 1, "wood");
    if (!e.arrived && now - e.logT0 >= LOG_MS) { e.arrived = true; fx.arrive?.("wood"); }
  }

  end(e: FallingTree) {
    this.scene.remove(e.root); if (e.log) this.scene.remove(e.log);
    if (e.dust?.solid) { for (const p of e.dust.pts) this.scene.remove(p.m!); e.dust.geo!.dispose(); e.dust.mats!.forEach((m) => m.dispose()); }
    else if (e.dust) { this.scene.remove(e.dust.points!); e.dust.points!.geometry.dispose(); e.dust.points!.material.dispose(); }
    for (const g of [e.root, e.log]) if (g) g.traverse((m) => (m as THREE.Mesh).geometry?.dispose());
    this.list.splice(this.list.indexOf(e), 1);
  }

  clear() { for (const e of [...this.list]) this.end(e); }
}

// Bursts: bits that fly, bounce and fade. A mined rock breaks into chunks of its own texture and one piece flies to the hotbar; a drink
// throws a spray of droplets up from the water.
const G = 12;
const CLIP_MATS = [0x5f9f35, 0x6cae3c, 0x7cc046, 0x98d85c].map((color) => new THREE.MeshBasicMaterial({ color }));   // grass clippings (shared)
const themeClips = new Map<string, THREE.MeshBasicMaterial[]>();
// a theme's own clippings (Winter: snow), made once, cycling its colors over four
const clipMats = (t: Theme | null) => {
  const cols = t?.bits?.grass;
  if (!t || !cols?.length) return CLIP_MATS;
  if (!themeClips.has(t.id)) themeClips.set(t.id, [0, 1, 2, 3].map((i) => new THREE.MeshBasicMaterial({ color: cols[i % cols.length] })));
  return themeClips.get(t.id)!;
};
export class Bursts {
  declare scene: THREE.Object3D; declare world: World; declare camera: THREE.Camera; declare list: BurstFx[];
  constructor(scene: THREE.Object3D, world: World, camera: THREE.Camera) { this.scene = scene; this.world = world; this.camera = camera; this.list = []; }

  // tex: the block's texture; (r, c) its tile; h: its height
  rock(tex: string, r: number, c: number, h: number, now: number, key: string | null = null) {                           // key: what it gives (its slot, main.ts fx.target)
    const bits: Bit[] = [];
    for (let i = 0; i < 12; i++) {
      const m = this.world.cube(tex, 0.14 + Math.random() * 0.14);
      m.position.set(c + 0.2 + Math.random() * 0.6, 0.15 + Math.random() * Math.max(0.2, h - 0.3), r + 0.2 + Math.random() * 0.6);
      const v = new THREE.Vector3(m.position.x - c - 0.5, 0, m.position.z - r - 0.5).normalize().multiplyScalar(1 + Math.random() * 2);
      v.y = 1.5 + Math.random() * 2.5;
      bits.push({ m, v, spin: new THREE.Vector3(Math.random() * 9, Math.random() * 9, 0), ground: 0.08 });
      this.scene.add(m);
    }
    const piece = this.world.cube(tex, 0.5);
    piece.visible = false; this.scene.add(piece);
    this.list.push({ bits, piece, key, from: new THREE.Vector3(c + 0.5, 0.6, r + 0.5), t0: now, last: now, life: 1000, fade: [500, 950] });
  }

  // a drink: droplets jump from the water at (r, c)
  splash(r: number, c: number, now: number, y = -0.1) {                                   // y: the water's surface (a fountain's basin sits higher)
    const bits: Bit[] = [], mat = new THREE.MeshBasicMaterial({ color: 0x8fd4ff, transparent: true, depthWrite: false });
    for (let i = 0; i < 16; i++) {
      const s = 0.05 + Math.random() * 0.06, m = new THREE.Mesh(new THREE.BoxGeometry(s, s * 1.4, s), mat);
      m.position.set(c + 0.3 + Math.random() * 0.4, y, r + 0.3 + Math.random() * 0.4);
      const a = Math.random() * Math.PI * 2, sp = 0.3 + Math.random() * 0.8;
      bits.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, 2.2 + Math.random() * 1.8, Math.sin(a) * sp), spin: new THREE.Vector3(), ground: y - 0.05 });
      this.scene.add(m);
    }
    this.list.push({ bits, mat, t0: now, last: now, life: 750, fade: [350, 750] });
  }

  // a sapling found in the grass (Pete: something to see): it pops up out of the tile, hangs a moment, and flies to its slot
  sapling(r: number, c: number, now: number) {
    const piece = this.world.cube("i_sapling", 0.5, true);
    piece.visible = false; this.scene.add(piece);
    // (Pete: too fast): up out of the grass over 0.45 s, held to be seen till 1 s, then 1.1 s to its slot
    this.list.push({ bits: [], piece, key: "sapling", from: new THREE.Vector3(c + 0.5, 0.9, r + 0.5), t0: now, last: now, life: 2100, fade: [2000, 2100], rise: 450, wait: 1000, fly: 1100 });
  }

  // grass cut (Pete): clippings, little green pixels, flicked up from the tile and settling
  clippings(r: number, c: number, now: number) {
    if (shared.uOutline.value > 0.5) return;                              // (laser and phosphor: their outline pass misreads loose bits)
    const bits: Bit[] = [], mats = clipMats(themeAt(r, c));
    const n = fxN(18); if (!n) return;
    for (let i = 0; i < n; i++) {
      const s = 0.04 + Math.random() * 0.03, m = new THREE.Mesh(new THREE.BoxGeometry(s, s * 1.6, s), mats[i % 4]);
      m.position.set(c + 0.2 + Math.random() * 0.6, 0.05 + Math.random() * 0.2, r + 0.2 + Math.random() * 0.6);
      const a = Math.random() * Math.PI * 2, sp = 0.4 + Math.random() * 1.0;
      bits.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, 1.6 + Math.random() * 1.6, Math.sin(a) * sp), spin: new THREE.Vector3(Math.random() * 12, Math.random() * 12, 0), ground: 0.02 });
      this.scene.add(m);
    }
    this.list.push({ bits, t0: now, last: now, life: 900, fade: [500, 900] });
  }

  // a mob appearing (Pete): a ring of pixel dust puffs out from its feet and drifts up, fading, as the dust it leaves when it dies
  puff(x: number, z: number, now: number, h = 1.4) {
    if (shared.uOutline.value > 0.5) return;                              // laser and phosphor: no loose dust (their outline pass misreads it)
    const bits: Bit[] = [], mat = new THREE.MeshBasicMaterial({ color: 0xc8c2b4, transparent: true, depthWrite: false });
    const n = fxN(26); if (!n) return;
    for (let i = 0; i < n; i++) {
      const s = 0.05 + Math.random() * 0.06, m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), mat);
      const a = Math.random() * Math.PI * 2, rr = 0.15 + Math.random() * 0.3;
      m.position.set(x + Math.cos(a) * rr, Math.random() * h, z + Math.sin(a) * rr);
      const sp = 0.6 + Math.random() * 0.9;
      bits.push({ m, v: new THREE.Vector3(Math.cos(a) * sp, 0.3 + Math.random() * 0.7, Math.sin(a) * sp), spin: new THREE.Vector3(Math.random() * 4, Math.random() * 4, 0), ground: -1 });
      this.scene.add(m);
    }
    this.list.push({ bits, mat, t0: now, last: now, life: 550, fade: [150, 550], float: true });
  }

  update(now: number) {
    for (const e of [...this.list]) {
      const k = e.float ? fx.time : 1;                                  // a spawn puff keeps pace with a fast bot, as the dissolves do
      e.clock = (e.clock ?? 0) + (now - e.last) / k;
      const dt = Math.min(0.05, (now - e.last) / 1000 / k), t = e.clock;
      e.last = now;
      const fade = 1 - THREE.MathUtils.smoothstep(t, e.fade[0], e.fade[1]);
      for (const b of e.bits) {
        if (e.float) b.v.multiplyScalar(1 - Math.min(1, 3 * dt)); else b.v.y -= G * dt;   // dust: drag, no fall
        b.m.position.addScaledVector(b.v, dt);
        if (b.m.position.y < b.ground) { b.m.position.y = b.ground; b.v.y = -b.v.y * 0.3; b.v.x *= 0.6; b.v.z *= 0.6; }
        b.m.rotation.x += b.spin.x * dt; b.m.rotation.y += b.spin.y * dt;
        if (e.mat) e.mat.opacity = fade; else b.m.scale.setScalar(Math.max(0.01, fade));
      }
      const w0 = e.wait ?? 200, fl = e.fly ?? 520, done = w0 + fl;        // (its own pace: a sapling rises, shows itself, then flies)
      if (e.piece && e.rise && t <= w0) {                                 // rising out of the ground, turning slowly, before it goes
        const u = Math.min(1, t / e.rise), y = e.from!.y * (1 - (1 - u) * (1 - u));
        e.piece.visible = true; e.piece.position.set(e.from!.x, y, e.from!.z); e.piece.rotation.set(0, t / 260, 0); e.piece.scale.setScalar(0.5 * Math.min(1, 0.3 + u));
      }
      if (e.piece && t > w0) flyToHotbar(e.piece, e.from!, this.camera, (t - w0) / fl, 0.5, e.key);
      if (e.piece && e.key && !e.arrived && t > done) { e.arrived = true; fx.arrive?.(e.key); }
      if (t > e.life && (!e.piece || t > done)) this.end(e);
    }
  }

  end(e: BurstFx) {
    for (const b of e.bits) { this.scene.remove(b.m); b.m.geometry.dispose(); }
    if (e.piece) { this.scene.remove(e.piece); e.piece.geometry.dispose(); }
    e.mat?.dispose();
    this.list.splice(this.list.indexOf(e), 1);
  }

  clear() { for (const e of [...this.list]) this.end(e); }
}

// a drop flying from `from` up and into the bottom of the view (the hotbar), spinning and shrinking; u runs 0 → 1
function flyToHotbar(obj: THREE.Object3D, from: THREE.Vector3, camera: THREE.Camera, u: number, size: number, key: string | null = null) {
  u = Math.min(1, u);
  // to its own slot when it has one (Pete: the wood flies to the materials row and its number ticks up as it lands), else the hotbar
  const pt = key && fx.target?.(key);
  const to = pt ? new THREE.Vector3((pt.x / innerWidth) * 2 - 1, 1 - (pt.y / innerHeight) * 2, 0.5).unproject(camera).sub(camera.position).normalize().multiplyScalar(0.8).add(camera.position)
    : camera.localToWorld(new THREE.Vector3(0, -0.42, -0.7));
  obj.position.lerpVectors(from, to, u * u * (3 - 2 * u));
  obj.position.y += Math.sin(Math.PI * u) * 1.2;
  obj.rotation.set(u * 6, u * 9, 0);
  obj.scale.setScalar(size * (1 - u) + 0.06 * u);
  obj.visible = u < 1;
}

// a steak: meat, a rim of fat and a bone
function steak() {
  const g = new THREE.Group();
  for (const [w, h, d, col, x, z] of [[0.36, 0.12, 0.26, 0xa8322a, 0, 0], [0.38, 0.13, 0.05, 0xf0e2d0, 0, 0.14], [0.2, 0.07, 0.07, 0xf4f0e6, 0.25, -0.02]]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), makeMaterial("mob", { color: col }));
    m.position.set(x, 0, z);
    g.add(m);
  }
  return g;
}

// Dying: when you kill a cow, Craftax just drops it from the mob list and adds the food. The client keeps its model, rolls it onto its
// side away from you, flashes it, sinks it away, and flies a steak to the hotbar.
const ROLL_MS = 450, LIE_MS = 600, GONE_MS = 450, STEAK_AT = 300, STEAK_MS = 520;
export class Dying {
  declare scene: THREE.Object3D; declare camera: THREE.Camera; declare list: DyingMob[];
  constructor(scene: THREE.Object3D, camera: THREE.Camera) { this.scene = scene; this.camera = camera; this.list = []; }

  // model: the mob's model, already in the scene; side: +1 / -1, which way it rolls; drop: whether a steak flies to the hotbar;
  // dust(model, now): instead of sinking into the ground, the body is handed on when its lie is over (a zombie crumbles to dust)
  start(model: THREE.Object3D, side: number, now: number, drop = true, dust: DyingMob["dust"] = null) {
    model.rotation.order = "YXZ";
    this.list.push({ model, side, drop, dust, t0: now, y0: model.position.y, steak: null, steakT0: -1, from: null });
  }

  update(now: number) {
    for (const e of [...this.list]) {
      const t = now - e.t0, u = Math.min(1, t / ROLL_MS);
      const roll = (Math.PI / 2) * (u < 1 ? u * u : 1 - 0.06 * Math.sin(Math.min(1, (t - ROLL_MS) / 220) * Math.PI));
      e.model.rotation.z = e.side * roll;
      e.model.position.y = e.y0 + 0.28 * Math.sin(roll);                // its side, not its middle, ends up on the ground
      const tg = t - ROLL_MS - LIE_MS;
      if (tg > 0 && e.dust) { if (e.steak) this.scene.remove(e.steak); e.dust(e.model, now); this.list.splice(this.list.indexOf(e), 1); continue; }
      if (tg > 0) { const v = Math.min(1, tg / GONE_MS); e.model.position.y -= 1.2 * v * v; e.model.scale.setScalar(1 - 0.6 * v); }
      animate(e.model, now / 1000, false, 1, t < 260);
      if (e.drop && t > STEAK_AT && !e.steak) { e.steak = steak(); e.steakT0 = now; this.scene.add(e.steak); e.from = e.model.position.clone().setY(0.6); }
      if (e.steak) flyToHotbar(e.steak, e.from!, this.camera, (now - e.steakT0) / STEAK_MS, 1.2);
      if (tg > GONE_MS && (!e.drop || (e.steak && now - e.steakT0 > STEAK_MS))) this.end(e);
    }
  }

  end(e: DyingMob) {
    this.scene.remove(e.model);
    if (e.steak) this.scene.remove(e.steak);
    this.list.splice(this.list.indexOf(e), 1);
  }

  clear() { for (const e of [...this.list]) this.end(e); }
}

// Bones: a skeleton's death. Its parts come apart and drop into a heap (each a falling box that settles flat), lie a moment, then
// each bone crumbles into rising pixel dust.
const REST_MS2 = 700;                                                     // the bones lie still this long before they crumble
const HEAP_MS = 700, PILE_MS = 1100, CRUMBLE_MS = 1400, FADE_MS = 420, BONE = [0xd8d8d0, 0x9a978c];
const flat = (a: number) => Math.round(a / (Math.PI / 2)) * (Math.PI / 2);

export class Bones {
  declare scene: THREE.Object3D; declare list: BoneHeap[];
  constructor(scene: THREE.Object3D) { this.scene = scene; this.list = []; }

  // model: the skeleton's model, already in the scene; (fx, fz): the player's position (the heap spills away from it).
  // opts.lying: the body already lies where it fell (a zombie): no heap, it crumbles where it is; opts.colors: the dust's two colours
  start(model: THREE.Object3D, fx: number, fz: number, now: number, opts: BonesOpts = {}) {
    model.updateMatrixWorld(true);
    const cx = model.position.x, cz = model.position.z, meshes: FxMesh[] = [];
    model.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as FxMesh); });
    const ax = cx - fx, az = cz - fz, an = Math.hypot(ax, az) || 1, size = new THREE.Vector3();
    const pieces = meshes.map((m): BonePiece => {
      this.scene.attach(m);                                              // keeps where it is in the world
      m.geometry.computeBoundingBox(); m.geometry.boundingBox!.getSize(size).multiply(m.getWorldScale(new THREE.Vector3()));
      const spread = 0.6 + Math.random() * 0.9;
      return {
        m, rest: !!opts.lying, keep: !!opts.lying, delay: Math.random() * 500,
        v: new THREE.Vector3((ax / an) * spread * 0.5 + (Math.random() - 0.5) * 1.2, Math.random() * 0.6, (az / an) * spread * 0.5 + (Math.random() - 0.5) * 1.2),
        spin: new THREE.Vector3((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 10).multiplyScalar(opts.blast ? 3 : 1),
        ground: opts.lying ? m.position.y : Math.max(0.02, Math.min(size.x, size.y, size.z) / 2) + Math.random() * 0.06,   // flattest side, a little stacked
        box: size.clone(), s0: m.scale.clone(),
      };
    });
    this.scene.remove(model);
    if (opts.blast) for (const p of pieces) {                           // blown apart (?god's nuke): every piece flung out from the middle and up
      const out = p.m.position.clone().sub(model.position).setY(0);
      if (out.lengthSq() < 1e-4) out.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      out.normalize().multiplyScalar(2.5 + Math.random() * 3.5);
      p.v.set(out.x + (Math.random() - 0.5) * 2, 4 + Math.random() * 4, out.z + (Math.random() - 0.5) * 2);
    }
    if (opts.lying) {                                                    // a body turning to dust: from the top down, a piece at a time
      const ys = pieces.map((p) => p.m.position.y), hi = Math.max(...ys), lo = Math.min(...ys);
      for (const p of pieces) p.delay = ((hi - p.m.position.y) / Math.max(0.1, hi - lo)) * 450 + Math.random() * 120;
    }
    const [a, b] = opts.colors || BONE;
    // lying: its clock starts past the heap and the pile (skip, in animation time, so a fast bot's quicker clock doesn't jump it to the end)
    // opts.more: that many times the dust (the necromancer's: a purple storm of it)
    this.list.push({ more: opts.more || 1, pieces, lying: !!opts.lying, restT: 0, t0: now, skip: opts.lying ? HEAP_MS + PILE_MS - 150 : 0, last: now, dust: null, colors: [new THREE.Color(a), new THREE.Color(b)] });
  }

  update(now: number) {
    for (const e of [...this.list]) {
      // its own clock (animation time): it runs fx.time faster when the bot is quick, never jumping when that changes
      e.clock = (e.clock ?? e.skip) + (now - e.last) / fx.time;
      const dt = Math.min(0.05, (now - e.last) / 1000 / fx.time), t = e.clock;
      e.last = now;
      for (const p of e.pieces) {
        if (!p.rest) {                                                   // falling: gravity, a dull bounce, then it lies flat
          p.v.y -= G * dt;
          p.m.position.addScaledVector(p.v, dt);
          p.m.rotation.x += p.spin.x * dt; p.m.rotation.y += p.spin.y * dt; p.m.rotation.z += p.spin.z * dt;
          if (p.m.position.y < p.ground) {
            p.m.position.y = p.ground; p.v.y = -p.v.y * 0.25; p.v.x *= 0.45; p.v.z *= 0.45; p.spin.multiplyScalar(0.4);
            if (Math.abs(p.v.y) < 0.4) p.rest = true;
          }
        } else if (!p.keep) {                                            // settle onto a face
          const k = Math.min(1, dt * 10);
          p.m.rotation.x += (flat(p.m.rotation.x) - p.m.rotation.x) * k;
          p.m.rotation.z += (flat(p.m.rotation.z) - p.m.rotation.z) * k;
        }
      }
      // crumbling: a lying body at once; a skeleton's heap only once every bone has come to rest and lain a moment (Pete)
      if (!e.lying && !e.restT && (e.pieces.every((p) => p.rest) || t > HEAP_MS + PILE_MS + 1500)) e.restT = t;
      const tc = e.lying ? t - HEAP_MS - PILE_MS : e.restT ? t - e.restT - REST_MS2 : -1;
      if (tc > 0) {
        if (!e.dust) e.dust = this.dust(e.pieces, e.colors, e.more);
        if (!e.specks && shared.uPhos.value > 0.5) e.specks = this.specks(e.pieces);   // phosphor: dust it can draw (Pete)
        // each piece keeps its size and place and fades out as its dust bursts from it, the two together (Pete)
        for (const p of e.pieces) {
          const u = THREE.MathUtils.clamp((tc - p.delay - 40) / FADE_MS, 0, 1), mat = p.m.material;
          // laser and phosphor write each surface's id and light into the colour, not a colour: blended at half alpha they read as a
          // bright flash (Pete), so there a piece stays solid and goes out halfway through its fade
          if (shared.uOutline.value > 0.5) {                               // there: each piece flares up and dies out fast, overlapping
            const d = tc - p.delay * 0.45, fl = d < 0 ? 0 : d < 50 ? d / 50 : 1 - (d - 50) / 150;   // up in 50 ms, down in 150
            if (mat.uniforms?.uEmissive) mat.uniforms.uEmissive.value = fl > 0 ? -Math.max(0.01, fl) : 0;
            p.m.visible = d < 200;
            continue;
          }
          if (mat.uniforms?.uAlpha) {
            if (!mat.transparent) { mat.transparent = true; mat.depthWrite = false; mat.needsUpdate = true; }
            mat.uniforms.uAlpha.value = 1 - u;
          }
          p.m.visible = u < 1;
        }
        this.drift(e.dust, tc, dt);
        if (e.specks) this.drift3(e.specks, tc, dt);
      }
      if (tc > CRUMBLE_MS + 400) this.end(e);
    }
  }

  // the dust: pixel squares spread through each bone, released as that bone crumbles, drifting up and fading out
  // lots of it (Pete): a piece's worth by its size, through its whole volume, in its own colour mixed with the dust's
  dust(pieces: BonePiece[], [c1, c2]: THREE.Color[], more = 1) {
    const pers = pieces.map((p) => fxN(Math.round(more * THREE.MathUtils.clamp(Math.round(p.box.x * p.box.y * p.box.z * 6000), 24, 110))));
    const n = pers.reduce((a, b) => a + b, 0), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), parts: { at: THREE.Vector3; born: number; v: THREE.Vector3 }[] = [];
    const c = new THREE.Color(), own = new THREE.Color(), bb = new THREE.Box3();
    let k = 0;
    pieces.forEach((p, i) => {
      p.m.updateMatrixWorld(true); bb.copy(p.m.geometry.boundingBox!);
      own.copy(p.m.material.uniforms?.uColor?.value || c1);
      for (let j = 0; j < pers[i]; j++, k++) {
        const at = new THREE.Vector3(THREE.MathUtils.lerp(bb.min.x, bb.max.x, Math.random()), THREE.MathUtils.lerp(bb.min.y, bb.max.y, Math.random()),
          THREE.MathUtils.lerp(bb.min.z, bb.max.z, Math.random())).applyMatrix4(p.m.matrixWorld);
        parts.push({ at, born: p.delay + Math.random() * FADE_MS * 0.8, v: new THREE.Vector3((Math.random() - 0.5) * 0.35, 0.25 + Math.random() * 0.55, (Math.random() - 0.5) * 0.35) });
        pos.set([0, -100, 0], k * 3);
        c.copy(c1).lerp(c2, Math.random()).lerp(own, 0.6); col.set([c.r, c.g, c.b], k * 3);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({ size: 0.07, vertexColors: true, transparent: true, depthWrite: false });
    const points = new THREE.Points(g, mat);
    points.frustumCulled = false;
    this.scene.add(points);
    return { points, parts };
  }

  // phosphor's dust: loose points garble its character pass, so there the dust is a few solid little cubes in each piece's own
  // material kind (each cloud of them one outlined surface), drifting up like the points and winking out one by one
  specks(pieces: BonePiece[]) {
    const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1), mats: THREE.Material[] = [], parts: { m: THREE.Mesh; born: number; life: number; v: THREE.Vector3 }[] = [], bb = new THREE.Box3();
    for (const p of pieces) {
      const mat = makeMaterial("mob", { color: p.m.material.uniforms?.uColor?.value?.getHex?.() ?? 0xaaaaaa });
      mats.push(mat);                                                    // (no boost: lit as the world, not a bright flash)
      p.m.updateMatrixWorld(true); bb.copy(p.m.geometry.boundingBox!);
      for (let j = 0, n = fxN(4); j < n; j++) {
        const m = new THREE.Mesh(geo, mat);
        m.position.set(THREE.MathUtils.lerp(bb.min.x, bb.max.x, Math.random()), THREE.MathUtils.lerp(bb.min.y, bb.max.y, Math.random()),
          THREE.MathUtils.lerp(bb.min.z, bb.max.z, Math.random())).applyMatrix4(p.m.matrixWorld);
        m.visible = false; this.scene.add(m);
        parts.push({ m, born: p.delay + Math.random() * FADE_MS * 0.8, life: 400 + Math.random() * 700,
          v: new THREE.Vector3((Math.random() - 0.5) * 0.35, 0.25 + Math.random() * 0.55, (Math.random() - 0.5) * 0.35) });
      }
    }
    return { geo, mats, parts };
  }

  drift3(d: NonNullable<BoneHeap["specks"]>, tc: number, dt: number) {
    for (const p of d.parts) {
      p.m.visible = tc >= p.born && tc < p.born + p.life;
      if (!p.m.visible) continue;
      p.v.x += (Math.random() - 0.5) * 0.6 * dt; p.v.z += (Math.random() - 0.5) * 0.6 * dt;
      p.m.position.addScaledVector(p.v, dt);
    }
  }

  drift(d: NonNullable<BoneHeap["dust"]>, tc: number, dt: number) {
    const pos = d.points.geometry.attributes.position;
    d.parts.forEach((p, k) => {
      if (tc < p.born) return;
      p.v.x += (Math.random() - 0.5) * 0.6 * dt; p.v.z += (Math.random() - 0.5) * 0.6 * dt;   // a little wind
      p.at.addScaledVector(p.v, dt);
      pos.setXYZ(k, p.at.x, p.at.y, p.at.z);
    });
    pos.needsUpdate = true;
    d.points.visible = shared.uOutline.value < 0.5;                        // (laser and phosphor: their outline pass would read it as surfaces)
    d.points.material.opacity = 1 - THREE.MathUtils.smoothstep(tc, 800, CRUMBLE_MS + 400);   // gone by ~1.8 s (between the old 2.3 and 1.3: Pete)
  }

  end(e: BoneHeap) {
    for (const p of e.pieces) this.scene.remove(p.m);
    if (e.dust) { this.scene.remove(e.dust.points); e.dust.points.geometry.dispose(); e.dust.points.material.dispose(); }
    if (e.specks) { for (const p of e.specks.parts) this.scene.remove(p.m); e.specks.geo.dispose(); e.specks.mats.forEach((m) => m.dispose()); }
    this.list.splice(this.list.indexOf(e), 1);
  }

  clear() { for (const e of [...this.list]) this.end(e); }
}
