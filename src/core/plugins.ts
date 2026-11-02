// Plugins: what a host adds to the game without editing it. A plugin is a bundle with a name, the slots it fills (`provides`)
// and a setup function. There are two kinds of slot:
//   services, one provider each:  telemetry, replayStore
//   lists, as many as you like:   brainView, memoryView, bot, look, lookView, view, theme, setPieces
// (theme: a way of drawing the world, T; setPieces: a scene's content written into a new world: src/themes/types.ts, doc/themes.md.
// A plugin with `provides: ["theme", "setPieces"]` is a scene pack. look: a look of its own, M and a button; lookView: how a look,
// its own or another's, draws a list of views: src/looks/types.ts, doc/looks.md)
// A plugin that fills a slot it didn't declare is refused, so `provides` is always the whole story of what it changes.
import * as THREE from "three";
import type { Kit } from "../../plugin";
import { events, type Events, type GameEvents } from "./events";
import type { SetPieces, Theme } from "../themes/types";
import type { BotReply } from "./types";
import type { Look, LookView } from "../looks/types";
export type * from "../themes/types";
export type { HudInk, Look, LookView, NecroInk, PixelInk, PostPass, Renderer, ViewId } from "../looks/types";

/** Where game analytics go. The game decides what happened; the service decides whether and where to send it. */
export interface Telemetry {
  /** False while the service shouldn't send anything (not the live site, no consent...). Checked before every event. */
  enabled(): boolean;
  capture(event: string, props: Record<string, unknown>, opts?: { timestamp?: Date }): void;
  /** The player switched statistics off (false) or back on (true) in Settings. */
  consent?(on: boolean): void;
}

/** Puts a recording somewhere public and returns its link (the replay page's Share → link / embed). */
export interface ReplayStore {
  /** Who hosts it, for the page's wording ("Putting it on playcraftax.com…"). */
  label: string;
  share(file: Blob, onStep: (step: "asking" | "uploading" | "checking") => void): Promise<{ id: string; url: string }>;
  /** Where a shared recording's file lives, by its id (opens ?r=<id> and short links). */
  fileUrl?(id: string): string;
  /** True on the host's own site, where its replay page and short links apply. */
  isHome?(where: Location): boolean;
  /** The host's replay page ("https://playcraftax.com/replay/"), used for links made on its own site. */
  page?: string;
  /** The host's short link for a shared id ("https://playcraftax.com/r/<id>"). */
  shortLink?(id: string): string;
}

/** A picture of what a bot is thinking, in the bot panel, instead of the built-in neuron brain. The newest one that accepts the
 *  world's bot wins; a checkbox in the expanded panel turns it off. */
export interface BrainView {
  id: string;
  /** For the panel's checkbox: "Show <label>". */
  label: string;
  /** The world (its bot_kind, bot_id...) whose bot this view can draw. */
  accepts(world: Record<string, unknown>): boolean;
  el: HTMLElement;
  /** An extra option shown beside the checkbox, if the view has one. */
  opt?: HTMLElement;
  /** True: no black behind it (the panel sets this for the folded phone view). */
  clear: boolean;
  setNames(actions: string[]): void;
  body(state: unknown): void;
  /** The bot's reply for the last move: its action, its probabilities and whatever else its worker sends. */
  update(reply: unknown): void;
}

/** Where a memory view may draw: the letterbox beside the classic view's 2D image, on each side. */
export interface MemoryArea {
  /** The most room a panel has, in CSS pixels (its canvas's width and height may be anything up to these). */
  width: number;
  height: number;
  /** True: the red laser frame (draw in its colors); false: the original art (white on black). */
  red: boolean;
}

/** The memory strip: a bot's memory on two panels down both sides of the classic 2D view (original art and laser). The game owns
 *  the two canvases and places them (centered in the letterbox, each side); the view sizes and paints them. The newest view that is
 *  active() draws; with none the panels stay hidden. Y turns the strip off and on (localStorage "craftax3d.memory"); with no view
 *  listed Y does nothing. */
export interface MemoryView {
  id: string;
  /** For the flash when Y toggles it: "<label> on" / "<label> off". */
  label: string;
  /** Every new state from the engine; the bot's last reply (its worker's act result) is in state.world.bot_reply. */
  update(state: Record<string, unknown>): void;
  /** True while it has a memory to show (its kind of bot playing); false hides the panels. */
  active(): boolean;
  /** Paint both panels, each at most area.width × area.height (set each canvas's width and height). Called up to 20 times a second
   *  while the strip shows. now: performance.now(). */
  draw(left: HTMLCanvasElement, right: HTMLCanvasElement, area: MemoryArea, now: number): void;
  /** Forget what it holds (a new world, or the player turned the strip off). */
  clear(): void;
}

/** A registry entry for a bot (models.json's shape): id, name, kind, the file it loads... */
export type BotModel = { id: string; kind?: string; name?: string; [k: string]: unknown };

