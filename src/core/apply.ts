// apply(s): a new state from the engine against the old one, and everything that follows from the difference.
import { buildAt, buildGap, chestOpen, chestState, flushWorld, needWarn, tileCenter } from "../effects/chest";
import { ITEM, B } from "../../js/world";
import { makeMob, makeProjectile } from "../../js/models";
import { HOTBAR, invAt } from "../../js/hud";
import { local, REPLAY } from "../../js/local";
import * as tele from "../../js/telemetry";
import { pixelText } from "../../js/pixeltitle";
import { net, renderBot } from "../../js/net";
import { $, A, DIRV, sound } from "./shared";
import { memoryUpdate } from "../views/memory";
import { botFast } from "../render/quality";
import { bones, bursts, dying, felling, setTool, world } from "../render/arm";
import { hangState } from "../effects/hang";
import { game, mobs, shots, view } from "./game";
import { PORTAL_CUT, enterPortal, openPortal, portalDist, portalT, portalTiles, startVictory, victory } from "../effects/victory";
import { MELT_MS, damageCause, deathNote, deathState, dieMs, lavaDeath, leanable, mobOnTile } from "../effects/death";
import { playerPos, syncEntities } from "../render/entities";
import { lookDead, shockwave } from "../looks/looks";
import { falls2D, refresh2D, syncLooks } from "../views/views";
import { targets, tooSalty } from "../input/targets";
import { pathing } from "../input/pathing";
import { MINED, intent } from "../input/intent";
import { flash, hint, hints } from "../ui/hud/hint";
import { botDriving, screens, show, unlockPointer } from "../ui/screens/screen";
import { fmtSeed } from "../ui/screens/worlds";
import { layout } from "../ui/hud/layout";
import { godState } from "../effects/god";
import { hitReel, hitState, shieldRepel } from "../effects/hits";
import type { GameState, Mob } from "./types";
import { themedSide } from "../themes/blocks";
import { themedText } from "../themes/names";
import { surpriseWorld } from "../themes/ui";

