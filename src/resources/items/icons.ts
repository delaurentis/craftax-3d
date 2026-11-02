// The HUD's pixel icons, drawn by code: hearts, food, drops, bolts and the other status icons (full, half, empty, and in a line
// look's ink: src/looks/<look> hud), and the tools and armor by tier.
import type { HudInk } from "../../looks/types";


// 9 × 9 pixel icons: '#' main colour, 'o' outline, '+' highlight
/** A status icon's kind: heart, food, drop, bolt, star or skull. */
export type IconKind = "heart" | "food" | "drop" | "bolt" | "star" | "skull";
export const ICONS: Record<IconKind, string[]> = {
  heart: ["", " oo   oo ", "o##o o##o", "o+######o", "o#######o", " o#####o ", "  o###o  ", "   o#o   ", "    o    "],
  food: ["", "     ooo ", "    o###o", "   o####o", "  o####o ", " oo##oo  ", "o+oo     ", "oo       ", ""],
  drop: ["    o    ", "   o#o   ", "   o#o   ", "  o###o  ", " o##+##o ", " o#+###o ", " o#####o ", "  o###o  ", "   ooo   "],
  bolt: ["    oooo ", "   o##o  ", "  o##o   ", " o#####o ", "  oo##o  ", "   o##o  ", "  o#o    ", " oo      ", ""],
  star: ["    o    ", "   o#o   ", "ooo###ooo", "o#######o", " o#####o ", "  o###o  ", " o##o##o ", " o#o o#o ", " oo   oo "],
  skull: ["  ooooo  ", " o#####o ", "o#######o", "o#oo#oo#o", "o#oo#oo#o", "o###o###o", " o#####o ", "  o#o#o  ", "   ooo   "],   // a sealed ladder: monsters to kill
};
export const COLORS: Record<IconKind, string> = { heart: "#e01818", food: "#b06a28", drop: "#3870e8", bolt: "#f0d020", star: "#c050f0", skull: "#e8e2d0" };
export const iconCache: Record<string, string> = {};
// the HUD's look: in a line look (lines) the bars and block icons are drawn as outlines, in its ink (set by src/looks/looks.ts before
// lines go on: laser's red, phosphor's green)
export const hudInk = { lines: false, ink: null as HudInk | null };
export const INK = () => hudInk.ink!.ink;                                  // the block icons' ink (textures.ts outlineIconURL)
// a heart as the hearts bar draws it, onto g at (ox, oy) (main.ts: the mobs' health bars)
export function drawHeart(g: CanvasRenderingContext2D, fill: number, ox = 0, oy = 0) {
  ICONS.heart.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === " ") return;
    const lit = fill >= 1 || (fill > 0 && x < 5);
    g.fillStyle = ch === "o" ? "#000" : !lit ? "#3a3a3a" : ch === "+" ? "#fff" : COLORS.heart;
    g.fillRect(ox + x, oy + y, 1, 1);
  }));
}
export function pixIcon(kind: IconKind, fill: number) {                                 // fill: 1 full, 0.5 half, 0 empty
  const key = kind + fill + (hudInk.lines ? hudInk.ink!.key : "");
  if (iconCache[key]) return iconCache[key];
  const c = document.createElement("canvas"); c.width = c.height = 9;
  const g = c.getContext("2d")!;
  if (hudInk.lines) outlineIcon(g, OUTLINE_SHAPES[kind] || ICONS[kind], fill);
  else ICONS[kind].forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === " ") return;
    const lit = fill >= 1 || (fill > 0 && x < 5);
    g.fillStyle = ch === "o" ? "#000" : !lit ? "#3a3a3a" : ch === "+" ? "#fff" : COLORS[kind];
    g.fillRect(x, y, 1, 1);
  }));
  return (iconCache[key] = c.toDataURL());
}
// line bars: the icon's whole shape, solid ink where full; where empty, a dim edge round the scene's glowing dark (the look's bars)
export const OUTLINE_SHAPES: Partial<Record<IconKind, string[]>> = {
  bolt: ["    #####", "   ##### ", "  #####  ", " ########", "   ##### ", "  ####   ", " ###     ", " ##      ", "#        "],
};
export function outlineIcon(g: CanvasRenderingContext2D, rows: string[], fill: number) {
  const at = (x: number, y: number) => y >= 0 && y < rows.length && x >= 0 && x < (rows[y] || "").length && rows[y][x] !== " ";
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === " ") return;
    const lit = fill >= 1 || (fill > 0 && x < 5);
    const edge = !at(x - 1, y) || !at(x + 1, y) || !at(x, y - 1) || !at(x, y + 1);
    const [ink, hi, rim, dark] = hudInk.ink!.bars;
    g.fillStyle = lit ? (ch === "+" ? hi : ink) : edge ? rim : dark;   // empty inside: the line scene's glowing dark
    g.fillRect(x, y, 1, 1);
  }));
}

