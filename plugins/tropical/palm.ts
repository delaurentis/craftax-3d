// Tropical's palm trees: the standard trunk made thin, then more of it, each piece a little further over; coconuts; and three layers
// of fronds (the bottom droops, the middle reaches furthest, the top is shorter and more upright), each frond a row of overlapping
// slabs from the crown out to its tip, tapering, each slab tall enough to reach the last, so it reads as one piece. Eight palms (Pete),
// reused: three tall, three middle, two short; each tree wears one of its size, turned a quarter turn or more, both by its tile
// (crownPick: the game draws each once and copies it), so a palm's look comes from its key, not its tile.
import type { CrownBox, TreeAt, TrunkBase } from "craftax-3d/plugin";
import { rng } from "./tiles";

export const TRUNK_W = 0.36;
const LAYERS = [
  { n: 5, reach: 1.7, y: -0.12, rise: 0.05, droop: 0.75, turn: 0 },     // (Pete: fewer, wider fronds: 16, not 21)
  { n: 6, reach: 2.4, y: 0, rise: 0.3, droop: 0.65, turn: Math.PI / 6 },
  { n: 5, reach: 1.35, y: 0.16, rise: 0.4, droop: 0.3, turn: Math.PI / 5 },
];
type Size = "tall" | "mid" | "short";
/** Each tree's size, by its tile: about one in five tall (2–3 blocks over the rest), about one in four short (fronds just above your
 *  head in first person), the rest in between. */
export const sizeAt = (r: number, c: number): Size => { const v = rng(Math.imul(r, 83492791) ^ Math.imul(c, 2971215073))(); return v < 0.22 ? "tall" : v < 0.47 ? "short" : "mid"; };
// (Pete) the overhead views' short trunk, the palm's skirt there: 2 blocks or 1, half the trees each; and on about half of the 2-block
// ones, a slightly wider foot half a block high (on those trees in the full-size view too)
const roll = (r: number, c: number, salt: number) => rng(Math.imul(r, 2246822519) ^ Math.imul(c, 3266489917) ^ salt)();
export const stubAt = (r: number, c: number): number => (roll(r, c, 0x1f3d) < 0.5 ? 1 : 2);
export const footAt = (r: number, c: number, overhead: boolean): TrunkBase | null => (stubAt(r, c) === 2 && roll(r, c, 0x2c7b) < 0.5 ? { width: overhead ? 0.42 : 0.46, height: 0.5 } : null);

const PALMS: Record<Size, number> = { tall: 3, mid: 3, short: 2 };
/** Which of the eight palms the tree on (r, c) wears, and its quarter turns. */
export function pickPalm(r: number, c: number): { key: string; turn: number } {
  const kind = sizeAt(r, c), R = rng(Math.imul(r, 2654435761) ^ Math.imul(c, 40503) ^ 0x51ed);
  return { key: kind + Math.floor(R() * PALMS[kind]), turn: Math.floor(R() * 4) };
}
const keySeed = (key: string) => { let h = 7; for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619); return h; };

/** A palm's crown (with its trunk above the standard one), as boxes. */
export function palm(at: TreeAt): CrownBox[] {
  const R = rng(keySeed(pickPalm(at.r, at.c).key)), k = at.overhead ? 0.5 : 1;
  const cx = at.c + 0.5, cz = at.r + 0.5, out: CrownBox[] = [];
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, top: string, side: string, bottom: string, piece: number) =>
    out.push({ x0, y0, z0, x1, y1, z1, top, side, bottom, piece });
  // above the trunk (2 blocks for a short palm: trunk.height): more pieces as thin as it, each a little further over (its own lean,
  // curving more as it climbs); two, or on a tall palm six to eight, 2–3 blocks above the rest; overhead, on a 1-block stub, as many
  // more as make up the block, so the tree stands as tall
  const kind = sizeAt(at.r, at.c), extra = at.overhead ? Math.max(0, Math.round((2 - at.trunk) / (0.5 * k))) : 0;
  const n = (kind === "tall" ? 6 + Math.floor(R() * 3) : kind === "short" ? 1 : 2) + extra;
  const lx = (R() - 0.5) * 0.4 * k, lz = (R() - 0.5) * 0.4 * k, w = (TRUNK_W / 2) * k, start = at.trunk - 0.02;
  const off = (i: number) => Math.pow(i / 2, 0.8);
  for (let i = 0; i < n; i++) {
    const x = cx + lx * off(i + 1), z = cz + lz * off(i + 1);
    box(x - w, start + i * 0.5 * k, z - w, x + w, start + (i + 1) * 0.5 * k, z + w, "palm_bark", "palm_bark", "palm_bark", 0);
  }
  const tx = cx + lx * off(n + 1), tz = cz + lz * off(n + 1), top = start + (n * 0.5 + 0.05) * k;
  box(tx - 0.26 * k, top - 0.12 * k, tz - 0.26 * k, tx + 0.26 * k, top + 0.2 * k, tz + 0.26 * k, "palm_frond", "palm_frond", "palm_frond_under", 1);
  const nuts = 2 + Math.floor(R() * 3), c = 0.1 * k;                     // coconuts, tucked under the fronds
  for (let i = 0; i < nuts; i++) {
    const a = R() * Math.PI * 2, x = tx + Math.cos(a) * 0.22 * k, z = tz + Math.sin(a) * 0.22 * k, y = top - 0.22 * k;
    box(x - c, y - c, z - c, x + c, y + c, z + c, "coconut", "coconut", "coconut", 1);
  }
  // the slabs along a frond, 0.48 blocks wide by the crown tapering to 0.24, each the next three quarters of its width on (they
  // overlap a quarter: one piece with fewer slabs, Pete); overhead (coarser: it's small and far) about 0.95 of a width on, at half size
  const w0 = at.overhead ? 0.28 : 0.24, w1 = at.overhead ? 0.24 : 0.12, gap = at.overhead ? 1.9 : 1.5;
  LAYERS.forEach((L, li) => {
    const spin = R() * Math.PI * 2;
    for (let f = 0; f < L.n; f++) {
      const a = spin + L.turn + (f / L.n) * Math.PI * 2 + (R() - 0.5) * 0.25, ux = Math.cos(a), uz = Math.sin(a);
      const reach = L.reach * (0.85 + R() * 0.25) * k, droop = L.droop * (0.85 + R() * 0.3);
      const yAt = (d: number) => { const t = d / reach; return top + (L.y + L.rise * t - droop * t * t) * k; };
      let prev = yAt(0.1 * k);
      for (let d = 0.1 * k, half = w0 * k; d <= reach; d += half * gap) {
        const t = d / reach, y = yAt(d), x = tx + ux * d, z = tz + uz * d;
        half = Math.max(w0 * (1 - 0.55 * t), w1) * k;
        const lo = Math.min(y, prev) - 0.035 * k, hi = Math.max(y, prev) + 0.035 * k;
        box(x - half, lo, z - half, x + half, hi, z + half, "palm_frond", "palm_frond", "palm_frond_under", 2 + li * 2 + (f % 2));
        prev = y;
      }
    }
  });
  return out;
}
