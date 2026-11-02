// Plugins a player adds themselves (Settings → World → "Add plugin…"), on top of the ones built in from craftax.config.ts: an address
// (https, or http on localhost while you write one) or a .js file chosen from disk (its text kept in the browser). Either is an ES module
// whose default export is a Plugin (or a list of them), self-contained (no "craftax-3d/…" or "three" imports: those only resolve in a
// build; three.js comes as host.three).
// The list is saved per player (localStorage "craftax3d.plugins") and loaded at boot, before the first world is built, so a theme or set
// pieces apply from the start; adding or removing one reloads the page.
// A plugin runs as the page itself: it can read your saved worlds and settings and send them anywhere. So it is only ever added by
// hand here, never from a link (no ?plugin=), and ?noplugins boots without them (a plugin that breaks the game can still be removed).
import { registerPlugins, type Plugin } from "./plugins";
import "../../plugin";                                                        // (host.kit: what a plugin added by hand gets from the game)

const KEY = "craftax3d.plugins";

/** One added plugin: an address, or a file's name and text. */
export type UserPlugin = { url: string } | { file: string; code: string };
export const pluginLabel = (p: UserPlugin): string => ("url" in p ? p.url : p.file);

export function savedPlugins(): UserPlugin[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((p) => p && (typeof p.url === "string" || (typeof p.file === "string" && typeof p.code === "string"))) : [];
  } catch { return []; }
}
function save(list: UserPlugin[]): boolean {
  try { localStorage.setItem(KEY, JSON.stringify(list)); return true; } catch { return false; }
}

/** https anywhere, or http on this page's own machine (a plugin served from localhost while you write it). */
export function pluginUrl(text: string): URL | null {
  let u: URL;
  try { u = new URL(text.trim(), location.href); } catch { return null; }
  if (u.protocol === "https:") return u;
  if (u.protocol === "http:" && (u.host === location.host || ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname))) return u;
  return null;
}

const isPlugin = (p: unknown): p is Plugin => {
  const o = p as Plugin | null;
  return !!o && typeof o.name === "string" && Array.isArray(o.provides) && typeof o.setup === "function";
};
async function fetchPlugins(p: UserPlugin): Promise<Plugin[]> {
  const blob = "code" in p ? URL.createObjectURL(new Blob([p.code], { type: "text/javascript" })) : null;
  try {
    const mod = await import(/* @vite-ignore */ blob ?? (p as { url: string }).url);
    const list = [mod.default].flat();
    if (!list.length || !list.every(isPlugin)) throw new Error("its default export isn't a plugin ({ name, provides, setup })");
    return list;
  } finally { if (blob) URL.revokeObjectURL(blob); }
}

/** Boot: register the saved plugins. One that won't load or set up is logged and skipped; it stays listed (Settings removes it). */
export async function loadUserPlugins(): Promise<void> {
  if (/[?&]noplugins\b/.test(location.search)) return;
  for (const p of savedPlugins()) {
    try { registerPlugins(await fetchPlugins(p)); } catch (e) { console.error(`[craftax-3d] plugin ${pluginLabel(p)} didn't load`, e); }
  }
}

/** Check it really is a plugin, then keep it and reload. Returns what went wrong ("" when the page is reloading). */
async function add(p: UserPlugin): Promise<string> {
  const list = savedPlugins().filter((q) => !("code" in p) || pluginLabel(q) !== p.file);   // a file chosen again replaces its old copy (an edited plugin)
  if (list.some((q) => pluginLabel(q) === pluginLabel(p))) return "Already added";
  try { await fetchPlugins(p); } catch (e) { return "Couldn't load it: " + (e instanceof Error ? e.message : String(e)); }
  if (!save([...list, p])) return "No room to keep it in this browser";
  location.reload();
  return "";
}
export function addPluginUrl(text: string): Promise<string> {
  const u = pluginUrl(text);
  return u ? add({ url: u.href }) : Promise.resolve("Needs an https:// address (or http://localhost)");
}
export async function addPluginFile(f: File): Promise<string> {
  return add({ file: f.name, code: await f.text() });
}
export function removePlugin(label: string): void {
  save(savedPlugins().filter((p) => pluginLabel(p) !== label));
  location.reload();
}
