// The frame loop: the clock, the frame-rate meter, and frame(now), which moves everything and draws it.
import { MOB_LOOK, necro, necroFx } from "../effects/necromancer";
import * as THREE from "three";
import { ITEM, B } from "../../js/world";
import { animate } from "../../js/models";
import { lavaFrame } from "../../js/textures";
import { shared, setSky } from "../../js/shading";
import { themeCave, themeGrass } from "../themes/sky";
import { themeMoving, themePause, themeTick } from "../themes/transition";
import { weatherTick } from "../themes/weather";
import { fx } from "../../js/fell";
import { REPLAY } from "../../js/local";
import { recorder, player as replayer } from "../../js/record";
import { net } from "../../js/net";
import { $, EYE, sound } from "./shared";
import { TOUCH_ONLY, camera, clouds, moon, renderer, scene, sky, stars, sun } from "../render/scene";
import { outlinePass } from "../looks/shared/outline-pass";
import { grassWatch } from "../render/quality";
import { bones, bursts, dying, felling, world } from "../render/arm";
import { WALK_MS, api, flat, game, keys, mobs, shots, viewYaw, type Entity } from "./game";
import { chestUpdate } from "../effects/chest";
import { apply } from "./apply";
import { shotFx } from "../effects/shots";
import { victoryFx } from "../effects/tunnel";
import { burnK } from "../effects/death";
import { mobBar, playerPos, sweepBars } from "../render/entities";
import { lookFrame } from "../looks/looks";
import { eyeLights, renderLooks, renderState } from "../looks/render";
import { snaps } from "../ui/snapshots";
import { falls2D, refresh2D, views } from "../views/views";
import { moveAction, previewTool } from "../input/targets";
import { updateAim } from "../render/targeting";
import { WALK, chooseAction, pathing } from "../input/pathing";
import { ARRIVE_MS, CLIMB_MS, intent, send } from "../input/intent";
import { flash, hint } from "../ui/hud/hint";
import { playing, screens } from "../ui/screens/screen";
import { applyMs, poll } from "../ui/screens/worlds";
import { brainShown, camNow, replayCam } from "../replay/recording";
import { TAP_MS, arrowT, pointerState, turn } from "../input/pointer";
import { fountainNear, lavaNear, seaNear, treesNear } from "../ui/hud/layout";
import { ghost } from "../effects/god";
import { hitState, sealFx, trampleFx } from "../effects/hits";
import { posePlayer } from "../render/player-pose";
import { placeCamera } from "../views/camera";

