// Pixel-art text for the start screen (and the death screen's title, data-pixel-color="red", and its gravestone, data-pixel-engraved): every <canvas data-pixel-text="..."> is drawn in a 5 × 7 block font, each font pixel a
// little block with a lit top, a shaded bottom, a dark outline and a drop shadow (the title), or flat and
// small (data-pixel-flat, the line under it). The text stays in the canvas's aria-label for screen readers.
import type { PixelInk } from "../src/looks/types";
const FONT: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"], C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"], E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"], G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"], J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"], O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"], S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"], U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"], 3: ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"], ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  " ": ["000", "000", "000", "000", "000", "000", "000"], "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"], "!": ["1", "1", "1", "1", "1", "0", "1"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"], H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"], L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"], P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"], V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"], Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  // lower case: x-height rows 2-6, descenders (g, j) in rows 7-8 below the baseline
  e: ["00000", "00000", "01110", "10001", "11111", "10000", "01111"], f: ["00110", "01000", "11110", "01000", "01000", "01000", "01000"],
  g: ["00000", "00000", "01111", "10001", "10001", "01111", "00001", "10001", "01110"],
  j: ["00010", "00000", "00110", "00010", "00010", "00010", "00010", "10010", "01100"],
  n: ["00000", "00000", "11110", "10001", "10001", "10001", "10001"], o: ["00000", "00000", "01110", "10001", "10001", "10001", "01110"],
  r: ["00000", "00000", "10110", "11000", "10000", "10000", "10000"], s: ["00000", "00000", "01111", "10000", "01110", "00001", "11110"],
  t: ["00100", "00100", "11111", "00100", "00100", "00100", "00011"], u: ["00000", "00000", "10001", "10001", "10001", "10011", "01101"],
  a: ["00000", "00000", "01110", "00001", "01111", "10001", "01111"], b: ["10000", "10000", "10110", "11001", "10001", "10001", "11110"],
  c: ["00000", "00000", "01110", "10000", "10000", "10001", "01110"], d: ["00001", "00001", "01101", "10011", "10001", "10001", "01111"],
  h: ["10000", "10000", "10110", "11001", "10001", "10001", "10001"], i: ["00100", "00000", "01100", "00100", "00100", "00100", "01110"],
  k: ["10000", "10000", "10010", "10100", "11000", "10100", "10010"], l: ["01100", "00100", "00100", "00100", "00100", "00100", "01110"],
  m: ["00000", "00000", "11010", "10101", "10101", "10001", "10001"], v: ["00000", "00000", "10001", "10001", "10001", "01010", "00100"],
  w: ["00000", "00000", "10001", "10001", "10101", "10101", "01010"], x: ["00000", "00000", "10001", "01010", "00100", "01010", "10001"],
  z: ["00000", "00000", "11111", "00010", "00100", "01000", "11111"],
  p: ["00000", "00000", "11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  q: ["00000", "00000", "01111", "10001", "10001", "01111", "00001", "00001", "00001"],
  y: ["00000", "00000", "10001", "10001", "10001", "01111", "00001", "10001", "01110"],
  // digits and a little punctuation (the gravestone's stats)
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"], "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"], "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"], "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"], "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"], "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ",": ["00000", "00000", "00000", "00000", "00000", "01100", "01100", "00100", "01000"], ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
};

// the look on the page's pixel lines (src/looks/looks.ts sets it as the look's class goes on or off, then redraws): every line in its
// ink (phosphor's greens), or only the ones that take a line look's ink (data-pixel-outline: red in laser); none in color
let look: { ink: PixelInk; every: boolean } | undefined;
export function setPixelLook(l: { ink: PixelInk; every: boolean } | undefined) { look = l; }
// a death's red (data-pixel-color="red"), in any look but one that inks every line
const RED: PixelInk = { flat: ["#3a0a06", "#ff2a18"], stone: (t) => `rgb(${Math.round(255 - 70 * t)},${Math.round(96 - 66 * t)},${Math.round(82 - 52 * t)})` };

// data-pixel-runs="C|RAFT|A|X| 3D": every second run one pixel size down, on the same baseline (the game's title, and a host's:
// a whole pixel smaller, so the blocks stay clean, Pete). Each run is drawn as its own title, then they're laid side by side.
function drawRuns(cv: HTMLCanvasElement) {
  const px = +(cv.dataset.pixelSize || 9), margin = 2 + 3;                    // (a title's canvas: a pixel each side, then its depth)
  const runs = cv.dataset.pixelRuns!.split("|").map((text, i) => {
    const p = i % 2 ? px - 1 : px, c = document.createElement("canvas");
    Object.assign(c.dataset, cv.dataset, { pixelText: text, pixelSize: String(p) }); delete c.dataset.pixelRuns;
    draw(c);
    return { c, p, w: c.width - margin * p };                                 // w: its letters alone
  });
  cv.width = runs.reduce((n, r) => n + r.w + r.p, -runs[runs.length - 1].p) + margin * px; cv.height = (7 + margin) * px;
  cv.style.width = cv.width + "px"; cv.style.height = cv.height + "px";
  const g = cv.getContext("2d")!;
  let x = px;
  for (const r of runs) { g.drawImage(r.c, x - r.p, 8 * (px - r.p)); x += r.w + r.p; }
}

