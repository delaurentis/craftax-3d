// The bot's brain, in pixel art: Craftax's 43 actions as neurons set into a little brain (grouped in regions: moving up front,
// crafting at the sides, placing on top, fighting and magic low at the front, resting at the back, potions and the rest at the
// base), each lit by the probability the policy gives it. The chosen action fires (a flash, a ring, pulses along its synapses),
// the brain turns to bring that region round to the front, and the top three are called out with their share.
//   brain.setNames(meta.actions); panel.appendChild(brain.el); brain.update(world.bot_reply)
import type { BotReply, GameState } from "../src/core/types";

const W = 248, H = 150, P = 3;                                         // canvas size; one brain "pixel" is 3 × 3
// one colour scale for everything that fires, green phosphor like an oscilloscope: near black at rest, through dim and bright
// green to a white-hot green at full
const RAMP = [[0, 4, 18, 8], [0.3, 12, 85, 32], [0.55, 30, 170, 70], [0.8, 80, 255, 120], [1, 225, 255, 225]];
const heat = (v: number, k = 1) => {
  v = Math.max(0, Math.min(1, v));
  let i = 1; while (i < RAMP.length - 1 && v > RAMP[i][0]) i++;
  const [a, b] = [RAMP[i - 1], RAMP[i]], u = (v - a[0]) / (b[0] - a[0]);
  return [1, 2, 3].map((j) => Math.round((a[j] + (b[j] - a[j]) * u) * k)).join(",");
};
const CX = 124, CY = 72, RX = 70, RY = 46;                             // where the brain sits and its half-size

// regions: [name test, centre longitude, centre latitude] (longitude 0 = facing you before the brain turns); each region's neurons
// sit in a little patch round its centre, one neuron each, spread over the whole brain
const REGIONS: [(n: string) => boolean, number, number][] = [
  [(n) => /^(NOOP|LEFT|RIGHT|UP|DOWN)$/.test(n), -0.7, 0.45],
  [(n) => n === "DO", 0.05, 0.75],
  [(n) => n.startsWith("PLACE_"), 0.85, 0.45],
  [(n) => n.startsWith("MAKE_"), 1.75, -0.15],
  [(n) => /^(SHOOT|CAST|ENCHANT)/.test(n), -1.6, -0.2],
  [(n) => /^(SLEEP|REST)$/.test(n), 2.9, 0.35],
  [(n) => true, -2.7, -0.35],                                          // potions, the book, levelling up, ladders
];

