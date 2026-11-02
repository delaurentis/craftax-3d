// One Craftax action from the input (chooseAct), the tool picked for it, and sending it.
import { CLIMB, OPEN, STATION, USE, WALK, WALKABLE, maneuver, nearestShore, pathing, reach } from "./pathing";
import { ITEM, B, isSolid } from "../../js/world";
import { HOTBAR, SLOT_KEYS } from "../../js/hud";
import { REPLAY } from "../../js/local";
import { net } from "../../js/net";
import { A, DIRV, sound } from "../core/shared";
import { world } from "../render/arm";
import { hangLetGo, hangStart, hangState } from "../effects/hang";
import { X_BLOCKS, X_SLOTS, api, flat, game, keys, mobs, oneShot, xHold } from "../core/game";
import { apply } from "../core/apply";
import { aim } from "./aim";
import { dirTo, drinkable, lookDir, moveAction, placeTarget, seaClicked, targets, waterDir } from "./targets";
import { actable, beyondReach, boxMode, diagTo, mobOn } from "../render/targeting";
import { flash, hints, isSealed, sealed, shakeSlot } from "../ui/hud/hint";
import { playing } from "../ui/screens/screen";
import { opt } from "../ui/screens/options";
import { drinkHold, holdOn, pointerState } from "./pointer";
import { ghost } from "../effects/god";
import { openPanel } from "../ui/screens/panel";
import { mow, shieldRepel } from "../effects/hits";
import type { OneShot } from "../core/game";
import type { Pos } from "../core/types";

/** One action to send (POST /api/step): the action, the way to face first, and up to n steps of it (asleep: 3). */
export interface Act extends OneShot { n?: number }
/** Taking a ladder: up or down, when the climb began, the move to send at the bottom of the fade, sent yet, when the new floor came. */
export interface Climb { up: boolean; t0: number; a: Act; sent: boolean; t1?: number | null }
// this module's state that other modules set (one module can't assign another's let): lastAct, climb
export interface Intent {
  /** The action the state being applied answers. */
  lastAct: Act | null;
  climb: Climb | null;
}
export const intent = {} as Intent;

