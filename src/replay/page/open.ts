// The replay page: the query (view, embed, bare, a shared id), loading the game page and a recording into it, the frame's orientation and
// fit, and the recordings kept in this browser.
import { service } from "../../core/plugins";
import { decode, download, GAME, kept } from "../../../js/record";
import { setWindow, soundOn, sync, view } from "./transport";
import { firstKey, renderKeys, sel } from "./keyframes";
import { applyShow, showNow, takeLooks } from "./side";
import { onKey } from "./video";
import type { Player } from "../../../js/record";
import type { Recording } from "../../core/types";

// this module's state that other modules set (one module can't assign another's let): rec, P
export interface OpenState {
  /** The recording open (null: the list page). */
  rec: Recording | null;
  /** The game page's replay player (its window.cxReplay), once that page is ready. */
  P: Player | null;
}
export const openState = {} as OpenState;

export const $ = (id: string) => document.getElementById(id);
// the list's backdrop: one of the game's menu pictures (index.html's #backdrop), at random
{ const ids = ["meadow-34", "trees-34-1", "trees-34-2", "trees-34-low", "trees-34-low-2", "fire-realm"], id = ids[(Math.random() * ids.length) | 0];
  $("stage")!.style.setProperty("--backdrop", `url("${new URL(`backdrops/${id}-${innerHeight > innerWidth ? "phone" : "desktop"}.webp`, GAME)}")`); }
