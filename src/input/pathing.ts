// Walking to a clicked target: reach, a step toward it, digging through, the nearest shore.
import { beyondReach } from "../render/targeting";
import { ITEM, B } from "../../js/world";
import { HOTBAR } from "../../js/hud";
import { A, DIRV, sound } from "../core/shared";
import { world } from "../render/arm";
import { hangState, hangTick } from "../effects/hang";
import { flat, game, mobs } from "../core/game";
import { aim } from "./aim";
import { dirTo, moveAction } from "./targets";
import { chooseAct } from "./intent";
import { flash, isSealed, sealed } from "../ui/hud/hint";
import { opt } from "../ui/screens/options";
import { holdOn, pointerState } from "./pointer";
import { padTouch } from "./touch";
import { openPanel } from "../ui/screens/panel";
import type { AimHit } from "../world/shapes";
import type { Act } from "./intent";
import type { Entity, OneShot } from "../core/game";
import type { Pos } from "../core/types";

/** A walk to a clicked target (reach): the tile, what to do there (an action, or OPEN, WALK, CLIMB), the creature followed (its key and
 *  model), steps taken, and how it's going. */
export interface Pending {
  r: number; c: number; action: number;
  key?: string;
  ent?: Entity | null;
  steps: number;
  /** First person: past 1st person reach, no walk. */
  far: boolean;
  /** Got to the creature and hit it once. */
  met?: boolean;
  /** Beside it now. */
  near?: boolean;
  /** The click's swing shown (Move off). */
  swung?: boolean;
}
// this module's state that other modules set (one module can't assign another's let): pending
export interface Pathing { pending: Pending | null }
export const pathing = {} as Pathing;

// Craftax only acts on the tile in front of you. A click on something farther away (within the crosshair's reach) walks you up
// beside it a tile per tick, then acts; any movement key cancels the walk.
export const WALKABLE = new Set([B.GRASS, B.SAND, B.PATH, B.FIRE_GRASS, B.ICE_GRASS, B.GRAVEL]);
pathing.pending = null;                                                          // {r, c, action, steps}
export const OPEN = -1;                                                             // reach's "action" for a table or furnace: open the E screen
export const WALK = -2;
export const CLIMB = -3;                                                            // reach's "action" for a ladder: walk onto it, then go down / up                                                             // reach's "action" for open ground: walk onto it
export const STATION = new Set([B.TABLE, B.FURNACE]);                              // Craftax's DO destroys these: sent only on Shift+click or the E screen's Break
export const ENCH = new Set([B.ENCH_FIRE, B.ENCH_ICE]);
export const USE = new Set([...STATION, ...ENCH]);                                  // a click, tap or Use on these opens the E screen (an enchantment table: at its Enchant cards)
export const BREAK = -5;                                                            // the E screen's "Break it" (hud.ts): DO on the table or furnace it was opened at
// key: a mob's key: follow it as it moves and keep hitting it until it is gone (killed, or wandered off)
export function reach(r: number, c: number, action: number, key?: string): OneShot | null {
  if (key) {
    const e = mobs.get(key);
    r = Math.floor(e?.to.z ?? NaN); c = Math.floor(e?.to.x ?? NaN);
    // its slot, a new creature in it (a new model; or, a one-hit kill and a full-health cow in its place, a jump no creature makes in
    // a step): not yours, the target is gone
    if (!e || (pathing.pending && pathing.pending.key === key && pathing.pending.ent && (pathing.pending.ent !== e || Math.abs(r - pathing.pending.r) + Math.abs(c - pathing.pending.c) > 2))) { pathing.pending = null; return null; }
  }
  if (!pathing.pending || pathing.pending.action !== action || (key ? pathing.pending.key !== key : pathing.pending.r !== r || pathing.pending.c !== c))
    pathing.pending = { r, c, action, key, ent: key ? mobs.get(key) : null, steps: 0, far: action !== WALK && action !== CLIMB && beyondReach(r, c) };   // first person: past 1st person reach, no walk
  const p: Pending = pathing.pending;
  p.r = r; p.c = c;
  const d = action === WALK || action === CLIMB ? 0 : dirTo(r, c);          // walking, climbing: arrive ON the tile, not beside it
  // If target moves (Settings, each view): a creature you got to and hit steps away: "chase" goes after it; "near" only while it's
  // within reach (first person: 1st person reach; overhead: 4 tiles); "stop" lets it go
  if (key && d) p.met = true;
  else if (key && p.met && (opt.chase === "stop" || (opt.chase === "near"
      && (flat.t === 0 ? beyondReach(r, c) : Math.max(Math.abs(r - game.S!.pos[0]), Math.abs(c - game.S!.pos[1])) > 4)))) { pathing.pending = null; return null; }
  p.near = !!d;                                                       // beside it: a chase now hits at the game's pace
  if (d && action === OPEN) { pathing.pending = null; openPanel({ r, c }); return null; }
  // Hold to target: only while held does a click walk or repeat, and then a held target is hit for as long as it is held (a block or
  // tree too), with no step limits; a quick click is one hit, or a swing
  const move = opt.move && (!holdOn() || pointerState.holding) && !maneuver && !p.far, spam = opt.spam && (!holdOn() || pointerState.holding) && !maneuver;
  if (d && key && spam && (pointerState.holding || ++p.steps <= 40)) { hangState.swingT = performance.now(); return { action, face: d }; }   // keep hitting
  if (d && pointerState.holding && spam && action === A.DO) { hangState.swingT = performance.now(); return { action, face: d }; }
  if (d) { pathing.pending = null; hangState.swingT = performance.now(); return { action, face: d }; }
  // Settings, Move to target on click off: no walking there. A mob being hit again and again (Spam on) stays the target and is hit
  // whenever it is beside you; anything else is dropped. Either way the click swings what you hold (only the arm: no step is sent,
  // no message), so every click answers
  if (!move && !(action === CLIMB && r === game.S!.pos[0] && c === game.S!.pos[1])) {
    if (!p.swung) { p.swung = true; hangState.swingT = performance.now(); sound.swing(HOTBAR[game.hud.sel].tool === "hand"); }   // once a click, not every tick of a wait
    if (!(key && spam)) pathing.pending = null;
    return null;
  }
  if (r === game.S!.pos[0] && c === game.S!.pos[1]) {
    pathing.pending = null;
    if (action !== CLIMB) return null;
    const it = game.S!.items[r * game.S!.size[1] + c];
    if (isSealed(game.S!, it)) { sealed(); return null; }                      // (no climb down and back up again: Craftax won't let you, Pete)
    return { action: it === ITEM.LADDER_UP ? A.ASCEND : A.DESCEND };
  }
  if (++p.steps > 200 && !pointerState.holding) { pathing.pending = null; flash("Can't get there"); return null; }
  if (action === A.DO && digTier(world.at(r, c))) {                         // a block inside a stack: dig through to it (Pete)
    const g = digStep(r, c);
    if (g) { if (g.dig) hangState.swingT = performance.now(); return g.dig ? { action: A.DO, face: g.a } : { action: g.a }; }
  }
  const a = stepToward(r, c, action === WALK || action === CLIMB);
  if (a) return { action: a };
  if (world.at(r, c) === B.LAVA && dirTo(r, c)) { pathing.pending = null; return null; }   // at the lava's edge: there, no further
  pathing.pending = null; flash("Can't get any closer");
  return null;
}