export function chooseAct(): Act | null | undefined {
  if (game.S!.sleeping || game.S!.resting) return { action: A.NOOP, n: 3 };
  if (oneShot.length) return oneShot.shift();
  if (pointerState.drinkSpam && game.S!.drink >= 7 + 2 * (game.S!.dexterity || 1)) pointerState.drinkSpam = false;   // Spam on a click on water: drink until full
  if ((drinkHold || pointerState.drinkSpam) && !game.clickQueued && !moveAction() && !game.spaceQueued) { const w = waterDir(); if (w) { hangState.swingT = performance.now(); return { action: A.DO, face: w }; } }   // held on water: drink on
  if (moveAction() || game.clickQueued || game.spaceQueued || (game.doQueued && !game.spaceHeld)) { pathing.pending = null; pointerState.drinkSpam = false; targets.saltyGoal = null; }   // a key, a Space press or a new click replaces the walk under way
  // Space held with a move key (Pete: the bot tunnels fast, you should too): whatever stands in the way that direction, a block or a
  // mob, gets hit; once it's clear you step on. Hold Space and W to dig straight ahead
  if (game.spaceHeld && !game.clickQueued) {
    const mv = moveAction();
    if (mv) {
      const r = game.S!.pos[0] + DIRV[mv][0], c = game.S!.pos[1] + DIRV[mv][1], b = world.at(r, c);
      const mob = [...mobs.values()].some((e) => Math.floor(e.to.z) === r && Math.floor(e.to.x) === c);
      game.spaceQueued = false;
      if (mob || drinkable(b) || (isSolid(b) && !USE.has(b))) { hangState.swingT = performance.now(); return { action: A.DO, face: mv }; }   // (water: a drink)
      return { action: mv };
    }
  }
  if (pathing.pending) { const a = reach(pathing.pending.r, pathing.pending.c, pathing.pending.action, pathing.pending.key); if (a || !playing()) return a; }
  const hit = aim();
  // a click on a ladder or its pit (or the hole in the ceiling above a ladder up): walk onto it and climb, whatever is held
  if ((game.clickQueued || (game.doQueued && !game.spaceHeld)) && hit && !hit.mob) {
    const it = game.S!.items[hit.r * game.S!.size[1] + hit.c];
    if (it === ITEM.LADDER_DOWN || it === ITEM.LADDER_UP || it === ITEM.LADDER_DOWN_BLOCKED) {
      game.clickQueued = game.doQueued = game.doHeld = false;
      if (isSealed(game.S!, it)) { hints.sealGlowT = performance.now(); hints.sealGlowAt = hit.r * game.S!.size[1] + hit.c; }   // (sealed: its glow at the click, the pop-up once you're on it)
      return reach(hit.r, hit.c, CLIMB);
    }
  }
  if ((game.spaceQueued || (game.spaceHeld && game.doHeld)) && !game.clickQueued) {          // Space: act on the tile in front of you (3D: the way you look; 2D: the way you last moved)
    const press = game.spaceQueued;                                             // a fresh press (not Space held down repeating)
    game.spaceQueued = false;
    // standing on a ladder: Space climbs it (Pete; Q still does), a fresh press only, so holding Space doesn't ride on down floors
    const under = game.S!.items[game.S!.pos[0] * game.S!.size[1] + game.S!.pos[1]];
    if (press && isSealed(game.S!, under)) { sealed(); return null; }
    if (press && (under === ITEM.LADDER_DOWN || under === ITEM.LADDER_UP)) return { action: under === ITEM.LADDER_UP ? A.ASCEND : A.DESCEND };
    const d = lookDir(), r = game.S!.pos[0] + DIRV[d][0], c = game.S!.pos[1] + DIRV[d][1];
    // first person, a fresh press with a tool or the hand out (Pete): the crosshair on a mob, tree or rock within 1st person reach (not the
    // tile in front) walks you up in front of it and hits it, as a click does (reach; Move to target on click off: it doesn't)
    const tip = press && !game.third && !flat.on && flat.t === 0 && !HOTBAR[game.hud.sel].place && !HOTBAR[game.hud.sel].shoot ? aim(true) : null;
    if (tip && !(tip.r === r && tip.c === c) && !beyondReach(tip.r, tip.c)
        && (tip.mob || (!tip.floor && isSolid(world.at(tip.r, tip.c)) && !USE.has(world.at(tip.r, tip.c))))) {
      const a = reach(tip.r, tip.c, A.DO, tip.mob ? tip.key : undefined);
      if (a) return a;
    }
    if (USE.has(world.at(r, c))) { openPanel({ r, c }); return null; }  // a table or furnace: use it, never break it
    const mob = [...mobs.values()].some((e) => Math.floor(e.to.z) === r && Math.floor(e.to.x) === c);
    // an item in hand (Pete): Space uses it on the tile in front: the bow and spells shoot that way, a block or item is placed there,
    // unless rock, ore or a mob stands there (then it's a hit, with the right tool: send's autoTool)
    // a hotbar number key held down (Pete: hold 4 and Space): that slot is the item, whatever the tool just switched to; after a hit
    // with the pickaxe the slot comes back, so the next Space places again
    const slot = SLOT_KEYS.findIndex((k) => keys.has(k === "-" ? "Minus" : "Digit" + k));
    if (slot >= 0 && slot < HOTBAR.length && game.hud.sel !== slot && !(mob || MINED.has(world.at(r, c)))) game.hud.select(slot, true);
    const held = slot >= 0 && slot < HOTBAR.length ? HOTBAR[slot] : HOTBAR[game.hud.sel];
    // Space or Use held down with a block: it places, but only a fresh press breaks rock in front (else it would break the block it
    // just placed, then place it again, back and forth: Pete, on the touch Use button); a block key held: not a mob either
    if (held.place && !press && (MINED.has(world.at(r, c)) || (slot >= 0 && mob))) return null;
    if (held.place && isTouch() && MINED.has(world.at(r, c))) { if (press) flash("Pick the pickaxe to dig"); return null; }   // a touch screen: no switching to the pickaxe, ever (Pete: pick it yourself)
    if (world.at(r, c) === B.RIPE_PLANT && !mob) { hangState.swingT = performance.now(); return { action: A.DO, face: d }; }   // ripe: eat it, whatever is held
    if (!held.hand && (held.shoot || (held.place && !mob && !MINED.has(world.at(r, c))))) {
      const why = held.need(game.S!);
      if (why) { flash(why); return null; }
      hangState.swingT = performance.now();
      return { action: held.action!, face: d };
    }
    const w = !mob && WALKABLE.has(world.at(r, c)) ? waterDir() : 0;        // nothing in front but water beside you: drink
    hangState.swingT = performance.now();
    return { action: A.DO, face: w || d };
  }
  // a click on a tree always fells it, and a click on water drinks (from the nearest shore of that water): the hand comes out and
  // the click becomes a hit. Except what can go into water: stone fills it (Craftax places stone on water, nothing else), and the
  // bow and spells shoot toward the click
  const onWater = hit && world.at(hit.r, hit.c) === B.WATER, held = HOTBAR[game.hud.sel];
  // a block or item in hand and the click lands on rock, ore or a mob (Pete): out comes the right tool (pickaxe, sword) and it's a
  // hit, not a placing; the bow and spells still shoot
  if (game.clickQueued && hit && held.place && (hit.mob || (MINED.has(world.at(hit.r, hit.c)) && !isTouch()))) {
    toolFor(hit.r, hit.c, !!hit.mob);
    game.clickQueued = false; game.doQueued = true;
  }
  // (a ripe plant too, Pete: whatever is held, a sapling just planted most likely, a click on it picks the berries and eats them)
  if (game.clickQueued && hit && !hit.mob && (world.at(hit.r, hit.c) === B.TREE || world.at(hit.r, hit.c) === B.FIRE_TREE
      || world.at(hit.r, hit.c) === B.RIPE_PLANT || (onWater && !held.place && !held.shoot))) {
    const i = HOTBAR.findIndex((h) => h.tool === "hand");
    if (i >= 0 && i !== game.hud.sel) game.hud.select(i, true);
    game.clickQueued = false; game.doQueued = true;
  }
  // Shift+click on a table or furnace breaks it (Craftax gives nothing back): walk up beside it with the hand out and hit it once
  if (game.clickQueued && game.shiftClick && hit && !hit.mob && STATION.has(world.at(hit.r, hit.c))) {
    const i = HOTBAR.findIndex((h) => h.tool === "hand");
    if (i >= 0 && i !== game.hud.sel) game.hud.select(i, true);
    game.clickQueued = game.shiftClick = false; game.doQueued = game.doHeld = false;
    return reach(hit.r, hit.c, A.DO) || null;
  }
  // a plain click on a table or furnace uses it: whatever is held, the hand comes out (never built against); a right click too,
  // the same as the left (Pete): nothing is placed against a station
  if (game.clickQueued && hit && !hit.mob && USE.has(world.at(hit.r, hit.c))) {
    const i = HOTBAR.findIndex((h) => h.tool === "hand");
    if (i >= 0 && i !== game.hud.sel) game.hud.select(i, true);
    game.clickQueued = game.rightClick = false; game.doQueued = game.doHeld = false;
    const a = reach(hit.r, hit.c, OPEN);
    return a || null;
  }
  // a right click (Pete): places the block in hand, or else stone, or else a crafting table, where the click is (or ahead of you)
  if (game.clickQueued && game.rightClick) {
    game.clickQueued = game.rightClick = false; game.doQueued = game.doHeld = false;
    const cur = HOTBAR[game.hud.sel], h = cur.place ? cur : game.S!.inventory.stone > 0 ? HOTBAR[X_SLOTS[7]] : HOTBAR[X_SLOTS[8]], why = h.need(game.S!);
    if (why && /^Need /.test(why)) { flash(cur.place || game.S!.inventory.stone > 0 || game.S!.inventory.wood > 1 ? why : "Nothing to place: no stone, nor wood for a table"); return null; }
    const t = placeTarget(hit) || ((): Pos | null => { const d = DIRV[lookDir()]; return d ? [game.S!.pos[0] + d[0], game.S!.pos[1] + d[1]] : null; })();
    if (!t || mobOn(t[0], t[1])) { flash(t ? "Can't place on a creature" : "Click a spot to place it"); return null; }
    return reach(t[0], t[1], h.action!);
  }
  if (game.clickQueued && !HOTBAR[game.hud.sel].hand) {                             // an item is selected: the click places / shoots / casts it, never breaks
    game.clickQueued = false; game.doQueued = game.doHeld = false;
    const h = HOTBAR[game.hud.sel], why = h.need(game.S!);
    if (why) { flash(why); return null; }
    if (h.shoot) {                                                         // toward where you clicked
      const dr = hit ? hit.r - game.S!.pos[0] : 0, dc = hit ? hit.c - game.S!.pos[1] : 0;
      const face = !dr && !dc ? lookDir() : Math.abs(dc) > Math.abs(dr) ? (dc > 0 ? 2 : 1) : dr > 0 ? 4 : 3;
      hangState.swingT = performance.now();
      return { action: h.action!, face };
    }
    const t = placeTarget(hit);
    if (!t) { flash(hit && hit.mob ? "Can't place on a creature" : "Click a spot to place it"); return null; }
    return reach(t[0], t[1], h.action!);
  }
  game.clickQueued = false;
  if ((game.doQueued || game.doHeld) && hit && !hit.mob && USE.has(world.at(hit.r, hit.c))) {   // a table or furnace: use it, never break it
    const fresh = game.doQueued;
    game.doQueued = game.doHeld = false;
    if (fresh) { const a = reach(hit.r, hit.c, OPEN); if (a) return a; }
  }
  if (game.doQueued || game.doHeld) {
    const fresh = game.doQueued;
    game.doQueued = false;
    if (fresh && hangState.hang && !(hit && !hit.mob && world.at(hit.r, hit.c) === B.LAVA)) { hangLetGo(); return null; }   // hanging: a click elsewhere pulls you back
    if (fresh && hit && !hit.mob && !HOTBAR[game.hud.sel].place && drinkable(world.at(hit.r, hit.c)) && opt.spam && (!holdOn() || pointerState.holding) && !maneuver) pointerState.drinkSpam = true;
    // first person (Pete): a click never walks you to a bare spot (open ground, lava's edge, the sea), only up to something to act
    // on: a block, tree, table, creature, water
    const fp1 = !game.third && !flat.on && flat.t === 0;
    // first person, the click not on anything it can act on (the sky, far ground): if the target box is showing what's ahead of you
    // (targetBox's fallback, as Space would hit it), the click hits that, so what's lit is what's hit (Pete)
    if (fresh && fp1 && !game.spaceHeld && boxMode !== "off") {
      const okHit = hit && (hit.mob || (!hit.floor && actable(world.at(hit.r, hit.c)))) && (opt.move ? !beyondReach(hit.r, hit.c) : dirTo(hit.r, hit.c));
      if (!okHit && !(hit && hit.floor && dirTo(hit.r, hit.c))) {
        const d0 = lookDir(), fr = game.S!.pos[0] + DIRV[d0][0], fc = game.S!.pos[1] + DIRV[d0][1], m = mobOn(fr, fc);
        if (m || actable(world.at(fr, fc))) {
          if (USE.has(world.at(fr, fc)) && !m) { const a = reach(fr, fc, OPEN); if (a) return a; return null; }   // (a table: open it, as a click on it does)
          toolFor(fr, fc, !!m); hangState.swingT = performance.now(); return { action: A.DO, face: d0 };
        }
      }
    }
    if (fresh && !hit && !game.spaceHeld && !fp1) { const sea = seaClicked(); if (sea) return sea.walk || null; }
    if (fresh && hit && hit.mob) { toolFor(hit.r, hit.c, true); const a = reach(hit.r, hit.c, A.DO, hit.key); if (a) return a; }   // walk up to it and hit it till it drops
    if (fresh && !game.spaceHeld && hit && !hit.mob && world.at(hit.r, hit.c) === B.LAVA && (!fp1 || dirTo(hit.r, hit.c))) {   // lava: to its edge first; a second click there goes in (Pete)
      game.doHeld = false;
      const d = dirTo(hit.r, hit.c);
      if (d && hangState.hang) { hangState.hang = null; return { action: d }; }               // hanging, a click on the lava: in
      if (d) return hangStart(d);
      return reach(hit.r, hit.c, WALK);                                    // (lava isn't walkable: the walk ends at the nearest edge)
    }
    if (fresh && !game.spaceHeld && hit && hit.floor && WALKABLE.has(world.at(hit.r, hit.c))) {   // open ground: walk there (first person: no)
      game.doHeld = false;
      // first person: no walk, just the swing, as at the sky; but grass right in front is hit, as Craftax hits it (a sapling now and
      // then, Pete: the walk rule had stopped that)
      const dg = world.at(hit.r, hit.c) === B.GRASS && dirTo(hit.r, hit.c);
      if (fp1 && dg) { hangState.swingT = performance.now(); return { action: A.DO, face: dg }; }
      // a diagonal tile (Pete): a step to the side so it's in front, then place what's in hand there, or hit it
      if (fp1 && diagTo(hit.r, hit.c)) { const held = HOTBAR[game.hud.sel]; return reach(hit.r, hit.c, held.place && !held.need?.(game.S!) ? held.action! : A.DO); }
      if (fp1) { hangState.swingT = performance.now(); sound.swing(HOTBAR[game.hud.sel].tool === "hand"); return null; }
      return reach(hit.r, hit.c, WALK);
    }
    // water anywhere in a lake or river: drink from the nearest edge of that same body of water (the shortest walk to its shore)
    if (fresh && hit && !hit.mob && world.at(hit.r, hit.c) === B.WATER && !dirTo(hit.r, hit.c)) {
      const t = nearestShore(hit.r, hit.c);
      if (t) { const d0 = dirTo(t[0], t[1]); if (d0) { hangState.swingT = performance.now(); return { action: A.DO, face: d0 }; } const a = reach(t[0], t[1], A.DO); if (a) return a; }
    }
    let d = hit && dirTo(hit.r, hit.c);
    if (game.spaceHeld && !(hit && hit.mob) && (!d || hit!.floor)) d = waterDir() || d;   // (a mob aimed at, even one in the water: hit it, Pete)                  // Space drinks from water next to you unless a block or mob is aimed at
    if (d && fresh && pointerState.holding && hit && !game.spaceHeld) { const a = reach(hit.r, hit.c, A.DO); if (a) return a; }   // held: it stays the target
    if (d) { hangState.swingT = performance.now(); return { action: A.DO, face: d }; }
    if (fresh && hit && (!hit.floor || world.at(hit.r, hit.c) === B.WATER)) {  // a tree, rock, mob or water a few tiles off
      toolFor(hit.r, hit.c, !!hit.mob);
      const a = reach(hit.r, hit.c, A.DO);
      if (a) return a;
    }
  }
  const mv = moveAction();
  // X held with a move key (a bridge, xDown): never a step into the water or lava ahead, nor into the stone going down over it; the
  // step comes once it's floor
  if (xHold && mv && DIRV[mv]) { const b = world.at(game.S!.pos[0] + DIRV[mv][0], game.S!.pos[1] + DIRV[mv][1]); if (b === B.WATER || b === B.LAVA || X_BLOCKS.has(b)) return null; }
  // Attack on bump (Settings, keyboard; Pete): a move key into a tree, rock or mob with a tool in hand (no block to place) hits it,
  // as the touch arrows do; once it's gone you step on
  // a block in hand, walking into something to act on (a mob, a tree, rock, water) with the arrows that would act (Attack on bump, or
  // the touch arrows' act-ahead): nothing happens, so the slot in hand shakes to say why (Pete)
  // a block or torch in hand, bumping into a creature (not a block) with Attack on bump: out comes the sword (the hand without one)
  // and it's hit, as Space at it would (Pete); a rock or tree still just shakes the slot
  if (mv && opt.bump && !isTouch() && HOTBAR[game.hud.sel].place && DIRV[mv]) {
    const r = game.S!.pos[0] + DIRV[mv][0], c = game.S!.pos[1] + DIRV[mv][1];
    if ([...mobs.values()].some((e) => Math.floor(e.to.z) === r && Math.floor(e.to.x) === c)) {
      const i = HOTBAR.findIndex((h) => h.tool === (game.S!.inventory.sword > 0 ? "sword" : "hand"));
      if (i >= 0) game.hud.select(i);
      hangState.swingT = performance.now(); return { action: A.DO, face: mv };
    }
  }
  if (mv && HOTBAR[game.hud.sel].place && DIRV[mv]) {                           // (any setting, Pete: whatever blocks the step, a table too)
    const r = game.S!.pos[0] + DIRV[mv][0], c = game.S!.pos[1] + DIRV[mv][1], b = world.at(r, c);
    if ([...mobs.values()].some((e) => Math.floor(e.to.z) === r && Math.floor(e.to.x) === c) || !WALKABLE.has(b)) shakeSlot();
  }
  if (mv && opt.bump && !isTouch() && !HOTBAR[game.hud.sel].place && DIRV[mv]) {
    const r = game.S!.pos[0] + DIRV[mv][0], c = game.S!.pos[1] + DIRV[mv][1], b = world.at(r, c);
    const mob = [...mobs.values()].some((e) => Math.floor(e.to.z) === r && Math.floor(e.to.x) === c);
    if (mob || drinkable(b) || (isSolid(b) && !USE.has(b) && b !== B.PLANT)) { hangState.swingT = performance.now(); return { action: A.DO, face: mv }; }   // (water: a drink, as Space would; a growing plant: not trampled)
  }
  if (!mv) hangState.lavaHeld = false;
  if (hangState.hang && mv) {                                                        // hanging: a fresh press decides
    if (hangState.lavaHeld) return null;
    hangState.lavaHeld = true;
    if (mv === hangState.hang.d) { hangState.hang = null; return { action: mv }; }            // toward the lava: in
    hangLetGo(); return null;                                              // any other way: pulled back (the next press walks)
  }
  if (mv && DIRV[mv] && world.at(game.S!.pos[0] + DIRV[mv][0], game.S!.pos[1] + DIRV[mv][1]) === B.LAVA) {   // a step into lava: you hang there
    if (hangState.lavaHeld) return null;                                             // (held: one try a press)
    hangState.lavaHeld = true;
    return hangStart(mv);
  }
  if (mv) return { action: mv };
  // idle: a NOOP every idleMs; while a fireball, iceball or arrow is in flight, at the moving pace (Pete: a shot crept a tile a second
  // while you stood and watched, as Craftax moves it one tile a step)
  const flying = game.S && (game.S.mob_projectiles.length || game.S.player_projectiles.length);
  return game.idleMs < 0 || performance.now() - game.lastSend < (flying ? game.tickMs : Math.max(game.idleMs, game.tickMs)) ? null : { action: A.NOOP };
}

