// Themes' tiles. Every material that draws blocks (the world, the flying pieces, the HUD's icons) reads the one texture atlas, so a
// theme is shown by repainting that atlas's canvas with the theme's tiles: the same names in the same places, so no geometry changes.
// While a transition runs, `fromAtlas` holds the theme being left, and the block shader blends the two tile by tile
// (src/render/shading/shaders.ts, uThemeP). Tiles a theme adds get new places in the atlas (and, with a line drawing, in
// `themeOutlines`, the laser and phosphor drawings of the rows the standard outline atlas doesn't cover).
import * as THREE from "three";
import { COLS, OUTLINE_ROWS, NAMES, R, ROWS, S, canvas, ctx, painters } from "../resources/blocks/paint";
import { atlas, urls } from "../resources/blocks/atlas";
import { OUTLINE, LS } from "../resources/blocks/outline-atlas";
import { themes } from "./state";
import { listed } from "../core/plugins";
import type { Painter, Theme, ThemeTile } from "./types";

let base: HTMLCanvasElement | null = null;                     // the standard tiles (with the themes' added ones), as first painted
const sheets = new Map<string, HTMLCanvasElement>();           // each theme's whole atlas, painted once
const fromCanvas = document.createElement("canvas");
fromCanvas.width = canvas.width; fromCanvas.height = canvas.height;
/** The theme being left, while a transition runs (the block shader's uMapFrom). */
export const fromAtlas = new THREE.CanvasTexture(fromCanvas);
fromAtlas.magFilter = THREE.NearestFilter; fromAtlas.minFilter = THREE.NearestMipmapNearestFilter;
fromAtlas.colorSpace = THREE.SRGBColorSpace; fromAtlas.generateMipmaps = true;

// the laser and phosphor drawings of atlas rows OUTLINE_ROWS … ROWS (the themes' added tiles live there), one channel, made on the
// first added tile that brings one (else a 1 × 1 black texture: nothing drawn)
const OUT_ROWS = ROWS - OUTLINE_ROWS;
let ocanvas: HTMLCanvasElement | null = null;
export const themeOutlines = { tex: new THREE.DataTexture(new Uint8Array([0]), 1, 1, THREE.RedFormat, THREE.UnsignedByteType), on: false };
themeOutlines.tex.needsUpdate = true;

const slot = (i: number): [number, number] => [(i % COLS) * S, Math.floor(i / COLS) * S];
function paintTile(g: CanvasRenderingContext2D, name: string, draw: Painter): void {
  const i = NAMES.indexOf(name), [x, y] = slot(i);
  const t = document.createElement("canvas"); t.width = t.height = S;
  R.seed = 1 + i * 7919;                                       // (each tile's random numbers, as the atlas paints it)
  draw(t.getContext("2d")!);
  g.clearRect(x, y, S, S); g.drawImage(t, x, y);
}
function outline(name: string, draw: Painter): void {
  const i = NAMES.indexOf(name), row = Math.floor(i / COLS) - OUTLINE_ROWS;
  if (row < 0 || row >= OUT_ROWS) return;
  if (!ocanvas) { ocanvas = document.createElement("canvas"); ocanvas.width = LS * COLS; ocanvas.height = LS * OUT_ROWS; const g0 = ocanvas.getContext("2d")!; g0.fillStyle = "#000"; g0.fillRect(0, 0, ocanvas.width, ocanvas.height); }
  const g = ocanvas.getContext("2d")!;
  g.save(); g.translate((i % COLS) * LS, row * LS);
  g.beginPath(); g.rect(1, 0, LS - 2, LS); g.clip();
  g.strokeStyle = "#fff"; g.lineWidth = 2.4; g.lineJoin = g.lineCap = "round"; R.seed = 7 + i * 104729;
  draw(g); g.restore();
  themeOutlines.on = true;
}
function uploadOutlines(): void {
  if (!ocanvas) return;
  const W = ocanvas.width, H = ocanvas.height, src = ocanvas.getContext("2d")!.getImageData(0, 0, W, H).data, red = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) { const o = (H - 1 - y) * W, i0 = y * W * 4; for (let x = 0; x < W; x++) red[o + x] = src[i0 + x * 4]; }   // (flipped, as the outline atlas)
  const t = new THREE.DataTexture(red, W, H, THREE.RedFormat, THREE.UnsignedByteType);
  t.unpackAlignment = 1; t.generateMipmaps = true; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.needsUpdate = true;
  themeOutlines.tex = t;
  ocanvas.width = ocanvas.height = 0; ocanvas = null;          // (the 4 MB canvas was only for painting them: the tiles go in once)
}

