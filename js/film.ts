// A replay as a video file (replay.html → Share → Make a video): every frame computed, not a recording of the screen (Pete). The
// game's clock is taken over (index.html __film), so each frame is drawn at its own moment however long it takes: the world
// (main.ts worldPicture), the HUD over it as the page lays it out (its DOM drawn through an SVG image, redrawn only when it
// changes), then encoded (WebCodecs H.264) into an MP4 (vendor/mp4-muxer). The sound is computed alongside in an
// OfflineAudioContext (sound.ts filmBegin) and encoded as AAC (Opus where AAC isn't offered). Chrome and Edge; Safari 17+ for the
// picture. A file picker first where there is one, so a long video streams to disk instead of filling memory
import { Muxer, ArrayBufferTarget, FileSystemWritableFileStreamTarget } from "../vendor/mp4-muxer/mp4-muxer.mjs";
import type { Player } from "./record";
import type { Recording } from "../src/core/types";

/** The game page's clock while filming (index.html __film): taken over, then moved frame by frame. */
interface FilmClock { t: number; start(): void; stop(): void; to(t: number): void }
/** The file picker (Chrome and Edge; not in TypeScript's DOM types yet). */
type PickerWindow = Window & { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> };
/** What the replay player's `film` (main.js) gives a video: the world's picture, and the sound computed alongside. */
// WebCodecs' audio half (Chrome, Edge, Safari 26; not in TypeScript's DOM types yet): what this file uses of it
interface AudioEncoderConfig { codec: string; sampleRate: number; numberOfChannels: number; bitrate?: number }
interface AudioChunkMeta { decoderConfig?: { codec: string; sampleRate: number; numberOfChannels: number; description?: AllowSharedBufferSource } }
interface AudioEncoderLike extends EventTarget { readonly encodeQueueSize: number; configure(c: AudioEncoderConfig): void; encode(d: AudioDataLike): void; flush(): Promise<void>; close(): void }
interface AudioDataLike { close(): void }
declare const AudioEncoder: {
  new (init: { output: (chunk: unknown, meta?: AudioChunkMeta) => void; error: (e: Error) => void }): AudioEncoderLike;
  isConfigSupported(c: AudioEncoderConfig): Promise<{ supported?: boolean }>;
};
declare const AudioData: new (init: { format: string; sampleRate: number; numberOfFrames: number; numberOfChannels: number; timestamp: number; data: BufferSource }) => AudioDataLike;
type Film = { canvas: HTMLCanvasElement; world(c: HTMLCanvasElement): HTMLCanvasElement; begin(sec: number): unknown; to(sec: number): Promise<unknown>; end(): Promise<AudioBuffer | null> };

export const FPS = 30;
const SHORT = 1080;                                                    // the short side: 1920 × 1080, or 1080 × 1920 in portrait
const SECRET = "No spoilers. The rest is secret…";                    // (replay.html's ending for a recording cut at the boss)
const even = (x: number) => Math.max(2, Math.round(x / 2) * 2);
const tick = () => new Promise<void>((ok) => { const c = new MessageChannel(); c.port1.onmessage = () => ok(); c.port2.postMessage(0); });   // (not slowed in a background tab)

export const canFilm = () => typeof VideoEncoder === "function" && typeof VideoFrame === "function";

// where it goes: a file chosen now (inside the click: the picker needs it), or null (kept in memory, then downloaded)
export async function pickFile(name: string) {
  if (!(window as PickerWindow).showSaveFilePicker) return null;
  const h = await (window as PickerWindow).showSaveFilePicker!({ suggestedName: name, types: [{ description: "MP4 video", accept: { "video/mp4": [".mp4"] } }] });
  return h.createWritable();
}

async function videoConfig(width: number, height: number) {
  for (const codec of ["avc1.640028", "avc1.4d0028", "avc1.42e028", "avc1.640033"]) {
    const c: VideoEncoderConfig = { codec, width, height, bitrate: 8e6, framerate: FPS, latencyMode: "quality", avc: { format: "avc" } };
    try { if ((await VideoEncoder.isConfigSupported(c)).supported) return c; } catch {}
  }
  return null;
}
async function audioConfig() {
  if (typeof AudioEncoder !== "function") return null;
  for (const [codec, mux] of [["mp4a.40.2", "aac"], ["opus", "opus"]]) {
    const c: AudioEncoderConfig = { codec, sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 };
    try { if ((await AudioEncoder.isConfigSupported(c)).supported) return { c, mux }; } catch {}
  }
  return null;
}