export const q = new URLSearchParams(location.search);
// ?view: a shared link's page (Pete): a player first, the embed's layout on the whole page, playing once, with Edit replay to
// make your own copy and edit it (kept in this browser, then the editor)
// a replay shared through the host's replayStore goes by its id (a short link, not the file's address): the host's own short
// link (playcraftax.com/r/<id>), or ?r=<id> anywhere; the store says where the file itself is. A shared link opens the viewer
export const STORE = service("replayStore"), HOME = !!STORE?.isHome?.(location);
export const shortId = (location.pathname.match(/\/r\/([\w-]{16})\/?$/) || [])[1] || (/^[\w-]{16}$/.test(q.get("r") || "") ? q.get("r") : null);
export const VIEW = q.has("view") || (!!shortId && !q.has("embed") && !q.has("bare")), EMBED = q.has("embed") || q.has("bare") || VIEW, BARE = q.has("bare"), COVER = q.get("fit") === "cover";
if (EMBED) document.body.classList.add("embed");
// a phone (Pete: the editor doesn't fit): the player with play, trim and share only, everything else on a bigger screen; and the frame
// stands the way the phone does now, turning with it (not kept with the recording: a bigger screen keeps its own choice)
export const PHONE = matchMedia("(max-width: 720px), (max-height: 520px)");
const phoneNow = () => {
  const on = PHONE.matches && !EMBED, sh = $("share")!;
  document.body.classList.toggle("phone", on);
  if (on && sh.parentElement!.id !== "right2") $("right2")!.append(sh);       // Share in the bottom bar (Pete: over the picture it hid the who badge)
  else if (!on && sh.parentElement!.id === "right2") $("side")!.prepend(sh);
  if (openState.rec) sizeFrame();
};
PHONE.addEventListener?.("change", phoneNow);
if (VIEW) document.body.classList.add("view");
if (BARE) document.body.classList.add("bare");
openState.rec = null; openState.P = null; export let srcUrl = q.get("src") || (shortId && STORE?.fileUrl ? STORE.fileUrl(shortId) : null);
export const fmt = (ms: number) => { const s = Math.max(0, ms) / 1000; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, "0")}`; };

// ---------- loading: the game page at the recorded size, then the recording into it ----------
export async function open(r: Recording) {
  openState.rec = r; document.body.classList.add("loaded", "framing"); $("err")!.textContent = "";
  view.a = 0; view.b = r.dur;
  const f = $("frame") as HTMLIFrameElement, d = (r.device || { w: 1280, h: 720 }) as Device;
  sizeFrame();
  openState.P = null;
  const ready = new Promise<void>((ok) => {
    const on = (ev: Event) => { const e = ev as MessageEvent; if (e.source === f.contentWindow && e.data?.cx === "replay-ready") { removeEventListener("message", on); ok(); } };
    addEventListener("message", on);
  });
  // (the page's bare flags go on to the game: ?crystal lists the crystals there too, so a crystal's recording finds its bot and brain)
  const flags = [...q].filter(([k, v]) => v === "" && !["clean", "embed"].includes(k)).map(([k]) => "&" + encodeURIComponent(k)).join("");
  f.src = `${GAME}index.html?server=local&replay${d.touch ? "&touch=1" : ""}${q.has("clean") ? "&clean" : ""}${flags}`;
  await ready;
  openState.P = f.contentWindow!.cxReplay!;
  takeLooks(f.contentDocument?.getElementById("looks") ?? null);            // the game's live buttons: the plugin looks' too
  f.contentWindow!.addEventListener("keydown", (e) => { if (e.code === "Space" || (sel && (e.code === "Delete" || e.code === "Backspace"))) onKey(e); }, true);   // (the game in focus: Space is still the replay's)
  openState.P!.loop = EMBED && !VIEW; openState.P!.on((what) => sync(what));
  await openState.P!.load(openState.rec!);
  soundOn();                                                          // (the level now; the audio itself starts on the first click)
  openState.P!.show!(showNow()); document.body.classList.toggle("show-inv", !!openState.rec!.edits.show!.inv); document.body.classList.toggle("show-status", !!openState.rec!.edits.show!.status);
  if (!EMBED) { applyShow(); firstKey(); setWindow(0, openState.rec!.dur); }
  document.body.classList.remove("framing");
  if (EMBED) openState.P!.play();
  sync(); renderKeys();
  intro();
}
// &intro=<look>:<ms> (playcraftax's 404, Pete: open in phosphor, then into colour, as a new world does): keys over the first play's
// opening, dropped when it loops so every pass after is the recording's own look (no jump back to green); the look in view told to
// the page holding this one, which turns its caption white with the world
export function intro() {
  const [look, ms] = (q.get("intro") || "").split(":");
  const tell = Object.assign((l: string | undefined) => { if (l !== tell.last) { tell.last = l; parent.postMessage({ cx: "replay-look", look: l }, location.origin); } }, { last: undefined as string | undefined });
  if (look && +ms > 0 && !openState.rec!.edits.keys.length) {
    openState.rec!.edits.keys = [{ t: 0, look }, { t: +ms, rec: true }];
    openState.P!.seek(0).then(() => { if (EMBED) openState.P!.play(); });
    let past = false;
    openState.P!.on((what) => {
      if (what === "tick" && openState.P!.t > +ms) past = true;
      if (what === "seek" && past && openState.rec!.edits.keys.length) openState.rec!.edits.keys = [];   // (looped: the rest are the recording's own)
    });
  }
  if (parent !== window) openState.P!.on((what) => { if (what === "tick") tell(openState.P!.camAt(openState.P!.t)?.look); });
}
// Orientation (Pete): the recording plays in a 16:9 (landscape) or 9:16 (portrait) frame, the game laid out for it (portrait takes
// its phone layout), chosen on the side and kept with the recording; switching resizes the game in place. An embed takes the
// recording's choice, or &aspect=16x9 | 9x16 | adaptive (adaptive: the frame is the whole embed, whatever its shape)
// portrait is a phone's own size (Pete: its HUD, hotbar and brain were too small at 720 × 1280): the game lays itself out exactly as on a
// phone, and the frame is scaled up to fit; the game draws the scene sharp enough for a 1080 × 1920 video (main.ts resize)
/** The device a recording was made on (record.ts start): the window, and a touch screen or phone. */
export interface Device { w: number; h: number; dpr?: number; touch?: boolean; phone?: boolean }
export const SIZES: Record<string, { w: number; h: number }> = { landscape: { w: 1280, h: 720 }, portrait: { w: 405, h: 720 } };
export const ASPECT = (<Record<string, string>>{ "16x9": "landscape", "9x16": "portrait" })[q.get("aspect")!] || (q.get("aspect") === "adaptive" ? "adaptive" : null);
export const orientNow = () => {
  const rec = openState.rec!, dev = rec.device as Device | undefined;
  if (!ASPECT && !EMBED && PHONE.matches) return innerHeight > innerWidth ? "portrait" : "landscape";   // (a phone: as it stands now)
  return ASPECT || rec.edits.orient || ((dev && dev.h > dev.w) ? "portrait" : "landscape");
};
export let fs = SIZES.landscape;                                              // (the frame's size now)
export function sizeFrame() {
  const o = orientNow(), st = $("stage")!.getBoundingClientRect();
  fs = o === "adaptive" ? { w: Math.round(st.width), h: Math.round(st.height) } : SIZES[o];
  const f = $("frame")!;
  f.style.width = fs.w + "px"; f.style.height = fs.h + "px";
  document.querySelectorAll<HTMLElement>("#orient button").forEach((b) => b.classList.toggle("on", b.dataset.o === o));
  fit(); openState.P?.wake?.();
}
export function fit() {
  if (!openState.rec) return;
  const st = $("stage")!.getBoundingClientRect(), d = fs;
  const k = (COVER ? Math.max : Math.min)(st.width / d.w, st.height / d.h);
  const x = (st.width - d.w * k) / 2, y = (st.height - d.h * k) / 2;
  $("frame")!.style.transform = `translate(${x}px, ${y}px) scale(${k})`;
  // (where the frame sits, for the paused Play button: its corner, or its middle when it stands portrait)
  Object.entries({ fx: x, fy: y, fw: d.w * k, fh: d.h * k }).forEach(([n, v]) => $("stage")!.style.setProperty("--" + n, Math.round(v) + "px"));
  document.body.classList.toggle("port", d.h > d.w);
  fitAt = { y, k }; whoY();
}
// the middle of the game's human / robot badge, on the stage: the Play button sits level with it (Pete)
export let fitAt = { y: 0, k: 1 }, whoAt: number | null = null;
export function whoY() {
  const el = ($("frame") as HTMLIFrameElement).contentDocument?.getElementById("seg-who"), r = el && el.getBoundingClientRect();
  const v = r && r.height ? Math.round(fitAt.y + (r.top + r.height / 2) * fitAt.k) : null;
  if (v !== whoAt) { whoAt = v; v == null ? $("stage")!.style.removeProperty("--who-y") : $("stage")!.style.setProperty("--who-y", v + "px"); }
}
addEventListener("resize", () => (openState.rec && (orientNow() === "adaptive" || (PHONE.matches && !EMBED)) ? sizeFrame() : fit()));   // (a phone turned: the frame turns)
phoneNow();
// the recordings kept in this browser (the game's ⏺ keeps them here until you save them): open, save as a file, or forget
export async function renderKept() {
  const box = $("kept")!; box.innerHTML = "";
  let list: Recording[] = [];
  try { list = await kept.all(); } catch { return; }
  if (!list.length) return;
  box.innerHTML = `<h2>Kept in this browser</h2><div class="list"></div>`;
  const ul = box.querySelector(".list")!;
  for (const r of list) {
    const row = document.createElement("div"); row.className = "k";
    row.innerHTML = `<span>${new Date(r.created).toLocaleString()} <small>· ${fmt((r.edits.out ?? r.dur) - (r.edits.in || 0))} · seed ${r.seed}${(r.device as Device | undefined)?.touch ? " · phone" : ""}</small></span>`
      + `<button data-open>Open</button><button data-save class="dl" aria-label="Download" title="Download it as a .cxreplay file (trimmed, with its keyframes)"><svg viewBox="0 0 16 16" width="16" height="16" shape-rendering="crispEdges" aria-hidden="true" style="display:block"><path d="M7 1h2v6h4v1h-1v1h-1v1h-1v1h-1v1H7v-1H6v-1H5V9H4V8H3V7h4z" fill="currentColor"/><path d="M2 13h12v2H2z" fill="currentColor"/></svg></button><button data-x aria-label="Forget it">✕</button>`;
    row.querySelector<HTMLElement>("[data-open]")!.onclick = () => { srcUrl = null; open(r); };
    row.querySelector<HTMLElement>("[data-save]")!.onclick = () => download(r);
    row.querySelector<HTMLElement>("[data-x]")!.onclick = async () => { if (confirm("Forget this recording? It isn't saved anywhere else unless you saved it as a file.")) { await kept.del(r.id!); renderKept(); } };
    ul.append(row);
  }
}
// a kept recording's trims and camera keys are kept with it as you make them
export let keepT: ReturnType<typeof setTimeout> | 0 = 0;
export const keep = () => { if (openState.rec && openState.rec.id) { clearTimeout(keepT); keepT = setTimeout(() => kept.put(openState.rec!).catch(() => {}), 300); } };
export async function openFile(file: Blob) {
  try { srcUrl = null; await open(await decode(file)); }
  catch (e) { $("err")!.textContent = "Can't open that: " + (e as Error).message; }
}
$("pick")!.onclick = () => $("file")!.click();
$("file")!.onchange = (e) => (e.target as HTMLInputElement).files![0] && openFile((e.target as HTMLInputElement).files![0]);
addEventListener("dragover", (e) => { e.preventDefault(); document.body.classList.add("drag"); });
addEventListener("dragleave", () => document.body.classList.remove("drag"));
addEventListener("drop", (ev) => { const e = ev as DragEvent; e.preventDefault(); document.body.classList.remove("drag"); if (!EMBED && e.dataTransfer!.files[0]) openFile(e.dataTransfer!.files[0]); });
// (a link to one replay: the page stays dark while it comes, no list page or drop border first; they show only if it can't load)
document.body.classList.toggle("arriving", !!(srcUrl || q.get("open")));   // (the early guess above, settled: a bad ?r= shows the list)
if (srcUrl) fetch(srcUrl).then((r) => { if (!r.ok) throw new Error(r.status + " " + r.statusText); return r.arrayBuffer(); }).then(decode).then(open)
  .catch((e: Error) => { document.body.classList.remove("arriving"); $("err")!.textContent = `Can't load ${srcUrl}: ${e.message}`; });
