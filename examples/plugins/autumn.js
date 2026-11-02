// Autumn: a sample plugin you can add by hand (the More... button beside the theme in Settings → World), as a file or by its address. The trees turn orange,
// red and gold, the grass goes a dry yellow-green, the sky warms, and now and then a leaf drops from a tree near you. One plain
// file with nothing to import: the game hands a plugin what it needs, its own three.js (host.three) for the falling leaves and the
// rest of what a plugin may use (host.kit: the block ids, the tile painter's helpers...). doc/themes.md says what else a theme can
// change.
//   On your own dev server it's at  http://localhost:<port>/examples/plugins/autumn.js

// the game's tile painter's helpers (host.kit.paint), set in setup below: hex("#rrggbb") → a color, px(g, x, y, color, vary) one pixel
// a little lighter or darker, rnd() its random numbers, seeded per tile, so a tile looks the same every time it's painted
let hex, px, rnd;

// dry grass: a yellow-green 16 × 16 with a little noise
const grass = () => (g) => {
  const base = hex("#8f9a3a");
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, x, y, rnd() < 0.15 ? hex("#a3883a") : base, (rnd() - 0.5) * 24);
};
// the 3D grass's blades (Settings → 3D grass): dry, darker at the foot where they grow out of the ground, paler toward the tips
const blade = (g) => {
  for (let x = 0; x < 16; x++) {
    const k = (rnd() - 0.5) * 24;
    for (let y = 0; y < 16; y++) { const up = 15 - y; px(g, x, y, hex(up < 3 ? "#7f8a34" : up < 6 ? "#949c3e" : "#a8a848"), k); }
    px(g, x, 0, hex("#c4b85a"), k);
  }
};
// the grass block's side: earth, with the dry grass hanging over its top edge
const grassSide = (g) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) px(g, x, y, hex("#7a5636"), (rnd() - 0.5) * 20);
  for (let x = 0; x < 16; x++) { const d = 2 + ((rnd() * 2.5) | 0); for (let y = 0; y < d; y++) px(g, x, y, hex("#8f9a3a"), (rnd() - 0.5) * 20); }
};
// autumn leaves, a tree's crown in one of several colors (each tree its own, picked by where it stands): a few gaps you can see
// through, as the standard leaves
const SHADES = {
  autumn_red: ["#c8261a", "#a81c14", "#e03a22"],
  autumn_orange: ["#e8711c", "#d2581a", "#f08a2a"],
  autumn_yellow: ["#f0c020", "#e0a81c", "#f8d84a"],
  autumn_gold: ["#d89a1e", "#c47a18", "#e8b030"],
};
const NAMES = Object.keys(SHADES);
const leavesIn = (name) => (g) => {
  const colors = SHADES[name].map(hex);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (rnd() < 0.08) continue;
    px(g, x, y, colors[(rnd() * colors.length) | 0], (rnd() - 0.5) * 26);
  }
};
// which color a tree at (r, c) turns: the same every time
const shadeOf = (r, c) => NAMES[(Math.imul(Math.imul(r, 73856093) ^ Math.imul(c, 19349663), 2654435761) >>> 28) % NAMES.length];   // (well mixed: neighbours differ)