// AAC's 2-byte AudioSpecificConfig for the muxer. Chrome on a Mac hands back the whole MPEG-4 ES descriptor (AudioToolbox's magic
// cookie) as the description, and the muxer wraps it again: players then read 0 channels and the video plays silent (Pete). The
// config is the descriptor's DecoderSpecificInfo (tag 5); none found: AAC-LC, 48 kHz, stereo (0x11 0x90)
function aacConfig(desc: AllowSharedBufferSource | undefined) {
  const b = desc ? new Uint8Array(desc instanceof ArrayBuffer ? desc : (desc as ArrayBufferView).buffer.slice((desc as ArrayBufferView).byteOffset, (desc as ArrayBufferView).byteOffset + (desc as ArrayBufferView).byteLength)) : new Uint8Array();
  if (b.length && b[0] !== 0x03) return b;                            // (a bare config already)
  let i = 0;
  const len = () => { let n = 0; for (let k = 0; k < 4 && i < b.length; k++) { const x = b[i++]; n = (n << 7) | (x & 0x7f); if (!(x & 0x80)) break; } return n; };
  try {
    if (b[i++] !== 0x03) throw 0; len();
    i += 2; const fl = b[i++];                                        // ES_ID, flags (dependsOn, URL, OCR stream)
    if (fl & 0x80) i += 2; if (fl & 0x40) i += 1 + b[i]; if (fl & 0x20) i += 2;
    if (b[i++] !== 0x04) throw 0; len(); i += 13;                     // DecoderConfigDescriptor: type, stream, buffer, max and average rate
    if (b[i++] !== 0x05) throw 0; const n = len();
    if (n > 0 && i + n <= b.length) return b.slice(i, i + n);
  } catch {}
  return new Uint8Array([0x11, 0x90]);
}