export let clock = 0, lastNow = 0;                                                // Craftax timestep, eased so the sun glides between ticks
// F: the frame rate on the top row (Pete), remembered in this browser; every half second, frames a second and the slowest frame's ms
export let fpsOn = false, fpsEl: HTMLDivElement | null = null;
export const fpsW = { t0: 0, n: 0, last: 0, worst: 0 };
try { fpsOn = localStorage.getItem("craftax3d.fps") === "1"; } catch {}
export function setFps(on: boolean) {
  fpsOn = on; try { localStorage.setItem("craftax3d.fps", on ? "1" : "0"); } catch {}
  if (!fpsEl) {
    // on the top row, just after the pause button (Pete), off the bar's own width so the buttons stay centred
    fpsEl = document.createElement("div"); fpsEl.id = "fps";
    // padding-top 6 px: the pixel font sits high in its line box, so its digits look centred (Pete)
    fpsEl.style.cssText = "position:absolute;left:calc(100% + 8px);top:0;bottom:0;display:flex;align-items:center;box-sizing:border-box;padding:6px 8px 0;min-width:130px;pointer-events:none;"
      + "background:rgba(0,0,0,.55);border:2px solid #8b8b8b;font-family:'Craftax Pixel','Courier New',monospace;font-size:14px;-webkit-font-smoothing:none;color:#fff;text-shadow:2px 2px 0 #3f3f3f;white-space:nowrap";
    $("topbar")!.append(fpsEl);
  }
  fpsEl.style.display = on ? "" : "none"; fpsEl.textContent = on ? "… fps" : ""; fpsW.t0 = 0;
}
export function fpsTick(now: number) {
  if (!fpsOn) return;
  if (fpsW.last) fpsW.worst = Math.max(fpsW.worst, now - fpsW.last);
  fpsW.last = now;
  if (!fpsW.t0) { fpsW.t0 = now; fpsW.n = 0; fpsW.worst = 0; return; }
  fpsW.n++;
  if (now - fpsW.t0 < 500) return;
  fpsEl!.textContent = `${Math.round(fpsW.n * 1000 / (now - fpsW.t0))} fps · ${Math.round(fpsW.worst)} ms`;
  fpsW.t0 = now; fpsW.n = 0; fpsW.worst = 0;
}
if (fpsOn) setFps(true);
export function frame(now: number) {
  requestAnimationFrame(frame);
  fpsTick(now);
  if (!game.S) return;
  if (REPLAY && replayer.still(now)) { lastNow = now; return; }           // a paused replay: the picture holds (record.ts still)
  if (!REPLAY) grassWatch(now);
  const dt = Math.min(0.1, (now - lastNow) / 1000); lastNow = now;
  const opening = renderState.introOrbit && screens.screen === "start" && flat.mode === 2;
  if (opening) { flat.orbit += dt * 0.08; if (flat.orbitGoal != null) flat.orbitGoal += dt * 0.08; }   // the opening: circling you (a swing round a tree rides along)
  clock = Math.abs(game.S.timestep - clock) > 30 ? game.S.timestep : clock + (game.S.timestep - clock) * Math.min(1, dt * 2.5);
  shared.uTime.value = now / 1000; outlinePass.uniforms.uTime.value = now / 1000;
  outlinePass.uniforms.uCellK.value = 1 - 0.4 * flat.t;
  outlinePass.uniforms.uInvVP.value.multiplyMatrices(camera.matrixWorld, camera.projectionMatrixInverse); outlinePass.uniforms.uCam.value.setFromMatrixPosition(camera.matrixWorld);   // (last frame's camera, matched)                      // phosphor from above (3/4, overhead): everything is far, so finer characters
  if (playing() && now - snaps.thumbAt > 15000) { snaps.thumbAt = now; snaps.thumbWanted = true; }   // a fresh picture of the world for My Worlds
  if (!net.driving(game.S) && game.S.dir !== necro.followDir) {                           // watching (a bot, another player): look the way they face;
    necro.followDir = game.S.dir;                                                      // a mouse look holds until they turn again
    const t = { 1: Math.PI / 2, 2: -Math.PI / 2, 3: 0, 4: Math.PI }[game.S.dir];
    if (t !== undefined) pointerState.yawGoal = game.yaw + Math.atan2(Math.sin(t - game.yaw), Math.cos(t - game.yaw));
  }
  if (pointerState.yawGoal !== null && !playing()) {                                     // behind a menu the camera still follows
    game.yaw += (pointerState.yawGoal - game.yaw) * Math.min(1, dt * 12);
    if (Math.abs(pointerState.yawGoal - game.yaw) < 0.002) { game.yaw = pointerState.yawGoal; pointerState.yawGoal = null; }
  }
  if (playing()) previewTool();
  if (playing()) {                                                         // arrow keys turn (the only way to look without a mouse)
    const held = (k: string) => keys.has(k) && now - ((arrowT as Record<string, number | undefined>)[k] ?? now) >= TAP_MS;  // a tap is not a hold
    const ax = (held("ArrowRight") ? 1 : 0) - (held("ArrowLeft") ? 1 : 0), ay = (held("ArrowDown") ? 1 : 0) - (held("ArrowUp") ? 1 : 0);
    if (ax || ay) turn(ax * 2.4 * dt, ay * 1.6 * dt);
    if (pointerState.yawGoal !== null) {                                                 // a tapped quarter turn, eased
      game.yaw += (pointerState.yawGoal - game.yaw) * Math.min(1, dt * 12);
      if (Math.abs(pointerState.yawGoal - game.yaw) < 0.002) { game.yaw = pointerState.yawGoal; pointerState.yawGoal = null; }
    }
    if (pointerState.pitchGoal !== null) {                                               // a tapped tilt (up / down), eased
      game.pitch += (pointerState.pitchGoal - game.pitch) * Math.min(1, dt * 12);
      if (Math.abs(pointerState.pitchGoal - game.pitch) < 0.002) { game.pitch = pointerState.pitchGoal; pointerState.pitchGoal = null; }
    }
  }
  if (recorder.on) { recorder.sample(camNow()); recorder.brain(brainShown()); }                              // recording: the camera too (record.ts)
  if (REPLAY) replayCam(replayer.frame(now));                                // a recording playing: its camera (replay.html drives it)
  game.pace = game.S.sleeping || game.S.resting ? 90 : moveAction() || (pathing.pending && !(pathing.pending.key && pathing.pending.near)) ? Math.min(game.tickMs, WALK_MS) : game.tickMs;   // walking steps faster, a chase too until it's beside its target (Pete: walking to a cow crawled)
  if (intent.climb && !intent.climb.sent && now - intent.climb.t0 >= CLIMB_MS) {               // the climb's top (or bottom): now the floor changes
    intent.climb.sent = true; intent.climb.t1 = null;
    game.inflight = true; intent.lastAct = intent.climb.a; game.lastSend = now;
    api("/api/step", intent.climb.a).then(apply).catch((e) => flash("Server error: " + e.message))
      .finally(() => { game.inflight = false; if (intent.climb) intent.climb.t1 = performance.now(); });
  }
  if (intent.climb && intent.climb.t1 && now - intent.climb.t1 >= ARRIVE_MS) intent.climb = null;
  if (net.driving(game.S) && !intent.climb) {
    if (playing() && !(themeMoving() && themePause.on) && !game.inflight && now - game.lastSend >= game.pace) {   // (a theme switching: the world holds still, Pete)
      const a = chooseAction();
      if (a) send(a);
    }
  } else if (!game.inflight && now - game.lastSend >= Math.max(90, 4 * applyMs)) poll();   // a slow phone: fewer, so the page stays free for taps
  // light: the sun follows Craftax's clock; underground the light map decides what you can see
  const under = game.S.level > 0, k = 1;
  const sunV = setSky((clock % 300) / 300, game.S.daylight, under);
  shared.uCaveColor.value.setRGB(0.2, 0.22, 0.28).multiplyScalar((game.S.level === 2 ? 1.02 : 1) * themeCave());   // the Gnomish Mines: 2% more cave light (Pete)
  shared.uThemeGrass.value = themeGrass();                                  // (a theme's grass height: Winter has none; hidden at none, looks/render.ts)
  if (necro.ladderFor !== game.S.level + ":" + game.S.seed) {                                 // the lit ladder up (found once per floor, see shading.ts uLadder)
    necro.ladderFor = game.S.level + ":" + game.S.seed;
    const i = game.S.level > 0 ? game.S.items.indexOf(ITEM.LADDER_UP) : -1, W = game.S.size[1];
    shared.uLadder.value.set(i >= 0 ? (i % W) + 0.5 : 0, i >= 0 ? Math.floor(i / W) + 0.5 : 0, 7, i >= 0 ? 1 : 0);
  }
  clouds.update(dt, camera.position, clock, game.S.seed ?? 0, under, game.S.daylight);
  sky.visible = stars.visible = !under;
  sky.material.uniforms.sunPosition.value.copy(sunV);
  sky.material.uniforms.skyGain.value = 0.3 * THREE.MathUtils.clamp(game.S.daylight * 1.4, 0.03, 1);   // Craftax's dark is dark: no afterglow band
  moon.material.opacity = THREE.MathUtils.smoothstep(-sunV.y, -0.05, 0.2);
  moon.visible = !under && moon.material.opacity > 0.01;
  moon.position.copy(camera.position).addScaledVector(sunV, -900);
  moon.lookAt(camera.position);
  sun.visible = !under && sunV.y > -0.05;
  sun.position.copy(camera.position).addScaledVector(sunV, 900);
  sun.lookAt(camera.position);
  stars.material.opacity = THREE.MathUtils.clamp(1 - game.S.daylight * 1.6, 0, 1);
  scene.background = under ? shared.uFogColor.value : null;
  renderer.toneMappingExposure = under ? 0.85 : 0.6 + 0.4 * THREE.MathUtils.smoothstep(sunV.y, -0.2, 0.3);   // caves: darker, the torches carry it

  const p = playerPos(now);
  if (ghost) {                                                               // the ghost drifts where the keys take it, walls or not
    const yw = viewYaw(), fx = -Math.sin(yw), fz = -Math.cos(yw), k = (a: string, b: string) => keys.has(a) || keys.has(b);
    let mx = 0, mz = 0;
    if (k("KeyW", "ArrowUp")) { mx += fx; mz += fz; } if (k("KeyS", "ArrowDown")) { mx -= fx; mz -= fz; }
    if (k("KeyD", "ArrowRight")) { mx -= fz; mz += fx; } if (k("KeyA", "ArrowLeft")) { mx += fz; mz -= fx; }
    const n = Math.hypot(mx, mz), sp = (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 14 : 6) * dt;   // (Shift: faster)
    const g = ghost;
    if (n > 0.01) { g.x += (mx / n) * sp; g.z += (mz / n) * sp; }
    if (game.S) { g.x = Math.max(0, Math.min(game.S.size[1], g.x)); g.z = Math.max(0, Math.min(game.S.size[0], g.z)); }
    p.set(g.x, 0, g.z);
  }
  // the climb: up the ladder into the ceiling's hole, or down into the pit, rung by rung; then, on the new floor, the last stretch
  let climbY = 0, climbDark = 0, climbK = 0;
  if (intent.climb) {
    const dir = intent.climb.up ? 1 : -1;
    if (!intent.climb.t1) {                                                        // going: rise (or sink) 1.6, darkening over the last third
      const u = Math.min(1, (now - intent.climb.t0) / CLIMB_MS);
      climbY = dir * 1.6 * u + Math.sin(u * Math.PI * 6) * 0.04; climbK = 1;
      climbDark = THREE.MathUtils.smoothstep(u, 0.55, 1);
    } else {                                                                // arriving: from 1.2 short of the floor, up (or down) onto it
      const u = Math.min(1, (now - intent.climb.t1) / ARRIVE_MS);
      climbY = -dir * 1.2 * (1 - THREE.MathUtils.smootherstep(u, 0, 1)); climbK = 1 - u;
      climbDark = 1 - THREE.MathUtils.smoothstep(u, 0, 0.6);
    }
    p.y += climbY;
  }
  shared.uPlayer.value.set(p.x, 1.0, p.z);                                  // outline art: line brightness by distance from you
  if (hitState.playerStag && now - hitState.playerStag.t < hitState.playerStag.ms) {                   // knocked back a little, then recover
    const k = Math.sin(((now - hitState.playerStag.t) / hitState.playerStag.ms) * Math.PI) * hitState.playerStag.amp;
    p.x += hitState.playerStag.dx * k; p.z += hitState.playerStag.dz * k;
  }
  const lightAt = (x: number, z: number) => (under ? world.lightAt(Math.floor(z), Math.floor(x)) : 1);
  const step = (e: Entity, dur: number) => {
    const a = Math.min(1, (now - e.t0) / dur);
    e.model.position.x = e.from.x + (e.to.x - e.from.x) * a;
    e.model.position.z = e.from.z + (e.to.z - e.from.z) * a;
    return a < 1;
  };
  for (const [, e] of mobs) {
    const moving = step(e, Math.min(game.tickMs, 220));
    { const d = world.dipAt(e.model.position.x, e.model.position.z), was = e.dip || 0, nd = was + (d - was) * Math.min(1, dt * 12); e.model.position.y -= nd - was; e.dip = nd; }   // (a pixel lower on dirt, as you)
    if (e.popT) {                                                           // appearing: pops up out of its dust, a little overshoot
      const k = Math.min(1, (now - e.popT) / (320 * fx.time)), c1 = 1.70158;   // (quicker with a fast bot)
      e.model.scale.setScalar(Math.max(0.01, 1 + (c1 + 1) * (k - 1) ** 3 + c1 * (k - 1) ** 2));
      if (k >= 1) { e.model.scale.setScalar(1); e.popT = 0; }
    }
    if (e.stag && now - e.stag.t < 260) {                                   // staggered by a hit
      const k = Math.sin(((now - e.stag.t) / 260) * Math.PI) * 0.25;
      e.model.position.x += e.stag.dx * k; e.model.position.z += e.stag.dz * k;
    }
    const dx = e.to.x - e.from.x, dz = e.to.z - e.from.z;
    const want = moving && (dx || dz) ? Math.atan2(dx, dz) : Math.atan2(p.x - e.model.position.x, p.z - e.model.position.z);
    let d = want - e.model.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    e.model.rotation.y += d * 0.2;
    animate(e.model, now / 1000, moving, lightAt(e.model.position.x, e.model.position.z), now - e.hurtT < 250);
    mobBar(e);
  }
  sweepBars();
  for (const [, e] of shots) {
    step(e, Math.min(game.tickMs, 200));
    if (e.dir) e.model.rotation.y = Math.atan2(e.dir[1], e.dir[0]);
    animate(e.model, now / 1000, false, lightAt(e.model.position.x, e.model.position.z), false);
  }
  // the bot faster than real time (Pete): effects play out quicker, in step with it; faster than 30 moves a second none are drawn
  { const w = game.S && game.S.world, sp = w && w.control === "bot" && !w.paused ? w.speed || 0 : 0, real = 1000 / game.tickMs;
    fx.time = sp > real ? Math.max(0.15, real / sp) : 1; fx.off = sp > 30; sound.pace = sp; }   // (sound.ts gate: thins the sounds)
  felling.update(now); dying.update(now); bursts.update(now); bones.update(now); chestUpdate(now);
  world.updateLight(now); world.updateFountains(now); world.updateGreenFlames(now);
  themeTick(now);                                                          // a theme switching: its wave or fade (src/themes/transition.ts)
  weatherTick(now, p, game.S.level);                                                     // and its weather: snow falling... (src/themes/weather.ts)
  if (falls2D.length && flat.mode === 1 && flat.picture === 1 && net.local && now - views.fallDrawn > 40) { views.fallDrawn = now; refresh2D(); }
  eyeLights(now);
  // sound: the listener is the camera; ambience; now and then a nearby mob groans (or a cow moos)
  sound.listener.x = p.x; sound.listener.z = p.z; sound.listener.yaw = viewYaw();
  shared.uLavaF.value = TOUCH_ONLY ? 0 : lavaFrame(now);                   // lava's frame (the shader picks it from the atlas); still on a phone (Pete)
  sound.ambient(now, game.S.daylight, under, under ? 0 : seaNear(game.S), under ? [] : treesNear(game.S), game.S.level, lavaNear(game.S), fountainNear(p), burnK);
  // the heartbeat (Pete): down to the last heart, or a need run out and draining health; not once dead
  sound.heart(now, game.S.health <= 0 || screens.screen === "dead" ? 0 : game.S.health <= 1 ? 1 : game.S.food <= 0 || game.S.drink <= 0 || game.S.energy <= 0 ? 0.6 : 0);
  if (now > hitState.nextGroan) {
    hitState.nextGroan = now + 10000 + Math.random() * 10000;                       // rare: one every 10-20 s at most (Pete: a little longer), only from close by
    const near0 = [...mobs.values()].filter((e) => e.model.position.distanceTo(p) < 7 && !(now - (e.voiceT ?? NaN) < (e.kind === "zombie" ? 12000 : String(e.kind).startsWith("gnome") ? 45000 : e.kind === "cow" ? 45000 : 30000)));   // each mob 30 s apart at least, a zombie 12 s (Pete: more zombie sounds when they're near), a cow's moo 45 s (Pete: sparse)
    // a monster near you is heard first (Pete: the cows' moos took the turn and the zombies and skeletons went quiet); a cow only when none is
    const hostile = near0.filter((e) => e.kind !== "cow" && e.kind !== "bat" && e.kind !== "snail"), near = hostile.length ? hostile : near0;
    const e = near[Math.floor(Math.random() * near.length)];
    if (e) e.voiceT = now;
    if (e && e.kind === "zombie") hitState.nextGroan = now + 4000 + Math.random() * 4000;   // zombies close by: the next moan in 4-8 s, not 10-20
    if (e) e.kind === "cow" ? sound.moo(e.model.position.x, e.model.position.z) : e.kind !== "bat" && e.kind !== "snail" && sound.groan(e.kind, e.model.position.x, e.model.position.z);
  }
  if (now > hitState.nextFarMoan) {                                                  // now and then a monster further off (out of view) growls or laughs, faint and muffled (Pete)
    hitState.nextFarMoan = now + 25000 + Math.random() * 25000;
    const far = [...mobs.values()].filter((e) => !["cow", "bat", "snail", "skeleton"].includes(e.kind) && e.model.position.distanceTo(p) >= 8 && e.model.position.distanceTo(p) < 22 && !(now - (e.voiceT ?? NaN) < 60000));
    const e = far[Math.floor(Math.random() * far.length)];
    if (e) { e.voiceT = now; sound.groan(e.kind, e.model.position.x, e.model.position.z, true); }
  }
  for (const m of world.props.children) animate(m, now / 1000, false, lightAt(m.position.x, m.position.z), false);
  necroFx(now);
  sealFx(now);
  trampleFx(now, p);
  victoryFx(now);
  shotFx(now);

  // while walking to or fighting a clicked target, turn the camera onto it (a mob where it is drawn now, a block at its middle)
  if (pathing.pending && !flat.on) {
    const e = pathing.pending.key && mobs.get(pathing.pending.key) === pathing.pending.ent ? pathing.pending.ent : null;
    // how high to look: open ground, trees and tall things straight ahead; a short mob (a cow), a table, or a block being mined, down at it
    const b = world.at(pathing.pending.r, pathing.pending.c);
    const ty = e ? (MOB_LOOK as Record<string, number | undefined>)[e.kind] ?? EYE - 0.15 : pathing.pending.action === WALK || b === B.TREE || b === B.FIRE_TREE ? EYE : 0.5;
    const tx = e ? e.model.position.x : pathing.pending.c + 0.5, tz = e ? e.model.position.z : pathing.pending.r + 0.5;
    const dx = tx - p.x, dz = tz - p.z, flatD = Math.hypot(dx, dz);
    if (flatD > 0.3) {
      const k = Math.min(1, dt * 6);
      let dy = Math.atan2(-dx, -dz) - game.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      game.yaw += dy * k;
      game.pitch += (Math.atan2(ty - EYE, flatD) - game.pitch) * k;
    }
  }

  const { bob, melt, fall, lie } = posePlayer(now, dt, p, lightAt, climbK, climbDark);
  placeCamera(now, dt, p, { under, climbY, bob, melt, fall, lie, opening, lightAt });
  updateAim(p);
  if (game.S) hint(game.S);
  lookFrame(now);                                                          // each look's own frame (phosphor: the Necromancer in code)
  renderLooks(now);
}