// how an action is called out: Craftax's UP / DOWN / LEFT / RIGHT are steps on the map (north, south...), not up or down a floor
const SAY: Record<string, string> = { NOOP: "wait", UP: "walk north", DOWN: "walk south", LEFT: "walk west", RIGHT: "walk east", DESCEND: "ladder down", ASCEND: "ladder up" };
const say = (a: string) => SAY[a] || a.toLowerCase().replace(/_/g, " ");
// a point on the brain's sphere (r: its shell, 1 the surface); the action neurons, the memory units, the senses (some in the base)
interface OnSphere { lon: number; lat: number; r?: number }
interface Neuron extends OnSphere { id: number; p: number; fire: number; glow: number }
interface MemUnit extends OnSphere { k: number; l: number; hi: boolean; r: number; a: number; glow: number }
interface Sense extends OnSphere { k: number; a: number; base?: boolean; ax?: number; x?: number; y?: number; flash?: number; seen?: boolean; glow?: number }
type At = () => { x: number; y: number };
let names: string[] = [], neurons: Neuron[] = [], links: [Neuron, Neuron][] = [], built = false;
function build() {
  const groups = REGIONS.map((): number[] => []);
  names.forEach((n, i) => groups[REGIONS.findIndex(([test]) => test(n))].push(i));
  neurons = [];
  groups.forEach((ids, g) => {
    const [, lon0, lat0] = REGIONS[g];
    ids.forEach((id, k) => {                                              // a sunflower spiral round the region's centre
      const a = k * 2.39996, r = 0.2 * Math.sqrt(k + (ids.length > 1 ? 0.5 : 0));
      neurons[id] = { id, lon: lon0 + Math.cos(a) * r * 1.3, lat: Math.max(-0.95, Math.min(0.95, lat0 + Math.sin(a) * r)), p: 0, fire: 0, glow: 0 };
    });
  });
  links = [];                                                             // synapses: each neuron to its three nearest
  for (const a of neurons) {
    const d = neurons.filter((b) => b !== a).map((b): [Neuron, number] => [b, Math.hypot(a.lon - b.lon, a.lat - b.lat)]).sort((x, y) => x[1] - y[1]);
    for (const [b] of d.slice(0, 3)) if (!links.some(([x, y]) => (x === b && y === a))) links.push([a, b]);
  }
  // the inner neurons, real values from the policy (agent-worker.ts): its recurrent memory as nested shells, one a layer, layer 1
  // just under the surface where the senses come in, the last at the core: in the panel its busiest 48 units a layer (a sunflower
  // sphere); expanded, the next 144 too (`hi`, a second sunflower between them); and its 51 self-sensing inputs on the surface
  mem = Array.from({ length: MEM_LAYERS * MEM_PER }, (_, k): MemUnit => {
    const l = Math.floor(k / MEM_PER), j = k % MEM_PER, hi = j >= TIER, n = hi ? MEM_PER - TIER : TIER, i = hi ? j - TIER : j;
    const y = 1 - (2 * (i + 0.5)) / n;
    return { k, l, hi, r: SHELLS[l], lon: i * 2.39996 + l * 0.8 + (hi ? 1.2 : 0), lat: Math.asin(y) * 0.92, a: 0, glow: 0 };
  });
  sense = Array.from({ length: 51 }, (_, k): Sense => {
    const y = 1 - (2 * (k + 0.5)) / 51;
    return { k, lon: k * 2.39996 + 1.2, lat: Math.asin(y) * 0.9, a: 0 };
  });
  // a third of the senses sit in the base of the brain instead (the cerebellum and the stem), where the body's signals come in;
  // they turn with the rest (Pete): each keeps its place in the cerebellum or the stem, which swing round as the brain turns (turned())
  const base = sense.filter((sn) => sn.k % 3 === 0);
  base.forEach((sn, i) => {
    sn.base = true;
    if (i < 13) { const a = i * 2.39996, r = Math.sqrt((i + 0.5) / 13); sn.ax = CX + 38; sn.x = CX + 38 + Math.cos(a) * r * 24; sn.y = CY + 36 + Math.sin(a) * r * 10; }
    else { sn.ax = CX + 14; sn.x = CX + 14 + ((i % 2) ? 2.5 : -2.5); sn.y = CY + 40 + (i - 13) * 4.5; }
  });
  baseLinks = [];                                                         // a little nerve web through the base
  for (const a of base) for (const [b] of base.filter((b) => b !== a).map((b): [Sense, number] => [b, Math.hypot(a.x! - b.x!, a.y! - b.y!)]).sort((x, y) => x[1] - y[1]).slice(0, 2))
    if (!baseLinks.some(([x, y]) => x === b && y === a)) baseLinks.push([a, b]);
  const sph = (a: OnSphere, b: OnSphere) => Math.acos(Math.max(-1, Math.min(1, Math.sin(a.lat) * Math.sin(b.lat) + Math.cos(a.lat) * Math.cos(b.lat) * Math.cos(a.lon - b.lon))));
  // memory to its two nearest units in its own shell, and to the nearest one in the next shell in (one layer feeds the next);
  // each action listens to its three nearest units of the core. Wired twice: over the panel's units, and over all of them
  const near = <T extends OnSphere>(a: OnSphere, list: T[], n: number) => list.filter((b) => b !== a).map((b): [T, number] => [b, sph(a, b)]).sort((x, y) => x[1] - y[1]).slice(0, n).map(([b]) => b);
  const wire = (units: MemUnit[]) => {
    const layer = (l: number) => units.filter((m) => m.l === l), ml: [MemUnit, MemUnit][] = [], al: [MemUnit, Neuron][] = [];
    for (const a of units) { for (const b of near(a, layer(a.l), 2)) ml.push([a, b]); if (a.l < MEM_LAYERS - 1) ml.push([a, near(a, layer(a.l + 1), 1)[0]]); }
    for (const n of neurons) for (const m of near(n, layer(MEM_LAYERS - 1), 3)) al.push([m, n]);
    return { mem: ml, act: al };
  };
  wires = { small: wire(mem.filter((m) => !m.hi)), big: wire(mem) };
  const outer = mem.filter((m) => m.l === 0 && !m.hi), low = outer.slice().sort((x, y) => x.lat - y.lat).slice(0, 16);   // the senses feed the outer shell; the base its lower part
  senseLinks = sense.map((s, i): [Sense, MemUnit] => [s, s.base ? low[(i * 7) % low.length] : near(s, outer, 1)[0]]);   // each sense feeds one memory unit
  built = true;
}
let MEM_LAYERS = 4, MEM_PER = 192, TIER = 48, SHELLS = [0.8, 0.6, 0.42, 0.24];   // units a layer (the panel shows the first TIER); shell radii (surface 1)
// another model's memory (the worker's memShape: [layers, units a layer, the first tier]): its shells spread over the same depth
function layout([l, per, tier]: [number, number, number]) {
  MEM_LAYERS = l; MEM_PER = per; TIER = tier;
  SHELLS = l === 4 ? [0.8, 0.6, 0.42, 0.24] : l === 1 ? [0.6] : Array.from({ length: l }, (_, i) => 0.8 - (0.56 * i) / (l - 1));
}
// a wire's light: each end keeps a glow that's topped up when it fires and fades over a few seconds of quiet (GLOW a bot step),
// so a connection that hasn't fired for a while sinks back to a dim baseline (WIRE)
const GLOW = 0.985, WIRE = 0.12;                                       // WIRE: the dim baseline every wire keeps (Pete)
const big = () => (el.clientWidth || W) / W > 1.5;                       // the panel expanded: every unit, finer pixels
type Wiring = { mem: [MemUnit, MemUnit][]; act: [MemUnit, Neuron][] };
let mem: MemUnit[] = [], sense: Sense[] = [], wires: { small: Wiring; big: Wiring } | null = null, senseLinks: [Sense, MemUnit][] = [], baseLinks: [Sense, Sense][] = [];

