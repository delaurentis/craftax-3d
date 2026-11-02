// The university buildings, made of blocks. A model is laid out in its own (local) coordinates, as if the set piece stood on the map's
// north edge: x across (the map's columns), z inward from the edge (its rows; negative: past the edge), y up from the ground. It is
// its blocks ("x,y,z" -> tile), its half-size blocks (in half blocks, for curves full blocks step too coarsely: the Camera's dome)
// and its extras (boxes smaller than a block: urns, finials, railing bars, [x0, y0, z0, x1, y1, z1, tile]). draw.ts turns a model
// to the side the set piece chose and draws it.
export interface Model {
  cells: Map<string, string>;
  fine: Map<string, string>;
  extras: [number, number, number, number, number, number, string][];
  put(x: number, y: number, z: number, tex: string): void;
  putF(x: number, y: number, z: number, tex: string): void;
}
export function model(): Model {
  const cells = new Map<string, string>(), fine = new Map<string, string>();
  return { cells, fine, extras: [], put: (x, y, z, tex) => { cells.set(`${x},${y},${z}`, tex); }, putF: (x, y, z, tex) => { fine.set(`${x},${y},${z}`, tex); } };
}

/** A palette: which tile each part of a building is drawn with. */
export interface Palette { stone: string; rustic: string; cornice: string; column: string; window: string; winLo: string; winHi: string; archLo: string; archHi: string; bal: string; roof: string; dome: string; rib: string; gold: string; doorLo: string; doorHi: string }
// the honey stone and lead of the real Camera, and the far campus's cream stone and green copper
export const HONEY: Palette = { stone: "ox_ashlar", rustic: "ox_rustic", cornice: "ox_cornice", column: "ox_column", window: "ox_window", winLo: "ox_win_lo", winHi: "ox_win_hi",
  archLo: "ox_arch_lo", archHi: "ox_arch_hi", bal: "ox_balustrade", roof: "ox_lead", dome: "ox_lead", rib: "ox_rib", gold: "ox_gold", doorLo: "ox_door_lo", doorHi: "ox_door_hi" };
export const CREAM: Palette = { stone: "oxp_ashlar", rustic: "oxp_rustic", cornice: "oxp_cornice", column: "oxp_column", window: "oxp_window", winLo: "oxp_win_lo", winHi: "oxp_win_hi",
  archLo: "oxp_arch_lo", archHi: "oxp_arch_hi", bal: "oxp_balustrade", roof: "oxp_roof", dome: "oxp_copper", rib: "oxp_copper_rib", gold: "ox_gold", doorLo: "ox_door_lo", doorHi: "ox_door_hi" };

const TAU = Math.PI * 2;
/** The angular distance (radians) from a to the nearest of n evenly spaced angles. */
export const near = (a: number, n: number, off = 0) => {
  const step = TAU / n, t = (((a - off) % step) + step) % step;
  return Math.min(t, step - t);
};
/** The Camera's footprint and its drum, by distance from its middle tile. */
export const FOOT = 7.5, DRUM = 5.6;