// a theme's tile as a painter: its own, or (from, tint) a copy of a tile the game has, its colors multiplied by the tint, and its line
// drawing the same (null: no such tile). The copy is of the standard tile as painted, before any theme's
function derived(t: ThemeTile): { paint: Painter; outline?: Painter } | null {
  if ("paint" in t) return t;
  const i = NAMES.indexOf(t.from);
  if (i < 0) return null;
  const [sx, sy] = slot(i), tint = "#" + t.tint.toString(16).padStart(6, "0");
  const paint: Painter = (g) => {
    g.drawImage(canvas, sx, sy, S, S, 0, 0, S, S);
    g.globalCompositeOperation = "multiply"; g.fillStyle = tint; g.fillRect(0, 0, S, S);
    g.globalCompositeOperation = "destination-in"; g.drawImage(canvas, sx, sy, S, S, 0, 0, S, S);   // (its own transparency back)
    g.globalCompositeOperation = "source-over";
  };
  return { paint, outline: OUTLINE[t.from] };
}
/** Once, before the first world is built: the themes' and set pieces' added tiles take their places in the atlas (and the standard
 *  sheet is kept). */
export function installThemeTiles(): void {
  if (base) return;
  for (const th of [...themes(), ...listed("setPieces")]) for (const [name, t0] of Object.entries((th.tiles || {}) as Record<string, ThemeTile>)) {
    const t = derived(t0);
    if (!t) { console.warn(`[craftax-3d] "${th.id}": tile "${name}" copies "${(t0 as { from: string }).from}", which isn't a tile`); continue; }
    if (NAMES.includes(name)) {
      if (painters[name] !== t.paint) console.warn(`[craftax-3d] "${th.id}": tile "${name}" already exists (a theme repaints it with paint instead)`);
      continue;                                                // (the same tile from two set pieces of one plugin: once is enough)
    }
    if (NAMES.length >= COLS * ROWS) { console.warn(`[craftax-3d] "${th.id}": the atlas is full, tile "${name}" left out`); continue; }
    NAMES.push(name); painters[name] = t.paint;
    paintTile(ctx, name, t.paint);                             // (in the standard sheet too: the game never draws it there)
    if (t.outline) outline(name, t.outline);
  }
  uploadOutlines();
  base = document.createElement("canvas"); base.width = canvas.width; base.height = canvas.height;
  base.getContext("2d")!.drawImage(canvas, 0, 0);
  atlas.needsUpdate = true;
}
/** A theme's whole atlas (null: the standard one). */
function sheet(t: Theme | null): HTMLCanvasElement {
  installThemeTiles();
  if (!t) return base!;
  let c = sheets.get(t.id);
  if (c) return c;
  c = document.createElement("canvas"); c.width = base!.width; c.height = base!.height;
  const g = c.getContext("2d")!;
  g.drawImage(base!, 0, 0);
  for (const [name, draw] of Object.entries(t.paint || {})) {
    if (NAMES.includes(name)) paintTile(g, name, draw);
    else console.warn(`[craftax-3d] theme "${t.id}" paints "${name}", which isn't a tile (add it under tiles)`);
  }
  sheets.set(t.id, c);
  return c;
}
let shownTo: string | null | undefined, shownFrom: string | null | undefined;
/** Shows `to` in the atlas and keeps `from` in fromAtlas for the blend. The HUD's icons are drawn again from the new tiles. */
export function showSheets(to: Theme | null, from: Theme | null): void {
  const kt = to?.id ?? null, kf = from?.id ?? null;
  if (kt !== shownTo) {
    shownTo = kt;
    ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(sheet(to), 0, 0);
    atlas.needsUpdate = true;
    for (const k of Object.keys(urls)) delete urls[k];        // (iconURL draws from the atlas canvas: its cache is the old theme's)
  }
  if (kf !== shownFrom) {
    shownFrom = kf;
    const g = fromCanvas.getContext("2d")!;
    g.clearRect(0, 0, fromCanvas.width, fromCanvas.height); g.drawImage(sheet(from), 0, 0);
    fromAtlas.needsUpdate = true;
  }
}