function draw(cv: HTMLCanvasElement) {
  if (cv.dataset.pixelRuns) return drawRuns(cv);
  const text = cv.dataset.pixelText!, flat = "pixelFlat" in cv.dataset;
  const gap = 1, depth = flat || "pixelEngraved" in cv.dataset ? 1 : 3;
  const ink = look?.every ? look.ink : cv.dataset.pixelColor === "red" ? RED : look && "pixelOutline" in cv.dataset ? look.ink : null;
  const glyphs = [...text].map((ch) => FONT[ch] || FONT[ch.toUpperCase()] || FONT[" "]);   // a letter without a lower-case form: its capital
  const cols = glyphs.reduce((n, g) => n + g[0].length + gap, -gap), rows = Math.max(...glyphs.map((g) => g.length));
  // data-pixel-max: the widest it may be (a long line shrinks to fit, never below 2 px a pixel)
  const max = +(cv.dataset.pixelMax || 1e9), px = Math.max(2, Math.min(+(cv.dataset.pixelSize || (flat ? 3 : 9)), Math.floor(max / (cols + 2 + depth))));
  cv.width = (cols + 2) * px + depth * px; cv.height = (rows + 2) * px + depth * px;
  cv.style.width = cv.width + "px"; cv.style.height = cv.height + "px";
  const g = cv.getContext("2d")!;
  g.imageSmoothingEnabled = false;
  const on: [number, number][] = [];                                                              // [x, y] of every lit font pixel
  let x0 = 1;
  for (const gl of glyphs) {
    gl.forEach((row, y) => [...row].forEach((b, x) => { if (b === "1") on.push([x0 + x, 1 + y]); }));
    x0 += gl[0].length + gap;
  }
  const rect = (x: number, y: number, c: string, dx = 0, dy = 0, w = px, h = px) => { g.fillStyle = c; g.fillRect(x * px + dx, y * px + dy, w, h); };
  if ("pixelEngraved" in cv.dataset) {                                       // cut into stone (the gravestone): dark, with a lit lower edge
    const e = Math.max(1, Math.round(px / 3));
    for (const [x, y] of on) rect(x, y, ink?.cut?.[0] ?? "#bdbdbd", e, e);    // (phosphor: on the dark code stone the cut burns bright)
    for (const [x, y] of on) rect(x, y, ink?.cut?.[1] ?? "#3b3b3b");
    return;
  }
  if (flat) {
    for (const [x, y] of on) rect(x, y, ink?.flat[0] ?? "#3f3f3f", px * depth, px * depth);  // the shadow, as the game's text has
    for (const [x, y] of on) rect(x, y, ink?.flat[1] ?? "#e8e8e8");
    return;
  }
  for (let d = depth; d >= 1; d--) for (const [x, y] of on) rect(x, y, ink?.ext ? ink.ext[d === depth ? 0 : 1] : d === depth ? "#1a1a1a" : "#2c2c2c", d * px * 0.5, d * px * 0.5);   // extrusion
  const o = Math.max(2, px / 4);
  for (const [x, y] of on) rect(x, y, ink?.outline ?? "#141414", -o, -o, px + 2 * o, px + 2 * o);                                    // outline
  for (const [x, y] of on) {
    const t = (y - 1) / 6;                                                    // stone: lighter at the top of each letter, darker below
    const v = Math.round(200 - 90 * t), c = ink ? ink.stone(t) : `rgb(${v},${v},${v + 4})`;   // stone, or the look's ink (red: a death)
    rect(x, y, c);
    rect(x, y, "rgba(255,255,255,.35)", 0, 0, px, Math.max(1, px / 5));        // the lit top edge of each block
    rect(x, y, "rgba(0,0,0,.25)", 0, px - Math.max(1, px / 5), px, Math.max(1, px / 5));
    if ((x * 7 + y * 13) % 5 === 0) rect(x, y, "rgba(0,0,0,.12)", px / 3, px / 3, px / 3, px / 3);   // a fleck of grain
  }
}

for (const cv of document.querySelectorAll<HTMLCanvasElement>("canvas[data-pixel-text]")) draw(cv);
// change a pixel line's text (the death screen's title)
export function pixelText(cv: HTMLCanvasElement, text: string) { cv.dataset.pixelText = text; cv.setAttribute("aria-label", text); draw(cv); }
// every pixel line on the page drawn again (a look's class went on or off)
// a button's label in the flat pixel font (Pete): its text drawn on a canvas, the plain text kept (hidden) for screen readers and
// for code that reads or sets textContent: whenever the text changes, the canvas is redrawn
export function pixelButton(btn: HTMLElement) {
  const draw = () => {
    const t = btn.textContent!.trim();
    if (!t || (btn.dataset.px === t && btn.querySelector("canvas"))) return;   // (the same text set again replaces the canvas too)
    btn.dataset.px = t;
    const cv = document.createElement("canvas");
    Object.assign(cv.dataset, { pixelFlat: "", pixelSize: "2", pixelOutline: "" }); cv.setAttribute("aria-hidden", "true");
    const sr = Object.assign(document.createElement("span"), { className: "px-txt", textContent: t });
    btn.replaceChildren(cv, sr);
    pixelText(cv, t);
  };
  new MutationObserver(draw).observe(btn, { childList: true, characterData: true, subtree: true });
  draw();
}
export function pixelRedraw() { for (const cv of document.querySelectorAll<HTMLCanvasElement>("canvas[data-pixel-text]")) draw(cv); }
