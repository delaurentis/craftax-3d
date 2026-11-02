// Picking a theme: T, or the theme button beside the views (the theme on screen's icon), cycles Standard → each installed theme →
// Standard (Shift+T back), with a flash; Settings has the same choice
// beside the graphics options (only with a theme installed), with Add plugin… (src/core/user-plugins.ts) next to it. The pick is saved per player (localStorage "craftax3d.theme").
// initThemes (js/main.ts, at boot, before the first world is built) puts the themes' tiles in the atlas and the saved theme on.
import { shared } from "../render/shading/uniforms";
import { flash } from "../ui/hud/hint";
import { installThemeTiles, showSheets, themeOutlines } from "./atlas";
import { onScreen, saveSurprise, saveTheme, savedTheme, keepSurprise, noteWorld, sceneTheme, surpriseFor, surpriseOn, SURPRISE, themeLabel, themeShown, themes } from "./state";
import { STANDARD_ICON, iconHTML } from "./icon";
import { setThemeNow, switchTheme } from "./transition";
import { game } from "../core/game";
import type { Theme } from "./types";
import { addPluginFile, addPluginUrl, pluginLabel, removePlugin, savedPlugins } from "../core/user-plugins";

/** A theme picked (T, or Settings: menu). With Surprise me on, T changes only this world's (kept for it); Settings turns it off.
 *  In a scene with its own theme a pick lasts until the page reloads: the player's own setting stays as it was. */
export function pickTheme(t: Theme | null, quiet = false, menu = false): void {
  switchTheme(t);
  if (sceneTheme()) {}
  else if (!menu && surpriseOn() && game.S) keepSurprise(game.S.seed, t); else saveTheme(t);
  if (!quiet) flash("Theme: " + themeLabel(t));
  syncThemeSelect();
}
/** Settings → Surprise me: this world's theme by its seed, and each new world's from now on. */
function pickSurprise(): void {
  saveSurprise();
  const t = game.S ? surpriseFor(game.S.seed) : null;
  switchTheme(t); flash("Theme: Surprise me");
  syncThemeSelect();
}
/** A world starting (core/apply.ts: a new seed): with Surprise me on, its theme, at once (the world is built next). */
export function surpriseWorld(seed: number): void {
  noteWorld(seed);
  if (!surpriseOn()) return;
  setThemeNow(surpriseFor(seed), false); syncThemeSelect();
}
function syncThemeSelect(): void {
  const sel = document.getElementById("opt-theme") as HTMLSelectElement | null;
  if (!sel) return;
  const on = surpriseOn();
  sel.value = on ? SURPRISE : onScreen.to?.id ?? "";
}
/** T (back: Shift+T): the next theme. */
export function cycleTheme(back = false): void {
  const list: (Theme | null)[] = [null, ...themes()];
  if (list.length < 2) { flash("No themes installed"); return; }
  const i = Math.max(0, list.indexOf(onScreen.to));
  pickTheme(list[(i + (back ? list.length - 1 : 1)) % list.length]);
}
/** The theme button (Pete), after the views and looks: the theme on screen's icon; a press is T (Shift: back). */
function themeButton(): void {
  const looks = document.getElementById("looks");
  if (!looks || document.getElementById("btn-theme")) return;
  const seg = document.createElement("div"), b = document.createElement("button");
  seg.className = "seg"; seg.id = "seg-theme"; b.id = "btn-theme"; b.type = "button";
  b.onclick = (e) => { cycleTheme(e.shiftKey); b.blur(); };
  seg.append(b); looks.append(seg);
  let shown: Theme | null | undefined;
  themeShown.fn = () => {
    const t = onScreen.to;
    if (t === shown) return;
    shown = t; b.innerHTML = iconHTML(t ? t.icon : STANDARD_ICON, "thm", 20);
    const tip = "Theme (T)"; b.dataset.tip = tip; b.setAttribute("aria-label", tip);
  };
  themeShown.fn();
}
export function initThemes(): void {
  if (!themes().length) for (const el of document.querySelectorAll<HTMLElement>(".if-themes")) el.style.display = "none";   // the help's T rows: only with a theme to pick
  installThemeTiles();
  shared.uThemeOut.value = themeOutlines.tex; shared.uThemeOutOn.value = themeOutlines.on ? 1 : 0;
  const t = savedTheme();
  onScreen.from = onScreen.to = t; showSheets(t, t);
  if (themes().length) themeButton();
  // Settings → World, above Ray tracing and 3D grass, a rule under it (Pete): the theme (with one installed) and Add plugin… beside it
  const rt = document.getElementById("opt-shaders")?.closest("label");
  if (!rt || document.getElementById("opt-plugin")) return;
  const row = document.createElement("label");
  row.className = "shadow";
  if (themes().length) {
    const sel = document.createElement("select");
    row.append("Theme ", sel); sel.id = "opt-theme"; sel.autocomplete = "off";
    sel.add(new Option("Surprise me", SURPRISE));                     // (Pete: each world's theme at random, by its seed; first, the default)
    for (const th of [null, ...themes()]) sel.add(new Option(themeLabel(th), th?.id ?? ""));
    sel.onchange = () => (sel.value === SURPRISE ? pickSurprise() : pickTheme(themes().find((th) => th.id === sel.value) ?? null, false, true));
  }
  const btn = document.createElement("button"); btn.type = "button"; btn.id = "opt-plugin"; btn.className = "mc small"; btn.textContent = "More..."; btn.dataset.tip = "Theme Plugins"; btn.setAttribute("aria-label", "Theme Plugins");
  row.append(btn); row.classList.add("themerow");                   // (Pete: one line, never wrapped: the menu narrows instead)
  const note = document.createElement("small"); note.className = "optnote themenote"; note.textContent = "Press T to switch";
  // (Pete) nothing of it shows until the button is pressed, and then in its own window over Settings
  const pop = document.createElement("div"); pop.className = "plugpop"; pop.hidden = true;
  const win = document.createElement("div"); win.className = "plugwin"; win.setAttribute("role", "dialog"); win.setAttribute("aria-label", "Theme Plugins");
  const head = document.createElement("div"), title = document.createElement("h3"); head.className = "plughead"; title.textContent = "Theme Plugins";
  const close = document.createElement("button"); close.type = "button"; close.className = "x"; close.setAttribute("aria-label", "Close"); close.dataset.tip = "Close (Esc)";
  close.innerHTML = '<svg viewBox="0 0 20 20" width="20" height="20" shape-rendering="crispEdges" aria-hidden="true"><path d="M3 3h3v2h2v2h4V5h2V3h3v3h-2v2h-2v4h2v2h2v3h-3v-2h-2v-2H8v2H6v2H3v-3h2v-2h2V8H5V6H3z" fill="#fff"/></svg>';   // (Settings' own X)
  head.append(title, close);
  const box = pluginBox(); box.hidden = false;
  win.append(head, box); pop.append(win);
  const shut = () => { pop.hidden = true; btn.focus(); };
  btn.onclick = (e) => { e.preventDefault(); pop.hidden = false; box.querySelector("input")!.focus(); };
  close.onclick = shut;
  pop.onclick = (e) => { if (e.target === pop) shut(); };
  pop.onkeydown = (e) => { if (e.key === "Escape") { e.preventDefault(); shut(); } e.stopPropagation(); };   // (Esc closes this window, not Settings)
  (rt.closest("#settings") ?? document.body).append(pop);
  const rule = document.createElement("hr"); rule.className = "srule";
  rt.before(row, ...(themes().length ? [note] : []), rule);
  // (Pete) "More..." where the row has room, "..." (three dots) where the theme menu would otherwise be cut short
  const sel = row.querySelector("select");
  const ctx = document.createElement("canvas").getContext("2d")!;
  const cut = () => {                                                // (a select doesn't say: its text measured against its room)
    if (!sel || !sel.clientWidth) return false;
    const cs = getComputedStyle(sel); ctx.font = cs.font;
    return ctx.measureText(sel.options[sel.selectedIndex]?.text ?? "").width > sel.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) + 0.5;
  };
  const fit = () => { btn.textContent = "More..."; if (cut()) btn.textContent = "..."; };
  new ResizeObserver(fit).observe(row); sel?.addEventListener("change", fit);
  // (Pete) Pause while the theme changes is no longer shown: it saves no work (the world is built again a chunk a frame either way),
  // it only holds the world still. Still there for anyone who set it (localStorage "craftax3d.themePause", transition.ts)
  syncThemeSelect();
}