// The Radcliffe Camera, its middle on tile (cr, cc). From the ground: a rusticated base with eight two-block arches (4 blocks), a
// cornice, the main storey with sixteen columns round it and a tall window in every bay (5), the entablature, a balustrade with an urn
// over each column, the drum with its windows (3), the dome with sixteen ribs, the lantern and a gold finial: about 25 blocks high and
// 15 across (the real one is about 40 m high and 30 m across)
export function camera(m: Model, cr: number, cc: number, P: Palette): void {
  const { put, extras } = m;
  for (let z = cr - 8; z <= cr + 8; z++) for (let x = cc - 8; x <= cc + 8; x++) {
    const d = Math.hypot(z - cr, x - cc), a = Math.atan2(z - cr, x - cc), bay = near(a, 8, TAU / 16), rim = d > FOOT - 1 && d <= FOOT;
    // the front door in the base, facing inward (toward where you start): oak double doors under a round fanlight
    const front = rim && Math.abs(a - Math.PI / 2) < 0.1;
    if (d <= FOOT) for (let y = 0; y < 4; y++) put(x, y, z, rim && y <= 1 && (front || bay < 0.12) ? (front ? (y ? P.doorHi : P.doorLo) : y ? P.archHi : P.archLo) : P.rustic);
    if (d <= FOOT) put(x, 4, z, P.cornice);
    if (d <= FOOT - 1) for (let y = 5; y < 10; y++) put(x, y, z, d > FOOT - 2 && y >= 6 && y <= 7 && near(a, 16, TAU / 32) < 0.08 ? (y === 7 ? P.winHi : P.winLo) : P.stone);
    if (rim && near(a, 16) < 0.08) for (let y = 5; y < 10; y++) put(x, y, z, P.column);
    if (d <= FOOT) put(x, 10, z, P.cornice);
    if (rim) {
      put(x, 11, z, P.bal);
      if (near(a, 16) < 0.08) extras.push([x + 0.3, 12, z + 0.3, x + 0.7, 12.7, z + 0.7, P.stone]);
    } else if (d <= FOOT - 1) put(x, 11, z, P.roof);
    // the drum: windows in eight bays, a cornice round its top, and a buttress between each pair of windows
    if (d <= DRUM) for (let y = 12; y < 15; y++) put(x, y, z, y === 14 && d > DRUM - 1 ? P.cornice : d > DRUM - 1 && y === 13 && bay < 0.14 ? P.window : P.stone);
    if (d > DRUM && d <= DRUM + 1 && near(a, 8) < 0.1) { put(x, 12, z, P.column); put(x, 13, z, P.column); }
  }
  extras.push([cc - 0.2, 0, cr + 8, cc + 1.2, 0.18, cr + 8.45, P.stone], [cc - 0.05, 0, cr + 8.45, cc + 1.05, 0.09, cr + 8.8, P.stone]);   // its two steps
  // the dome in half blocks (full blocks made a stepped beehive): a smooth half-ellipsoid as wide as the drum and a little taller than
  // it is wide, lead with sixteen lighter ribs; on it the lantern, an open ring of eight columns under its own small dome, and a gold
  // ball finial
  const ox = cc + 0.5, oz = cr + 0.5, RD = DRUM + 0.1, HD = 6.2, Y0 = 15;
  for (let Z = Math.floor((oz - RD) * 2); Z <= Math.ceil((oz + RD) * 2); Z++) for (let X = Math.floor((ox - RD) * 2); X <= Math.ceil((ox + RD) * 2); X++) {
    const dx = (X + 0.5) / 2 - ox, dz = (Z + 0.5) / 2 - oz, d = Math.hypot(dx, dz), a = Math.atan2(dz, dx);
    for (let Y = Y0 * 2; Y < (Y0 + HD) * 2; Y++) {
      const y = (Y + 0.5) / 2 - Y0, k = (d / RD) ** 2 + (y / HD) ** 2;
      if (k > 1) break;
      m.putF(X, Y, Z, k > 0.78 && near(a, 16) < 0.07 ? P.rib : P.dome);
    }
    const yl = Math.round((Y0 + HD - 0.6) * 2) / 2;                     // the lantern stands in the dome's top (on a half block)
    if (d <= 1.25) for (let Y = yl * 2; Y < (yl + 2) * 2; Y++) m.putF(X, Y, Z, d > 0.75 ? (near(a, 8) < 0.2 ? P.column : P.archLo) : P.stone);   // (dark openings between the columns)
    const yc = yl + 2;
    if (d <= 1.5) for (let Y = yc * 2; Y < (yc + 1.2) * 2; Y++) { if ((d / 1.5) ** 2 + (((Y + 0.5) / 2 - yc) / 1.2) ** 2 <= 1) m.putF(X, Y, Z, P.dome); }
  }
  const top = Math.round((Y0 + HD - 0.6) * 2) / 2 + 3.2;
  extras.push([cc + 0.42, top, cr + 0.42, cc + 0.58, top + 0.5, cr + 0.58, P.gold], [cc + 0.3, top + 0.5, cr + 0.3, cc + 0.7, top + 0.9, cr + 0.7, P.gold]);
}