// leaves dropping: now and then a leaf comes loose from under a tree's crown near you and tumbles down to the ground, swinging side
// to side (never from the open sky). The frame says which block is where (blockAt), so the leaves start under real trees.
const CROWN = 1.25;                                   // how high a tree's crown starts above the ground
function fallingLeaves(THREE, TREE, scene) {
  const N = 120, NEAR = 14, RATE = 5;                 // leaves at most; how far round you (tiles); about how many come loose a second
  const pos = new Float32Array(N * 3).fill(-50), col = new Float32Array(N * 3), fall = new Float32Array(N), phase = new Float32Array(N), live = new Uint8Array(N);
  const shade = Object.fromEntries(NAMES.map((n) => [n, new THREE.Color(SHADES[n][0])]));   // (a leaf: its tree's color)
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.12, vertexColors: true, transparent: true, depthWrite: false, fog: false });
  const points = new THREE.Points(geo, mat);
  points.frustumCulled = false; points.visible = false;
  scene.add(points);
  const INK = { laser: 0xff2a18, phosphor: 0x2aff5a };
  let t = 0, due = 0;
  // one leaf loose from under a tree near (r, c): a few tries at a random tile round you, and only where there's a tree
  function loosen(blockAt, pr, pc) {
    const i = live.indexOf(0);
    if (i < 0) return;
    for (let k = 0; k < 8; k++) {
      const r = pr + Math.round((Math.random() - 0.5) * 2 * NEAR), c = pc + Math.round((Math.random() - 0.5) * 2 * NEAR);
      if (blockAt(r, c) !== TREE) continue;
      pos.set([c + 0.5 + (Math.random() - 0.5) * 1.1, CROWN - Math.random() * 0.1, r + 0.5 + (Math.random() - 0.5) * 1.1], i * 3);
      fall[i] = 0.3 + Math.random() * 0.3; phase[i] = Math.random() * Math.PI * 2; live[i] = 1;
      shade[shadeOf(r, c)].toArray(col, i * 3); geo.attributes.color.needsUpdate = true;
      return;
    }
  }
  return {
    update({ dt, k, player, level, look, blockAt }) {
      const solid = look !== "color";                 // (laser and phosphor draw outlines: no see-through there, one ink)
      points.visible = level === 0 && (solid ? k >= 0.5 : k > 0.01);
      if (!points.visible) return;
      if (mat.transparent === solid) { mat.transparent = !solid; mat.depthWrite = solid; mat.vertexColors = !solid; mat.needsUpdate = true; }
      if (solid) mat.color.setHex(INK[look]); else mat.color.setHex(0xffffff);
      mat.opacity = solid ? 1 : k;
      t += dt; due += dt * RATE * k;
      while (due >= 1) { due -= 1; loosen(blockAt, Math.floor(player.z), Math.floor(player.x)); }
      for (let i = 0; i < N; i++) {
        if (!live[i]) continue;
        const j = i * 3, a = t * 1.8 + phase[i];
        pos[j] += Math.sin(a) * 0.5 * dt;             // (a leaf swings as it falls)
        pos[j + 1] -= fall[i] * dt;
        pos[j + 2] += Math.cos(a * 0.7) * 0.35 * dt;
        if (pos[j + 1] <= 0.02) { live[i] = 0; pos[j + 1] = -50; }   // (on the ground: gone)
      }
      geo.attributes.position.needsUpdate = true;
    },
    dispose() { scene.remove(points); geo.dispose(); mat.dispose(); },
  };
}

export default {
  name: "autumn",
  provides: ["theme"],
  setup(host) {
    const THREE = host.three, { B } = host.kit.blocks;
    ({ hex, px, rnd } = host.kit.paint);
    host.add("theme", {
      id: "autumn",
      label: "Autumn",
      // its icon on the replay page's keyframes (an SVG, or a letter): a tree in its autumn colors
      icon: '<svg viewBox="0 0 20 20" width="16" height="16" shape-rendering="crispEdges"><path d="M7 2h6v2h2v2h1v6h-1v1h-3v1h-4v-1H5v-1H4V6h1V4h2z" fill="#e8711c"/><path d="M8 4h3v1h2v2h-2V6H8zM5 8h2v2H5z" fill="#f8c040"/><path d="M12 9h2v2h-2z" fill="#c8261a"/><path d="M9 13h2v5H9zM7 17h6v1H7z" fill="#8a5a2e"/></svg>',
      paint: { grass_top: grass(), grass_top2: grass(), grass_top3: grass(), grass_side: grassSide, grass_blade: blade, leaves: leavesIn("autumn_orange") },
      // what flies when you cut the grass (dry, as it is) and when a tree comes down (its own color)
      bits: { grass: [0x8f9a3a, 0xa8a848, 0x7f8a34], leaves: (r, c) => SHADES[shadeOf(r, c)].slice(0, 2).map((h) => parseInt(h.slice(1), 16)) },
      // each tree's crown in its own color (the game asks for a tree's leaves tile by name, with where the tree stands)
      tiles: Object.fromEntries(NAMES.map((n) => [n, { paint: leavesIn(n) }])),
      tile: (name, at) => (name === "leaves" ? shadeOf(at.r, at.c) : undefined),
      creatures: { cow: { tint: 0xd9b38c } },
      sky: { tint: [1.12, 0.92, 0.78], sun: 0.95 },
      weather: (scene) => fallingLeaves(THREE, B.TREE, scene),
    });
  },
};
