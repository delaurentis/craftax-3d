// The keyboard: every key's meaning.
import { closeWarp, ghost, godState, nuke, openWarp, setGhost, warpOpen } from "../effects/god";
import { ITEM } from "../../js/world";
import { HOTBAR, SLOT_KEYS } from "../../js/hud";
import { GOD } from "../../js/local";
import { $, A, DIRV, sound } from "../core/shared";
import { QUALITY, quality, setQuality } from "../render/quality";
import { flat, game, keys, oneShot, xDown, xUp } from "../core/game";
import { enterPortal, victory, victoryNudge } from "../effects/victory";
import { aim } from "./aim";
import { saveLook, setView, toggleLook } from "../views/views";
import { moveAction } from "./targets";
import { pathing } from "./pathing";
import { flash, isSealed, sealed } from "../ui/hud/hint";
import {
  DEBUG, botDriving, capOn, grab, letGo, locked, noCapture, pause, play, playing, saveCapture, screens, setCap, show, syncCapture,
  unlockPointer,
} from "../ui/screens/screen";
import { toggleMemory } from "../ui/hud/buttons";
import { toggleAuto } from "../ui/screens/worlds";
import { syncMirrors } from "../ui/screens/help";
import { arrowTurn } from "../ui/screens/options";
import { TAP_MS, arrowT, arrowTap, pointerState } from "./pointer";
import { typing } from "./touch";
import { openPanel } from "../ui/screens/panel";
import { fpsOn, setFps } from "../core/frame";
import { cycleTheme } from "../themes/ui";