export function apply(s: GameState) {
  const prev = game.S;
  game.S = s;
  const levelChanged = !prev || prev.level !== s.level || prev.seed !== s.seed;
  if (!REPLAY && (!prev || prev.seed !== s.seed)) surpriseWorld(s.seed);    // a world starting: Surprise me's theme for it (a replay keeps its own)
  if (!prev && s.god) flash("God mode: the best of everything, and nothing can hurt you (L warps)");
  if (prev && prev.seed === s.seed && s.level > prev.level) sound.levelUp();   // down a floor (Pete chose the refined fanfare)
  memoryUpdate(prev, s);
  needWarn(prev, s);
  if (levelChanged || s.done) { felling.clear(); dying.clear(); bursts.clear(); bones.clear(); pathing.pending = null; if (game.hud) game.hud.pend = {}; }   // (nothing left in flight)   // a walk never outlives its floor
  if (levelChanged) world.resetGreen();                                     // (green torches belong to the floor the portal opened on)
  else {
    for (let i = 0; i < s.map.length; i++) {
      const b = prev.map[i];
      if (s.map[i] === b) continue;
      const r = (i / s.size[1]) | 0, c = i % s.size[1], std = b === B.STALAGMITE ? "stone" : world.blockTex(b);   // a stalagmite is stone too
      const tex = std && themedSide(prev.map, s.size[1], s.size[0], prev.level, r, c, std, world.height(r, c) || 1, b === B.STONE && !prev.level && world.placed.has(i));   // (as a theme drew it)
      if (b === B.CHEST) {                                                  // a chest opened: the lid, the light, the loot
        chestOpen(r, c);
        setTimeout(() => { if (!game.S!.done && game.S!.seed === s.seed && game.S!.timestep >= s.timestep) game.hud.loot(prev.inventory, s.inventory, botFast()); }, 800);   // (not into a world restarted since)   // once the lid is up (not over a gravestone)
      } else if (b === B.TREE || b === B.FIRE_TREE) {                              // a tree that became grass was just chopped: it falls
        felling.start(b, r, c, s.pos, world.lightAt(r, c), performance.now()); game.hud.hold("wood");
        if (b === B.TREE) falls2D.push({ r, c, t0: performance.now(), dir: c >= s.pos[1] ? 1 : -1 });   // the 2D view: it falls away from you
        // its achievement (Pete): toast and bell wait for the fall to be heard and the wood to reach the hotbar (hud.ts update)
        game.hud.achWait = "wood"; game.hud.achWaitUntil = performance.now() + 4000; game.hud.achHoldUntil = performance.now() + 1500;
        sound.chop(c + 0.5, r + 0.5); sound.treeFall(c + 0.5, r + 0.5);
        flash("+1 wood");
      } else if (tex) {                                                     // a rock or ore that became path was mined: it breaks apart
        const got = ({ [B.STONE]: "stone", [B.COAL]: "coal", [B.IRON]: "iron", [B.DIAMOND]: "diamond", [B.SAPPHIRE]: "sapphire", [B.RUBY]: "ruby", [B.STALAGMITE]: "stone" })[b];
        bursts.rock(tex, r, c, b === B.STALAGMITE ? 1.6 : world.height(r, c) || 1, performance.now(), got); if (got) game.hud.hold(got);
        sound.rockBreak(c + 0.5, r + 0.5, got);
        flash("+1 " + ({ [B.STONE]: "stone", [B.COAL]: "coal", [B.IRON]: "iron", [B.DIAMOND]: "diamond", [B.SAPPHIRE]: "sapphire", [B.RUBY]: "ruby", [B.STALAGMITE]: "stone" })[b]);
      } else if ([B.STONE, B.TABLE, B.FURNACE, B.PLANT].includes(s.map[i]))                // something placed: it knocks in its material
        sound.place(c + 0.5, r + 0.5, s.map[i] === B.TABLE ? "table" : s.map[i] === B.PLANT ? "plant" : "stone");
    }
    // a sapling found in the grass (Pete: something to see): it pops up out of the tile just hit and flies to its slot, with a pluck
    if ((s.inventory.sapling || 0) > (prev.inventory.sapling || 0) && hitState.lastMow && performance.now() - hitState.lastMow.t < 3000) {
      const { r, c } = hitState.lastMow; hitState.lastMow = null;
      bursts.sapling(r, c, performance.now()); game.hud.hold("sapling");
      sound.saplingFound(c + 0.5, r + 0.5); flash("+1 sapling");
    }
    for (let i = 0; i < s.items.length; i++) if (s.items[i] === ITEM.TORCH && prev.items[i] !== ITEM.TORCH) sound.place(i % s.size[1] + 0.5, ((i / s.size[1]) | 0) + 0.5, "torch");
    // something crafted (the inventory grows a tier, armour, arrows or torches): a craft by what it is made of (Pete)
    {
      const I = s.inventory, P = prev.inventory, sum = (a: number[] | undefined) => (a || []).reduce((x, y) => x + y, 0);
      const tier = Math.max(I.pickaxe > (P.pickaxe || 0) ? I.pickaxe : 0, I.sword > (P.sword || 0) ? I.sword : 0);
      const armour = sum(I.armour) > sum(P.armour), made = ((I.arrows || 0) > (P.arrows || 0) || (I.torches || 0) > (P.torches || 0)) && (I.wood || 0) < (P.wood || 0);   // made, not found in a chest
      if ((tier || armour || made) && performance.now() - layout.panelCraftT > 3000) sound.craft(tier >= 3 || armour ? "iron" : tier === 2 ? "stone" : "wood");   // the bot's crafts; yours sound with their payoff
    }
    // the Necromancer hit (his boss progress up, Pete): he rumbles, the whole screen quakes, and an evil roar echoes
    if ((s.boss_progress || 0) > (prev.boss_progress || 0)) {
      hitState.bossHitT = performance.now();
      const n = world.props.children.find((m) => /^necromancer/.test(m.userData.kind || ""));
      sound.necroRoar?.(n ? n.position.x : s.pos[1] + 0.5, n ? n.position.z : s.pos[0] + 0.5);
      if (n) shockwave(n.position.clone().setY(1), 1.6, n);                  // (phosphor: his outline bursts outward, the glow there)
    }
    // (not a world started again, Pete: coming back to life refills the food bar, and that chewed)
    if (s.food > prev.food && !prev.done && s.timestep >= prev.timestep) {   // with the food bar going up: a plant if one was just picked
      sound.eat(prev.map.some((b, i) => b === B.RIPE_PLANT && s.map[i] !== B.RIPE_PLANT));   // (full already: no rise, no chewing, Pete)
      flash(`+${s.food - prev.food} food`);                                  // what you actually gained (a cow at a full bar: nothing to say)
    }
    if (targets.saltyGoal && s.pos[0] === targets.saltyGoal[0] && s.pos[1] === targets.saltyGoal[1]) { targets.saltyGoal = null; tooSalty(); }   // reached the shore
    if (s.pos[0] !== prev.pos[0] || s.pos[1] !== prev.pos[1]) {           // a footstep on what you stepped onto
      const g = s.map[s.pos[0] * s.size[1] + s.pos[1]];
      sound.step(g === B.SAND ? "sand" : g === B.GRASS || g === B.FIRE_GRASS || g === B.ICE_GRASS ? "grass" : world.floorAt(s.pos[0], s.pos[1]) === 3 ? "dirt" : "stone");   // (dirt: its own, Pete)
    }
    // the bot's own hits: it takes out the tool for what it faced (the pickaxe for rock and ore, the sword for a mob, else the hand),
    // swings it, and you hear it, as your own clicks do (send); judged on the state before the hit, while the block is still there
    // (in the browser the bot announces a hit a beat before it lands, reply.pending, so the swing comes first; a server's bot doesn't,
    // so there it swings as the result arrives)
    const br = s.world && (s.world.control === "bot" || s.world.control === "replay") && s.world.bot_reply, pbr = prev.world && prev.world.bot_reply;   // (a replay: your own hits, the same way)
    const hitNow = br && br.action === "DO" && (br.pending ? !(pbr && pbr.pending) : br.pending === undefined && s.timestep !== prev.timestep);
    if (hitNow && DIRV[s.dir]) {
      const r = prev.pos[0] + DIRV[s.dir][0], c = prev.pos[1] + DIRV[s.dir][1];
      const mob = [...mobs.values()].some((e) => Math.floor(e.to.z) === r && Math.floor(e.to.x) === c);
      let want = mob || [B.NECROMANCER, B.NECROMANCER_VULNERABLE].includes(prev.map[r * prev.size[1] + c]) ? "sword" : MINED.has(prev.map[r * prev.size[1] + c]) ? "pickaxe" : "hand";   // (the Necromancer: the sword, Pete)
      if (want !== "hand" && !((invAt(s.inventory, want) ?? 0) > 0)) want = "hand";
      const i = HOTBAR.findIndex((h) => h.tool === want);
      if (i >= 0 && i !== game.hud.sel) game.hud.select(i, true);
      sound.swing(HOTBAR[game.hud.sel].tool === "hand"); hangState.swingT = performance.now();                             // the first-person tool swings too
      if (game.player) game.player.userData.attackT = performance.now() / 1000;
      shieldRepel(s.dir);                                                   // a blow at his shield: the flare, the thrum, the stagger, as yours
    }
    // a DO facing water (or a fountain) was a drink: a splash and a blue flash. The bot's too (Pete): its drinks show as the water
    // meter rising while it faces water
    const drinkFace = !botDriving() && intent.lastAct && intent.lastAct.action === A.DO && intent.lastAct.face ? intent.lastAct.face : s.drink > prev.drink && DIRV[s.dir] ? s.dir : 0;   // (driving, your last act is stale)
    // a DO at the sea beyond the overworld's edge (a click or Space, facing off the map): TOO SALTY!, not a drink (Pete)
    const doFace = !botDriving() && intent.lastAct && intent.lastAct.action === A.DO ? intent.lastAct.face || s.dir : 0;
    if (doFace && !s.level && DIRV[doFace]) {
      const r = s.pos[0] + DIRV[doFace][0], c = s.pos[1] + DIRV[doFace][1];
      if (r < 0 || c < 0 || r >= s.size[0] || c >= s.size[1]) {             // a splash in the sea as you dip in (Pete: that, not a drink's gulp)
        bursts.splash(r, c, performance.now(), -0.1);
        sound.splash?.(c + 0.5, r + 0.5);                                     // (a real splash, sound.ts: the old burst rang like metal, Pete)
        tooSalty(true);
      }
    }
    if (drinkFace) {
      const r = s.pos[0] + DIRV[drinkFace][0], c = s.pos[1] + DIRV[drinkFace][1];
      const off = r < 0 || c < 0 || r >= s.size[0] || c >= s.size[1];      // (off the map: the index would wrap onto the next row's tile)
      const tile = off ? -1 : s.map[r * s.size[1] + c];
      if (tile === B.WATER || tile === B.FOUNTAIN) {                      // a fountain too: the same drink, from its basin
        bursts.splash(r, c, performance.now(), tile === B.FOUNTAIN ? 0.44 : -0.1);
        sound.drink(c + 0.5, r + 0.5, tile === B.FOUNTAIN);
        $("drink")!.style.opacity = "1"; setTimeout(() => ($("drink")!.style.opacity = "0"), 220);
        if (s.drink > prev.drink) flash("+1 water");
      }
    }
  }
  // the bot driving: the world's rebuild (only the chunks near what changed, world.ts; and as long again uploading it in the next
  // frame) at most every 250 ms, or 15 of its own durations on a slow phone, so a tap finds the page free (Pete: buttons hard to
  // press once the bot runs, worse the faster); a new floor rebuilds at once, and a change left over is drawn by the next apply or
  // the timer below
  chestState.worldDirty = true;
  if (levelChanged || !(s.world && s.world.control === "bot") || performance.now() - buildAt >= buildGap()) flushWorld();
  const now = performance.now(), target = tileCenter(s.pos);
  if (levelChanged) { view.from.copy(target); view.to.copy(target); }
  else if (!target.equals(view.to)) { view.from.copy(playerPos(now)); view.to.copy(target); view.t0 = now; view.dur = Math.min(game.pace, 200); }
  // Craftax spawns a creature 9 to 14 tiles off as the crow flies, but keeps one only under 14 counted along the rows and columns:
  // one spawned off on a diagonal is gone the next step (Pete: zombies popping in and out). Its 2D view never showed that far; here
  // such a creature isn't drawn at all (the boss floor keeps its creatures whatever the distance)
  const stays = (m: Mob) => s.level === 8 || Math.abs(m.pos[0] - s.pos[0]) + Math.abs(m.pos[1] - s.pos[1]) < 14;
  syncEntities(mobs, [...s.melee.filter(stays).map((m): [string, Mob] => ["m", m]), ...s.ranged.filter(stays).map((m): [string, Mob] => ["r", m]), ...s.passive.filter(stays).map((m): [string, Mob] => ["p", m])], makeMob, levelChanged, now);
  // your own shots by their type, not the engine's name for them: its table for the player's was short (fireball 2 came out "iceball",
  // an arrow 4 and an iceball 3 as "?"), so a cast fireball flew pale blue (Pete)
  const MINE: Record<number, string | undefined> = { 0: "arrow", 2: "fireball", 3: "iceball", 4: "arrow", 6: "fireball", 7: "iceball" };
  syncEntities(shots, [...s.mob_projectiles.map((m): [string, Mob] => ["x", m]), ...s.player_projectiles.map((m): [string, Mob] => ["y", { ...m, kind: MINE[m.type] || m.kind }])], makeProjectile, levelChanged, now);
  const hurt = s.health < game.prevHealth - 0.01;
  if (hurt) { $("hurt")!.style.opacity = "1"; setTimeout(() => ($("hurt")!.style.opacity = "0"), 250); if (!prev || levelChanged) sound.hurt(); }
  // dead in lava: the hearts drain as you sink (frame, lavaFire), from what you had as you stepped in (Pete), so not all at once here
  if (lavaDeath(s) && (!prev || !prev.done)) { deathState.meltHp = prev ? prev.health : 0; deathState.meltShown = -1; }
  game.prevHealth = s.health;
  if (!(lavaDeath(s) && deathState.deathT && performance.now() - deathState.deathT < MELT_MS) && !(lavaDeath(s) && (!prev || !prev.done))) game.hud.update(s);
  const tk = game.hud.tool + (invAt(s.inventory, game.hud.tool) || 0) + "|" + s.sword_enchant;
  if (tk !== hangState.toolKey) { hangState.toolKey = tk; setTool(game.hud.tool, invAt(s.inventory, game.hud.tool), game.hud.tool === "sword" ? s.sword_enchant : 0); }
  if (hurt && prev && !levelChanged) {                                       // say what did it: shake the need, or blink the weapon
    deathState.lastCause = damageCause(prev, s);
    if (deathState.lastCause.shot) sound.shot(); else sound.hurt();
    // (no shockwave from you when you're hit: Pete didn't like the round ripples; the jolt and the HUD's blink say it)
    if (deathState.lastCause.icon) { game.hud.hit(deathState.lastCause.icon); hitState.shakeT = performance.now(); }   // hit by something: the screen jolts
    if (deathState.lastCause.from) {                                                    // you stagger back from it; a melee attacker is seen to swing
      // a shot pushes you along its flight (it usually ends on your own tile, so "away from it" has no direction), harder, and
      // snaps your head back
      let dz = s.pos[0] - deathState.lastCause.from[0], dx = s.pos[1] - deathState.lastCause.from[1];
      if (deathState.lastCause.shot && deathState.lastCause.dir && (deathState.lastCause.dir[0] || deathState.lastCause.dir[1])) { dz = deathState.lastCause.dir[0]; dx = deathState.lastCause.dir[1]; }
      const n = Math.hypot(dx, dz) || 1;
      hitState.playerStag = { t: performance.now(), dx: dx / n, dz: dz / n, amp: deathState.lastCause.shot ? 0.34 : 0.2, ms: deathState.lastCause.shot ? 340 : 260, kick: !!deathState.lastCause.shot };
      hitReel(dx / n, dz / n, s);
      if (deathState.lastCause.melee) for (const [, e] of mobs) if (Math.floor(e.to.z) === deathState.lastCause.from[0] && Math.floor(e.to.x) === deathState.lastCause.from[1]) {
        e.model.userData.attackT = performance.now() / 1000;
        if (String(e.kind).startsWith("knight")) sound.clash(e.model.position.x, e.model.position.z);   // steel on steel as a knight swings (Pete)
      }
    }
    for (const k of deathState.lastCause.bars) game.hud.shake(k);
  }
  if (!prev || prev.seed !== s.seed) deathState.lastCause = null;                     // a new world
  if (prev && (prev.seed !== s.seed || s.timestep < prev.timestep) && game.hud.sel !== 0) game.hud.select(0, true);
  if (prev && (prev.seed !== s.seed || s.timestep < prev.timestep)) {     // a new or restarted world (Pete): the last one's pop-ups go
    $("loot")?.remove(); $("payoff")?.remove();                              // a chest's treasure, a low need's warning, a craft
    $("toasts")!.replaceChildren();                                          // the achievements still up
    hints.flashT = 0;                                                             // and the line of text
  }   // a new or restarted world: the hand (slot 1) out again (Pete)
  refresh2D();
  // (sleeping: the lie-down and the fade to black are animated in the frame loop, see slp)
  hint(s);
  renderBot(s, game.meta.speeds || [1, 2, 4, 8, 15, 30, 60, 120, 240]);
  syncLooks();
  tele.observe(s, deathState.lastCause && deathState.lastCause.text);                            // analytics: starts, achievements, floors, the bot, the end
  const justDied = s.done && s.health <= 0 && (!prev || !prev.done || prev.seed !== s.seed);
  if (justDied) deathState.deathT = performance.now();                                 // whoever plays, the body falls backward (frame)
  if (s.done && prev && !prev.done) { $("loot")?.remove(); $("payoff")?.remove(); }   // dead (or over): a low need's warning, a chest's treasure, a craft's pop-up go at once (Pete)
  if (justDied && game.player) {                                                 // falling back into water (Pete): it splashes in and sinks (frame; not before the model exists: a world loaded dead)
    const ph = game.player.rotation.y, r = Math.floor(game.player.position.z - Math.cos(ph) * 0.9), c = Math.floor(game.player.position.x - Math.sin(ph) * 0.9);
    const bb = world.at(r, c);
    // what's behind you (Pete): water or lava, you fall back into it (lava: it burns and you sink); a rock, a tree, a table, a wall:
    // you slump against it, sitting, not fall back into it
    deathState.deathWater = !lavaDeath(s) && (bb === B.WATER || bb === B.LAVA) ? { x: c + 0.5, z: r + 0.5, splashed: false, lava: bb === B.LAVA } : null;
    if (deathState.deathWater?.lava) {                                                // the lava tiles the body lies over (Pete): the one behind, and the next if lava too
      const r2 = Math.floor(game.player.position.z - Math.cos(ph) * 1.7), c2 = Math.floor(game.player.position.x - Math.sin(ph) * 1.7);
      deathState.deathWater.fires = [[c + 0.5, r + 0.5]];
      if ((r2 !== r || c2 !== c) && world.at(r2, c2) === B.LAVA) deathState.deathWater.fires.push([c2 + 0.5, r2 + 0.5]);
    }
    // (a zombie or any creature behind you too, Pete: you slump against it, not through it; and only while it's there: it moves
    // off and you go on down onto your back, the frame looks again each moment, deathSlumpK)
    deathState.deathBehind = [r, c]; deathState.deathSlumpK = 0;
    const mobBehind = mobOnTile(r, c);
    deathState.deathSlump = !lavaDeath(s) && (mobBehind || (!deathState.deathWater && leanable(bb)));
    if (mobBehind) deathState.deathWater = null;
    // teetering over lava when you die (Pete): forward, face first, into it, and it burns
    if (hangState.hang && !lavaDeath(s)) {
      const f = DIRV[hangState.hang.d], fr = game.S!.pos[0] + f[0], fc = game.S!.pos[1] + f[1];
      if (world.at(fr, fc) === B.LAVA) {
        deathState.deathSlump = false; deathState.deathForward = true;
        deathState.deathWater = { x: fc + 0.5, z: fr + 0.5, splashed: false, lava: true, fires: [[fc + 0.5, fr + 0.5]] };
        if (world.at(fr + f[0], fc + f[1]) === B.LAVA) deathState.deathWater.fires!.push([fc + f[1] + 0.5, fr + f[0] + 0.5]);
        game.player.rotation.y = Math.atan2(-f[1], -f[0]) + Math.PI;           // (facing the lava)
      }
    }
  }
  if (!s.done && deathState.deathWater?.lava && game.player && !godState.godGlow) for (const m of game.player.userData.mats || []) if (m.uniforms?.uEmissive) m.uniforms.uEmissive.value = 0;   // (alive again: no glow)
  if (!s.done) { deathState.deathWater = null; deathState.deathSlump = false; deathState.deathForward = false; deathState.deathBehind = null; deathState.deathSlumpK = 0; }
  if (!s.done) deathState.deathT = 0;
  // your own world, whether you or the bot is playing it (a server's bot world restarts by itself: it keeps the banner)
  const mine = !s.world || (s.world.you && s.world.kind !== "bot");
  // play on (local.ts): beating him doesn't end the game. The moment he dies: the victory and the portal; a beaten Graveyard come back
  // to (a reload): just the portal. Walk into it for a new world
  if (mine && !s.done && s.level === 8 && s.achievements.includes(49) && victory.victorySeed !== s.seed) {
    if (prev && prev.seed === s.seed && !prev.achievements.includes(49)) startVictory(s);
    else { victory.victorySeed = s.seed; victory.bossAt = null; victory.bossYaw = 0; openPortal(s); }
  }
  // no spoilers (Pete): a recording ends as you come toward the portal, PORTAL_CUT tiles off, before the move that brought you nearer
  // (only nearer than you've been since it opened: beaten up close, it may open within that and its opening still shows)
  if (victory.portal && victory.portalAt && !s.done) { const d = portalDist(s); if (d <= PORTAL_CUT && d < victory.portalNear) local.portalCut?.(true); victory.portalNear = Math.min(victory.portalNear, d); }
  if (victory.portal && victory.portalAt && !s.done && portalTiles.some(([r, c]) => s.pos[0] === r && s.pos[1] === c)) enterPortal(true);
  // the bot beat him (Pete: it then just stood there; nothing it was trained on comes after the win): 3 s after the portal opens it goes
  // through, the same dive, tunnel and drop as yours, and plays on in the new world
  else if (victory.portal && !victory.entering && !s.done && botDriving() && performance.now() - portalT > 3000) enterPortal();
  if (s.done && !net.driving(s) && !mine) {                                // someone we watch died: say so, plainly
    if (!prev || !prev.done) {
      const bot = s.world && s.world.control === "bot";
      deathNote(s.health > 0 ? "Game over" : bot ? "The bot died" : "They died",
        (s.health <= 0 && deathState.lastCause ? themedText(deathState.lastCause.text) + " · " : "") + `${s.achievements.length} achievements · ${s.timestep} steps · ${s.floor}`
        + (bot || (s.world && s.world.kind === "bot") ? " — a new world starts in a moment" : ""));
      if (s.health <= 0) sound.death();
    }
  }
  else if (s.done && deathState.deathT && performance.now() - deathState.deathT < dieMs(s)) {   // our own death: let the fall (or the sinking) play, then the screen
    if (!deathState.deathTimer) deathState.deathTimer = setTimeout(() => { deathState.deathTimer = null; if (game.S && game.S.done) apply(game.S); }, dieMs(s) - (performance.now() - deathState.deathT) + 50);
  }
  else if (s.done && mine && s.health > 0 && s.achievements.includes(49)) {   // the Necromancer beaten: the victory payoff and a portal, not the stone (Pete)
    if (victory.victorySeed !== s.seed) startVictory(s);
  }
  else if (s.done) {
    unlockPointer();
    const won = s.health > 0 && s.achievements.includes(49);
    const botPlayed = s.world && s.world.control === "bot";
    pixelText($("dead-title") as HTMLCanvasElement, won ? "You defeated the Necromancer!" : s.health > 0 ? "Time's up" : botPlayed ? "Bot died!" : "You died!");
    $("tomb")!.classList.toggle("plain", won || s.health > 0);                // a gravestone for a death; a plain stone for a win or time-out
    $("dead-title")!.style.display = won || s.health > 0 ? "" : "none";     // a death: the stone's R.I.P. says it; a win or time-out keeps its title
    // engraved on the stone in the pixel font (pixeltitle.ts), a line each
    const engrave = (text: string, size: number) => { const cv = document.createElement("canvas"); Object.assign(cv.dataset, { pixelEngraved: "", pixelSize: size, pixelMax: 256 }); pixelText(cv, text); return cv; };
    $("dead-cause")!.replaceChildren(...(!won && s.health <= 0 ? [engrave(deathState.lastCause ? themedText(deathState.lastCause.text) : "Health ran out", 3)] : []));
    $("dead-sub")!.replaceChildren(...[`Score ${Math.round(s.score)}`, `${s.achievements.length} achievement${s.achievements.length === 1 ? "" : "s"}`,
      `${s.timestep.toLocaleString("en-US")} steps`, `Reached ${s.floor}`].map((l) => engrave(l, 2)));   // no "the": "Reached Gnomish Mines", the longest, fits
    $("dead-seed")!.textContent = "Seed " + fmtSeed(s.seed);
    if (screens.screen !== "dead") (won ? sound.chime() : sound.death());
    show("dead");
    lookDead();                                                              // each look's gravestone (phosphor: its picture in characters)
  }
  else if (REPLAY && screens.screen === "dead") show(null);                         // a replay rewound to before the death: the stone goes (Pete)
}
