// A set piece arriving (raised with I, src/scenes/raise.ts), or going away the same way backwards. Nothing here touches the game: it
// sees the map change under a set piece (a new one there, or the one there gone) and draws the change over a few seconds, whatever
// made it, so a replay or a spectated game shows it the same.
//
// Going up, it all happens in one wave out from you: where the wave reaches, the set piece's parts shoot up out of the ground (and its
// land past the map's edge lifts out of the sea), and what stood there changes with them: a tree bursts into dust, a rock in the open
// breaks apart (src/scenes/rise-fx.ts), the grass shrinks into the ground, a rock under a building stretches up with it, into its
// walls. Coming down: the same backwards (no bursts: the trees and rocks grow back up out of the ground). A set piece can time its own
// parts (Placement.arrive, seconds going up). The shader scales each tile's height (uRiseK: the Ruins stones' way).
//
// Everything is worked out in "up time" (going up: the time; coming down: the end less the time), so the two can't differ. While it
// runs the world draws the map as it is shown (riseView: each tile shows its old block or its new one by its moment), the paving only
// where it has arrived, the footprint left uncovered (the rocks under it showing, stretched) until the end, and the parts in meshes
// of their own (one per moment, each lifted from below); at the end it is built into the world as usual.
import * as THREE from "three";
import { Geo } from "../world/geo";
import { SOLID, TREES } from "../world/blocks";
import { makeDraw } from "../themes/draw";
import { shared } from "../render/shading/uniforms";
import { placementFor } from "./active";
import type { Draw, Placement } from "../themes/types";
import type { GameState } from "../core/types";
import type { World } from "../world/core";

const SPEED = 14, RISE = 1300, SINK = 600, STEP = 40, REFRESH = 100;   // tiles/s; ms: a part shooting up, a tile's old things going down
const STRETCH = 2.5, K_MAX = 4, LAND_LIFT = 3;                     // (a rock under a building, as tall as this; the land, from this deep)
const MIN_CHANGE = 24;                                             // (fewer tiles changed at once: the game's own doing)

interface Part { t: number; lift: number; mesh: THREE.Mesh }
interface Run {
  up: boolean; p: Placement; t0: number; level: number; end: number; W: number;
  /** Each changed tile: its moment in the wave and when it turns (up time), its block on each side, and whether it stretches. */
  tiles: Map<number, { wave: number; turn: number; orig: number; piece: number; tall: boolean; fx: "tree" | "rock" | null; done?: boolean; hb: number; h0: number }>;
  /** How deep the building starts (blocks below the ground). */
  lift: number;
  parts: Part[]; group: THREE.Group; shown: number; refreshed: number; k: Uint8Array; tex: THREE.DataTexture;
}
let run: Run | null = null;
let last: { map: readonly number[]; level: number; seed: number; id: string } | null = null;

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const shoot = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : 1 - (1 - x) ** 3);   // fast out of the ground, slowing as it lands
const upTime = (r: Run, now: number) => { const t = now - r.t0; return r.up ? t : r.end - t; };
/** So many tiles changed at once that it isn't the game (mining, chopping): a set piece come or gone. */
export const bigChange = (a: readonly number[], b: readonly number[]) => { let n = 0; for (let i = 0; i < b.length && n < MIN_CHANGE; i++) if (a[i] !== b[i]) n++; return n >= MIN_CHANGE; };

/** World.update's state as it is to be drawn: while a set piece is arriving, each changed tile shows its block for the moment. */
export function riseView(w: World, s: GameState): GameState {
  const prev = last;
  last = { map: s.map, level: s.level, seed: s.seed, id: s.game_id };
  if (!run && prev && w.map && prev.level === s.level && prev.seed === s.seed && prev.id === s.game_id && bigChange(prev.map, s.map)) begin(w, prev.map, s);
  if (!run) return s;
  if (run.level !== s.level || s.size[1] !== run.W) { finish(w); return s; }
  const tu = upTime(run, performance.now()), map = s.map.slice();
  for (const [i, x] of run.tiles) map[i] = tu >= x.turn ? x.piece : x.orig;
  return { ...s, map };
}

/** The set piece the world draws while one is arriving (null: none arriving, the world finds its own): paved where it has arrived,
 *  its footprint uncovered (the parts rising over what stands there). */