const el = document.createElement("canvas");
let DPR = 2;   // drawn at twice the size (round neurons, smooth energy), more when the panel is expanded: sharp at any size (frame())
el.width = W * DPR; el.height = H * DPR;
el.className = "brain";
Object.assign(el.style, { width: W + "px", height: H + "px", display: "block", margin: "6px 0 2px" });
// the panel's expand button (net.ts) makes the whole bot window big; the brain then fills its width (index.html #botpanel.big)
const box = document.createElement("div");
box.className = "brain-box";
box.append(el);
const g = el.getContext("2d")!;

// the brain's outline as a pixel mask (a side view: the cerebrum, the cerebellum tucked under the back, a stub of stem)
// as [x, y, part] at a pixel size p (in brain units): P in the panel, finer when the panel is expanded (masks, cached)
// [x, y, part (0 cerebrum, 1 cerebellum, 2 stem), u, v, on a fissure, e]
type MaskPx = [number, number, number, number, number, number, number];
const masks: Record<number, MaskPx[]> = {};
function maskFor(p: number) {
  if (masks[p]) return masks[p];
  const m: MaskPx[] = [];
  for (let y = 0; y < H / p; y++) for (let x = 0; x < W / p; x++) {
    const px = x * p + p / 2, py = y * p + p / 2;
    // the cerebrum, seen from the side (front to the left): an ellipse pushed out and in by lobe, with a bumpy gyral rim — a rounder
    // frontal lobe, a notch under it where the temporal lobe hangs down, a flatter underside at the back over the cerebellum
    const u = (px - CX) / RX, v = (py - CY + 4) / (RY * 0.95), th = Math.atan2(-v, u), gs = (a: number, w: number) => Math.exp(-((((th - a + 9.42) % 6.283 - 3.14) / w) ** 2));
    const f = 1 + 0.07 * gs(2.4, 0.6) - 0.2 * gs(-2.35, 0.22) + 0.1 * gs(-1.55, 0.45) - 0.14 * gs(-0.55, 0.4) - 0.04 * gs(0.15, 0.35) + 0.025 * Math.sin(th * 13);
    const e = (u * u + v * v) / (f * f);
    const cb = ((px - (CX + 38)) / 30) ** 2 + ((py - (CY + 36)) / 15) ** 2;
    const stem = Math.abs(px - (CX + 14)) < 7 && py > CY + 30 && py < CY + 58;
    // the two great fissures, fixed: the lateral (Sylvian) one rising back from the notch, the central sulcus coming down from the top
    const syl = u > -0.62 && u < 0.38 && Math.abs(v - (0.32 - 0.42 * (u + 0.62))) < 0.045;
    const cen = v > -0.98 && v < 0.02 && Math.abs(u - (0.08 - 0.32 * (v + 0.95))) < 0.035;
    if (e < 1 || cb < 1 || stem) m.push([x * p, y * p, e < 1 ? 0 : cb < 1 ? 1 : 2, u, v, e < 1 && (syl || cen) ? 1 : 0, e]);
  }
  return (masks[p] = m);
}
// PU: one pixel of the pixel art (cells, rings, tissue / 3), in brain units. 1 in the panel; expanded, the art keeps ~2 screen
// pixels a pixel instead of growing with the panel (Pete: pixelated, but not much coarser than the rest of the screen)
let PU = 1;