/** Add plugin…'s window's insides: an address or a file from disk, the warning, and the plugins added so far (each with Remove). */
function pluginBox(): HTMLElement {
  const box = document.createElement("div"); box.className = "plugbox"; box.hidden = true;
  const url = document.createElement("input"); url.type = "url"; url.placeholder = "https://…/plugin.js"; url.autocomplete = "off"; url.spellcheck = false;
  const load = document.createElement("button"); load.type = "button"; load.className = "mc small"; load.textContent = "Load";
  const pick = document.createElement("button"); pick.type = "button"; pick.className = "mc small"; pick.textContent = "Choose file…";
  const file = document.createElement("input"); file.type = "file"; file.accept = ".js,.mjs,text/javascript"; file.hidden = true;
  const msg = document.createElement("small"); msg.className = "optnote plugmsg";
  const warn = document.createElement("small"); warn.className = "optnote";
  warn.textContent = "A plugin runs as the game itself: it can read your saved worlds and send them anywhere. Only add one you trust.";
  const line = document.createElement("div"); line.className = "plugline"; line.append(url, load, pick, file);
  box.append(line, msg, warn);
  const busy = async (job: Promise<string>) => { msg.textContent = "Loading…"; msg.textContent = await job; };
  load.onclick = () => { if (url.value.trim()) busy(addPluginUrl(url.value)); };
  url.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); load.click(); } e.stopPropagation(); };   // (typing isn't playing: keys stay out of the game)
  pick.onclick = () => file.click();
  file.onchange = () => { const f = file.files?.[0]; if (f) busy(addPluginFile(f)); file.value = ""; };
  const added = savedPlugins();
  if (added.length) {
    const rule = document.createElement("hr"); rule.className = "srule";   // (the plugins you've added, under a hairline: Pete)
    const ul = document.createElement("ul"); ul.className = "pluglist";
    for (const p of added) {
      const li = document.createElement("li"), name = document.createElement("span"), x = document.createElement("button");
      name.textContent = pluginLabel(p); name.title = pluginLabel(p);
      x.type = "button"; x.className = "mc small"; x.textContent = "Remove"; x.onclick = () => removePlugin(pluginLabel(p));
      li.append(name, x); ul.append(li);
    }
    box.append(rule, ul);
    if (/[?&]noplugins\b/.test(location.search)) msg.textContent = "Started without plugins (?noplugins)";
  }
  return box;
}
