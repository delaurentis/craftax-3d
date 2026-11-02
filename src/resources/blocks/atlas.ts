// The texture atlas: every registered painter drawn into one canvas in order, lava's animation frames, and the
// lookups the game uses (uv for a tile, iconURL for the HUD).
import * as THREE from "three";
import { COLS, NAMES, R, ROWS, S, canvas, ctx, hex, painters } from "./paint";
import type { RGB } from "./paint";
import { onScreen } from "../../themes/state";
import "./painters/terrain";
import "./painters/objects";
import "./painters/realms";
import "./painters/floors";

NAMES.forEach((name, i) => {
  const t = document.createElement("canvas"); t.width = t.height = S;
  const g = t.getContext("2d")!;
  R.seed = 1 + i * 7919;
  painters[name](g);
  ctx.drawImage(t, (i % COLS) * S, Math.floor(i / COLS) * S);
});

export const atlas = new THREE.CanvasTexture(canvas);
// lava's pixels on the move (Pete: not a conveyor belt, not blinking on a grid: a few frames of pixel art swapped in, each tile at a
// different stage). The painted tile stays as it is; over 8 frames two bubbles rise in it, swell, pop to a dark crust and settle, and
// a few pixels glint a shade brighter for a frame. Four variants (world.ts gives each lava block one by its position), each its own
// bubbles, their cycles apart, so neighbours never pop together. All the frames sit in the atlas from the start, a variant's 8 side by
// side in two rows of their own; the shader moves a lava face along its row to the frame of the moment (shading.ts uLavaF), so the
// animation costs no upload at all (Pete: the efficient way; re-sending the atlas each frame ran a phone out of memory)
export const LAVA_TILES = [0, 1, 2, 3].map((v) => `lavaf${v}_0`);
export const LAVA_FRAMES = 8, LAVA_MS = 250;
export const LAVA_AT = NAMES.indexOf("lavaf0_0"), LAVA_ROW = LAVA_AT / COLS;
export const LAVA_V: [number, number] = [1 - (LAVA_ROW + 2) / ROWS, 1 - LAVA_ROW / ROWS];       // the two rows, in texture v (the shader's test)
export const lavaFrame = (now: number) => Math.floor(now / LAVA_MS) % LAVA_FRAMES;
export const lavaSrc = (() => { const i = NAMES.indexOf("lava"); return ctx.getImageData((i % COLS) * S, Math.floor(i / COLS) * S, S, S); })();
// a bubble's life, frame by frame: [dx, dy, colour] pixels over the tile (wrapping)
export const BUB = (() => {
  const Y = "#ffd040", W = "#fff0a0", O = "#ffa030", R = "#e8761e", D = "#a02a08", C = "#c84a10";
  type Dot = [number, number, string];
  const plus = (c: string, e: string): Dot[] => [[0, 0, c], [1, 0, e], [-1, 0, e], [0, 1, e], [0, -1, e]];
  const box = (c: string, e: string, k: string): Dot[] => [...plus(c, e), [1, 1, k], [-1, 1, k], [1, -1, k], [-1, -1, k]];
  const frames: Dot[][] = [[], [[0, 0, O]], plus(Y, O), box(W, Y, R), box(W, Y, O),
    [[0, 0, D], [1, 0, O], [-1, 0, O], [0, 1, O], [0, -1, O], [2, 0, Y], [-2, 0, Y], [0, 2, Y], [0, -2, Y]],   // pop: a splash
    [[0, 0, C], [1, 0, D], [-1, 0, D], [0, 1, D], [0, -1, D]], [[0, 0, C]]];
  return frames.map((f) => f.map(([x, y, c]): [number, number, RGB] => [x, y, hex(c)]));
})();
[0, 1, 2, 3].forEach((v) => {
  let sd = 4242 + v * 977; const r = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
  const bubbles = [0, 4].map((ph) => ({ x: Math.floor(r() * S), y: Math.floor(r() * S), ph: (ph + v * 2 + (v >> 1)) % LAVA_FRAMES }));
  const frames: ImageData[] = [];
  for (let f = 0; f < LAVA_FRAMES; f++) {
    const im = new ImageData(new Uint8ClampedArray(lavaSrc.data), S, S), d = im.data;
    for (let k = 0; k < 3; k++) {                                          // the glints: a shade brighter for a frame
      const i = (Math.floor(r() * S) * S + Math.floor(r() * S)) * 4;
      d[i] = Math.min(255, d[i] + 26); d[i + 1] = Math.min(255, d[i + 1] + 30); d[i + 2] = Math.min(255, d[i + 2] + 12);
    }
    for (const b of bubbles) for (const [dx, dy, c] of BUB[(f - b.ph + LAVA_FRAMES) % LAVA_FRAMES]) {
      const i = (((b.y + dy + S) % S) * S + ((b.x + dx + S) % S)) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    }
    frames.push(im);
  }
  frames.forEach((im, f) => { const at = LAVA_AT + v * LAVA_FRAMES + f; ctx.putImageData(im, (at % COLS) * S, Math.floor(at / COLS) * S); });   // once, before the first upload
});
atlas.magFilter = THREE.NearestFilter;
atlas.minFilter = THREE.NearestMipmapNearestFilter;
atlas.colorSpace = THREE.SRGBColorSpace;
atlas.generateMipmaps = true;

export const E = 0.02 / (S * COLS);                                     // a hair inside each tile so mipmaps don't bleed neighbours in
export function uv(name: string): [number, number, number, number] {
  const i = NAMES.indexOf(name);
  if (i < 0) throw new Error("no texture " + name);
  if (i >= COLS * ROWS) throw new Error("texture atlas full: " + name);
  const u0 = (i % COLS) / COLS, v1 = 1 - Math.floor(i / COLS) / ROWS, Ev = 0.02 / (S * ROWS);
  return [u0 + E, v1 - 1 / ROWS + Ev, u0 + 1 / COLS - E, v1 - Ev];   // u0, v0, u1, v1
}

export const urls: Record<string, string> = {};
export function iconURL(name: string, tint?: string) {                             // a tile as a data URL for the HUD (optionally tinted: potions)
  const own = onScreen.to?.icons?.[name];
  if (own && NAMES.includes(own)) name = own;                                       // (a theme's own icon for it: the Ruins' cut stone)
  const key = name + (tint || "");
  if (urls[key]) return urls[key];
  const i = NAMES.indexOf(name);
  const t = document.createElement("canvas"); t.width = t.height = S;
  const g = t.getContext("2d")!;
  g.drawImage(canvas, (i % COLS) * S, Math.floor(i / COLS) * S, S, S, 0, 0, S, S);
  if (tint) { g.globalCompositeOperation = "source-atop"; g.fillStyle = tint; g.fillRect(4, 5, 8, 9); }
  return (urls[key] = t.toDataURL());
}
