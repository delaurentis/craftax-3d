// The replay page's Share window: a file, a video, a screenshot, Play from here, putting it on the web (embed code and links), Edit replay,
// and opening a kept recording.
import "./side";
import { download, fileName, GAME, kept, share, shareHost } from "../../../js/record";
import { screenshot } from "../../../js/film";
import { config } from "../../config";
import { $, EMBED, HOME, STORE, fmt, keep, open, openState, orientNow, q, renderKept, srcUrl } from "./open";
import { playFromHere } from "./transport";
import { askPop, endKey } from "./keyframes";
import { recordVideo } from "./video";
import type { Recording } from "../../core/types";

const rec = () => openState.rec!, P = () => openState.P!;                  // (a recording is open wherever these run)
const field = (id: string) => $(id) as HTMLTextAreaElement;
const act = (what: string) => sharePop.querySelector<HTMLElement>(`[data-do="${what}"]`)!;

// ---------- Share: one icon, its choices in a window ----------
export const sharePop = $("sharepop")!;
$("share")!.onclick = () => { if (!openState.P) return; endKey(); openState.P.pause(); sharePop.classList.add("on"); };
$("share-close")!.onclick = () => sharePop.classList.remove("on");
sharePop.onclick = (e) => { if (e.target === sharePop) sharePop.classList.remove("on"); };
// Put it on the web needs a host's replay store (playcraftax.com's plugin); without one it stays on offer and points to the game's home
// site (Pete): save the file, drop it on the site's replays page, share it from there
const SITE = (config.site || "https://playcraftax.com").replace(/\/$/, ""), siteName = SITE.replace(/^https?:\/\//, "");
if (!STORE) {
  Object.assign($("embed-site")!, { href: SITE + "/replay/", textContent: siteName });
  Object.assign($("embed-go")!, { href: SITE + "/replay/", textContent: "Open " + siteName });
  $("embed-back")!.onclick = () => { embedPop.classList.remove("on"); sharePop.classList.add("on"); };   // (back to the Share window)
  $("embed-save")!.onclick = async () => download(await P().trimmed());
} else $("embed-where")!.textContent = `It's on ${STORE.label}: anyone with the link or the embed can watch it.`;
act("file").onclick = async () => { sharePop.classList.remove("on"); await download(await P().trimmed()); };
act("video").onclick = () => { sharePop.classList.remove("on"); recordVideo(); };
act("play").onclick = async (e) => {
  const sm = (e.currentTarget as HTMLElement).querySelector("small")!, was = sm.textContent;
  if (await playFromHere((m) => { sm.textContent = m; setTimeout(() => (sm.textContent = was), 4000); })) sharePop.classList.remove("on");
};
// a screenshot: the frame as it shows now, HUD and agent brain included as chosen under Show (Pete; film.ts)
act("shot").onclick = async () => {
  sharePop.classList.remove("on");
  try {
    const b = await screenshot({ iframe: $("frame") as HTMLIFrameElement, P: P() });
    const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(b), download: fileName(rec()).replace(/\.cxreplay$/, `-${fmt(P().t - P().start).replace(/[:.]/g, "-")}.png`) });
    a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  } catch (e) { console.error(e); P().shot!(); }                         // (no HUD layer: the world alone, as before)
};
// Put it on the web (Pete): the click uploads it to playcraftax.com (record.ts share: presign, S3, the verifier replays it), then
// offers the ways to use it: embed code (16:9, 9:16, or adaptive: it fills whatever box the page gives it), a link, or an MP4.
// Shared once per version: the same trims, keyframes and HUD again reuse the upload (rec.shared). A recording opened from an
// address (?src) is on the web already
export let embedAspect: string | null = null, embedHow = "code", sharing: Promise<{ id: string; url: string }> | null = null;
export const editSig = () => JSON.stringify([rec().edits.in, rec().edits.out, rec().edits.keys, rec().edits.show, rec().edits.orient]);
// the page's links: by id for one in the host's store (short), by the file's address for one hosted anywhere else (long)
export const PAGE = HOME && STORE!.page ? STORE!.page : location.origin + location.pathname.replace(/\/r\/[\w-]+\/?$/, "/replay/");
export const idOf = (src: string) => (src.match(/\/replays\/([\w-]{16})\.cxreplay$/) || [])[1] || null;
export const pageUrl = (src: string, extra = "") => { const id = idOf(src); return id ? `${PAGE}?r=${id}${extra}` : `${PAGE}?src=${encodeURIComponent(src)}${extra}`; };
export const shortLink = (src: string) => { const id = idOf(src); return id && HOME && STORE!.shortLink ? STORE!.shortLink(id) : pageUrl(src, id ? "" : "&view"); };
export function embedCode() {
  const a = embedAspect, src = srcUrl ? new URL(srcUrl, location.href).href : rec().shared!.url;
  $("embed-long")!.textContent = `${PAGE}?src=https://your-site/${fileName(rec())}&view`;
  const box = a === "16x9" ? 'width="720" height="405" style="border:0"' : a === "9x16" ? 'width="360" height="640" style="border:0"'
    : 'style="border:0; width: 100%; height: 100%; min-height: 360px"';
  field("embed-code").value = `<iframe src="${pageUrl(src, `&embed&aspect=${a}`)}" ${box} allow="autoplay; fullscreen" loading="lazy"></iframe>`;
  field("embed-link").value = shortLink(src);
  document.querySelectorAll<HTMLElement>("#embed-aspect button").forEach((b) => b.classList.toggle("on", b.dataset.a === a));
  document.querySelectorAll<HTMLElement>("#embed-how button").forEach((b) => b.classList.toggle("on", b.dataset.how === embedHow));
  embedPop.dataset.how = embedHow; $("embed-copied")!.textContent = "";
}
export const embedPop = $("embedpop")!;
export async function putOnWeb() {
  const wait = $("embed-wait")!.firstChild!;
  embedPop.classList.remove("ready", "failed");
  if (!srcUrl && !(rec().shared && rec().shared!.sig === editSig() && rec().shared!.url.includes("/replays/"))) {   // (an upload from before /replays/: again)
    const r = rec(), sig = editSig();
    try {
      wait.textContent = `Putting it on ${shareHost()}…`;
      sharing ??= share(await P().trimmed(), (step) => (wait.textContent = { asking: `Putting it on ${shareHost()}…`, uploading: "Uploading…", checking: "Checking it plays (a few seconds)…" }[step]));
      const s = await sharing;
      r.shared = { ...s, sig }; keep();
    } catch (e) {
      wait.textContent = "It couldn't go up: " + ((e as Error)?.message || e); embedPop.classList.add("failed"); return;
    } finally { sharing = null; }
    if (openState.rec !== r) return;
  }
  embedPop.classList.add("ready"); embedCode(); embedPop.querySelector<HTMLElement>(`[data-pane="${embedHow}"] .copy`)?.focus();
}
act("embed").onclick = () => {
  if (!STORE) { sharePop.classList.remove("on"); embedPop.classList.add("on", "nohost"); return; }
  embedAspect ??= orientNow() === "portrait" ? "9x16" : "16x9";
  sharePop.classList.remove("on"); embedPop.classList.add("on"); putOnWeb();
};
$("embed-retry")!.onclick = putOnWeb;
$("embed-how")!.onclick = (e) => { const b = (e.target as Element).closest("button"); if (b) { embedHow = b.dataset.how!; embedCode(); } };
$("embed-done")!.onclick = () => embedPop.classList.remove("on");
embedPop.onclick = (e) => { if (e.target === embedPop) embedPop.classList.remove("on"); };
embedPop.querySelectorAll<HTMLElement>(".copy").forEach((b) => (b.onclick = async () => {
  const ta = field(embedHow === "link" ? "embed-link" : "embed-code");
  try { await navigator.clipboard.writeText(ta.value); } catch { ta.select(); document.execCommand("copy"); }
  $("embed-copied")!.textContent = "Copied";
}));
// Edit replay (a shared link's page): a copy of it kept in this browser, its edits as they were, then the editor on that copy; it
// remembers where it came from, so sharing it unchanged gives the same link
$("edit-replay")!.onclick = async () => {
  if (!openState.rec) return;
  const r: Recording = { ...structuredClone(openState.rec), id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6) };
  const abs = new URL(srcUrl!, location.href).href, m = abs.match(/\/replays\/([\w-]{16})\.cxreplay$/);
  if (m) r.shared = { id: m[1], url: abs, sig: JSON.stringify([r.edits.in, r.edits.out, r.edits.keys, r.edits.show, r.edits.orient]) };
  try { await kept.put(r); } catch (e) { return void askPop("Can't edit it here", "This browser won't keep a copy (private window?).", "OK"); }
  location.href = `${location.pathname}?open=${r.id}`;
};
$("embed-open")!.onclick = () => window.open(field("embed-link").value, "_blank", "noopener");
$("embed-mp4")!.onclick = () => { embedPop.classList.remove("on"); recordVideo(); };
$("embed-aspect")!.onclick = (e) => { const b = (e.target as Element).closest("button"); if (b) { embedAspect = b.dataset.a!; embedCode(); } };
$("close")!.onclick = () => { endKey(); openState.rec = null; openState.P = null; ($("frame") as HTMLIFrameElement).src = "about:blank"; document.body.classList.remove("loaded", "framing", "arriving"); renderKept(); };   // (arriving: a shared link opened it; the list must show, not a black page)
if (!EMBED && !srcUrl) renderKept().then(async () => {                // ?open=<id>: straight into a kept recording (the game's "Watch it")
  const id = q.get("open"); if (!id) return;
  const r = await kept.get(id).catch(() => null);
  if (r) open(r); else document.body.classList.remove("arriving");
});
$("back")!.onclick = $("back2")!.onclick = () => { location.href = GAME.href; };