// energy along a wire (between two places, or two neurons by id), and rings spreading from a place
interface Spark { from?: At; to?: At; a?: number; b?: number; t0: number; dur?: number; c?: string; hit?: boolean }
interface Ripple { at: At; t0: number; c: string; size: number; dur: number }
let yaw = 0, yawTo = 0, lastReply: BotReply | null = null, sparks: Spark[] = [], ripples: Ripple[] = [], running = false, chosen = -1;
// cells and rings are drawn in whole screen pixels, pixel art like the tissue (no smooth arcs): a disc of radius r, and a
// one-pixel ring of radius r
const dot = (x: number, y: number, r: number, c: string) => {
  const u = PU, cx = Math.floor(x / u) * u, cy = Math.floor(y / u) * u, R = Math.ceil(r / u), r2 = (r / u) ** 2 + 0.5;
  g.fillStyle = c;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dy * dy <= r2) g.fillRect(cx + dx * u, cy + dy * u, u, u);
};
const ring = (x: number, y: number, r: number, c: string) => {
  const u = PU, cx = Math.floor(x / u) * u, cy = Math.floor(y / u) * u, R = Math.ceil(r / u) + 1;
  g.fillStyle = c;
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) if (Math.abs(Math.hypot(dx, dy) - r / u) < 0.5) g.fillRect(cx + dx * u, cy + dy * u, u, u);
};
// a ripple: rings of energy spreading out from a neuron (at: a function giving its place now, as it turns)
const ripple = (at: At, t0: number, c: string, size = 1, rings = 3) => { for (let i = 0; i < rings; i++) ripples.push({ at, t0: t0 + i * 0.16, c, size, dur: 0.7 }); };
// the whole brain turns about its vertical axis with the neurons' sphere (yaw): seen from the side the cerebrum is its full length,
// from the front or back about 0.7 of it, and past a quarter turn it is seen from the other side (mirrored); the cerebellum and the
// stem, behind and below the middle, swing round with it (their centres by cos yaw)
let cosY = 1, kX = 1;
const turned = (x: number, ax: number) => CX + (ax - CX) * cosY + (x - ax) * kX;                // a point of a part whose centre is ax
const where = (n: OnSphere & { base?: boolean; x?: number; ax?: number; y?: number }) => (n.base ? { x: turned(n.x!, n.ax!), y: n.y!, z: 1 } : project(n));   // a neuron's place now
const project = (n: OnSphere) => {
  // on an egg, not a ball: the brain is about 0.7 as deep (side to side) as it is long, so seen from the front the neurons stay inside
  // the turned outline (as kX narrows it)
  const r = n.r || 1, lon = n.lon + yaw, cl = Math.cos(n.lat) * r, y = Math.sin(n.lat) * r;
  const x = (Math.sin(n.lon) * Math.cos(yaw) + 0.7 * Math.cos(n.lon) * Math.sin(yaw)) * cl, z = Math.cos(lon) * cl;
  return { x: CX + x * RX * 0.88, y: CY - 4 - y * RY * 0.85, z };
};

