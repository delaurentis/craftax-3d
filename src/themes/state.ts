// The themes installed (plugins' "theme" slot), the one the player picked (saved: localStorage "craftax3d.theme"), and what is on
// screen now: the theme being left (from), the one coming in (to) and each tile's progress between them (p: 0 from … 1 to). Tiny on
// purpose, with no imports from the game, so the shader setup, the models and the sky can all read it.
import { listed } from "../core/plugins";
import { activeScene } from "../scenes/active";
import type { CreatureStyle, Theme, TrunkBase } from "./types";

export const THEME_KEY = "craftax3d.theme";
/** The installed themes, in the order T cycles them (after Standard). */
export const themes = (): readonly Theme[] => listed("theme");
export const themeById = (id: string | null | undefined): Theme | null => (id ? themes().find((t) => t.id === id) ?? null : null);
/** The theme the scene on (?scene=) starts its worlds in, whatever the player's setting, Surprise me too (Pete): { t } (null:
 *  Standard), or undefined with no scene, a scene that names none, or one naming a theme not installed. */
export function sceneTheme(): { t: Theme | null } | undefined {
  const id = activeScene()?.theme;
  if (id === "standard") return { t: null };
  const t = themeById(id);
  return t ? { t } : undefined;
}
/** The theme a player starts in: the scene's (sceneTheme), else the one they picked last (saved), else the newest plugin's that asks to be the default, else
 *  Standard (Surprise me's, the default, is each world's own: ui.ts surpriseWorld). */
export function savedTheme(): Theme | null {
  const sc = sceneTheme();
  if (sc) return sc.t;
  let v: string | null = null;
  try { v = localStorage.getItem(THEME_KEY); } catch {}
  if (v === "standard" || v === SURPRISE) return null;                // (Surprise me: each world picks its own as it starts, ui.ts)
  return themeById(v) ?? [...themes()].reverse().find((t) => t.default) ?? null;
}
export function saveTheme(t: Theme | null): void { try { localStorage.setItem(THEME_KEY, t ? t.id : "standard"); } catch {} }
export const themeLabel = (t: Theme | null): string => (t ? t.label : "Standard");
/** Told each time the theme on screen is set, however (transition.ts): the theme button follows it (ui.ts). */
export const themeShown = { fn: () => {} };

// Surprise me (Pete): each world's theme picked at random by its seed, out of Standard and the themes installed, so the same world
// (a retry, or loading it again) gets the same one until the themes installed change. A theme the player picks in a world while
// it's on is kept for that world (by seed and the themes installed; the last 50 worlds) and Surprise me stays on for the next.
export const SURPRISE = "surprise";
const SURPRISE_KEY = "craftax3d.theme.surprise", FIRST_KEY = "craftax3d.firstWorld";
/** A world starting (ui.ts surpriseWorld, whatever the theme setting): the player's very first one remembered, by its seed. */
export function noteWorld(seed: number): void { try { if (localStorage.getItem(FIRST_KEY) === null) localStorage.setItem(FIRST_KEY, String(seed)); } catch {} }
const firstWorld = (seed: number): boolean => { try { return localStorage.getItem(FIRST_KEY) === String(seed); } catch { return false; } };
/** Surprise me: picked, or (Pete) by default, with nothing picked yet and no theme asking to be the default. */
export function surpriseOn(): boolean {
  if (sceneTheme()) return false;                                      // (a scene's own theme wins)
  let v: string | null = null;
  try { v = localStorage.getItem(THEME_KEY); } catch {}
  return v === SURPRISE || (v === null && !themes().some((t) => t.default));
}
export function saveSurprise(): void { try { localStorage.setItem(THEME_KEY, SURPRISE); localStorage.removeItem(SURPRISE_KEY); } catch {} }
const installedIds = (): string => themes().map((t) => t.id).join(",");
type Kept = { seed: number; ids: string; id: string | null };
const kept = (): Kept[] => { try { const v = JSON.parse(localStorage.getItem(SURPRISE_KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; } };
/** Surprise me's theme for the world with this seed: the one picked in it, else Standard in the player's first world (Pete: the
 *  game as it is first; the surprises start with the second), else its roll. */
export function surpriseFor(seed: number): Theme | null {
  const ids = installedIds(), k = kept().find((e) => e.seed === seed && e.ids === ids);
  if (k) return themeById(k.id);
  if (firstWorld(seed)) return null;
  const list: (Theme | null)[] = [null, ...themes()];
  let h = Math.imul(seed ^ 0x5bd1e995, 2654435761);
  for (let i = 0; i < ids.length; i++) h = Math.imul(h ^ ids.charCodeAt(i), 16777619);
  h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
  return list[(h >>> 0) % list.length];
}
/** A theme picked in the world with this seed while Surprise me is on: kept for it. */
export function keepSurprise(seed: number, t: Theme | null): void {
  const ids = installedIds(), list = [{ seed, ids, id: t?.id ?? null }, ...kept().filter((e) => e.seed !== seed)].slice(0, 50);
  try { localStorage.setItem(SURPRISE_KEY, JSON.stringify(list)); } catch {}
}

/** What's on screen. `to` is the theme picked; while a transition runs, `from` the one it leaves and `p` (rows × columns) each tile's
 *  progress; `k` the transition's progress as a whole (the sky, the HUD). Idle: from = to, p null, k 1. */
export const onScreen = {
  from: null as Theme | null,
  to: null as Theme | null,
  p: null as Float32Array | null,
  W: 0, H: 0,
  k: 1,
};
/** A tile's progress from `from` to `to` (off the map: the nearest tile's). */
export function tileP(r: number, c: number): number {
  const { p, W, H } = onScreen;
  if (!p) return 1;
  r = Math.max(0, Math.min(H - 1, Math.floor(r))); c = Math.max(0, Math.min(W - 1, Math.floor(c)));
  return p[r * W + c];
}
/** The theme a tile shows now (past halfway: the new one). */
export const themeAt = (r: number, c: number): Theme | null => (tileP(r, c) >= 0.5 ? onScreen.to : onScreen.from);
/** A creature's (or, kind "player", your) style under a theme. */
/** How far an ordinary tree's trunk sits in from its tile's edges (the theme's trunk.width; 0.2 the standard, 0.6 wide). */
export const trunkInset = (ordinary: boolean): number => { const w = ordinary ? onScreen.to?.trunk?.width : undefined; return w ? (1 - w) / 2 : 0.2; };
/** An ordinary tree's wider foot on (r, c) (the theme's trunk.base; overhead: the stub's): its inset and height, or null for none. */
export function trunkBase(ordinary: boolean, r: number, c: number, overhead = false): { inset: number; h: number } | null {
  const own = ordinary ? onScreen.to?.trunk?.base : undefined;
  let b: TrunkBase | null | undefined;
  try { b = typeof own === "function" ? own(r, c, overhead) : overhead ? null : own; } catch { b = null; }   // (a theme's bug: none)
  return b && b.width > 0 && b.height > 0 ? { inset: (1 - b.width) / 2, h: b.height } : null;
}
export const styleOf = (t: Theme | null, kind: string): CreatureStyle | undefined => (kind === "player" ? t?.player : t?.creatures?.[kind]);
