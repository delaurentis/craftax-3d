// A replay's split screen between two keyframes (js/record.ts camKeyed): the line sweeps from one keyframe's to the next over the
// whole gap between them (Pete: a keyframe placed earlier makes it slower). Into a split from a keyframe without one, the line comes
// in from off screen, the new look's side growing from its edge; out of one, it goes off screen, the side that isn't staying
// shrinking away. Whichever look covers the screen as the line leaves is the one the next keyframe shows, so the look switches
// there with no fade (src/replay/recording.ts).
import type { CamKey, SplitKey, SplitNow } from "../core/types";

/** The same line, its sides swapped: `look` beyond it now (the angle turned half way round turns the side it faces). */
const flip = (s: SplitKey, look: string): SplitKey => ({ look, x: s.x, y: s.y, ang: s.ang + 180 });
/** Degrees, the short way round. */
const lerpDeg = (a: number, b: number, k: number) => a + ((((b - a) % 360) + 540) % 360 - 180) * k;
const still = (s: SplitKey | undefined): SplitNow | null => (s ? { ...s, push: 0 } : null);

/**
 * The split screen at a moment between keyframes a (in force) and b (the next, or null), k of the way (eased, 0..1). lookA, lookB:
 * the look each keyframe shows (its own, or the recording's). Null: no split.
 */
export function splitAt(a: CamKey | null, b: CamKey | null, lookA: string, lookB: string, k: number): SplitNow | null {
  const A = a?.split, B = b?.split;
  if (!b || k <= 0) return still(A);
  if (A && B) {                                                        // one line to the other (its looks the same two, either way round)
    const Bo = B.look === A.look && lookB === lookA ? B : B.look === lookA && lookB === A.look ? flip(B, A.look) : null;
    if (!Bo) return still(A);                                          // (two other looks: it changes at b)
    return { look: A.look, x: A.x + (Bo.x - A.x) * k, y: A.y + (Bo.y - A.y) * k, ang: lerpDeg(A.ang, Bo.ang, k), push: 0 };
  }
  if (A) return { ...A, push: lookB === A.look ? -k : k };             // out: the look staying takes the screen
  if (B) {                                                             // in: the side that's new grows from its edge
    if (lookB === lookA) return { ...B, push: 1 - k };
    if (B.look === lookA) return { ...flip(B, lookB), push: 1 - k };
  }
  return null;
}