function frame(now: number) {
  if (!el.isConnected) { running = false; return; }
  requestAnimationFrame(frame);
  const t = now / 1000;
  let d = yawTo - yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  if (!dead) yaw += d * 0.05 + 0.0015;
  cosY = Math.cos(yaw); kX = Math.sign(cosY || 1) * Math.sqrt(cosY * cosY + 0.49 * Math.sin(yaw) ** 2);                                    // a dead brain stops turning                                               // swing round to the active region, with a slow drift
  const want = Math.max(2, Math.min(8, Math.ceil(((el.clientWidth || W) / W) * (devicePixelRatio || 1))));
  if (want !== DPR) { DPR = want; el.width = W * DPR; el.height = H * DPR; }
  const k = (el.clientWidth || W) / W;
  PU = k > 1.5 ? Math.max(1, Math.round(2 * (devicePixelRatio || 1))) / DPR : 1;     // whole device pixels a pixel: crisp, no seams
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (brain.clear) g.clearRect(0, 0, W, H); else { g.fillStyle = "#030805"; g.fillRect(0, 0, W, H); }
  // the brain: dark tissue, its folds a soft shading that slides with the turn (no specks: the only dots are the neurons)
  const tp = P * PU;
  const tissueA = brain.clear ? 0.25 : 1;                                 // the mini brain: the tissue faint, the game through it (Pete)
  for (const [x, y, part, u, w, fiss, e] of maskFor(tp)) {
    // gyri: winding ridges whose grooves (sulci) slide with the turn; the fissures stay; the rim darkens; the cerebellum in folia
    const fold = 0.5 + 0.5 * Math.sin((x / P) * 0.45 + yaw * 3 + Math.sin((y / P) * 0.35) * 2.2);
    const gy = Math.sin(u * 15 + Math.sin(w * 9 + yaw * 2) * 1.6 + yaw * 3) * Math.sin(w * 12 + Math.cos(u * 8) * 1.7);
    let v = part === 2 ? 2 : part === 1 ? (Math.sin(y * 1.3 / PU) > 0.4 ? 0 : 9) : 15 + fold * 8;
    if (part === 0) { if (fiss) v = -8; else if (Math.abs(gy) < 0.16) v = 1; if (e > 0.9) v *= 0.75; }
    g.fillStyle = `rgba(${8 + v * 0.3},${20 + v * 0.9},${12 + v * 0.4},${tissueA})`;
    const X = turned(x + tp / 2, part === 0 ? CX : part === 1 ? CX + 38 : CX + 14), wd = tp * Math.abs(kX);
    g.fillRect(X - wd / 2, y, wd + 0.35, tp);                              // turned with the brain (a hair wide: no seams)
  }
  if (!built) return;
  const pos = neurons.map(project), mpos = mem.map(project), spos = sense.map(where), all = big(), { mem: memLinks, act: actLinks } = all ? wires!.big : wires!.small;
  // the inner wiring: senses up into memory, memory to memory, memory to the actions; brighter where both ends are busy
  const line = (x0: number, y0: number, x1: number, y1: number, k: number, c: string) => { if (k < 0.05) return; g.strokeStyle = `rgba(${c},${Math.min(0.9, k).toFixed(3)})`; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); };
  for (const [a, b] of memLinks) { const pa = mpos[a.k], pb = mpos[b.k]; if (pa.z > -0.1 && pb.z > -0.1) line(pa.x, pa.y, pb.x, pb.y, (WIRE + 0.8 * Math.min(1, a.glow + b.glow)) * (0.4 + 0.6 * (pa.z + pb.z + 2) / 4), "40,170,80"); }
  for (const [a, b] of baseLinks) line(turned(a.x!, a.ax!), a.y!, turned(b.x!, b.ax!), b.y!, WIRE + 0.8 * Math.max(a.glow || 0, b.glow || 0), "30,150,70");
  for (const [s, m] of senseLinks) { const ps = spos[s.k], pm = mpos[m.k]; if (ps.z > -0.2) line(ps.x, ps.y, pm.x, pm.y, (WIRE + 0.8 * (s.glow || 0)) * Math.max(0.3, (pm.z + 1) / 2), "70,220,110"); }
  for (const [m, n] of actLinks) { const pm = mpos[m.k], pn = pos[n.id]; if (pm.z > -0.2 && pn.z > -0.2) line(pm.x, pm.y, pn.x, pn.y, WIRE + 0.75 * n.glow * Math.min(1, 0.3 + 2 * m.glow), "50,200,100"); }
  // synapses between the actions: brighter between busy neurons
  for (const [a, b] of links) {
    const pa = pos[a.id], pb = pos[b.id], k = Math.max(0, (pa.z + pb.z) / 2 + 0.4) * (WIRE + 0.85 * Math.max(a.glow, b.glow));
    if (k < 0.04) continue;
    g.strokeStyle = `rgba(${heat(0.4 + 0.5 * Math.max(a.p, b.p))},${Math.min(0.95, 0.3 + 0.6 * k).toFixed(3)})`; g.lineWidth = 0.9;
    g.beginPath(); g.moveTo(pa.x, pa.y); g.lineTo(pb.x, pb.y); g.stroke();
  }
  g.globalCompositeOperation = "lighter";                                   // energy adds up where it overlaps
  // energy running along a wire: the wire lights up behind a bright, glowing head, then the glow drains away
  sparks = sparks.filter((s) => t - s.t0 < (s.dur || 0.6) * 1.4);
  for (const s of sparks) {
    const dur = s.dur || 0.6, u = (t - s.t0) / dur; if (u < 0) continue;
    const pa = s.from ? s.from() : pos[s.a!], pb = s.to ? s.to() : pos[s.b!], c = s.c || heat(1);
    const head = Math.min(1, u), tail = Math.max(0, u - 0.45), fade = u > 1 ? 1 - (u - 1) / 0.4 : 1;
    const hx = pa.x + (pb.x - pa.x) * head, hy = pa.y + (pb.y - pa.y) * head, tx = pa.x + (pb.x - pa.x) * tail, ty = pa.y + (pb.y - pa.y) * tail;
    const grad = g.createLinearGradient(tx, ty, hx, hy);
    grad.addColorStop(0, `rgba(${c},0)`); grad.addColorStop(1, `rgba(${c},${(0.6 * fade).toFixed(3)})`);
    g.strokeStyle = grad; g.lineWidth = 0.9; g.lineCap = "round";
    g.shadowColor = `rgba(${c},${(0.5 * fade).toFixed(3)})`; g.shadowBlur = 2.5 * DPR;
    g.beginPath(); g.moveTo(tx, ty); g.lineTo(hx, hy); g.stroke();
    g.shadowBlur = 0; g.lineCap = "butt";
    if (u >= 1 && !s.hit) { s.hit = true; if (s.to) ripple(s.to, t, c, 0.5, 1); }   // a small ripple where it lands
  }
  // ripples: rings of energy spreading out and fading
  ripples = ripples.filter((r) => t - r.t0 < r.dur);
  for (const r of ripples) {
    const u = (t - r.t0) / r.dur; if (u < 0) continue;
    const q = r.at(), a = 0.6 * (1 - u) * (1 - u);
    ring(q.x, q.y, Math.round(2 + u * 16 * r.size), `rgba(${r.c},${a.toFixed(3)})`);
  }
  g.shadowBlur = 0;
  // the cells are added as light too, so a resting (dark) cell can never punch a black hole in the glow round it
  // memory units: small round cells, lit by how strongly each fires (its activation, either sign); the deeper the shell, the
  // smaller and dimmer (seen through the tissue)
  for (const m of mem) {
    if (m.hi && !all) continue;
    const q = mpos[m.k]; if (q.z < -0.55) continue;
    const front = (0.3 + 0.7 * (q.z + 1) / 2) * (0.55 + 0.45 * m.r), lit = Math.min(1, Math.abs(m.a) * 1.25);
    dot(q.x, q.y, (q.z > 0 ? 1.5 : 1.1) * (0.6 + 0.4 * m.r), `rgb(${heat(0.1 + 0.8 * lit, front)})`);
  }
  // senses (health, food, water, energy, inventory...): dim until one changes, then a flash that fades
  for (const sn of sense) {
    sn.flash = (sn.flash || 0) * 0.94;
    const q = spos[sn.k]; if (q.z < -0.55) continue;
    const front = 0.3 + 0.7 * (q.z + 1) / 2;
    dot(q.x, q.y, 1.2 + sn.flash * 0.6, `rgb(${heat(0.08 + 0.92 * sn.flash, front)})`);
  }
  g.globalCompositeOperation = "source-over";
  // the neurons, back to front: brightness = probability, a flash when chosen
  const order = neurons.map((n) => n.id).sort((a, b) => pos[a].z - pos[b].z);
  for (const id of order) {
    const n = neurons[id], q = pos[id], front = 0.35 + 0.65 * Math.max(0, (q.z + 1) / 2);
    n.fire *= 0.92;
    const lit = Math.min(1, Math.sqrt(n.p) + n.fire), r = q.z > -0.2 ? 2.6 : 1.6;   // one round cell a neuron: smaller round the back
    const flick = 0.85 + 0.15 * Math.sin(t * 9 + id * 1.7);
    g.globalCompositeOperation = "lighter";
    if (lit > 0.5) ring(q.x, q.y, r + 1, `rgba(${heat(lit)},${(0.6 * (lit - 0.5)).toFixed(3)})`);   // a pixel halo on the busy ones
    dot(q.x, q.y, r, `rgb(${heat(0.15 + 0.85 * lit, front * flick)})`);
    g.globalCompositeOperation = "source-over";
  }
  // callouts: the top three actions, labelled at the sides with a line to their neuron
  const top = neurons.filter((n) => n.p > 0.02).sort((a, b) => b.p - a.p).slice(0, 3);
  g.textBaseline = "middle";
  // the labels grow only gently with the panel: expanded ~3×, the type is ~1.6× its small size, not 3× (Pete)
  const ts = Math.pow(Math.max(1, (el.clientWidth || W) / W), -0.6);
  top.forEach((n, i) => {                                                   // the choice itself in a bigger, bold type
    g.font = i === 0 ? `bold ${13 * ts}px 'Courier New', monospace` : `${10 * ts}px 'Courier New', monospace`;
    const q = pos[n.id], left = i === 1, ly = (12 + i * 15 + (i ? 2 : 0)) * ts, label = `${say(names[n.id])} ${Math.round(n.p * 100)}%`;
    const tx = left ? 4 * ts : W - 4 * ts, w = g.measureText(label).width;
    g.strokeStyle = i === 0 ? "rgba(190,255,200,.9)" : "rgba(60,200,100,.6)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(left ? tx + w + 2 * ts : tx - w - 2 * ts, ly); g.lineTo(q.x, q.y); g.stroke();
    g.fillStyle = "rgba(3,8,5,.75)"; g.fillRect(left ? tx - 2 * ts : tx - w - 2 * ts, ly - 7 * ts, w + 4 * ts, 14 * ts);
    g.fillStyle = i === 0 ? "#c8ffd0" : "#6fdc8c"; g.textAlign = left ? "left" : "right";
    g.fillText(label, tx, ly);
  });
  // the body's state over everything, callouts too (Pete): a hit flashes the brain red, empty food / water / energy keeps it
  // pulsing red, and death turns it grey and dark, dormant
  const hurtK = Math.max(0, 1 - (now - hurtT) / 650), redK = Math.max(hurtK, starving ? 0.8 + 0.2 * Math.sin(t * 4) : 0);
  g.setTransform(1, 0, 0, 1, 0, 0);
  // (the mini brain, no black behind: the same recolouring, wires and all turned red or grey, then cut back to what was drawn, so the
  // clear stays clear: the blend modes paint the empty pixels too)
  const keep = brain.clear && (dead || redK > 0) && maskOf();
  if (dead) {
    g.globalCompositeOperation = "saturation"; g.fillStyle = "#808080"; g.fillRect(0, 0, el.width, el.height);
    g.globalCompositeOperation = "multiply"; g.fillStyle = "#5a5a5a"; g.fillRect(0, 0, el.width, el.height);
  } else if (redK > 0) {
    g.globalCompositeOperation = "color"; g.globalAlpha = Math.min(1, redK); g.fillStyle = "#ff2418"; g.fillRect(0, 0, el.width, el.height);
  }
  if (keep) { g.globalAlpha = 1; g.globalCompositeOperation = "destination-in"; g.drawImage(keep, 0, 0); }
  g.globalCompositeOperation = "source-over"; g.globalAlpha = 1;
}
// a copy of the canvas as it stands (its alpha: the mask the recolouring is cut back to), one canvas reused
let maskCv: HTMLCanvasElement | null = null;
function maskOf() {
  maskCv ??= document.createElement("canvas");
  if (maskCv.width !== el.width || maskCv.height !== el.height) { maskCv.width = el.width; maskCv.height = el.height; }
  const m = maskCv.getContext("2d")!; m.clearRect(0, 0, el.width, el.height); m.drawImage(el, 0, 0);
  return maskCv;
}
let hurtT = -1e9, dead = false, starving = false, lastHealth: number | null = null;

