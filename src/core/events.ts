// A small typed event bus: the game announces what happened (a step, an achievement, a death), and anything that cares, a
// plugin included, listens. Listeners never throw into the game: an error in one is logged and the rest still run.

export type Handler<T> = (payload: T) => void;

export class Events<Map extends { [K in keyof Map]: unknown }> {
  private handlers = new Map<keyof Map, Set<Handler<never>>>();

  /** Listen for an event; returns a function that stops listening. */
  on<K extends keyof Map>(name: K, fn: Handler<Map[K]>): () => void {
    let set = this.handlers.get(name);
    if (!set) this.handlers.set(name, (set = new Set()));
    set.add(fn as Handler<never>);
    return () => set.delete(fn as Handler<never>);
  }

  /** Tell every listener; a listener that throws is logged and skipped. */
  emit<K extends keyof Map>(name: K, payload: Map[K]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    for (const fn of set) {
      try {
        (fn as Handler<Map[K]>)(payload);
      } catch (e) {
        console.error(`[craftax-3d] a listener for "${String(name)}" failed`, e);
      }
    }
  }
}

/** The game's own events. Payloads stay small and plain so plugins can forward them as they are. */
export interface GameEvents {
  /** The game page has its first state and is ready to play. */
  ready: { local: boolean };
  /** A state was applied (every step, and every state from a watched world). */
  state: { state: unknown; cause?: string };
  /** One action was taken in this tab, by the player or a bot. */
  step: { gameId: string; action: number; actor: "human" | "bot"; botId?: string | null };
  /** A screen was opened (null: back to the game). */
  screen: { id: string | null };
}

export const events = new Events<GameEvents>();
