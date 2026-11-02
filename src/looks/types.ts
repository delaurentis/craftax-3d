// The Look interface: everything one look (M: color, phosphor, laser, a plugin's) changes about how the world, the HUD and the effects
// are drawn; and its renderers (LookView), one per list of views. Each built-in look is one folder (src/looks/<look>/: its Look, its
// renderer and its css); src/looks/registry.ts lists them in M's order with the plugins' (slots "look" and "lookView").
import type * as THREE from "three";

/** A view (V B C; flat.mode 0 2 1): first person, bird's-eye, the classic 2D game. A views plugin may name more. */
export type ViewId = "first" | "overhead" | "classic" | (string & {});

/** RGB, 0..1 (linear light for the outline pass). */
export type RGB = [number, number, number];
/** The HUD's icons in a line look's ink (src/resources/items/icons.ts): the block icons' ink, the bars' palette, an icon cache key. */
export interface HudInk {
  /** The block icons' outline drawings, in this ink (textures.js outlineIconURL). */
  ink: string;
  /** The bars: lit, its highlight, an empty one's edge, an empty one's inside (the scene's glowing dark). */
  bars: [string, string, string, string];
  /** One letter, for the icon cache. */
  key: string;
}
/** The pixel font's lines (js/pixeltitle.ts) in a look's colors; what it leaves out is drawn as usual. */
export interface PixelInk {
  /** A flat line: its shadow and its ink. */
  flat: [string, string];
  /** Stone letters, top (t 0) to bottom (t 1). */
  stone(t: number): string;
  /** Cut into the gravestone: the lit lower edge, then the cut. */
  cut?: [string, string];
  /** Stone letters' extrusion (back, then the rest) and outline. */
  ext?: [string, string];
  outline?: string;
}
/** The Necromancer's look in a line look: his body lit from within, and the pool of light round him (effects/necromancer.ts). */
export interface NecroInk { glow: number; flare: number; light: number }

export interface Look {
  /** Its name in saved settings (craftax3d.lookview), recordings, ?look=, the art buttons' data-art. */
  id: string;
  /** What the note and the buttons' tips call it. */
  label: string;
  /** Its place in M's order (color 10, phosphor 20, laser 30; none: after those, in the order plugins add them). */
  order?: number;
  /** Its button's picture (an <svg>, 20 × 20), added to the looks bar (#seg-art); the built-ins' are in index.html (the replay page
   *  reads them from there). */
  icon?: string;
  /** Its page rules (a plugin's css text), put on the page once as it registers. */
  css?: string;
  /** Draws the outline frame (surface ids and light, not color: no sky, no soft blends) rather than the color render. */
  lines: boolean;
  /** A skin: the same frame as the plain line look, in its own ink, switched on and off apart from the lines (phosphor over laser:
   *  its green stays on through a fade to color, and the opening wears it without the HUD's). */
  over?: boolean;
  /** The body class while it's on (its css: src/looks/<look>/<look>.css); a line look's page has body.outline too (src/looks/shared/
   *  outline.css, the rules every line look shares, in the ink its own css sets). Several, space-separated: a look that wears color's
   *  HUD lists "color" too. */
  cls: string;
  /** The bloom for this render (a plain look's: color, or the line frame). */
  bloom?: { threshold: number; strength: number; radius: number; knee: number; sat: number };
  /** The outline pass in this look (a line look): its ink (linear), the bloom's crowding axis, and code art (characters, not lines). */
  pass?: { ink: RGB; satAxis: RGB; code: boolean };
  /** The HUD's icons (a line look). */
  hud?: HudInk;
  /** The pixel font: every line (true) or only the ones that take a line look's ink (data-pixel-outline). */
  pixel?: { ink: PixelInk; every: boolean };
  /** The target box (render/targeting.ts): the green box's color, the red box's, every box style's, and the aimed thing glowing. */
  aim?: { green?: number; red?: number; every?: number; glow?: boolean };
  /** The look's own ink for sparks and glows: the victory sparks' hue, his death's sparkles, a fireball's ring ("r,g,b"). */
  spark?: { hue: number; hex: number; rgb: string };
  /** The Necromancer, lit from within (a line look; none: he stays dark). */
  necro?: NecroInk;
  /** A shockwave where something was hit (pos null: the screen's middle); model: the thing, whose outline ripples out. */
  shock?(pos: THREE.Vector3 | null, strength: number, model: THREE.Object3D | null): void;
  /** Every frame (on: it's the look in view), before the render. */
  frame?(now: number, on: boolean): void;
  /** A death: the gravestone is up, sized (every look, so a later switch finds it ready). */
  dead?(): void;
}

/** A full-screen pass over a 3D view's finished picture (after tone mapping: display colors, 0..1). The shader defines
 *  `vec3 post(vec3 color, vec2 uv)`, and may read the host's uniforms uRes (the picture's size, device px), uTime (s) and uScale
 *  (device px per drawn pixel) besides its own, which it declares itself. */
export interface PostPass {
  shader: string;
  uniforms?: Record<string, { value: unknown }>;
}
/** How a look draws a view. A 3D view's renderer runs the game's own render of the world (base) and may add a post pass and a render
 *  scale; a renderer may instead draw its own picture from the game's state (draw: the classic view's image; a 3D view's own picture,
 *  a sprite look's, is for later). Nothing here is three.js: a pass is GLSL text, a picture is an image. */
export interface Renderer {
  /** 3D: the render under it: the world in its light ("color") or the line frame ("outline": surface ids for the outline pass, in the
   *  look's ink). Default: the look's own (lines). */
  base?: "color" | "outline";
  /** 3D: a pass over the finished picture. */
  post?: PostPass;
  /** 3D: CSS px per drawn pixel: the picture point-sampled in blocks this size, each block one color (low resolution, nearest-neighbor
   *  upscaled). 1, or none: full resolution. */
  scale?: number;
  /** Its own picture of the state instead of the game's render (the classic view: into its image; call refresh() if it had to load
   *  something first). */
  draw?(state: Record<string, unknown>, img: HTMLImageElement, refresh: () => void): void;
  /** For the note when it's picked, if not the look's label ("What the crystal sees"). */
  label?: string;
  /** Every frame while it draws a 3D view, before the render (its uniforms). */
  frame?(now: number): void;
}
/** A renderer, for one look in a list of views: the look's own (its plugin's), or any plugin's filling that look's spot in a view
 *  (the crystal plugin: laser's classic picture). The newest for a look and view wins; a skin (over) with none borrows its plain
 *  line look's (phosphor: laser's); a look with neither draws as color does there (in the classic view: Craftax's original art). */
export interface LookView extends Renderer {
  /** The look's id. */
  look: string;
  views: ViewId[];
}