export function risePiece(): Placement | null {
  const r = run;
  if (!r) return null;
  const on = (rr: number, c: number) => { const x = r.tiles.get(rr * r.W + c); return !x || upTime(r, performance.now()) >= x.turn; };
  return { data: r.p.data, fog: r.p.fog, paved: r.p.paved && ((rr, c) => on(rr, c) && !!r.p.paved!(rr, c)) };
}
/** Is this tile changing as a set piece arrives (its faces are built knowing their tile, so the shader can sink and stretch them)? */
export const riseTile = (r: number, c: number) => !!run && run.tiles.has(r * run.W + c);

// a set piece come or gone between two maps of the same world and floor
function begin(w: World, before: readonly number[], s: GameState): void {
  const [H, W] = s.size;
  const now = placementFor({ level: s.level, seed: s.seed, size: [H, W], map: s.map, items: s.items }, "rise|" + s.map.join(""));
  const was = w.piece;
  if (!!now === !!was) return;
  const up = !!now, p = (now ?? was)!, origin = [s.pos[0] + 0.5, s.pos[1] + 0.5] as const, from = [origin[1], origin[0]] as const;
  const wave = (x: number, z: number) => (Math.hypot(z - origin[0], x - origin[1]) / SPEED) * 1000;
  // its parts as it draws them, each with its moment in the wave
  const faces: { t: number; g: boolean; f: (d: Draw) => void; piece: number }[] = [];
  let piece = -1, top = 1;
  const part = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, f: (d: Draw) => void) => {
    const x = (x0 + x1) / 2, z = (z0 + z1) / 2, g = y1 <= 0.01, own = p.arrive?.(x, Math.max(0, y0), z, from);
    if (!g) top = Math.max(top, y1);
    faces.push({ t: own != null ? own * 1000 : wave(x, z), g, piece, f });
  };
  const keep: Draw = {
    r0: 0, c0: 0, r1: H, c1: W,
    face: (f, x0, y0, z0, x1, y1, z1, tex, light, sub, sway) => part(x0, y0, z0, x1, y1, z1, (d) => d.face(f, x0, y0, z0, x1, y1, z1, tex, light, sub, sway)),
    box: (x0, y0, z0, x1, y1, z1, tex, light, fs) => part(x0, y0, z0, x1, y1, z1, (d) => d.box(x0, y0, z0, x1, y1, z1, tex, light, fs)),
    piece: (k) => { piece = k; },
  };
  try { p.draw?.(keep); p.beyond?.(keep); } catch (e) { console.error("[craftax-3d] a set piece failed to draw rising", e); return; }
  // the changed tiles: a tile out in the open turns once its old things are down; one under the building keeps them (a rock
  // stretched up inside its walls, a tree shrunk away) until the very end, when the building covers it
  const tiles: Run["tiles"] = new Map();
  let end = 0;
  for (const f of faces) end = Math.max(end, f.t + RISE);
  for (let i = 0; i < H * W; i++) {
    if (before[i] === s.map[i]) continue;
    const r = Math.floor(i / W), c = i % W, t = wave(c + 0.5, r + 0.5), orig = up ? before[i] : s.map[i], pc = up ? s.map[i] : before[i];
    // a rock under the building stretches up until the building's column on its tile has risen past it (hb: that column's height;
    // h0: the rock's); where the building is hollow, it breaks like one in the open
    const under = !!p.covers?.(r, c);
    let hb = 0;
    if (under && p.solid) for (let y = 0; y < top; y++) if (p.solid(c, y, r)) hb = y + 1;
    const tall = under && orig in SOLID && hb > 0, h0 = up ? w.height(r, c) || 1 : 1;
    // going up, a tree in the way bursts into dust and a rock in the open breaks (rise-fx.ts); coming down they grow back
    const fx = !up ? null : orig in TREES ? "tree" : orig in SOLID && !tall ? "rock" : null;
    tiles.set(i, { wave: t, turn: under ? Infinity : fx ? t : t + SINK, orig, piece: pc, tall, fx, hb, h0 });
    end = Math.max(end, t + SINK);
  }
  for (const x of tiles.values()) if (x.turn === Infinity) x.turn = end;
  // the meshes: the parts grouped by moment, STEP ms apart, each lifted from below (the building from as deep as it's tall)
  const buckets = new Map<string, { t: number; lift: number; geo: Geo; d: Draw }>(), solid = p.solid;
  const occ = solid ? (x: number, y: number, z: number) => (solid(Math.floor(x), Math.floor(y), Math.floor(z)) ? 1 : 0) : null;
  for (const f of faces) {
    const k = Math.round(f.t / STEP), key = k + (f.g ? "g" : "");
    let b = buckets.get(key);
    if (!b) { const geo = new Geo(occ); b = { t: k * STEP, lift: f.g ? LAND_LIFT : top + 1, geo, d: makeDraw(geo, 0, 0, H, W, 120) }; buckets.set(key, b); }
    b.d.piece(f.piece); f.f(b.d);
  }
  const group = new THREE.Group(), parts: Part[] = [];
  for (const b of buckets.values()) if (b.geo.i.length) {
    const mesh = b.geo.mesh(w.mats.opaque);
    mesh.visible = !up;
    group.add(mesh); parts.push({ t: b.t, lift: b.lift, mesh });
  }
  w.group.parent?.add(group);
  if (w.floorMemo) for (const i of tiles.keys()) w.floorMemo.memo[i] = 0;   // (the paving drawn afresh where the ground changed)
  const kb = new Uint8Array(W * H).fill(Math.round(255 / K_MAX)), tex = new THREE.DataTexture(kb, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter; tex.unpackAlignment = 1; tex.needsUpdate = true;
  shared.uRiseK.value = tex; shared.uRiseOn.value = 1;
  run = { up, p, t0: performance.now(), level: s.level, end, W, tiles, lift: top + 1, parts, group, shown: -1, refreshed: 0, k: kb, tex };
  w.key = null; w.fullNext = true; w.regrow = true;                  // (built once more, each changing tile's faces knowing their tile)
}