export const TIER = ["#b8935a", "#b8935a", "#9a9a9a", "#d8d8d8", "#5decf5"];             // none, wood, stone, iron, diamond
export const toolCache: Record<string, string> = {};
// a pixel-art pickaxe: a diagonal haft (s, S its dark side) into a head curved symmetrically about it (H lit edge, h, d shadow);
// o is the dark outline
export const PICKAXE = [                                   // (Pete: a slim head, a bar across the top bending down the
  "................",                                // right side, the haft running into its corner)
  "......ooooo.....",
  ".....oHHHHHoo...",
  "....oHhhhhhHHo..",
  ".....ooooosShHo.",
  "........osSodhHo",
  ".......osSo.dhHo",
  "......osSo..dhHo",
  ".....osSo...dhHo",
  "....osSo....dhHo",
  "...osSo.....odHo",
  "..osSo.......oo.",
  ".osSo...........",
  "osSo............",
  ".oo.............",
  "................",
];
// and its sword, drawn the same way (outline, lit edge, shadow) so the two read alike: the blade down from the top right, a wooden guard
// (G) across it, the hilt (s, S) to the bottom left
export const SWORD = [
  "............ooo.",
  "...........oHHHo",
  "..........oHhhdo",
  ".........oHhhdo.",
  "........oHhhdo..",
  ".......oHhhdo...",
  "......oHhhdo....",
  "..oo.oHhhdo.....",
  "..oGooHhdo......",
  "...oGoHdo.......",
  "....oGdo........",
  "...osoGGo.......",
  "..osSo.oGo......",
  ".osSo...oo......",
  "oSSo............",
  ".oo.............",
];
export const shade = (hex: string, k: number) => "#" + [1, 3, 5].map((i) => Math.min(255, Math.round(parseInt(hex.slice(i, i + 2), 16) * k)).toString(16).padStart(2, "0")).join("");
export function pixelArt(rows: string[], cols: Record<string, string>) {
  const c = document.createElement("canvas"); c.width = c.height = 16;
  const g = c.getContext("2d")!, pal: Record<string, string | undefined> = { o: "#140d06", s: "#7a5530", S: "#4a3018", ...cols };
  rows.forEach((row, y) => [...row].forEach((ch, x) => { const ink = pal[ch]; if (ink) { g.fillStyle = ink; g.fillRect(x, y, 1, 1); } }));
  return c.toDataURL();
}
// the pickaxe's or sword's pixels, row by row, as [char, colour] (null where empty): main.ts builds the held tool from them, a cube a
// pixel, so it looks just like its icon (Pete); the char tells the metal (h, H, d) from the wood and the outline
export function toolPixels(kind: string, tier: number): ([string, string] | null)[][] {
  const col = TIER[tier] || TIER[1], pal: Record<string, string | undefined> = { o: "#140d06", s: "#7a5530", S: "#4a3018", h: col, H: shade(col, 1.35), d: shade(col, 0.7), G: "#6b4a25" };
  return (kind === "sword" ? SWORD : PICKAXE).map((row) => [...row].map((ch): [string, string] | null => { const ink = pal[ch]; return ink ? [ch, ink] : null; }));
}
export function toolIcon(kind: string, tier: number) {
  const key = kind + tier;
  if (toolCache[key]) return toolCache[key];
  const c = document.createElement("canvas"); c.width = c.height = 16;
  const g = c.getContext("2d")!, col = TIER[tier] || TIER[1];
  g.fillStyle = "#6b4a25";
  if (kind === "pickaxe") return (toolCache[key] = pixelArt(PICKAXE, { h: col, H: shade(col, 1.35), d: shade(col, 0.7) }));
  if (kind === "sword") return (toolCache[key] = pixelArt(SWORD, { h: col, H: shade(col, 1.35), d: shade(col, 0.7), G: "#6b4a25" }));
  {                                                  // armour piece: helmet, chest, pants, boots
    g.fillStyle = col;
    if (kind === "helmet") {                         // a domed cap with cheek guards, open at the face (Pete: the flat one read as leggings)
      g.fillRect(6, 2, 4, 1); g.fillRect(4, 3, 8, 1); g.fillRect(3, 4, 10, 4); g.fillRect(3, 8, 2, 3); g.fillRect(11, 8, 2, 3);
      g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(3, 7, 10, 1);   // the brim's shadow
      g.fillStyle = "rgba(255,255,255,.3)"; g.fillRect(6, 3, 3, 1);   // a shine on the dome
    }
    if (kind === "chest") { g.fillRect(2, 3, 12, 3); g.fillRect(4, 6, 8, 8); g.fillStyle = "rgba(0,0,0,.25)"; g.fillRect(7, 3, 2, 4); }
    if (kind === "pants") { g.fillRect(3, 3, 10, 4); g.fillRect(3, 7, 4, 7); g.fillRect(9, 7, 4, 7); }
    if (kind === "boots") { g.fillRect(2, 8, 4, 6); g.fillRect(10, 8, 4, 6); g.fillRect(1, 12, 5, 2); g.fillRect(10, 12, 5, 2); }
    // a dark outline round the piece, as the pickaxe and sword have (Pete: pale iron on the grey slot looked disabled)
    const im = g.getImageData(0, 0, 16, 16), d = im.data, solid = (x: number, y: number) => x >= 0 && y >= 0 && x < 16 && y < 16 && d[(y * 16 + x) * 4 + 3] > 0;
    const edge: [number, number][] = [];
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (!solid(x, y) && (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1))) edge.push([x, y]);
    g.fillStyle = "#140d06"; for (const [x, y] of edge) g.fillRect(x, y, 1, 1);
  }
  return (toolCache[key] = c.toDataURL());
}