// the first move of a shortest walk (breadth-first over walkable tiles, around mobs) to the tile itself (onto) or to a tile beside it;
// when there is no way there, toward the reachable tile nearest it, so a click anywhere always brings you as close as the map allows
export function stepToward(r: number, c: number, onto: boolean): number {
  const H = game.S!.size[0], W = game.S!.size[1], start = game.S!.pos[0] * W + game.S!.pos[1];
  const mobAt = new Set([...mobs.values()].map((e) => Math.floor(e.to.z) * W + Math.floor(e.to.x)));
  const goal = (i: number) => { const ir = (i / W) | 0, ic = i % W; return onto ? ir === r && ic === c : Math.abs(ir - r) + Math.abs(ic - c) === 1; };
  const first = new Map<number, number>([[start, 0]]), q = [start];
  let best = start, bestD = Math.abs(game.S!.pos[0] - r) + Math.abs(game.S!.pos[1] - c);
  for (let k = 0; k < q.length; k++) {
    const i = q[k], ir = (i / W) | 0, ic = i % W;
    if (goal(i)) { best = i; break; }
    const d = Math.abs(ir - r) + Math.abs(ic - c);
    if (d < bestD) { best = i; bestD = d; }
    for (const a of [A.LEFT, A.RIGHT, A.UP, A.DOWN]) {
      const nr = ir + DIRV[a][0], nc = ic + DIRV[a][1], j = nr * W + nc;
      if (nr < 0 || nc < 0 || nr >= H || nc >= W || first.has(j) || mobAt.has(j) || !WALKABLE.has(world.at(nr, nc))) continue;
      first.set(j, i === start ? a : first.get(i)!);
      q.push(j);
    }
  }
  return best === start ? 0 : first.get(best)!;
}

