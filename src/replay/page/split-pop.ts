// The split screen's window (replay.html): a keyframe's screen split between two looks along a line (the game draws it: src/looks/
// split.ts; between keyframes it sweeps: src/replay/split-sweep.ts). Opened by the side's Split button, `/`, or a keyframe's split
// icon on the row. The line in miniature, three points to drag (the middle moves it, either end turns it; Shift: 45° steps), the
// look on each side, and the numbers to type when it has to be exact. It sits beside the picture, which shows the split as you go.
import { $, keep, openState } from "./open";
import { LOOKS, SPLIT, addKey, lane, renderKeys, sel, selectKey } from "./keyframes";
import type { CamKey, SplitKey } from "../../core/types";

const P = () => openState.P!;
const SIDE_INK: Record<string, string> = { color: "#35618a", laser: "#6a1a14", phosphor: "#0f5a24" };   // (each side tinted as its look)
const pop = Object.assign(document.createElement("div"), { id: "splitpop", hidden: true });
pop.innerHTML = `<div class="win"><h2>Split screen</h2><canvas></canvas>
  <div class="sides"><label>A <select data-side="a" aria-label="Look on side A"></select></label><button data-swap title="Swap the sides" aria-label="Swap the sides"><svg viewBox="0 0 16 14" width="16" height="14" shape-rendering="crispEdges" aria-hidden="true"><path d="M4 1h1v1h-1zM3 2h2v1h-2zM2 3h12v1H2zM3 4h2v1h-2zM4 5h1v1h-1zM11 8h1v1h-1zM11 9h2v1h-2zM2 10h12v1H2zM11 11h2v1h-2zM11 12h1v1h-1z" fill="#ddd"/></svg></button><label>B <select data-side="b" aria-label="Look on side B"></select></label></div>
  <div class="nums"><label>x <input data-n="x" type="text" inputmode="numeric" autocomplete="off" spellcheck="false"></label><label>y <input data-n="y" type="text" inputmode="numeric" autocomplete="off" spellcheck="false"></label><label>angle <input data-n="ang" type="text" inputmode="numeric" autocomplete="off" spellcheck="false"></label></div>
  <p class="note">Drag the middle to move the line, an end to turn it (Shift: 45° steps). It sweeps from here to the next keyframe's.</p>
  <div class="row"><button data-off>No split</button><button data-done>Done</button></div></div>`;
document.body.append(pop);
const cv = pop.querySelector("canvas")!, g = cv.getContext("2d")!;
const pick = (s: string) => pop.querySelector<HTMLSelectElement>(`[data-side="${s}"]`)!;
const num = (n: string) => pop.querySelector<HTMLInputElement>(`[data-n="${n}"]`)!;
let k: CamKey | null = null;

const looks3d = () => Object.entries(LOOKS).filter(([id]) => id !== "original" && id !== "crystal");
const norm = (a: number) => ((((a + 180) % 360) + 360) % 360) - 180;
function size() {
  const w = ($("frame") as HTMLIFrameElement).contentWindow!, asp = w.innerWidth / Math.max(1, w.innerHeight);
  const W = asp >= 1 ? 320 : Math.round(320 * asp), H = asp >= 1 ? Math.round(320 / asp) : 320;
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
}
// the line in the miniature: its middle, along it (d), toward B (n), and where its ends' points are
function geo(s: SplitKey) {
  const a = (s.ang * Math.PI) / 180, R = 0.32 * Math.min(cv.width, cv.height);
  const c = { x: s.x * cv.width, y: s.y * cv.height }, d = { x: Math.cos(a), y: -Math.sin(a) }, n = { x: Math.sin(a), y: Math.cos(a) };
  return { c, d, n, ends: [{ x: c.x + d.x * R, y: c.y + d.y * R }, { x: c.x - d.x * R, y: c.y - d.y * R }] };
}
function draw() {
  if (!k?.split) return;
  size();
  const s = k.split, { c, d, n, ends } = geo(s), L = 3000, W = cv.width, H = cv.height;
  g.fillStyle = SIDE_INK[k.look ?? ""] ?? "#3a3a3a"; g.fillRect(0, 0, W, H);
  g.fillStyle = SIDE_INK[s.look] ?? "#555"; g.beginPath();                // B: the side the line faces
  g.moveTo(c.x + d.x * L, c.y + d.y * L); g.lineTo(c.x + d.x * L + n.x * L, c.y + d.y * L + n.y * L);
  g.lineTo(c.x - d.x * L + n.x * L, c.y - d.y * L + n.y * L); g.lineTo(c.x - d.x * L, c.y - d.y * L); g.fill();
  g.font = "14px 'Craftax Pixel', monospace"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = "#fff";
  const label = (t: string, sgn: number) => g.fillText(t, Math.max(40, Math.min(W - 40, c.x + n.x * 34 * sgn)), Math.max(12, Math.min(H - 12, c.y + n.y * 34 * sgn)));
  label("A: " + (LOOKS[k.look ?? ""] ?? k.look), -1); label("B: " + (LOOKS[s.look] ?? s.look), 1);
  g.strokeStyle = "#fff"; g.lineWidth = 2; g.beginPath(); g.moveTo(c.x - d.x * L, c.y - d.y * L); g.lineTo(c.x + d.x * L, c.y + d.y * L); g.stroke();
  g.fillStyle = "#ffd84a"; g.fillRect(c.x - 6, c.y - 6, 12, 12);
  for (const e of ends) { g.beginPath(); g.arc(e.x, e.y, 6, 0, Math.PI * 2); g.fill(); }
  const a = pick("a"), b = pick("b");
  if (document.activeElement !== a) a.value = k.look ?? "";
  if (document.activeElement !== b) b.value = s.look;
  if (document.activeElement !== num("x")) num("x").value = String(Math.round(s.x * 100));
  if (document.activeElement !== num("y")) num("y").value = String(Math.round(s.y * 100));
  if (document.activeElement !== num("ang")) num("ang").value = String(Math.round(s.ang));
}
function changed() { renderKeys(); keep(); P().wake(); draw(); }

