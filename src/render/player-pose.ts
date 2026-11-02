// The player model each frame: where it stands and its pose (walking, on a ladder, asleep, dead, drinking, hanging).
import "../core/frame";
import * as THREE from "three";
import { ITEM } from "../../js/world";
import { makeMob, animate, dressArmor, enchPulse } from "../../js/models";
import { $, DIRV, sound } from "../core/shared";
import { camera, scene } from "./scene";
import { DRINK_MS, drinkFx, endDrink, playerTool, tool, world } from "./arm";
import { hangState, sweat } from "../effects/hang";
import { flat, game, view } from "../core/game";
import { setAlpha } from "../effects/victory";
import {
  FALL_MS, HIT_AT, MELT_MS, SINK_MS, bodyFire, bodyFires, deathState, lavaDeath, lavaFire, leanable, mobOnTile, splash,
} from "../effects/death";
import { lookState } from "../looks/looks";
import { moveAction } from "../input/targets";
import { intent } from "../input/intent";
import { GHOST_TINT, ghost, godFx } from "../effects/god";
import { necro, poseBox, poseFor } from "../effects/necromancer";

// frame(), the player model: where it stands and how it is posed (walking, on a ladder, asleep, dead, drinking, hanging over lava);
// returns what the camera needs from it
export function posePlayer(now: number, dt: number, p: THREE.Vector3, lightAt: (x: number, z: number) => number, climbK: number, climbDark: number): { bob: number; melt: number; fall: number; lie: number } {
  const S = game.S!;                                                       // (frame draws the player only once a state is in)
  // camera: first person at the eye, or third person behind the player model
  const walking = now - view.t0 < view.dur;
  const bob = walking ? Math.sin(now / 45) * 0.04 : 0;
  camera.rotation.set(game.pitch, game.yaw, 0);
  if (!game.player) { game.player = makeMob("player"); for (const m of game.player.userData.mats) m.uniforms.uBoost.value = 1; scene.add(game.player); game.hud.onTool!(game.hud.tool); }   // and put the tool in its hand
  game.player.visible = game.third || flat.t > 0;
  game.player.position.copy(p);
  deathState.playerDip += (world.dipAt(p.x, p.z) - deathState.playerDip) * Math.min(1, dt * 12); game.player.position.y -= deathState.playerDip;   // on bare dirt: a pixel lower (Pete)
  // on a ladder up (Pete: not standing through it): just south of its rails, facing it, feet on the first rung, hands up on the rails
  // (ladK, 1 at the tile's middle, easing in as you step onto it); the model only, the eye stays where it was
  let ladK = 0;
  if (S.level > 0 && !S.done) {
    const lr = Math.floor(p.z), lc = Math.floor(p.x);
    if (S.items[lr * S.size[1] + lc] === ITEM.LADDER_UP) ladK = THREE.MathUtils.clamp(1 - 2 * Math.hypot(p.x - lc - 0.5, p.z - lr - 0.5), 0, 1);
    if (ladK) { game.player.position.z += 0.3 * ladK; game.player.position.y += 0.2 * ladK; }
  }
  if (game.S) dressArmor(game.player, S.inventory.armour, S.armour_enchant);          // what you wear, as you get it (Pete; only rebuilt when it changes)
  enchPulse(1 + 0.5 * Math.sin(now / 260));                                  // an enchanted piece's purple glow, pulsing
  for (const g of game.player.userData.glows || []) g.visible = !lookState.lines;           // (a soft blend: none in the line looks)
  for (const g of [...(tool.userData.glows || []), ...(playerTool?.userData.glows || [])]) g.visible = !lookState.lines;   // the sword's too
  godFx(p, now);
  // 2D: face Craftax's own direction (a move turns you that way); 3D: the camera's
  game.player.rotation.y = flat.t > 0 ? [0, -Math.PI / 2, Math.PI / 2, Math.PI, 0][S.dir] ?? 0 : game.yaw + Math.PI;
  if (intent.climb || ladK > 0.5) game.player.rotation.y = Math.PI;                    // on a ladder: facing it (north), in every view
  animate(game.player, now / 1000, walking, lightAt(p.x, p.z), false);
  // the ghost (Pete: ghostly from outside): see-through, pale and blue-white, glowing a little, floating up off the ground and bobbing
  if (ghost) {
    if (!lookState.lines) setAlpha(game.player, 0.38 + 0.06 * Math.sin(now / 400));      // (laser, phosphor: no blending there, it stays whole and glows)
    for (const m of game.player.userData.mats || []) { const u = m.uniforms; if (u?.uColor) u.uColor.value.lerp(GHOST_TINT, 0.7); if (u?.uEmissive) u.uEmissive.value = Math.max(u.uEmissive.value, 0.55); }
    game.player.position.y += 0.25 + 0.07 * Math.sin(now / 520);
  }
  let fall = deathState.deathT ? THREE.MathUtils.smootherstep(Math.min(1, (now - deathState.deathT) / FALL_MS), 0, 1) : 0;
  // dead in lava (Pete: a human's step into it kills, local.ts / the engine's cx_into_lava): no fall backward; you sink into it upright
  // as a fire roars up over you (a world loaded dead: already under)
  const melt = lavaDeath(game.S) ? (deathState.deathT ? Math.min(1, (now - deathState.deathT) / MELT_MS) : 1) : 0;
  if (melt > 0 && deathState.deathT) {                                                // the hearts going down as you sink
    const hp = Math.ceil(deathState.meltHp * (1 - Math.min(1, melt / 0.7)));
    if (hp !== deathState.meltShown) { deathState.meltShown = hp; game.hud.update({ ...S, health: hp }); }
  }
  if (melt) fall = 0;
  lavaFire(melt, p, now);
  // sleep (only a picture; the game sleeps as Craftax does): lie down on your back, hands behind your head, then the world fades to
  // black; waking, it fades back and you get up. slp runs 0..2: 0-1 lying down, 1-2 the fade
  // waking: the light comes back as slowly as it went, but then you're up in a fifth of a second (Pete: he floated up on his back while
  // already walking), and at once if you move before then
  // (a bot playing past 30 moves a second: no sleep shown at all, no lying down, no dark, no Zzz; it sleeps at its own pace: Pete)
  const blur = S.world?.control === "bot" && (S.world.speed ?? 0) > 30;
  const waking = !(S.sleeping && !S.done) || blur;
  if (waking && deathState.slp <= 1 && deathState.slp > 0 && (moveAction() || walking)) deathState.slp = 0;
  deathState.slp = THREE.MathUtils.clamp(deathState.slp + (waking ? -dt / (deathState.slp > 1 ? 0.9 : 0.2) : dt / 0.9), 0, 2);
  const lie = THREE.MathUtils.smootherstep(Math.min(1, deathState.slp), 0, 1), dark = THREE.MathUtils.smootherstep(Math.max(0, deathState.slp - 1), 0, 1);
  // (seen from outside, bird's-eye, the classic view or third person: only 70 % dark, so you still see yourself asleep, Pete)
  $("dark")!.style.transition = "none"; $("dark")!.style.opacity = Math.max(dark * (flat.mode !== 0 || game.third ? 0.7 : 0.94), climbDark).toFixed(3);
  $("zzz")!.style.opacity = dark.toFixed(3);                                // and a big Zzzzzz... while it's dark
  // slumped against something behind you: only while it's still there (a creature can walk off), easing to lying down once it's gone
  if (deathState.deathT && deathState.deathBehind) {
    const [br, bc] = deathState.deathBehind, held = deathState.deathSlump && (leanable(world.at(br, bc)) || mobOnTile(br, bc));
    if (!held) deathState.deathSlump = false;
    deathState.deathSlumpK = THREE.MathUtils.clamp(deathState.deathSlumpK + (held ? 1 : -1) * dt * 3, 0, 1);
    if (held) deathState.deathSlumpK = 1;
  }
  const sk = deathState.deathT ? deathState.deathSlumpK : 0;
  game.player.rotation.order = "YXZ";
  game.player.rotation.x = deathState.deathForward ? fall * Math.PI * 0.49 : -Math.max(fall * (1 - sk), lie) * Math.PI * 0.49;  // dead or asleep: on its back (over lava: on its face)
  if (game.player.userData.arms) game.player.userData.arms.forEach((a: THREE.Object3D, i: number) => {                       // asleep: hands up behind the head
    if (lie > 0) a.rotation.x = -2.75 * lie;
    a.rotation.z = (i ? -0.45 : 0.45) * lie;
  });
  // lying down needs the tile behind you free (you lie back into it): turn to whichever side has room, or, walled in (the usual
  // way to sleep safely), slump sitting against a wall instead. Whatever the pose, nothing of you dips below the floor
  if ((lie > 0 && !fall) || (sk > 0 && fall > 0)) {
    // (dead with a rock, tree or wall behind you: the same slump against it, as you fall, Pete)
    if (!necro.sleepPose) necro.sleepPose = deathState.deathSlump ? { yaw: game.player.rotation.y, slump: true } : poseFor(game.player.rotation.y);
    const k = sk > 0 && fall > 0 ? fall * sk : lie, ph = necro.sleepPose.yaw, bx = -Math.sin(ph), bz = -Math.cos(ph);   // (bx, bz): behind you
    game.player.rotation.y = ph;
    if (necro.sleepPose.slump) {
      game.player.rotation.x = Math.min(game.player.rotation.x, -0.3 * k);          // (dead, sliding off it: the fall back takes over)                                        // back against the wall, sitting, legs out, head down
      game.player.position.y -= 0.7 * k;
      game.player.position.x += bx * 0.22 * k; game.player.position.z += bz * 0.22 * k;
      for (const l of game.player.userData.limbs.slice(0, 2)) l.rotation.x = -Math.PI / 2 * k;
      game.player.userData.arms.forEach((a: THREE.Object3D, i: number) => { a.rotation.x = -0.35 * k; a.rotation.z = (i ? -0.15 : 0.15) * k; });
      game.player.userData.head.rotation.x = 0.4 * k;
      // back up to the wall, not into it: whatever of you (the head, most) would cross your tile's edge on the wall's side comes forward
      game.player.updateMatrixWorld(true);
      const bb = poseBox.setFromObject(game.player), cx0 = S.pos[1] + 0.5, cz0 = S.pos[0] + 0.5, EDGE = 0.48;
      const out = Math.round(bx) > 0 ? bb.max.x - cx0 : Math.round(bx) < 0 ? cx0 - bb.min.x : Math.round(bz) > 0 ? bb.max.z - cz0 : cz0 - bb.min.z;
      if (out > EDGE) { game.player.position.x -= Math.round(bx) * (out - EDGE); game.player.position.z -= Math.round(bz) * (out - EDGE); }
    } else {
      game.player.position.x -= bx * 0.4 * k; game.player.position.z -= bz * 0.4 * k;   // feet at your tile's front edge: you lie in it and the one behind
      game.player.userData.head.rotation.x = 0;
    }
  } else if (!lie && !(sk > 0 && fall > 0) && necro.sleepPose) { necro.sleepPose = null; game.player.userData.head.rotation.x = 0; }
  if ((lie > 0 || fall > 0) && !(necro.sleepPose && necro.sleepPose.slump)) {         // on its back: lift it so its lowest point rests on the floor
    game.player.updateMatrixWorld(true);
    const lo = poseBox.setFromObject(game.player).min.y;
    if (lo < p.y) game.player.position.y += p.y - lo;
  }
  if (melt) game.player.position.y -= 2.4 * THREE.MathUtils.smootherstep(Math.min(1, melt / 0.7), 0, 1);   // down into the lava (its skin 0.15 below the floor), head last
  if (!(deathState.deathWater?.lava && deathState.deathT) && bodyFires.some((g) => g.visible)) bodyFire(0, [], now);
  if (deathState.deathWater && deathState.deathT) {                                              // into the water: the splash, then down, drifting out over it
    const since = now - deathState.deathT, sink = THREE.MathUtils.smoothstep((since - HIT_AT) / (SINK_MS - HIT_AT - 300), 0, 1);
    if (!deathState.deathWater.splashed && since >= HIT_AT) {
      deathState.deathWater.splashed = true;
      const hx = (game.player.position.x + deathState.deathWater.x) / 2, hz = (game.player.position.z + deathState.deathWater.z) / 2;
      const lv = deathState.deathWater.lava;                                        // lava: a fiery hiss and a spray of embers, not water
      sound.burst?.("lowpass", lv ? 900 : 1400, 0.8, 0.55, 0.3, hx, hz, 0, 300); if (lv) sound.fireRoar?.(hx, hz); else sound.drink?.(hx, hz);
      for (let i = 0; i < 18; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: lv ? (i % 3 ? 0xffb030 : 0xff4a10) : i % 3 ? 0xd8f0ff : 0x8ac8f0, transparent: true }));
        m.position.set(hx + (Math.random() - 0.5) * 0.5, 0, hz + (Math.random() - 0.5) * 0.5);
        scene.add(m); splash.push({ m, t0: now, v: new THREE.Vector3((Math.random() - 0.5) * 2.4, 2.2 + Math.random() * 2, (Math.random() - 0.5) * 2.4) });
      }
    }
    game.player.position.x += (deathState.deathWater.x - game.player.position.x) * 0.5 * sink; game.player.position.z += (deathState.deathWater.z - game.player.position.z) * 0.5 * sink;
    game.player.position.y -= 1.4 * sink;
    if (deathState.deathWater.lava) {                                                 // burning as it goes under (Pete: bursting into flames)
      for (const m of game.player.userData.mats || []) if (m.uniforms?.uEmissive) m.uniforms.uEmissive.value = 1.6 * sink;
      bodyFire(since >= HIT_AT ? Math.min(1, (since - HIT_AT) / (SINK_MS - HIT_AT)) : 0, deathState.deathWater.fires || [], now);
    }
  }
  for (const sd of [...splash]) {                                          // the splash's drops, up and back down
    const a = (now - sd.t0) / 1000;
    if (a > 1.1) { scene.remove(sd.m); sd.m.geometry.dispose(); sd.m.material.dispose(); splash.splice(splash.indexOf(sd), 1); continue; }
    sd.m.position.addScaledVector(sd.v, dt); sd.v.y -= 9 * dt; sd.m.material.opacity = 1 - a / 1.1;
  }
  if (melt >= 0.68) game.player.visible = false;                                 // engulfed: nothing of you shows through the head's fire (Pete)
  if (drinkFx) {                                                           // drinking a potion: bottle up to the mouth, head back
    const e = (now - drinkFx.t0) / DRINK_MS;
    if (e >= 1) endDrink();
    else {
      const k = THREE.MathUtils.smootherstep(Math.min(e / 0.25, (1 - e) / 0.2, 1), 0, 1), sip = Math.sin(e * Math.PI * 5) * 0.06 * k;
      const a = game.player.userData.arms[0];
      a.rotation.x = -2.3 * k + sip; a.rotation.z = 0.5 * k;            // up and in, toward the mouth
      game.player.userData.head.rotation.x = -0.35 * k;
      drinkFx.b1.visible = !game.third && flat.t === 0;                         // first person only (the model drinks in the other views)
      drinkFx.b1.position.set(0.05 - 0.05 * k, -0.6 + 0.42 * k, -0.45);
      drinkFx.b1.rotation.set(-1.6 * k + sip, 0, 0.2 * k);
    }
  }
  {                                                                        // hanging over lava: leaning out, wobbling, arms wheeling; sweat
    hangState.hangOut += ((hangState.hang && !S.done ? 1 : 0) - hangState.hangOut) * Math.min(1, dt * (hangState.hang ? 7 : 10));   // out over it, or scrambling back
    if (hangState.hangOut > 0.01 && !S.done && DIRV[hangState.teeterDir]) {
      const [dr, dc] = DIRV[hangState.teeterDir], wob = Math.sin(now / 95) * hangState.hangOut, out = hangState.hangOut;
      game.player.position.x += dc * 0.36 * out; game.player.position.z += dr * 0.36 * out;
      game.player.rotation.y = [0, -Math.PI / 2, Math.PI / 2, Math.PI, 0][hangState.teeterDir]; game.player.rotation.order = "YXZ"; game.player.rotation.x = 0.28 * out + 0.07 * wob;
      if (game.player.userData.arms) game.player.userData.arms.forEach((a: THREE.Object3D, i: number) => { a.rotation.x = -1.3 * out + Math.sin(now / 80 + i * Math.PI) * 0.9 * out; a.rotation.z = (i ? 1 : -1) * 0.8 * out; });   // wheeling, out to the sides
    }
    if (hangState.hang && now - hangState.sweatT > 380 && sweat.length < 16) {               // sweat flying off the head
      hangState.sweatT = now;
      for (let i = 0; i < 3; i++) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.05), new THREE.MeshBasicMaterial({ color: 0xbfe6ff, transparent: true }));
        m.position.set(game.player.position.x + (Math.random() - 0.5) * 0.3, game.player.position.y + 1.8, game.player.position.z + (Math.random() - 0.5) * 0.3);
        scene.add(m); sweat.push({ m, t0: now, v: new THREE.Vector3((Math.random() - 0.5) * 1.6, 1.2 + Math.random(), (Math.random() - 0.5) * 1.6) });
      }
    }
    for (const sd of [...sweat]) {
      const a = (now - sd.t0) / 1000;
      if (a > 0.8) { scene.remove(sd.m); sd.m.geometry.dispose(); sd.m.material.dispose(); sweat.splice(sweat.indexOf(sd), 1); continue; }
      sd.m.position.addScaledVector(sd.v, dt); sd.v.y -= 6 * dt; sd.m.material.opacity = 1 - a / 0.8;
    }
  }
  if ((climbK > 0 || ladK > 0) && game.player.userData.arms) game.player.userData.arms.forEach((a: THREE.Object3D, i: number) => {   // hand over hand up the rails (still: holding on)
    a.rotation.x = -2.6 * Math.max(climbK, ladK) + Math.sin(now / 70 + i * Math.PI) * 0.45 * climbK;
  });
  return { bob, melt, fall, lie };
}