// digging through a rock stack to a block in its middle (Pete): the pickaxe tier each block needs (0: not dug through), and the first
// move of the cheapest way to stand beside the target, walking or mining what's in the way (a block mined costs 4 steps, so a walk
// round is taken when it's not much longer). {a: the way, dig: mine the block that way first}, or null with no way or nothing to dig
export const DIG = new Map([[B.STONE, 1], [B.COAL, 1], [B.IRON, 2], [B.DIAMOND, 3], [B.SAPPHIRE, 4], [B.RUBY, 4]]);
export const digTier = (b: number) => (DIG.get(b) || 0) && (game.S!.inventory.pickaxe || 0) >= DIG.get(b)!;
export function digStep(r: number, c: number): { a: number; dig: boolean } | null {
  const H = game.S!.size[0], W = game.S!.size[1], start = game.S!.pos[0] * W + game.S!.pos[1];
  const mobAt = new Set([...mobs.values()].map((e) => Math.floor(e.to.z) * W + Math.floor(e.to.x)));
  const cost = new Map<number, number>([[start, 0]]), first = new Map<number, { a: number; dig: boolean }>(), buckets: number[][] = [[start]];
  for (let k = 0; k < buckets.length; k++) for (const i of buckets[k] || []) {
    if (cost.get(i) !== k) continue;
    const ir = (i / W) | 0, ic = i % W;
    if (Math.abs(ir - r) + Math.abs(ic - c) === 1) return i === start ? null : first.get(i)!;
    if (k > 120) return null;
    for (const a of [A.LEFT, A.RIGHT, A.UP, A.DOWN]) {
      const nr = ir + DIRV[a][0], nc = ic + DIRV[a][1], j = nr * W + nc;
      if (nr < 0 || nc < 0 || nr >= H || nc >= W || mobAt.has(j) || (nr === r && nc === c)) continue;
      const b = world.at(nr, nc), step = WALKABLE.has(b) ? 1 : digTier(b) ? 4 : 0;
      if (!step || (cost.has(j) && cost.get(j)! <= k + step)) continue;
      cost.set(j, k + step);
      first.set(j, i === start ? { a, dig: step > 1 } : first.get(i)!);
      (buckets[k + step] ||= []).push(j);
    }
  }
  return null;
}

// the water tile of the body containing (r, c) that is quickest to stand beside: a walk outward from you over walkable tiles,
// stopping at the first tile that touches that body
export function nearestShore(r: number, c: number): Pos | null {
  const H = game.S!.size[0], W = game.S!.size[1], body = new Set([r * W + c]), q = [r * W + c];
  for (let k = 0; k < q.length; k++) {
    const i = q[k], ir = (i / W) | 0, ic = i % W;
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const rr = ir + dr, cc = ic + dc, j = rr * W + cc;
      if (rr >= 0 && cc >= 0 && rr < H && cc < W && !body.has(j) && world.at(rr, cc) === B.WATER) { body.add(j); q.push(j); }
    }
  }
  const start = game.S!.pos[0] * W + game.S!.pos[1], seen = new Set([start]), walk = [start];
  for (let k = 0; k < walk.length; k++) {
    const i = walk[k], ir = (i / W) | 0, ic = i % W;
    for (const [dr, dc] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
      const rr = ir + dr, cc = ic + dc, j = rr * W + cc;
      if (rr < 0 || cc < 0 || rr >= H || cc >= W) continue;
      if (body.has(j)) return [rr, cc];
      if (!seen.has(j) && WALKABLE.has(world.at(rr, cc))) { seen.add(j); walk.push(j); }
    }
  }
  return null;
}

// with no walking to targets (Move off, or Hold to target and not held), every click swings what you hold, even at nothing: if the
// click did not become a hit (a far target, the sky, open ground), the arm swings anyway (only the animation; no step is sent)
// steering (a finger on the pad, or a move key held): a click on the view is a hit, never a target to walk to or follow
export let maneuver = false;
export function chooseAction(): Act | null | undefined {
  const h = hangTick();
  if (h) return h;
  const clicked = game.clickQueued;
  if (clicked) maneuver = padTouch !== null || !!moveAction();
  if (clicked && opt.orient && !maneuver && !(opt.move && (!holdOn() || pointerState.holding)) && flat.t === 0) orientTo(aim());   // (not while steering: the view is yours)   // Orient on click: face it
  const a = chooseAct();
  if (clicked && !a && !(opt.move && (!holdOn() || pointerState.holding) && !maneuver) && performance.now() - hangState.swingT > 150) { hangState.swingT = performance.now(); sound.swing(HOTBAR[game.hud.sel].tool === "hand"); }
  return a;
}
// Orient on click (Settings; less than Move): a click turns you to face what it was on, so Space and Use then act toward it. First
// person only (overhead, Craftax's own facing is the way you last moved)
export function orientTo(hit: AimHit | null) {
  if (!hit || !game.S) return;
  const e = hit.mob && mobs.get(hit.key!);
  const tx = e ? e.model.position.x : hit.c + 0.5, tz = e ? e.model.position.z : hit.r + 0.5;
  const dx = tx - (game.S.pos[1] + 0.5), dz = tz - (game.S.pos[0] + 0.5);
  if (Math.hypot(dx, dz) < 0.3) return;
  const want = Math.atan2(-dx, -dz), base = pointerState.yawGoal ?? game.yaw;
  pointerState.yawGoal = base + Math.atan2(Math.sin(want - base), Math.cos(want - base));
}