/** The window for the keyframe being set (a new one at the playhead if none), its split made if it has none. */
export async function openSplit(key?: CamKey) {
  if (!openState.P) return;
  if (key && key !== sel) await selectKey(key);
  if (!sel) await addKey(P().t);
  k = sel;
  if (!k) return;
  k.split ??= { look: k.look === "phosphor" ? "color" : "phosphor", x: 0.5, y: 0.5, ang: 0 };
  const opts = looks3d().map(([id, name]) => `<option value="${id}">${name}</option>`).join("");
  pick("a").innerHTML = opts; pick("b").innerHTML = opts;
  pop.hidden = false; changed(); follow();
}
const close = () => { pop.hidden = true; k = null; };
// while open: the keyframe being set (another picked: its split, if it has one; none: closed), and its look as the game shows it
function follow() {
  if (pop.hidden) return;
  if (sel !== k) { if (sel?.split) { k = sel; draw(); } else return close(); }
  draw(); requestAnimationFrame(follow);
}

let drag: "c" | 0 | 1 | null = null;
cv.addEventListener("pointerdown", (e) => {
  if (!k?.split) return;
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, { ends } = geo(k.split);
  const near = (p: { x: number; y: number }) => Math.hypot(p.x - x, p.y - y) < 14;
  drag = near(ends[0]) ? 0 : near(ends[1]) ? 1 : "c";
  cv.setPointerCapture(e.pointerId); move(e);
});
function move(e: PointerEvent) {
  if (drag === null || !k?.split) return;
  const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, s = k.split;
  if (drag === "c") { s.x = Math.max(0, Math.min(1, x / r.width)); s.y = Math.max(0, Math.min(1, y / r.height)); }
  else {
    const cx = s.x * r.width, cy = s.y * r.height;
    let a = (Math.atan2(-(y - cy), x - cx) * 180) / Math.PI + (drag === 1 ? 180 : 0);   // (the far end: the same line, its sides kept)
    if (e.shiftKey) a = Math.round(a / 45) * 45;
    s.ang = norm(a);
  }
  changed();
}
cv.addEventListener("pointermove", move);
cv.addEventListener("pointerup", () => (drag = null));

pick("a").onchange = () => {                                         // A: the keyframe's own look (the game shows it; followKey keeps it)
  if (!k?.split) return;
  const v = pick("a").value;
  if (v === k.split.look) k.split.look = k.look ?? "color";
  P().look!(k.mode ?? P().camNow!().mode, v); k.look = v; changed();
};
pick("b").onchange = () => {
  if (!k?.split) return;
  const v = pick("b").value;
  if (v === k.look) { P().look!(k.mode ?? P().camNow!().mode, k.split.look); k.look = k.split.look; }
  k.split.look = v; changed();
};
pop.querySelector<HTMLElement>("[data-swap]")!.onclick = () => {
  if (!k?.split) return;
  const a = k.look ?? "color";
  P().look!(k.mode ?? P().camNow!().mode, k.split.look); k.look = k.split.look; k.split.look = a; changed();
};
for (const n of ["x", "y", "ang"]) num(n).onchange = () => {
  if (!k?.split) return;
  const v = +num(n).value;
  if (!Number.isFinite(v)) return draw();
  if (n === "ang") k.split.ang = norm(v); else k.split[n as "x" | "y"] = Math.max(0, Math.min(1, v / 100));
  changed();
};
pop.querySelector<HTMLElement>("[data-off]")!.onclick = () => { if (k) { delete k.split; changed(); } close(); };
pop.querySelector<HTMLElement>("[data-done]")!.onclick = close;
pop.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.code === "Escape") close(); });   // (typing a number: not the replay's keys)

// the split icon beside the looks (side.ts puts it there), and a keyframe's split icon on the row
$("side-looks")!.addEventListener("click", (e) => { if ((e.target as Element).closest("[data-split]")) openSplit(); });
lane.addEventListener("pointerdown", (e) => {
  const d = (e.target as Element).closest<HTMLElement>(".key");
  if (!d || !(e.target as Element).closest(".spl") || !openState.rec) return;
  e.stopImmediatePropagation(); e.preventDefault();
  openSplit(openState.rec.edits.keys[+d.dataset.i!]);
}, true);
