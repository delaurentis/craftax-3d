// Phosphor's gravestone and its heap of earth, redrawn in characters, and the stone's character tile (--code-tile).
import * as THREE from "three";
import { $ } from "../../core/shared";

// phosphor's gravestone, the stone's own picture in characters (Pete 0e01): its layers (index.html .tomb .stone: the light, the cracks,
// the grain, the checker speckle, the lit and shaded edges) painted onto a canvas the stone's size, then each 4 x 6 px cell redrawn as
// one green character, heavier and brighter where the stone is lighter. The layers' places mirror the stylesheet's
export async function codeStone() {
  const el = document.querySelector<HTMLElement>("#tomb .stone")!, W = el.offsetWidth, H = el.offsetHeight;
  if (!W || !H || $("tomb")!.classList.contains("plain")) { el.classList.remove("coded"); return; }
  codeMound();                                                             // the heap first: it needs nothing from the stone
  // the layers as the colour look draws them: in phosphor the stylesheet swaps them for one character tile, so a death already in
  // phosphor found one layer, not six, and gave up, the heap with it (Pete 4348). Off and on again before anything paints
  const ph = document.body.classList.contains("phosphor");
  if (ph) document.body.classList.remove("phosphor");
  const urls = [...getComputedStyle(el).backgroundImage.matchAll(/url\("([^"]*)"\)/g)].map((m) => m[1]);
  if (ph) document.body.classList.add("phosphor");
  if (urls.length < 6) return;
  const im = await Promise.all(urls.slice(0, 6).map((u) => { const i = new Image(); i.src = u; return i.decode().then(() => i); })).catch(() => null);
  if (!im) return;
  const pic = Object.assign(document.createElement("canvas"), { width: W, height: H }), g = pic.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  for (let y = 0; y < H; y += 4) for (let x = 0; x < W; x += 4) { g.fillStyle = ((x >> 2) + (y >> 2)) % 2 ? "#878787" : "#8f8f8f"; g.fillRect(x, y, 4, 4); }   // the checker speckle
  for (let y = 0; y < H; y += 30) for (let x = 0; x < W; x += 30) g.drawImage(im[5], x, y, 30, 30);                           // the grain
  g.drawImage(im[4], 62, 40, 18, 15); g.drawImage(im[3], W - 30 - 21, H - 6 - 24, 21, 24);                                    // the cracks
  g.drawImage(im[2], 0, 118, 33, 27); g.drawImage(im[1], W - 52 - 42, 12, 42, 60);
  g.drawImage(im[0], 0, 0, 320, 320);                                                                                          // the light
  g.fillStyle = "#b6b2aa"; g.fillRect(0, 0, 6, H); g.fillStyle = "#4c4b50"; g.fillRect(W - 6, 0, 6, H); g.fillRect(0, H - 6, W, 6);   // the edges
  const px = g.getImageData(0, 0, W, H).data, CW = 4, CH = 6, K = 2, ramp = " .:-=+*o#%@";
  const out = Object.assign(document.createElement("canvas"), { width: W * K, height: H * K }), o = out.getContext("2d")!;
  o.fillStyle = "#020a04"; o.fillRect(0, 0, out.width, out.height);
  o.font = `600 ${CH * K}px ui-monospace, Menlo, monospace`; o.textAlign = "center"; o.textBaseline = "middle";
  for (let cy = 0; cy + CH <= H; cy += CH) for (let cx = 0; cx + CW <= W; cx += CW) {
    let L = 0;
    for (let y = cy; y < cy + CH; y++) for (let x = cx; x < cx + CW; x++) { const i = (y * W + x) * 4; L += 0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]; }
    const t = THREE.MathUtils.clamp((L / (CW * CH * 255) - 0.26) / 0.48, 0, 1), k = 0.16 + 0.42 * t;   // dim, so the engraved words stand out (Pete 8651)
    o.fillStyle = `rgb(${(48 * k) | 0},${(255 * k) | 0},${(97 * k) | 0})`;
    o.fillText(ramp[Math.round(t * (ramp.length - 1))], (cx + CW / 2) * K, (cy + CH / 2) * K);
  }
  el.style.setProperty("--tomb-code", `url(${out.toDataURL()})`);
  el.classList.add("coded");
}
// and the heap of earth in front of it (Pete 8651): its 90 x 7 pixel picture (index.html --tomb-dirt, shown at 4 px a pixel) as
// characters too, one a 4 x 7 px cell, only where the heap is (its stepped ends stay clear)
// (Pete c11b: still green dirt; reading the picture back through the computed style and an image decode failed somewhere unseen, so
// the heap is redrawn here from index.html's own recipe, the same stepped heap and hashed clods, nothing read back)
export function moundPicture() {
  const DW = 90, DH = 7, c = Object.assign(document.createElement("canvas"), { width: DW, height: DH }), g = c.getContext("2d")!, d = g.createImageData(DW, DH);
  const browns = [[89, 61, 41], [107, 74, 50], [121, 85, 58], [139, 97, 66], [150, 112, 79]];
  for (let x = 0; x < DW; x++) {
    const e = Math.min(x, DW - 1 - x), top = DH - Math.min(DH, 2 + (e >> 1) + (e % 5 === 2 && e > 3 && x < DW / 2 ? 1 : 0));
    for (let y = Math.max(0, top); y < DH; y++) {
      const r = ((((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000) / 1000;
      let k = r < 0.18 ? 0 : r < 0.5 ? 1 : r < 0.8 ? 2 : r < 0.94 ? 3 : 4;
      if (y === top) k = Math.min(4, k + 2); else if (y >= DH - 2) k = Math.max(0, k - 1);
      d.data.set([...browns[k], 255], (y * DW + x) * 4);
    }
  }
  g.putImageData(d, 0, 0);
  return c;
}
export function codeMound() {
  const el = document.querySelector<HTMLElement>("#tomb .mound")!, W = el.offsetWidth, H = el.offsetHeight;
  if (!W || !H) { console.warn("codeMound: the heap has no size yet", W, H); return; }
  const pic = Object.assign(document.createElement("canvas"), { width: W, height: H }), g = pic.getContext("2d")!;
  g.imageSmoothingEnabled = false; g.drawImage(moundPicture(), 0, 0, W, H);
  const px = g.getImageData(0, 0, W, H).data, CW = 4, CH = 7, K = 2, ramp = ".:-=+*o#%@";
  const out = Object.assign(document.createElement("canvas"), { width: W * K, height: H * K }), o = out.getContext("2d")!;
  o.font = `600 ${CH * K}px ui-monospace, Menlo, monospace`; o.textAlign = "center"; o.textBaseline = "middle";
  for (let cy = 0; cy + CH <= H; cy += CH) for (let cx = 0; cx + CW <= W; cx += CW) {
    let L = 0, A = 0;
    for (let y = cy; y < cy + CH; y++) for (let x = cx; x < cx + CW; x++) { const j = (y * W + x) * 4; L += 0.3 * px[j] + 0.59 * px[j + 1] + 0.11 * px[j + 2]; A += px[j + 3]; }
    if (A < CW * CH * 128) continue;                                       // off the heap
    const t = THREE.MathUtils.clamp((L / (CW * CH * 255) - 0.22) / 0.26, 0, 1), k = 0.3 + 0.7 * t;
    o.fillStyle = "#020a04"; o.fillRect(cx * K, cy * K, CW * K, CH * K);
    o.fillStyle = `rgb(${(48 * k) | 0},${(255 * k) | 0},${(97 * k) | 0})`;
    o.fillText(ramp[Math.round(t * (ramp.length - 1))], (cx + CW / 2) * K, (cy + CH / 2) * K);
  }
  el.style.setProperty("--mound-code", `url(${out.toDataURL()})`);
  el.classList.add("coded");
}
{ // phosphor's gravestone texture: a tile of tiny green characters
  const cv = document.createElement("canvas"); cv.width = 152; cv.height = 96;
  const g = cv.getContext("2d")!, chars = "0123456789abcdef#%&@+=-/\\|(){}:;.<>*";
  g.font = "600 6px ui-monospace, Menlo, monospace"; g.textBaseline = "top";
  for (let y = 0; y < cv.height; y += 6) for (let x = 0; x < cv.width; x += 4) {
    const v = (110 + Math.random() * 90) | 0; g.fillStyle = `rgba(${(v * 0.19) | 0},${v},${(v * 0.38) | 0},${(0.1 + Math.random() * 0.3).toFixed(2)})`;   // the ink's green, dimmed
    g.fillText(chars[(Math.random() * chars.length) | 0], x, y);
  }
  document.documentElement.style.setProperty("--code-tile", `url(${cv.toDataURL()})`);
}
