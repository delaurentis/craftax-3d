# Contributing

Thanks for helping. A few things keep the project easy to work on.

## Setup

    npm install
    npm run dev       # the game, with instant reloads
    npm run check     # types and file sizes: run it before you open a pull request

## Rules of the house

- **TypeScript, strict.** Every file is `.ts`, new ones too (see TypeScript below).
- **500 lines a file at most.** `npm run sizes` lists any file over, and `npm run check` fails if there is one.
- **One job a file**, with a short comment at the top saying what it owns.
- **Themes and scene packs are plugins too.** A theme changes how the world is drawn (T), never the game; a scene pack's set pieces add real content to new worlds. How to write both: [doc/themes.md](doc/themes.md), with working examples in `plugins/winter/`, `plugins/ruins/`, `plugins/tropical/` and `plugins/university/`. So are new looks: [doc/looks.md](doc/looks.md), with `plugins/noir/` and `plugins/pixel/`.
- **The game doesn't know about any website.** Anything a particular site needs (analytics, upload links, branding) goes in a plugin, not in the game. A plugin uses the game only through `plugin.ts` (`craftax-3d/plugin`); `npm run check` fails a plugin that imports any other game file. See `doc/themes.md` and `doc/components.html`.
- **No copied art.** Textures are drawn by code; images and sounds need a license that allows redistribution, recorded in `NOTICE.md` or the folder's README.
- **American English** in text people read.

## TypeScript

The game is all TypeScript.

- **Refactors in their own pull request**, apart from changes in behavior.
- **Imports stay extension-free** (`from "./x"`), so a rename needs no importer edits. The places that name a file outright do need updating: `new URL("./x.ts", import.meta.url)` (the agent worker in `js/agent.ts`), the `<script src>` in `index.html` and `replay.html`, and the inputs in `vite.config.ts`.
- **Strict, no implicit `any`.** Use real types; at the boundaries (JSON, `postMessage`, `localStorage`, IndexedDB) take `unknown` and narrow, or cast once to a declared shape. An explicit `any` needs a short `// any: why` comment beside it, and should be rare.
- **Non-null `!` only where the code already assumes the thing is there**, such as `$("id")!` for an element `index.html` always has. Where a value is truly missing at times, keep the `null` in the type and check for it.
- **Shared shapes live in `src/core/types.ts`**: the engine's state (`EngineState`, and `GameState` with what the game adds), the world and bot reply in it, `Meta`, the engine's API (`CraftaxGame`), bot registry entries (`ModelEntry`), engine ops and recordings. Derive new fields from the real JSON (craftax-wasm's `cx_state_json`, `js/local.ts`) and add them there.
- **Shared state objects are typed with an interface listing every property** (`Game`, `Flat`, `Entity` in `src/core/game.ts`, `Common` in `src/core/shared.ts`). A module that adds a property to one adds it to the interface too.
- **Classes split with `mixin`** (World, Sound) are typed as the class intersected with its parts (`js/world.ts`, `js/sound.ts`); a converted part keeps its methods' `this` typed as that whole.
- **Class fields are `declare`d** (`declare sel: number;`), so the emitted class sets them in the constructor exactly as before, in the same order.
- **Still-JavaScript modules** are typed by inference, which reads `let x = null` or `{ value: null }` as the type `null`. Until such a module is converted, a TS caller casts at the call, with a comment saying why.
- `npm run check` (types and file sizes) passes before a pull request.

## Pull requests

Keep each one to a single change, say what you tested, and include a screenshot or a short recording for anything visual. By contributing you agree that your contribution is licensed under the MIT license, the same as the rest of the project.

## Testing on a phone

Run a second dev server for the tunnel, then point [ngrok](https://ngrok.com) at it:

    CRAFTAX_TUNNEL=1 npx vite --port 8805
    ngrok http 8805

Open the `https://….ngrok-free.app` address ngrok prints on the phone (its free plan shows a "Visit Site" page once). `CRAFTAX_TUNNEL=1` makes live reload connect through the tunnel's port 443, so edits still reload the phone. Saves, settings and recordings belong to each browser, so the phone starts with its own.