// The iron railing round the Camera's lawn: black bars on a stone kerb, a rail along the top, and a gate facing `gateAt` (radians, as
// atan2(row, column) from the middle; inward is π/2) between two stone piers with ball finials. Drawn only: the lawn is open ground
export function railing(m: Model, cr: number, cc: number, R: number, gateAt: number): void {
  const { extras } = m, ox = cc + 0.5, oz = cr + 0.5, n = Math.round(TAU * R / 0.42), gate = 1.4 / R;   // a bar every ~0.42; the gate 2.8 wide
  const at = (a: number, r = R) => [ox + Math.cos(a) * r, oz + Math.sin(a) * r];
  const off = (a: number) => Math.abs(((a - gateAt + Math.PI) % TAU + TAU) % TAU - Math.PI);   // angle from the gate's middle
  for (let k = 0; k < n; k++) {
    const a = (k / n) * TAU, [x, z] = at(a), o = off(a);
    if (o < gate + 0.09) continue;                                     // the gateway (its leaves below) and room for the piers
    extras.push([x - 0.03, 0.15, z - 0.03, x + 0.03, 1.15, z + 0.03, "ox_iron"]);
    const [x2, z2] = at(a + TAU / n);                                  // the kerb and the top rail to the next bar
    if (off(a + TAU / n) >= gate + 0.09) {
      extras.push([Math.min(x, x2) - 0.07, 0, Math.min(z, z2) - 0.07, Math.max(x, x2) + 0.07, 0.15, Math.max(z, z2) + 0.07, "ox_rustic"]);
      extras.push([Math.min(x, x2) - 0.03, 1.05, Math.min(z, z2) - 0.03, Math.max(x, x2) + 0.03, 1.12, Math.max(z, z2) + 0.03, "ox_iron"]);
    }
  }
  // the gate piers, and the two leaves standing open (no post in the middle): each swung in toward the lawn from its pier, its bars
  // in a line, a gold tip on each, a rail along the top
  const [ix, iz] = [-Math.cos(gateAt), -Math.sin(gateAt)];            // inward, toward the Camera
  for (const s of [-1, 1]) {
    const [x, z] = at(gateAt + s * (gate + 0.05));
    extras.push([x - 0.25, 0, z - 0.25, x + 0.25, 1.8, z + 0.25, "ox_rustic"], [x - 0.15, 1.8, z - 0.15, x + 0.15, 2.1, z + 0.15, "ox_ashlar"]);
    const len = R * gate - 0.1;
    for (let t = 0.32; t <= len; t += 0.36) {
      const bx = x + ix * t, bz = z + iz * t;
      extras.push([bx - 0.035, 0.05, bz - 0.035, bx + 0.035, 1.5, bz + 0.035, "ox_iron"], [bx - 0.05, 1.5, bz - 0.05, bx + 0.05, 1.6, bz + 0.05, "ox_gold"]);
    }
    const ex = x + ix * len, ez = z + iz * len;
    extras.push([Math.min(x, ex) - 0.03, 1.32, Math.min(z, ez) - 0.03, Math.max(x, ex) + 0.03, 1.39, Math.max(z, ez) + 0.03, "ox_iron"]);
    extras.push([Math.min(x, ex) - 0.03, 0.12, Math.min(z, ez) - 0.03, Math.max(x, ex) + 0.03, 0.19, Math.max(z, ez) + 0.03, "ox_iron"]);
  }
}