export const brain = {
  el: box, clear: false,
  setNames(list: string[]) { names = list; build(); },
  // the game state, for the body's effects on the brain: hurt (health fell), starving (food, water or energy at 0), dead
  body(s: GameState | null) {
    if (!s) return;
    if (lastHealth !== null && s.health < lastHealth - 0.01 && !s.done) hurtT = performance.now();
    lastHealth = s.health; dead = !!s.done;
    starving = !s.done && (s.food <= 0 || s.drink <= 0 || s.energy <= 0);
  },
  // reply: { action, probs?: number[43], top?: [[name, p], ...] } from the bot (the browser's bot gives all 43, a server the top 5)
  update(reply: BotReply | null) {
    if (!built || !reply) return;
    const sh = reply.memShape;                                          // a model with another memory: the shells rebuilt for it
    if (sh && (sh[0] !== MEM_LAYERS || sh[1] !== MEM_PER || sh[2] !== TIER)) { layout(sh); build(); }
    if (reply.mem === null) mem.forEach((m) => { m.a *= 0.9; m.glow *= GLOW; });   // a browser model with no brain output: its memory goes dark
    if (reply.probs && reply.probs.length === names.length) neurons.forEach((n, i) => (n.p = reply.probs![i]));
    if (reply.mem && reply.mem.length === mem.length) {               // the memory is unbounded (|h| up to ~200): scale each layer to its
      const top = Array.from({ length: MEM_LAYERS }, (_, l) => Math.max(1e-6, ...reply.mem!.slice(l * MEM_PER, (l + 1) * MEM_PER).map(Math.abs)));   // largest this step
      mem.forEach((m, i) => {
        const a = Math.sign(reply.mem![i]) * Math.pow(Math.abs(reply.mem![i]) / top[m.l], 0.7) * 0.7;
        m.glow = Math.max(m.glow * GLOW, Math.min(1, Math.abs(a - m.a) * 4));   // a unit fires when it changes
        m.a = a;
      });
    }
    if (reply.sense && reply.sense.length === sense.length) sense.forEach((sn, i) => {   // a sense lights up when it changes (hurt, ate,
      const v = Math.max(0, Math.min(1, reply.sense![i]));                                    // picked something up), then fades
      if (sn.seen) sn.flash = Math.min(1, (sn.flash || 0) + Math.abs(v - sn.a) * 6);
      sn.a = v; sn.seen = true; sn.glow = Math.max((sn.glow || 0) * GLOW, sn.flash || 0);
    });
    else if (reply.top) { neurons.forEach((n) => (n.p *= 0.5)); for (const [nm, p] of reply.top) { const i = names.indexOf(nm); if (i >= 0) neurons[i].p = p; } }
    if (reply !== lastReply && reply.pending !== false) {               // (a hit's second reply, as it lands, isn't a new decision)
      lastReply = reply;
      for (const n of neurons) n.glow = Math.max(n.glow * GLOW, n.p);    // an action's wires stay lit while it's in play
      chosen = names.indexOf(reply.action);
      if (chosen >= 0) {
        const n = neurons[chosen], t = performance.now() / 1000;
        n.fire = 1;
        yawTo = -n.lon;                                                     // bring its region round to the front
        // the signal that led here: energy from the senses that just changed into memory, from the busiest memory units into the
        // chosen action, which then ripples out and sends energy on to its neighbours
        const mp = (m: Sense | MemUnit | Neuron): At => () => where(m), np = () => project(n);
        sense.filter((sn) => (sn.flash || 0) > 0.15).sort((x, y) => y.flash! - x.flash!).slice(0, 5).forEach((sn, i) => {
          const m = senseLinks[sn.k][1];
          ripple(mp(sn), t - 0.05 * i, heat(0.55), 0.6, 2);
          sparks.push({ from: mp(sn), to: mp(m), t0: t - 0.05 * i, dur: 0.45, c: heat(0.55) });
        });
        mem.filter((m) => !m.hi || big()).sort((x, y) => Math.abs(y.a) - Math.abs(x.a)).slice(0, 8).forEach((m, i) => sparks.push({ from: mp(m), to: np, t0: t + 0.15 + 0.04 * i, dur: 0.5, c: heat(0.8) }));
        ripple(np, t + 0.6, heat(1), 1.2, 3);
        for (const [a, b] of links) if (a === n || b === n) { const o = a === n ? b : a; sparks.push({ from: np, to: mp(o), t0: t + 0.7, dur: 0.5 }); }
      }
    }
    if (!running) { running = true; requestAnimationFrame(frame); }
  },
};