addEventListener("keydown", (ev) => {
  const e = ev as KeyboardEvent;
  if (DEBUG && warpOpen()) { if (e.code === "Escape") closeWarp(); e.preventDefault(); return; }
  if (DEBUG && e.code === "KeyL" && !e.repeat && game.S && screens.screen === null) { e.preventDefault(); openWarp(); return; }
  // ?god, Shift+G: a ghost (Pete): you leave your body where it stands and drift free through walls, touching nothing; again: back in it
  if (GOD && e.code === "KeyG" && e.shiftKey && !e.repeat && game.S && screens.screen === null) { e.preventDefault(); setGhost(!ghost); return; }
  if (e.code === "KeyF" && !e.shiftKey && !e.repeat && !e.metaKey && !e.ctrlKey && !typing(e.target)) { setFps(!fpsOn); return; }   // F: the frame rate on or off
  if (GOD && e.code === "KeyG" && !e.repeat && game.S && screens.screen === null) { e.preventDefault(); godState.godGlow = !godState.godGlow; flash(godState.godGlow ? "Glowing" : "Glow off"); return; }   // (G is graphics quality otherwise)
  if (GOD && e.code === "KeyN" && !e.repeat && game.S && screens.screen === null && !game.S.done) { e.preventDefault(); nuke(); return; }
  // Enter in the inventory screen (Pete): the picked card's green button (Craft, Enchant, Level up, Drink…), if it can be done now
  if ((e.code === "Enter" || e.code === "NumpadEnter") && screens.screen === "dead") { e.preventDefault(); $("btn-retry")!.click(); return; }   // dead: Enter tries again (Pete)
  if ((e.code === "Enter" || e.code === "NumpadEnter") && screens.screen === "panel") {
    e.preventDefault();
    const go = document.querySelector<HTMLButtonElement>("#panel-win .card button.go");
    if (go && !go.disabled) go.click();
    return;
  }
  if (e.code === "KeyE" && game.S && (screens.screen === null || screens.screen === "panel")) {
    if (screens.screen === "panel") play(); else openPanel(aim());
    return;
  }
  if (e.code === "KeyH" && (screens.screen === null || screens.screen === "help")) { if (screens.screen === "help") play(); else { unlockPointer(); syncMirrors(); show("help"); } return; }
  if (e.code === "Escape" && (screens.screen === "panel" || screens.screen === "help" || screens.screen === "research" || screens.screen === "settings")) { show("start"); return; }
  if (e.code === "Escape" && screens.screen === null) { pause(); return; }
  if (e.code === "Escape" && screens.screen === "start") { play(); return; }       // Esc again: close the menu, back to the game
  // P: who plays, like the head buttons in the top bar: from the game or the pause menu (which it closes, as the buttons do)
  if (e.code === "KeyP" && !e.repeat && game.S && (screens.screen === null || screens.screen === "start")) { if (screens.screen !== null) play(); toggleAuto(); return; }
  // the inventory screen up: 1 to 0, - and = pick the card of the numbered cell (the Make row at a table, else potions and magic)
  if (screens.screen === "panel" && !e.repeat) {
    const k = e.code.startsWith("Digit") ? e.code.slice(5) : e.code === "Minus" ? "-" : e.code === "Equal" ? "=" : null;
    const cell = k && document.querySelector<HTMLElement>(`#panel-win [data-pk="${k}"]`);
    if (cell) { e.preventDefault(); cell.click(); return; }
  }
  if ($("victory")!.classList.contains("on")) {                              // after a win: moving fades the words (playing on, you walk into the portal)
    victoryNudge();
    if (victory.portal && game.S && game.S.done && ["Enter", "Space", "KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) { e.preventDefault(); enterPortal(); return; }
  }
  // T: the next theme (Shift+T: the one before): how the world is drawn, never the game (src/themes); in a replay too
  if (e.code === "KeyT" && !e.repeat && !e.metaKey && !e.ctrlKey && !typing(e.target) && game.S && (screens.screen === null || screens.screen === "dead")) { cycleTheme(e.shiftKey); return; }
  // dead (Pete): the look keys still work, to see your last moments other ways: C V B the views, M the mode, G graphics, K sound
  if (screens.screen === "dead" && game.S && !e.metaKey && !e.ctrlKey && !typing(e.target)) {
    if (e.code === "KeyC" && !e.repeat) setView(flat.picture ? 2 : 1);
    if (e.code === "KeyV" && !e.repeat) setView(0);
    if (e.code === "KeyB" && !e.repeat) setView(2);
    if (e.code === "KeyM") toggleLook(e.shiftKey);
    if (e.code === "KeyK") flash(sound.toggle() ? "Sound off (K)" : "Sound on (K)");
    if (e.code === "KeyG") { setQuality((quality + 1) % QUALITY.length); flash("Graphics: " + QUALITY[quality].name); }
    return;
  }
  if (!playing()) return;
  if ((e.code === "AltLeft" || e.code === "AltRight") && !e.repeat && locked()) {   // Alt held: a free cursor, to click the panels
    e.preventDefault(); screens.altFreed = true; letGo(); return;
  }
  keys.add(e.code);
  // Shift + a move key (Pete: to wall yourself in): face that way without stepping, the view turning with you; then Space places there
  if ((e.shiftKey || (arrowTurn === "arrows" && flat.on && e.code.startsWith("Arrow"))) && !e.repeat && game.S && ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) {
    const only = new Set(keys); keys.clear(); keys.add(e.code);
    const mv = moveAction(true);
    keys.clear(); for (const k of only) keys.add(k);
    if (mv && DIRV[mv]) {
      oneShot.push({ action: A.NOOP, face: mv });
      if (!flat.on) { const want = (<Record<number, number>>{ [A.UP]: 0, [A.DOWN]: Math.PI, [A.LEFT]: Math.PI / 2, [A.RIGHT]: -Math.PI / 2 })[mv], base = pointerState.yawGoal ?? game.yaw; pointerState.yawGoal = base + Math.atan2(Math.sin(want - base), Math.cos(want - base)); }
    }
    e.preventDefault(); return;
  }
  if (e.code.startsWith("Arrow")) { e.preventDefault(); if (!e.repeat) arrowT[e.code] = performance.now(); }
  const slot = SLOT_KEYS.indexOf(e.code === "Minus" ? "-" : e.code.startsWith("Digit") ? e.code.slice(5) : "");
  if (slot >= 0 && slot < HOTBAR.length) game.hud.select(slot);
  if (e.code === "Space" || e.code === "Enter" || e.code === "NumpadEnter") { game.doHeld = true; game.spaceQueued = true; game.spaceHeld = true; e.preventDefault(); }   // Enter: Space, when nothing is up (Pete). not doQueued: a quick tap is still Space, never a click at the cursor
  if (e.code === "KeyU" && !e.repeat && screens.screen === null) {                // U: capture the mouse, or let it go (Pete), as the top bar's button
    setCap(!capOn()); syncCapture(); saveCapture();
    if (!capOn()) { letGo(); flash("Mouse free: drag to look (U captures it)"); }
    else if (botDriving()) flash("The bot is playing: take over (P) and the mouse is captured");
    else if (noCapture()) flash("Mouse capture on: it starts in first person or 3/4");
    else { grab(false); flash("Mouse captured: U or Esc lets go, hold Alt to click"); }
  }
  if (e.code === "KeyZ" && !e.repeat) game.hud.onSleep?.();                   // Z: a nap, as the Zzz button does (N dropped: one key each, Pete)
  if (e.code === "KeyR" && !e.repeat && game.S) {                                // R: rest, which Craftax only allows below full health
    if (!game.S.available || game.S.available[A.REST]) oneShot.push({ action: A.REST }); else flash("Full health: nothing to rest for");
  }
  if (e.code === "KeyQ" && game.S) {                                           // Q: up or down the ladder you stand on; off a ladder, nothing (Pete: no step spent)
    const it = game.S.items[game.S.pos[0] * game.S.size[1] + game.S.pos[1]];
    if (isSealed(game.S, it)) sealed();
    else if (it === ITEM.LADDER_UP || it === ITEM.LADDER_DOWN) oneShot.push({ action: it === ITEM.LADDER_UP ? A.ASCEND : A.DESCEND });
  }
  if (e.code === "F5") { game.third = !game.third; e.preventDefault(); saveLook(); }          // F5: first or third person (V is the view now)
  // the three views a key each, in the buttons' order on the keyboard (Pete): C Classic 2D (again: back to bird's-eye), V first-person
  // View, B Bird's-eye 3/4
  if (e.code === "KeyC" && !e.repeat) setView(flat.picture ? 2 : 1);
  if (e.code === "KeyV" && !e.repeat) setView(0);
  if (e.code === "KeyB" && !e.repeat) setView(2);
  if (e.code === "KeyM") toggleLook(e.shiftKey);                         // M for mode: color, phosphor, laser (Shift+M: back)
  if (e.code === "KeyY") toggleMemory();
  if (e.code === "KeyX" && !e.repeat) xDown();                            // X: a block ahead (hold: place and break it, again and again)
  if (e.code === "KeyK") flash(sound.toggle() ? "Sound off (K)" : "Sound on (K)");
  if (e.code === "KeyG") { setQuality((quality + 1) % QUALITY.length); flash("Graphics: " + QUALITY[quality].name); }
});
addEventListener("keyup", (ev) => {
  const e = ev as KeyboardEvent;
  keys.delete(e.code);
  // Alt let go: captured again (the Alt press still counts as your gesture; if the browser refuses, the next click on the view does it)
  if ((e.code === "AltLeft" || e.code === "AltRight") && screens.altFreed && capOn() && playing() && !botDriving() && !noCapture()) { e.preventDefault(); screens.altFreed = false; grab(false); }
  if (e.code === "Space" || e.code === "Enter" || e.code === "NumpadEnter") game.doHeld = game.spaceHeld = false;
  if (e.code === "KeyX") xUp();
  if (e.code in arrowT) { if (performance.now() - arrowT[e.code] < TAP_MS) arrowTap(e.code); delete arrowT[e.code]; }
});
addEventListener("blur", () => { keys.clear(); game.doHeld = game.spaceHeld = false; pointerState.press = null; if (pointerState.holding) { pointerState.holding = false; pathing.pending = null; } });