// the hurt and drink glows round the screen's edges (index.html #hurt, #drink: an inset box-shadow, its opacity flashed), drawn here
// round the whole frame: in the foreignObject the shadow came out as a column of colour across the middle of the video (Pete)
function edgeGlow(g: CanvasRenderingContext2D, e: HTMLElement | null, k: number, W: number, H: number) {
  const op = e ? Number(e.style.opacity || 0) : 0;
  if (!(op > 0)) return;
  const m = getComputedStyle(e!).boxShadow.match(/rgba?\(([^)]+)\)\s+[-\d.]+px\s+[-\d.]+px\s+([\d.]+)px/);
  if (!m) return;
  const [r, gr, b, a = "1"] = m[1].split(",").map((x) => x.trim()), d = Number(m[2]) * k, on = `rgba(${r},${gr},${b},${a})`, off = `rgba(${r},${gr},${b},0)`;
  const side = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
    const lg = g.createLinearGradient(x0, y0, x1, y1); lg.addColorStop(0, on); lg.addColorStop(1, off); g.fillStyle = lg; g.fillRect(rx, ry, rw, rh);
  };
  g.save(); g.globalAlpha = op;
  side(0, 0, d, 0, 0, 0, d, H); side(W, 0, W - d, 0, W - d, 0, d, H); side(0, 0, 0, d, 0, 0, W, d); side(0, H, 0, H - d, 0, H - d, W, d);
  g.restore();
}
// the HUD: the game page's body (no world, no scripts) and its styles in an SVG <foreignObject>, its fonts and pictures inlined
// (an SVG image loads nothing). Animations and transitions are off: each element shows where it ends up
async function hudLayer(w: Window, world: HTMLCanvasElement) {
  const doc = w.document, files = new Map<string, Promise<string>>();
  const inline = (u: string) => {
    if (u.startsWith("data:")) return Promise.resolve(u);
    if (!files.has(u)) files.set(u, fetch(u).then((r) => r.blob()).then((b) => new Promise((ok) => { const f = new FileReader(); f.onload = () => ok(f.result as string); f.readAsDataURL(b); })).catch(() => "") as Promise<string>);
    return files.get(u)!;
  };
  let css = "";
  for (const sh of doc.styleSheets) {
    let rules: CSSRuleList; try { rules = sh.cssRules; } catch { continue; }
    let t = ""; for (const r of rules) t += r.cssText + "\n";
    for (const m of new Set([...t.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]))) {
      if (m.startsWith("data:") || m.startsWith("#")) continue;
      t = t.split(m).join(await inline(new URL(m, sh.href || doc.baseURI).href));
    }
    css += t;
  }
  css = css.replace(/:root\b/g, "html") + "\n*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent; }\nhtml, body { background: transparent !important; }";
  const xml = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const sig = () => `${doc.documentElement.className}|${doc.documentElement.style.cssText}|${doc.body.className}|${doc.body.style.cssText}|${doc.body.innerHTML}`;
  let last: string | null = null, pic: HTMLCanvasElement | null = null;
  const shown = (o: HTMLCanvasElement) => o !== world && !!o.width && !!o.height && !!o.getClientRects().length && !o.closest("#view2d, #mem-l, #mem-r")
    && (!o.checkVisibility || o.checkVisibility({ opacityProperty: true, visibilityProperty: true }));
  // the HUD's canvases (the bot's brain) change every frame without its HTML changing: they're left out of the picture (their place
  // kept) and drawn straight onto the frame where they sit, every frame (Pete: as pictures in the SVG the brain blinked or stayed black)
  const snap = async () => {
    const s = sig();
    if (s === last) return pic;
    last = s;
    const body = doc.body.cloneNode(true) as HTMLElement, cv = doc.body.querySelectorAll("canvas");
    body.querySelectorAll("canvas").forEach((c, i) => {
      const o = cv[i];
      if (!shown(o)) return c.remove();
      const box = doc.createElement("div");                            // (its place, empty: drawn over it below)
      for (const a of ["id", "class", "style"]) if (o.getAttribute(a) != null) box.setAttribute(a, o.getAttribute(a)!);
      // (its size as laid out now, pinned: the page's rules for it name canvas.brain etc. Pete: the expanded brain came out small)
      box.style.setProperty("width", o.clientWidth + "px", "important"); box.style.setProperty("height", o.clientHeight + "px", "important");
      box.style.setProperty("display", "block", "important"); box.style.setProperty("background", "transparent", "important");
      c.replaceWith(box);
    });
    for (const sel of ["script", "#view2d", "#mem-l", "#mem-r", "#hurt", "#drink"]) body.querySelectorAll(sel).forEach((e) => e.remove());   // (worldPicture draws the first; edgeGlow the glows)
    await Promise.all([...body.querySelectorAll("img")].map(async (im) => { const u = im.getAttribute("src"); if (u && !u.startsWith("data:")) im.setAttribute("src", await inline(new URL(u, doc.baseURI).href)); }));
    const W = w.innerWidth, H = w.innerHeight, html = doc.documentElement;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><foreignObject x="0" y="0" width="${W}" height="${H}">`
      + `<html xmlns="http://www.w3.org/1999/xhtml" class="${xml(html.className)}" style="${xml(html.style.cssText)}; width: ${W}px; height: ${H}px; overflow: hidden"><head><style>${xml(css)}</style></head>`
      + new XMLSerializer().serializeToString(body) + "</html></foreignObject></svg>";
    const im = new Image();
    im.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    // drawn once at the page's own size into a canvas, which is what gets scaled to the frame: the SVG itself drawn bigger left a seam
    // (a stripe down the gravestone), and laid out bigger inside it put the backgrounds and the text in different places (Pete)
    try {
      await im.decode();
      const c = document.createElement("canvas"); c.width = W; c.height = H; c.getContext("2d")!.drawImage(im, 0, 0);
      pic = c;
    } catch { pic = null; }
    return pic;
  };
  // where a canvas can show: its box cut to every ancestor that clips (a crystal's view is bigger than the panel that shows it)
  const clipOf = (o: Element) => {
    let r = o.getBoundingClientRect(), x0 = r.left, y0 = r.top, x1 = r.right, y1 = r.bottom;
    for (let e = o.parentElement; e && e !== doc.body; e = e.parentElement) {
      const st = w.getComputedStyle(e);
      if (st.overflowX === "visible" && st.overflowY === "visible" && st.clipPath === "none") continue;
      r = e.getBoundingClientRect(); x0 = Math.max(x0, r.left); y0 = Math.max(y0, r.top); x1 = Math.min(x1, r.right); y1 = Math.min(y1, r.bottom);
    }
    return { x0, y0, x1, y1 };
  };
  // the HUD onto a frame W × H: the picture, the canvases where they sit, the edge glows
  return async (g: CanvasRenderingContext2D, W: number, H: number) => {
    const p = await snap(), kx = W / w.innerWidth, ky = H / w.innerHeight;
    if (p) g.drawImage(p, 0, 0, W, H);
    for (const o of doc.body.querySelectorAll("canvas")) {
      if (!shown(o)) continue;
      const r = o.getBoundingClientRect(), c = clipOf(o);
      if (c.x1 <= c.x0 || c.y1 <= c.y0) continue;
      g.save(); g.beginPath(); g.rect(c.x0 * kx, c.y0 * ky, (c.x1 - c.x0) * kx, (c.y1 - c.y0) * ky); g.clip();
      g.drawImage(o, r.left * kx, r.top * ky, r.width * kx, r.height * ky);
      g.restore();
    }
    edgeGlow(g, doc.getElementById("drink"), kx, W, H); edgeGlow(g, doc.getElementById("hurt"), kx, W, H);
  };
}

// a screenshot (replay.html → Share → Screenshot): exactly what the frame shows now, the world and the HUD you chose under Show (the
// same layers as a video frame), at the scene's full resolution. Returns a PNG Blob
export async function screenshot({ iframe, P }: { iframe: HTMLIFrameElement; P: Player }) {
  const w = iframe.contentWindow!, film = P.film as Film;
  const world = film.world(document.createElement("canvas")), W = world.width, H = world.height;
  const out = document.createElement("canvas"); out.width = W; out.height = H;
  const g = out.getContext("2d")!;
  g.drawImage(world, 0, 0);
  g.imageSmoothingQuality = "high"; await (await hudLayer(w, film.canvas))(g, W, H);
  return new Promise<Blob>((ok, fail) => out.toBlob((b) => (b ? ok(b) : fail(new Error("no picture"))), "image/png"));
}

// the video: P the game's replay player (record.ts, in the frame `iframe`), from its trim in to its trim out. onProgress(0..1);
// stop() → true cancels. Returns a Blob (no file chosen) or null (written to the chosen file)
export async function makeVideo({ iframe, P, rec, file = null, audio = true, onProgress = () => {}, stop = () => false }: {
  iframe: HTMLIFrameElement; P: Player; rec: Recording; file?: FileSystemWritableFileStream | null; audio?: boolean; onProgress?: (k: number) => void; stop?: () => boolean;
}) {
  const w = iframe.contentWindow!, F = (w as Window & { __film?: FilmClock }).__film, film = P.film as Film | undefined;
  if (!F || !film) throw new Error("This game page can't make videos yet (reload it)");
  const iw = w.innerWidth, ih = w.innerHeight, k = SHORT / Math.min(iw, ih), W = even(iw * k), H = even(ih * k);
  const vc = await videoConfig(W, H);
  if (!vc) throw new Error("This browser can't encode H.264 video");
  const ac = audio ? await audioConfig() : null;                       // (sound off: a silent video, no audio track)
  const out = document.createElement("canvas"); out.width = W; out.height = H;
  const g = out.getContext("2d")!, shot = document.createElement("canvas");
  g.imageSmoothingQuality = "high";
  const hud = await hudLayer(w, film.canvas);

  // the secret ending (replay.html secretEnd): black over 1.6 s, then the line types out and holds
  const secret = rec.secret && P.end >= rec.dur - 1;
  const typing = [...SECRET].reduce((a, ch) => a + (ch === "." ? 380 : 70), 0), tail = secret ? 1700 + typing + 2600 : 0;
  if (secret) await document.fonts.load('20px "Craftax Pixel"').catch(() => {});
  const dur = P.end - P.start, n = Math.max(1, Math.ceil((dur / 1000) * FPS)), nTail = Math.ceil((tail / 1000) * FPS), all = n + nTail;

  const rate = P.rate, loop = P.loop;
  P.pause(); P.loop = false; P.rate = 1;
  await P.seek(P.start);
  F.start();
  const v0 = F.t;
  P.play();
  const sound = ac ? film.begin((dur + tail) / 1000 + 0.5) : false;
  const target = file ? new FileSystemWritableFileStreamTarget(file) : new ArrayBufferTarget();
  const muxer = new Muxer({ target, fastStart: file ? false : "in-memory", firstTimestampBehavior: "offset",
    video: { codec: "avc", width: W, height: H, frameRate: FPS }, ...(sound ? { audio: { codec: ac!.mux, sampleRate: 48000, numberOfChannels: 2 } } : {}) });
  let failed: Error | null = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: (e) => (failed = e) });
  venc.configure(vc);
  let frame = 0;
  const put = async () => {
    if (failed) throw failed;
    const vf = new VideoFrame(out, { timestamp: Math.round((frame * 1e6) / FPS), duration: Math.round(1e6 / FPS) });
    venc.encode(vf, { keyFrame: frame % (FPS * 2) === 0 }); vf.close();
    while (venc.encodeQueueSize > 6) await new Promise((ok) => venc.addEventListener("dequeue", ok, { once: true }));
    if (++frame % 8 === 0) { onProgress(frame / all); await tick(); }
  };
  try {
    for (let i = 0; i < n; i++) {
      if (stop()) throw new DOMException("Stopped", "AbortError");
      F.to(v0 + (i * 1000) / FPS);
      if (sound) await film.to(i / FPS);
      film.world(shot);
      g.globalAlpha = 1; g.drawImage(shot, 0, 0, W, H);
      await hud(g, W, H);
      await put();
    }
    if (nTail) {
      const last = document.createElement("canvas"); last.width = W; last.height = H; last.getContext("2d")!.drawImage(out, 0, 0);
      const px = Math.round(Math.min(W, H) * 0.035);
      for (let i = 0; i < nTail; i++) {
        if (stop()) throw new DOMException("Stopped", "AbortError");
        const t = (i * 1000) / FPS;
        g.globalAlpha = 1; g.drawImage(last, 0, 0); g.fillStyle = "#000"; g.globalAlpha = Math.min(1, t / 1600); g.fillRect(0, 0, W, H); g.globalAlpha = 1;
        let shown = 0;
        for (let u = 1700; shown < SECRET.length && u <= t; ) u += SECRET[shown++] === "." ? 380 : 70;
        if (shown) { g.fillStyle = "#ddd"; g.font = `${px}px "Craftax Pixel", monospace`; g.textAlign = "left"; g.textBaseline = "middle";
          g.fillText(SECRET.slice(0, shown), (W - g.measureText(SECRET).width) / 2, H / 2); }
        await put();
      }
    }
  } catch (e) {
    F.stop(); P.pause(); P.rate = rate; P.loop = loop;
    if (sound) await film.end();
    try { venc.close(); } catch {}
    try { if (file) await file.abort(); } catch {}
    throw e;
  }
  F.stop(); P.pause(); P.rate = rate; P.loop = loop;

  if (sound) {
    const buf = await film.end();
    if (buf) {
      const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, ac!.mux === "aac" && m?.decoderConfig ? { ...m, decoderConfig: { ...m.decoderConfig, description: aacConfig(m.decoderConfig.description) } } : m), error: (e) => (failed = e) });
      aenc.configure(ac!.c);
      const len = Math.min(buf.length, Math.round((frame / FPS) * buf.sampleRate)), L = buf.getChannelData(0), R = buf.getChannelData(1), step = 4800;
      for (let o = 0; o < len; o += step) {
        const m = Math.min(step, len - o), d = new Float32Array(m * 2);
        d.set(L.subarray(o, o + m), 0); d.set(R.subarray(o, o + m), m);
        const ad = new AudioData({ format: "f32-planar", sampleRate: buf.sampleRate, numberOfFrames: m, numberOfChannels: 2, timestamp: Math.round((o / buf.sampleRate) * 1e6), data: d });
        aenc.encode(ad); ad.close();
        if (aenc.encodeQueueSize > 20) await new Promise((ok) => aenc.addEventListener("dequeue", ok, { once: true }));
      }
      await aenc.flush(); aenc.close();
    }
  }
  await venc.flush(); venc.close();
  if (failed) throw failed;
  muxer.finalize();
  onProgress(1);
  if (file) { await file.close(); return null; }
  return new Blob([(target as InstanceType<typeof ArrayBufferTarget>).buffer], { type: "video/mp4" });
}
