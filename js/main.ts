// Craftax 3D client: input → one Craftax action per tick → POST /api/step → draw the returned state in first person.
// Boot: the game's parts live in src/, one module each (each says what it owns); importing the last one runs them all in their original
// order (each imports the one before it first).
import "../src/config";
import "three";
import "./world";
import "./models";
import { Hud } from "./hud";
import { renderResearch, routeTab } from "./research";
import "./textures";
import "./shading";
import "./fell";
import "./clouds";
import "./sound";
import "./art2d";
import { brain } from "./brain";
import { listed } from "../src/core/plugins";
import { REPLAY } from "./local";
import { player as replayer } from "./record";
import "./telemetry";
import "./research";
import "./pixeltitle";
import { net, serverName } from "./net";
import "three/addons/postprocessing/EffectComposer.js";
import "three/addons/postprocessing/RenderPass.js";
import "three/addons/postprocessing/UnrealBloomPass.js";
import "three/addons/postprocessing/OutputPass.js";
import "three/addons/postprocessing/ShaderPass.js";
import "three/addons/postprocessing/Pass.js";
import "three/addons/objects/Sky.js";
import "../src/views/camera";
import { $, A, sound } from "../src/core/shared";
import { FROM_REPLAY, SPECTATE, canvas, renderer } from "../src/render/scene";
import { botFast } from "../src/render/quality";
import { bones, dying, setTool, world } from "../src/render/arm";
import { hangState } from "../src/effects/hang";
import { api, flat, game, keys, mobs, oneShot } from "../src/core/game";
import { lookButtons, lookUnrestored, restoreLook } from "../src/ui/hud/buttons";
import { chestOpen } from "../src/effects/chest";
import { apply } from "../src/core/apply";
import { DUST } from "../src/render/entities";
import { aim } from "../src/input/aim";
import { shockwave } from "../src/looks/looks";
import { shockMasks } from "../src/looks/phosphor/fx";
import { look } from "../src/looks/registry";
import { MIN_STILL, backdropReveal, introLook, renderState } from "../src/looks/render";
import { snaps, worldPicture } from "../src/ui/snapshots";
import { setLook } from "../src/views/views";
import { cycleTheme, initThemes } from "../src/themes/ui";
import { loadUserPlugins } from "../src/core/user-plugins";
import { themeMoving, switchTheme } from "../src/themes/transition";
import { tooSalty } from "../src/input/targets";
import { pathing } from "../src/input/pathing";
import { send } from "../src/input/intent";
import { flash } from "../src/ui/hud/hint";
import { DEBUG, play, playing, screens, show } from "../src/ui/screens/screen";
import { camNow, goLook } from "../src/replay/recording";
import { touchOn } from "../src/input/touch";
import { panelAction } from "../src/ui/screens/panel";
import { frame } from "../src/core/frame";
import { invAt } from "./hud";
import type { Player } from "./record";
import type { Inventory, Meta } from "../src/core/types";
import { themeById, themes } from "../src/themes/state";
import { widenPhoneCss } from "../src/ui/side";

widenPhoneCss(); addEventListener("load", widenPhoneCss);         // (a touch screen on its side: the phone layout, src/ui/side.ts)

// what the page hangs on window: replay.html's handle on the player (?replay), and the debug console's (?debug)
declare global { interface Window { cxReplay?: Player; cx?: Record<string, unknown> } }

