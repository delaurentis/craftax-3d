# Writing a look

A look is how the game is drawn: the world, the HUD and the effects. M steps through the looks (Shift+M goes back) and each one has a button in the looks bar. The game has three: color, phosphor and laser. A plugin can add more, and it can also change how any look draws one of the views.

A look is picked once and stays picked in every view: first person (V), bird's-eye (B) and the classic 2D game (C). Each view draws it with that look's **renderer** for that view. A renderer is registered for a list of views, so one renderer can serve first person and bird's-eye together.

## The two slots

A plugin adds a look with two slots, both lists:

- `look`: the look itself: its id (saved settings, recordings and `data-art` use it), its label, its place in M's order, its button's icon, its body class and its CSS, and its inks for the HUD and the effects. The interface is `Look` in `src/looks/types.ts`.
- `lookView`: a renderer, for one look in a list of views. The interface is `LookView` in the same file.

A renderer for a 3D view starts from the game's own render of the world, color or the line frame (`base`). On top of it, it can add a post pass (`post`: a GLSL function over the finished picture) and a render scale (`scale`: big square pixels, nearest-neighbor). A renderer can draw its own picture from the game's state instead (`draw`). That is how the classic view's pictures work.

The views are named `"first"`, `"overhead"` (bird's-eye) and `"classic"`.

## A worked example: noir

The noir plugin (`plugins/noir/`) is a film noir look. It uses color's render, turns it black and white with hard contrast, darkens the corners and adds a little film grain. Its HUD is grayed by its CSS. Here is the whole plugin:

```ts
import type { Look, LookView, Plugin } from "craftax-3d/plugin";
import css from "./noir.css?raw";
import { NOIR } from "./noir.glsl";

export default function noir(opts: NoirOptions = {}): Plugin {
  const look: Look = {
    id: "noir", label: "Noir", order: 40,
    lines: false, cls: "color noir",
    css,
    icon: `<svg viewBox="0 0 20 20" width="20" height="20">…</svg>`,
  };
  const view: LookView = {
    look: "noir", views: ["first", "overhead"], base: "color",
    post: { shader: NOIR, uniforms: { uGrain: { value: opts.grain ?? 0.08 }, uVignette: { value: opts.vignette ?? 0.7 } } },
  };
  return {
    name: "noir",
    provides: ["look", "lookView"],
    setup(host) { host.add("look", look); host.add("lookView", view); },
  };
}
```

`order` places it in M's order. The built-ins are color 10, phosphor 20 and laser 30, so 40 comes after laser. A look with no order goes after the built-ins, in the order plugins add them.

`lines: false` says it is drawn like color: no line frame, and the HUD keeps its normal style. A line look (`lines: true`) is drawn over laser's line frame in its own ink, as phosphor is. It sets `over: true`, `pass`, `hud` and `pixel` (see phosphor in `src/looks/phosphor/`).

`cls` is the body class while the look is on. Several classes can be listed: `"color noir"` keeps color's HUD rules and adds noir's own. The CSS text (`css`) is put on the page once, when the look's button is made. Noir's CSS is one rule:

```css
body.noir :is(#topbar, #looks, #info, #res, #hotrow, #slotname, #bars, #hint, #botpanel, #panel, .toast) { filter: grayscale(1) contrast(1.15); }
```

`icon` is the button's picture: an inline SVG, 20 by 20.

The post pass is GLSL that defines `vec3 post(vec3 color, vec2 uv)`. It is called for every point of the finished picture. The colors are display colors from 0 to 1, after tone mapping. The pass may read `uRes` (the picture's size in device pixels), `uTime` (seconds) and `uScale` (device pixels per drawn pixel). It declares its own uniforms, and the plugin gives their values in `uniforms`. The game uses those same objects, so the plugin can change a value later and the next frame uses it. Noir's pass (`plugins/noir/noir.glsl.ts`):

```glsl
uniform float uGrain, uVignette;
float grain(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 post(vec3 c, vec2 uv) {
  float y = dot(c, vec3(0.2126, 0.7152, 0.0722));
  y = smoothstep(0.06, 0.82, y);
  vec2 d = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  y *= 1.0 - uVignette * smoothstep(0.4, 1.0, length(d));
  y += (grain(floor(uv * uRes) + mod(floor(uTime * 24.0), 64.0) * 17.0) - 0.5) * uGrain;
  return vec3(clamp(y, 0.0, 1.0));
}
```

Noir has no renderer for the classic view. There it draws what color draws, which is Craftax's original art, but noir stays picked: its button stays lit, and leaving the classic view brings noir back.

The pixel plugin (`plugins/pixel/`) is the second example. Its renderer sets `scale: 4`, so the picture is drawn in blocks of 4 CSS pixels. Its post pass maps each block to the nearest of 16 colors with an ordered dither.

## Which renderer draws

For a look in a view, the game uses the newest renderer listed for that look and view. If there is none and the look is a skin (`over`, like phosphor), it borrows the renderer of its line look (laser). If there is still none, the look draws the way color does in that view. In 3D that is the normal render; in the classic view it is Craftax's original art, or a theme's own classic picture.

## Filling another look's spot

A renderer doesn't have to belong to the plugin's own look. Any plugin can fill a look's spot in a view. The crystal plugin (craftax-crystal) defines no look of its own. It gives laser a picture for the classic view, "What the crystal sees":

```ts
const sees: LookView = {
  look: "laser", views: ["classic"],
  label: "What the crystal sees",
  draw(state, img, refresh) { /* draw the crystal's 192 × 192 frame into img */ },
};
host.add("lookView", sees);
```

With it installed, laser in the classic view shows the crystal's picture. So does phosphor, which borrows laser's renderer. Without it, both show Craftax's original art.

`draw` gets the game's state, the classic view's image and a `refresh` function to call once something it had to load has arrived. `label` is the note shown when the picture comes up. The classic view only draws plugin pictures when the game runs in the browser, not on a server.

## Trying them

Noir and pixel are off by default. To turn one on, import it in `craftax.config.ts` and add it to `plugins`, with any options in its call:

```ts
import noir from "./plugins/noir";
const config: CraftaxConfig = { site: "https://playcraftax.com", plugins: [winter(), ruins(), tropical(), noir({ grain: 0 })] };
```

A plugin left out of the list isn't in the build at all.

For a test copy with the crystal plugin too, from the craftax-crystal checkout beside this one, `crystal.config.ts` adds it to what `craftax.config.ts` lists:

```sh
CRAFTAX_CONFIG=crystal.config.ts npx vite --port 8797
```

Then open `http://localhost:8797/?crystal`.

## Not yet

A renderer can't draw its own picture of a 3D view yet. `draw` only applies to the classic view for now. The types leave room for it, for example a look drawn with prerendered sprites instead of three.js.

`scale` point-samples the full picture, so it looks like a low-resolution render but costs the same as a full one.