/** Each frame: the parts lifted, the tiles' things sunk or stretched, and true when the world should draw again from the state (more
 *  tiles have turned, or it's done). */
export function riseTick(w: World, now: number, fx: Record<"tree" | "rock", (b: number, r: number, c: number, now: number) => void>): boolean {
  const r = run;
  if (!r) return false;
  if (now - r.t0 > r.end) { finish(w); return true; }
  const tu = upTime(r, now);
  for (const { t, lift, mesh } of r.parts) {
    const e = shoot((tu - t) / RISE);
    mesh.visible = e > 0; mesh.position.y = -lift * (1 - e);
  }
  let n = 0;
  for (const [i, x] of r.tiles) {
    // a tall one (a rock under the building): stretched up as the building comes; one cleared away: gone in a burst as the wave
    // reaches it; anything else: down into the ground (coming down: up out of it), then the new tile (flat) in its place
    const gone = !!x.fx && tu >= x.wave;
    if (gone && !x.done) { x.done = true; fx[x.fx!](x.orig, Math.floor(i / r.W), i % r.W, now); }
    const k = x.tall ? tallK(r, x, tu) : tu >= x.turn ? 1 : gone ? 0 : x.fx ? 1 : 1 - ease((tu - x.wave) / SINK);
    r.k[i] = Math.round((k / K_MAX) * 255);
    if (tu >= x.turn) n++;
  }
  r.tex.needsUpdate = true;
  if (n !== r.shown && now - r.refreshed >= REFRESH) { r.shown = n; r.refreshed = now; return true; }
  return false;
}

// a rock under the building: stretched up as the building comes, and gone into it once the building's column there has risen as high
// as the rock stands (inside its walls from then on)
function tallK(r: Run, x: { wave: number; hb: number; h0: number }, tu: number): number {
  const k = 1 + (STRETCH - 1) * ease((tu - x.wave) / RISE), built = x.hb - r.lift * (1 - shoot((tu - x.wave) / RISE));
  return built >= x.h0 * k ? 0 : k;
}

function finish(w: World): void {
  const r = run;
  if (!r) return;
  run = null;
  for (const { mesh } of r.parts) mesh.geometry.dispose();
  r.group.removeFromParent();
  shared.uRiseOn.value = 0; shared.uRiseK.value = null; r.tex.dispose();
  w.key = null; w.fullNext = true; w.regrow = false;                 // (built again, with the set piece in it, or without)
}