// a hit with the Hand, Pickaxe or Sword slot selected picks the slot for its target: the pickaxe for stone and ores, the sword for a
// mob, the hand for the rest (only tools you own; an item slot is never changed). It is what you see; Craftax uses your best tools anyway.
export const TREE_B = new Set([B.TREE, B.FIRE_TREE]);                             // a tree lights up whole: trunk and the crown above it
export const isTouch = () => document.body.classList.contains("touch");            // a touch screen: a block in hand stays in hand (no pickaxe)
export const MINED = new Set([B.STONE, B.COAL, B.IRON, B.DIAMOND, B.SAPPHIRE, B.RUBY, B.STALAGMITE]);
export function autoTool(d: number) {
  if (!game.S || !DIRV[d]) return;
  toolFor(game.S.pos[0] + DIRV[d][0], game.S.pos[1] + DIRV[d][1]);
}
// the same choice for the tile (r, c), made as soon as a click sets it as the goal, so the right tool is out for the whole walk there
export function toolFor(r: number, c: number, mob = [...mobs.values()].some((e) => Math.floor(e.to.z) === r && Math.floor(e.to.x) === c)) {
  if (!game.S || !(HOTBAR[game.hud.sel].hand || (HOTBAR[game.hud.sel].place && !isTouch()))) return;   // a tool, or a block (Space on rock with stone in hand: the pickaxe); never the bow or a spell, nor a block on a touch screen (Pete: a tap that placed stone then broke it)
  if (!mob && WALKABLE.has(world.at(r, c))) return;                       // plain ground: nothing to hit, keep what you hold
  let want = mob || [B.NECROMANCER, B.NECROMANCER_VULNERABLE].includes(world.at(r, c)) ? "sword" : MINED.has(world.at(r, c)) ? "pickaxe" : "hand";   // (the Necromancer is fought: the sword, Pete)
  if (want !== "hand" && !(game.S.inventory[want as "sword" | "pickaxe"] > 0)) want = "hand";
  const i = HOTBAR.findIndex((h) => h.tool === want);
  if (i >= 0 && i !== game.hud.sel) game.hud.select(i, true);
}
intent.lastAct = null;                                                         // the action the state being applied answers
// taking a ladder: a short climb plays first (the world holds still: no step is sent meanwhile), the move is sent at the bottom of a
// fade to black, and the new floor fades in with you finishing the climb. climb: {up, t0, a, sent}
export const CLIMB_MS = 900, ARRIVE_MS = 600;
intent.climb = null;
export async function send(a: Act) {
  if (ghost) return;                                                         // a ghost touches nothing: no steps, no hits (the world waits)
  if (!net.driving(game.S)) { if (REPLAY) return; flash(game.S && game.S.world && game.S.world.you ? "The bot is playing: press P to take over" : "You're watching this world"); return; }
  if ((a.action === A.ASCEND || a.action === A.DESCEND) && !intent.climb && net.local) {
    intent.climb = { up: a.action === A.ASCEND, t0: performance.now(), a, sent: false };
    // face the ladder (Pete: not side-on to it): its rungs face north (a pit's ladder is on its north wall), so turn to look north
    if (!flat.on) { const base = pointerState.yawGoal ?? game.yaw; pointerState.yawGoal = base + Math.atan2(Math.sin(0 - base), Math.cos(0 - base)); }
    return;
  }
  game.inflight = true;
  intent.lastAct = a;
  if (a.action === A.DO) { autoTool(a.face || game.S!.dir); sound.swing(HOTBAR[game.hud.sel].tool === "hand"); if (game.player) game.player.userData.attackT = performance.now() / 1000; }
  if (a.action === A.DO) shieldRepel(a.face || game.S!.dir);
  if (a.action === A.DO) { const f = DIRV[a.face || game.S!.dir]; if (f && world.at(game.S!.pos[0] + f[0], game.S!.pos[1] + f[1]) === B.GRASS) mow(game.S!.pos[0] + f[0], game.S!.pos[1] + f[1]); }
  game.lastSend = performance.now();
  try { apply(await api("/api/step", a)); }
  catch (e) { flash("Server error: " + (e as Error).message); }
  finally { game.inflight = false; }
}