/** A kind of bot the built-in ONNX player can't run: it lists its models and runs them in a worker of its own. */
export interface BotSource {
  /** The models' `kind`, e.g. "crystal". */
  kind: string;
  /** Its models, added to the picker after the registry's. root: the game's own folder, for files kept beside it. */
  models(root: URL): Promise<BotModel[]>;
  /** Fills in a registry entry of this kind (models.json) the way models() would, e.g. the file it loads. */
  prepare?(model: BotModel, root: URL): BotModel;
  /** A worker that speaks the agent-worker protocol (js/agent.js). */
  worker(model: BotModel): Worker;
  /** What it sees each move, when that isn't the engine's packed observation. */
  observe?(model: BotModel, game: { state(): unknown; obs(): unknown }): Promise<ArrayLike<number>> | ArrayLike<number>;
  /** True: it always chooses among the actions that would change something (Settings can't turn that off). */
  usefulOnly?: boolean;
  /** What to tell the player when a model won't load. */
  hint?(model: BotModel): string;
  /** Its own brain picture in recordings and replays (src/replay/brain-rec.ts). */
  brain?: BrainCodec;
}

/** A bot source's own part of the brain in a recording (the crystal's picture): what to keep each move, and the picture again from
 *  it in a replay. Moves come in order from the recording's start, so it can keep changes only; first: the first move since a
 *  reset (a recording's start, a seek, the bot taking over). */
export interface BrainCodec {
  /** What to keep of this move (undefined: nothing). full: Settings → Agent → "Record brain activity" is on. */
  record?(reply: BotReply, full: boolean, first: boolean): unknown;
  /** The move's picture again: kept.x is what record() kept (none in a recording made before, or by another source). What it
   *  returns is added to the reply; a promise, once it settles. */
  replay(kept: BotReply & { x?: unknown }, ctx: { first: boolean; seed: number; actions: readonly string[]; model: BotModel; observe(): Promise<ArrayLike<number>> | ArrayLike<number> }): Partial<BotReply> | Promise<Partial<BotReply>>;
  /** The picture as it stands now, whole: what a trimmed recording keeps for its first move. */
  snapshot?(): unknown;
}

interface Services { telemetry: Telemetry; replayStore: ReplayStore }
interface Lists { brainView: BrainView; memoryView: MemoryView; bot: BotSource; look: Look; lookView: LookView; view: unknown; theme: Theme; setPieces: SetPieces }
export type Slot = keyof Services | keyof Lists;

/** What a plugin's setup gets: the game's events, and the two ways to fill a slot. */
export interface PluginHost {
  events: Events<GameEvents>;
  /** The game's own three.js, for a plugin that makes 3D objects (a theme's weather, a model) without bundling its own copy: a
   *  plugin added by hand (Settings → Add plugin…) is one plain file and can't import "three" itself. Its version is
   *  three.REVISION ("186"): a plugin written against one release checks it, since the game may move to a newer one. */
  three: typeof THREE;
  /** What a plugin may use from the game (plugin.ts, "craftax-3d/plugin"), for a plugin added by hand, which can't import it:
   *  blocks, paint, models (a creature's parts, shaded like the game's own: call them from a model(), not from setup), hud, orient. */
  kit: Kit;
  provide<K extends keyof Services>(slot: K, impl: Services[K]): void;
  add<K extends keyof Lists>(slot: K, item: Lists[K]): void;
}

export interface Plugin {
  name: string;
  provides: Slot[];
  setup(host: PluginHost): void;
}

/** The kit, set by plugin.ts as it loads (it can't be imported here: this module loads first, from src/config.ts). */
export const kitRef: { kit?: Kit } = {};

const services: Partial<Services> = {};
const lists: { [K in keyof Lists]: Lists[K][] } = { brainView: [], memoryView: [], bot: [], look: [], lookView: [], view: [], theme: [], setPieces: [] };
const loaded: string[] = [];

/** Register plugins (once, at boot, from craftax.config.ts). A plugin that fails to set up is logged and left out. */
export function registerPlugins(list: Plugin[]): void {
  for (const p of list) {
    if (loaded.includes(p.name)) continue;
    const declared = new Set<Slot>(p.provides);
    const check = (slot: Slot) => {
      if (!declared.has(slot)) throw new Error(`plugin "${p.name}" fills "${slot}" but doesn't list it in provides`);
    };
    const host: PluginHost = {
      events, three: THREE,
      get kit() { if (!kitRef.kit) throw new Error("host.kit: craftax-3d/plugin hasn't loaded"); return kitRef.kit; },
      provide(slot, impl) {
        check(slot);
        if (services[slot]) console.warn(`[craftax-3d] plugin "${p.name}" replaces the ${slot} service`);
        services[slot] = impl;
      },
      add(slot, item) {
        check(slot);
        lists[slot].push(item);
      },
    };
    try {
      p.setup(host);
      loaded.push(p.name);
    } catch (e) {
      console.error(`[craftax-3d] plugin "${p.name}" failed to set up and was left out`, e);
    }
  }
}

/** The provider of a service, or null when no plugin provides it (the game then does without). */
export function service<K extends keyof Services>(slot: K): Services[K] | null {
  return services[slot] ?? null;
}

/** Everything plugins added to a list, oldest first. */
export function listed<K extends keyof Lists>(slot: K): readonly Lists[K][] {
  return lists[slot];
}

/** The names of the plugins that set up, in order. */
export const pluginNames = (): readonly string[] => loaded;