// ---------- boot ----------
(async function boot() {
  // the loading bar: it eases out toward 85% over about 3 s (a load takes ~3 s on playcraftax.com), the engine and world arriving
  // take it on, then it fills and folds away
  const bar = $("start-status")!.querySelector("i")!, fill = (p: number, ms: number) => { bar.style.transitionDuration = ms + "ms"; bar.style.width = p + "%"; };
  requestAnimationFrame(() => fill(85, 3200));
  try {
    await loadUserPlugins();                                                // (the player's own plugins, Settings → Add plugin…: before anything reads the slots)
    lookButtons(); if (lookUnrestored()) { restoreLook(); flat.t = flat.k = flat.mode === 0 ? 0 : 1; }   // (their looks: a button each, and the saved one back)
    net.init();
    // the server picker is hidden for now (Pete: never "In your browser"): ?servers shows it, as does playing on a real server (?server=…)
    if (/[?&]servers\b/.test(location.search) || (/[?&]server=/.test(location.search) && !net.local)) $("srv-line")!.style.display = "";
    serverName().then((n) => ($("srv-name")!.textContent = n + (net.base ? " (" + net.base + ")" : "")));
    game.meta = await api<Meta>("/api/meta");
    fill(92, 300);
    if (!net.local) for (const id of ["btn-botworld", "btn-watch"]) $(id)!.style.display = "";   // a server's worlds: hidden until known (no flash while loading)
    if (!net.local) for (const id of ["btn-load", "btn-dead-worlds"]) $(id)!.style.display = "none";                             // My Worlds is for worlds played in the browser   // bot worlds need a server; P runs here (agent.ts)
    game.hud = new Hud(game.meta, panelAction);
    brain.setNames(game.meta.actions); for (const v of listed("brainView")) v.setNames(game.meta.actions);
    game.hud.onAch = () => sound.chime();                                       // the bell rings with the toast (hud.ts: after a tree has fallen)
    game.hud.onSleep = () => {                                                  // Craftax only lets you sleep below full energy
      if (!playing() || !game.S || game.S.sleeping) return;
      if (game.S.available && !game.S.available[A.SLEEP]) { flash("Not tired: energy is full"); return; }
      pathing.pending = null; oneShot.push({ action: A.SLEEP }); flash("Sleeping…");
    };
    game.hud.onTool = (k) => {
      const t = game.S ? invAt(game.S.inventory, k) || 0 : 0, en = game.S ? game.S.sword_enchant : 0;
      hangState.toolKey = k + t + "|" + en; setTool(k, t, k === "sword" ? en : 0);
    };
    game.hud.select(0);
    initThemes();                                                           // (the themes' tiles in the atlas and the saved theme on, before the first build)
    apply(await api("/api/state"));
    $("loading")!.remove(); document.body.classList.add("ready");      // the menu's buttons wake up
    fill(100, 150); setTimeout(() => $("start-status")!.classList.add("done"), 220);   // full, then gone
    ($("btn-play") as HTMLButtonElement).disabled = false;
    if (SPECTATE) {                                                         // straight into the world the page drives: no menu
      document.body.classList.add("spectate"); play();
      // its look the page's (?look=<a look's id: color, laser, phosphor>, then { cx: "look", look } as the setting changes) — 3D looks
      // only: the classic 2D view is a picture beside the canvas, which the page doesn't copy
      const pick = (a: string) => { if (look(a)) setLook(a, true); };
      pick(new URLSearchParams(location.search).get("look") || "color");
      addEventListener("message", (e) => { if (e.origin === location.origin && e.data?.cx === "look") pick(e.data.look); });
    }
    if (REPLAY) {                                                           // replay.html's copy: it loads a recording into `cxReplay`
      if (/[?&]touch=1\b/.test(location.search)) touchOn();                 // recorded on a touch screen: its controls
      if (/[?&]clean\b/.test(location.search)) document.body.classList.add("clean");   // a backdrop: the world alone (index.html)
      document.body.classList.add("replay");                                // (index.html: no controls in the frame)
      $("info")!.classList.add("open");                                      // (a phone's Status, opened: the score shows too)
      // (and its Inventory just under Status, or at the top when Status is hidden: index.html)
      const gearY = () => { const r = $("info")!.getBoundingClientRect(); document.documentElement.style.setProperty("--gear-y", (r.height ? r.bottom + 8 : 6) + "px"); };
      new ResizeObserver(gearY).observe($("info")!); gearY();
      window.cxReplay = replayer; replayer.camNow = camNow;                  // (camNow: a camera key, as the shot is framed now)
      // replay.html's side: the view and look for a keyframe, and which parts of the HUD the recording shows
      replayer.look = (mode, look) => { replayer.wake(); goLook(mode, look, false); };
      replayer.themeName = (id) => (id ? themeById(id)?.label ?? id : "Standard");
      replayer.themeList = () => [{ id: null, label: "Standard" }, ...themes().map((t) => ({ id: t.id, label: t.label, icon: t.icon }))];
      replayer.setTheme = (id) => { switchTheme(themeById(id)); const t = setInterval(() => { replayer.wake(); if (!themeMoving()) clearInterval(t); }, 200); replayer.wake(); };
      replayer.theme = (back) => { cycleTheme(back); const t = setInterval(() => { replayer.wake(); if (!themeMoving()) clearInterval(t); }, 200); replayer.wake(); };   // (paused: drawn on till it's done)
      // a recording's moments the engine doesn't keep (record.ts `ui` ops): hanging over the lava, letting go, the scorch
      replayer.onUi = (o, live) => {
        if (o.e === "hang") { hangState.hang = { d: o.d as number, r: game.S!.pos[0], c: game.S!.pos[1], hurtT: performance.now() }; hangState.teeterDir = o.d as number; if (live) flash("Hanging over the lava! Back away, or step in"); }
        else if (o.e === "letgo") hangState.hang = null;
        else if (o.e === "scorch" && live) { hangState.scorchT = performance.now(); sound.hurt?.(); }
      };
      replayer.shot = () => { replayer.wake(); snaps.shotWanted = true; };       // (replay.html's Share: a screenshot of the frame as it is)
      // (replay.html's Make a video, js/film.ts: each frame's world, and the sound computed alongside, sound.ts filmBegin)
      replayer.film = { canvas: canvas as HTMLCanvasElement, world: worldPicture, begin: (sec) => sound.filmBegin(sec), to: (sec) => sound.filmTo(sec), end: () => sound.filmEnd() };
      replayer.sound = (v: number) => { sound.unlock(); sound.level(v); };          // (called in replay.html's click: the context may start)
      replayer.show = (o = {}) => { replayer.wake(); for (const k of ["status", "inv", "hotbar", "bars", "ach", "loot", "msg"]) document.body.classList.toggle("hide-" + k, (o as Record<string, boolean>)[k] === false); };
      if (parent !== window) parent.postMessage({ cx: "replay-ready" }, location.origin);
    }
    if (screens.screen === "start") show("start");                                  // Play or Continue, now the world is known
    if (FROM_REPLAY && screens.screen === "start") { backdropReveal(); show(null); renderState.introOrbit = false; flash("Playing on from the replay: a new world of yours"); }
    if (routeTab()) { renderResearch($("research-body")!, routeTab()); show("research"); }   // Research's own pages (/papers/, /agents/, /repos/, /research/)
    else if (location.hash === "#research") ($("btn-research")!.onclick as () => void)();    // an older link to the Research screen
    // a new world starting up (Pete): the still at least MIN_STILL, then into the live world in phosphor, then colour; a saved world: its
    // own picture (or a still, if it has none yet), straight into the live world, never the green. Play goes at once (play)
    const saved = $("backdrop")?.dataset.saved === "1";
    if (!saved && !SPECTATE && !FROM_REPLAY) introLook(true);                // (spectating, or played on from a replay: the look from the first frame)
    requestAnimationFrame(frame);
    if ($("backdrop")) setTimeout(backdropReveal, Math.max(120, MIN_STILL - performance.now()));   // the menu's picture fades into it
    else setTimeout(() => introLook(false), 1100);
    if (DEBUG) window.cx = { api, shockwave, shockMasks, send, aim, world, renderer, mobs, bones, dying, apply, get S() { return game.S; }, look(y: number, p: number) { game.yaw = y; game.pitch = p; }, play() { show(null); }, keys, panel: panelAction, salty: () => tooSalty(),
    crumble(k: string) { const e = mobs.get(k); if (e) { mobs.delete(k); bones.start(e.model, 0, 0, performance.now(), { lying: true, colors: (DUST as Record<string, number[]>)[e.kind] || DUST.any }); } },
    setLook: (a: string) => setLook(a), camD(d: number) { renderState.camD = d; }, chest(r: number, c: number, before: Inventory, after: Inventory) { chestOpen(r, c); setTimeout(() => game.hud.loot(before, after, botFast()), 800); } };
  } catch (e) {
    $("loading")!.classList.add("err"); $("start-status")!.classList.add("done");
    $("loading")!.textContent = net.local ? "Can't start the game engine in this browser: " + (e as Error).message
      : "Can't reach the game server at " + net.base + ". Remove ?server= from the address to play in the browser.";
    console.error(e);
  }
})();