// A college range: a long block [x0, x1) × [z0, z1), a rusticated ground floor with doors, two storeys of tall windows, a cornice, a
// balustrade round the roof's edge and the roof inside it; `h` blocks to the cornice. The facade goes in bays so it doesn't repeat:
// windows in pairs between pilasters, a door now and then, and the end pavilions two blocks higher, their windows set apart
export function range(m: Model, x0: number, x1: number, z0: number, z1: number, P: Palette, h = 8): void {
  const { put } = m, edge = (x: number, z: number) => x === x0 || x === x1 - 1 || z === z0 || z === z1 - 1;
  const long = x1 - x0 >= z1 - z0, len = long ? x1 - x0 : z1 - z0;
  for (let z = z0; z < z1; z++) for (let x = x0; x < x1; x++) {
    const e = edge(x, z), along = (z === z0 || z === z1 - 1 ? x - x0 : z - z0), k = (long ? x - x0 : z - z0);
    const end = k < 5 || k >= len - 5, hh = end ? h + 2 : h;                  // the end pavilions
    const bay = along % 6, pilaster = bay === 0, win = end ? bay === 3 : bay === 2 || bay === 4, door = !end && along % 18 === 9;
    for (let y = 0; y < hh; y++) {
      let t = y < 2 ? P.rustic : P.stone;
      if (e) {
        if (pilaster && y >= 2) t = P.column;
        else if (door && y < 2) t = y ? P.archHi : P.archLo;
        else if (win && y >= 2) { const r = (y - 2) % 3; t = r === 0 ? P.winLo : r === 1 ? P.winHi : P.stone; }
      }
      put(x, y, z, t);
    }
    put(x, hh, z, P.cornice);
    put(x, hh + 1, z, e ? (pilaster ? P.stone : P.bal) : P.roof);        // the parapet: balustrade between solid piers
  }
}

// A domed tower: a square body w × w with windows on every face, a round drum, a copper dome and a lantern with a gold finial
export function tower(m: Model, x0: number, z0: number, P: Palette, w = 6, h = 11): void {
  const { put, extras } = m, cx = x0 + (w - 1) / 2, cz = z0 + (w - 1) / 2;
  for (let z = z0; z < z0 + w; z++) for (let x = x0; x < x0 + w; x++) {
    const e = x === x0 || x === x0 + w - 1 || z === z0 || z === z0 + w - 1, mid = !((x - x0) % (w - 1) !== 0 && (z - z0) % (w - 1) !== 0);
    for (let y = 0; y < h; y++) {
      const corner = (x === x0 || x === x0 + w - 1) && (z === z0 || z === z0 + w - 1);
      let t = y < 2 ? P.rustic : corner ? P.column : P.stone;
      if (e && !corner && mid && y >= 2) { const k = (y - 2) % 3; t = k === 0 ? P.winLo : k === 1 ? P.winHi : P.stone; }
      put(x, y, z, t);
    }
    put(x, h, z, P.cornice);
    if (e) put(x, h + 1, z, P.bal);
  }
  const R = w / 2 - 0.6;
  for (let z = z0; z < z0 + w; z++) for (let x = x0; x < x0 + w; x++) {
    const d = Math.hypot(x - cx, z - cz), a = Math.atan2(z - cz, x - cx);
    if (d <= R) for (let y = h + 1; y < h + 4; y++) put(x, y, z, y === h + 2 && d > R - 1 && near(a, 8) < 0.3 ? P.window : P.stone);
    for (let y = h + 4; y < h + 8; y++) {
      const r = R * Math.sqrt(1 - ((y - h - 3) / 4.6) ** 2) + 0.2;
      if (d <= r) put(x, y, z, P.dome);
    }
  }
  const lx = Math.floor(cx), lz = Math.floor(cz);
  for (let y = h + 8; y < h + 10; y++) put(lx, y, lz, P.column);
  extras.push([lx + 0.3, h + 10, lz + 0.3, lx + 0.7, h + 10.8, lz + 0.7, P.gold]);
}
