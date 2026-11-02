// Other worlds (the bot, watching, servers), My Worlds, the ask box, and the death screen's retry.
import { clearEntities } from "../hud/buttons";
import { local } from "../../../js/local";
import { net, renderServers, addServer, renderWorlds, panelHooks } from "../../../js/net";
import { $ } from "../../core/shared";
import { api, flat, game } from "../../core/game";
import { apply } from "../../core/apply";
import { simCaption } from "../../looks/phosphor/caption";
import { FADE_MS, lookState } from "../../looks/looks";
import { look, SIM_LOOK } from "../../looks/registry";
import { leaveSkin, savedLook, setLook, syncLooks } from "../../views/views";
import { flash } from "../hud/hint";
import { capOn, grab, letGo, noCapture, play, playing, screens, show } from "./screen";
import { syncMirrors } from "./help";
import type { GameState } from "../../core/types";

const msg = (e: unknown) => (e as Error).message;
const input = (id: string) => $(id) as HTMLInputElement;

// ---------- other worlds: auto mode, bot worlds, watching ----------
export let applyMs = 0;                                                              // what an apply costs here (a moving average)
export async function poll() {                                                     // a world someone else drives: ask what changed
  game.inflight = true; game.lastSend = performance.now();
  try { const s = await api<GameState & { same?: boolean }>("/api/state" + (game.S ? "?since=" + game.S.t : "")); if (!s.same) { const t = performance.now(); apply(s); applyMs = 0.7 * applyMs + 0.3 * (performance.now() - t); } }
  catch (e) { flash("Server error: " + msg(e)); }
  finally { game.inflight = false; }
}
export async function control(body: { control: string }) { try { apply(await api("/api/control", body)); return true; } catch (e) { flash(msg(e)); return false; } }
export async function toggleAuto() {
  if (!game.S) return;
  if (!game.S.world) { flash("This game server has no bots, so auto mode is off. Play in the browser to use the bots"); return; }
  if (!game.S.world.you) { flash("You're watching someone else's world"); return; }
  const on = game.S.world.control !== "bot";
  document.querySelectorAll<HTMLElement>("#seg-who button").forEach((b) => b.classList.toggle("on", (b.dataset.who === "bot") === on));   // lit at once, not after the weights load (Pete)
  if (!(await control({ control: on ? "bot" : "human" }))) { syncLooks(); return; }        // (refused: back as it was)
  flash(on ? "The bot is playing your world (P to take over)" : "You have control");
  if (on) letGo(); else if (playing() && !noCapture() && capOn()) grab(false);         // may be refused (no click): the next click takes it                // the cursor is yours to click with while the bot plays
}
export async function openWorld(id: string | null) {                                              // watch (or open your own) world by id; null = your own
  net.world = id; clearEntities(); game.S = null; game.hud.seen = null;           // a different world: its old achievements are no news
  history.replaceState(null, "", location.pathname + "?" + [net.base && "server=" + encodeURIComponent(net.base), id && "watch=" + id].filter(Boolean).join("&"));
  apply(await api("/api/state")); play();
}
panelHooks.pace = async (body) => { try { apply(await api("/api/pace", body)); } catch (e) { flash(msg(e)); } };
panelHooks.toggle = toggleAuto;
panelHooks.home = () => openWorld(null);
$("btn-botworld")!.onclick = async () => {
  try { const s = await api("/api/worlds", { name: "Bot world" }); net.world = s.world!.id; await openWorld(s.world!.id); }
  catch (e) { flash(msg(e)); }
};
$("btn-watch")!.onclick = async () => { show("worlds"); try { await renderWorlds((id) => openWorld(id)); } catch (e) { $("worlds-list")!.textContent = msg(e); } };
$("btn-worlds-back")!.onclick = () => show("start");
$("btn-servers")!.onclick = () => { show("servers"); renderServers(); };
$("btn-servers-back")!.onclick = () => show("start");
$("btn-server-add")!.onclick = () => { const v = input("server-url").value; if (v) addServer(v); };
$("btn-respawn")!.onclick = $("btn-new")!.onclick;
$("btn-dead-menu")!.onclick = () => show("start");                          // the death screen's way to the main menu (Pete)
// My Worlds' last row: a seed box, then New World; with a seed typed in, the button becomes Play Seed and makes that world (the
// same seed always makes the same world: JAX's PRNGKey(seed), as on the leaderboard); empty, a random one
$("btn-saves-new")!.onclick = async () => {
  const v = input("seed-in").value.replace(/[\s,.\-_]/g, "");            // 1,162,770,148 as shown, or plain digits
  if (!v) return ($("btn-new")!.onclick as () => Promise<void>)();
  if (!/^\d{1,10}$/.test(v) || +v > 2147483647) { flash("A seed is a whole number from 0 to 2147483647"); $("seed-in")!.focus(); return; }
  try { apply(await api("/api/reset", { seed: +v })); clearEntities(); play(); input("seed-in").value = ""; ($("seed-in")!.oninput as () => void)(); } catch (e) { flash(msg(e)); }
};
$("seed-in")!.oninput = () => ($("btn-saves-new")!.textContent = input("seed-in").value.trim() ? "Play Seed" : "New World");
$("seed-in")!.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") $("btn-saves-new")!.click(); };
// My Worlds (playing in the browser): every world autosaves (local.ts) until it dies (permadeath); the list opens them
export const ago = (ms: number) => { const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; };
export const esc = (x: unknown) => String(x).replace(/[&<>"]/g, (c) => "&#" + c.charCodeAt(0) + ";");
export async function renderSaves() {
  const box = $("saves-list")!; box.textContent = "…";
  const list = await local.saves();
  // one row a world, where it got to (autosaved; a death ends it): its name and how far it got on one line, Open and ✕ on the
  // right; under it the seed, to copy
  box.innerHTML = list.length ? list.map((w) => `<div class="srow${w.current ? " here" : ""}">${w.thumb ? `<img class="thumb" src="${w.thumb}" alt="">` : '<div class="thumb"></div>'}<div class="sinfo">`
    + `<div class="sline"><b>${esc(w.name)}</b>${w.current ? ' <span class="tag">playing</span>' : ""}`
    + ` <span class="st">${esc(w.floor)} · score ${w.score} · ${w.steps} steps · ${ago(w.updated)}${w.old ? " · older version" : ""}</span></div>`
    + `<div class="sline"><span class="seed" title="this world's seed: the same seed always makes the same world">Seed ${fmtSeed(w.seed)}</span>`
    + `<button class="mc small copy" data-copy="${w.seed}" title="Copy the seed: anyone can play this world from the start with it">Copy seed</button></div></div>`
    + `<div class="acts">${w.current ? `<button class="mc small" data-play>Play</button>` : `<button class="mc small" data-open="${w.id}"${w.old ? " disabled" : ""}>Open</button>`}`
    + `${w.current ? `<button class="mc small" data-kill="${w.id}" title="End this world">✕</button>` : `<button class="mc small" data-del="${w.id}" title="Forget this world">✕</button>`}</div></div>`).join("")
    : "No worlds yet.";
  box.querySelectorAll<HTMLElement>("[data-open]").forEach((b) => (b.onclick = () => enterSave(() => local.open(b.dataset.open!))));
  box.querySelectorAll<HTMLElement>("[data-copy]").forEach((b) => (b.onclick = () => copySeed(b.dataset.copy!, b)));
  box.querySelectorAll<HTMLElement>("[data-play]").forEach((b) => (b.onclick = () => play()));   // the world you're in: back to it
  box.querySelectorAll<HTMLElement>("[data-kill]").forEach((b) => (b.onclick = async () => {    // ✕ on it: end it for good, a new world in its place
    const w = list.find((x) => x.id === b.dataset.kill)!;
    if (!(await ask(`End ${esc(w.name)}?`, `${esc(w.floor)} · score ${w.score} · ${w.steps} steps. It's gone for good, and a new world starts in its place.`, "End it", "Keep"))) return;
    try { const s = await local.kill(); clearEntities(); game.S = null; game.hud.seen = null; apply(s); } catch (e) { flash(msg(e)); }
    renderSaves();
  }));
  box.querySelectorAll<HTMLElement>("[data-del]").forEach((b) => (b.onclick = async () => {   // ✕ asks first
    const w = list.find((x) => x.id === b.dataset.del)!;
    if (await ask(`Forget ${esc(w.name)}?`, `${esc(w.floor)} · score ${w.score} · ${w.steps} steps. It's gone for good: its seed ${fmtSeed(w.seed)} only starts it over.`, "Forget", "Keep"))
      { await local.remove(w.id); renderSaves(); }
  }));
}
// a question in the game's own style, over everything: resolves true for yes; Esc or a click beside it is no
export function ask(title: string, text: string, yes: string, no: string) {
  return new Promise<boolean>((done) => {
    const pop = document.createElement("div");
    pop.className = "ask";
    pop.innerHTML = `<div class="menu"><h1 style="font-size:30px">${title}</h1><p>${text}</p>`
      + `<div class="pair"><button class="mc" data-yes>${yes}</button><button class="mc" data-no>${no}</button></div></div>`;
    const end = (v: boolean) => { pop.remove(); removeEventListener("keydown", key, true); done(v); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); end(false); } };
    pop.onclick = (e) => { if (e.target === pop) end(false); };
    pop.querySelector<HTMLElement>("[data-yes]")!.onclick = () => end(true);
    pop.querySelector<HTMLElement>("[data-no]")!.onclick = () => end(false);
    addEventListener("keydown", key, true);
    document.body.append(pop);
    pop.querySelector<HTMLElement>("[data-no]")!.focus();
  });
}
export async function enterSave(how: () => Promise<GameState>) {
  try { const s = await how(); clearEntities(); game.S = null; game.hud.seen = null; apply(s); play(); }
  catch (e) { flash(msg(e)); }
}
// a seed as shown (1,162,770,148), and to the clipboard as plain digits (the button shows ✓ for a moment)
export function fmtSeed(seed: number | string) { return String(seed).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
export function copySeed(seed: number | string, btn: HTMLElement) {
  const done = () => { const was = btn.textContent; btn.textContent = "✓"; setTimeout(() => (btn.textContent = was), 1200); };
  navigator.clipboard.writeText(String(seed)).then(done, () => flash("Seed " + seed));
}
export let savesFrom = "start";                                                     // Back returns to the menu you came from
$("btn-load")!.onclick = $("btn-dead-worlds")!.onclick = (e) => {
  savesFrom = (e.currentTarget as HTMLElement).id === "btn-dead-worlds" ? "dead" : "start";
  show("saves"); renderSaves().catch((err) => ($("saves-list")!.textContent = err.message));
};
$("btn-saves-back")!.onclick = () => show(savesFrom === "dead" && game.S && game.S.done ? "dead" : "start");
// after a death: the same world again from the start (permadeath: there's no going back, only over), or copy its seed
// Try Again from the colour look in 3D (not the classic art, not a line look already): the screen flips to the simulation's look (SIM_LOOK) as the button
// goes down, the stone in green characters with it; you start again in it, and a second and a half later it fades back to colour (Pete 0e01)
export let retryPhos = false;
export let retryAt = 0;
export function retryFlash() {
  if (retryPhos || lookState.lines || lookState.skin || lookState.post || flat.picture || !game.S) return;
  retryPhos = true; retryAt = performance.now();
  crossfadeDead(() => setLook(SIM_LOOK, true));
}
// the death screen cross-fades into its new look over FADE_MS, as the world behind it does (Pete: Try again jumped the gravestone to
// phosphor at once): a view transition of that screen alone (index.html html.vt-dead), the rest of the page live and untouched
export function crossfadeDead(fn: () => void) {
  if (!document.startViewTransition || screens.screen !== "dead") { fn(); return; }
  document.documentElement.classList.add("vt-dead");
  try { document.startViewTransition(fn).finished.finally(() => document.documentElement.classList.remove("vt-dead")); }
  catch { document.documentElement.classList.remove("vt-dead"); fn(); }
}
// (not on pointerdown any more: a view transition takes the page's clicks while it runs, and would have eaten this one)
$("btn-retry")!.addEventListener("pointerleave", (e) => {                // pressed, then dragged off without letting go: back to colour
  if (e.buttons && retryPhos && screens.screen === "dead") { retryPhos = false; leaveSkin("color"); }
});
$("btn-retry")!.onclick = async () => {
  if (!game.S) return;
  retryFlash();
  const wait = FADE_MS - (performance.now() - retryAt);                    // let the cross-fade finish before the new world
  if (retryPhos && wait > 0) await new Promise((r) => setTimeout(r, wait));
  try { apply(await api("/api/reset", { seed: game.S!.seed })); clearEntities(); play(); } catch (e) { flash(msg(e)); }
  // in the green of the new world's first moments, typed out as after the win (Pete): which simulation this is, every game so far
  if (game.S && game.S.games) simCaption(`Simulation #${game.S.games.toLocaleString("en-US")}`, 2600, "12%");
  // (back into the look you were playing in, Pete, not always colour)
  if (retryPhos) setTimeout(() => { retryPhos = false; const want = savedLook()?.look || "color"; if (lookState.skin && want !== SIM_LOOK) { leaveSkin(look(want) || want === "original" || want === "crystal" ? want : "color"); $("pcap")?.classList.add("white"); } }, 1500);   // (the caption turns white with the world, Pete)
};
$("btn-dead-seed")!.onclick = (e) => game.S && copySeed(game.S.seed, e.currentTarget as HTMLElement);
$("btn-help")!.onclick = () => { syncMirrors(); show("help"); };
