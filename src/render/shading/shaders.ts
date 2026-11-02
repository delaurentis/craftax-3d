// The GLSL for every block, water, glow and creature material: the vertex shader, and the fragment shader that ray-traces the
// voxel grid for shadow and sky, adds block light, water waves and the laser and phosphor looks (see js/shading.ts).
import { CLOUD_SPAN, EYE_LIGHTS } from "./uniforms";
import { OUTLINE_V } from "../../../js/textures";

const WAVES = /* glsl */ `
vec3 waves(vec2 p, float t) {
  vec3 h = vec3(0.0);
  vec2 D[4]; D[0] = normalize(vec2(1.0, 0.35)); D[1] = normalize(vec2(-0.45, 1.0)); D[2] = normalize(vec2(0.75, -0.65)); D[3] = normalize(vec2(0.15, 0.95));
  float L[4]; L[0] = 3.4; L[1] = 2.1; L[2] = 1.35; L[3] = 0.8;
  float A[4]; A[0] = 0.055; A[1] = 0.035; A[2] = 0.02; A[3] = 0.01;
  for (int i = 0; i < 4; i++) {
    float k = 6.2832 / L[i], w = sqrt(9.8 * k) * 0.55, ph = k * dot(D[i], p) - w * t + float(i) * 1.7;
    h.x += A[i] * sin(ph);
    h.yz += A[i] * k * D[i] * cos(ph);
  }
  return h;
}`;

export const vert = /* glsl */ `
${WAVES}
attribute float aVis;
attribute float aAO;
attribute float aWave;
attribute float aId;
attribute float aIdFar;
attribute vec2 aTree;
attribute float aGrow;
uniform float uTime;
uniform vec2 uShrink;
attribute vec3 aMorph;                            // a morphing crown's corner: where it goes (src/themes/crowns.ts)
uniform float uCrownSwap;                         // 1 while a theme switch changes the trees' crowns (Theme.crown): they morph
uniform sampler2D uThemeP;                        // (each tile's progress through the switch, a texel a tile)
uniform sampler2D uShapeK;                        // a theme's stones rising or sinking: each tile's column height now over the height it's built at
uniform float uShapeOn;
uniform vec2 uMapSize;
uniform vec3 uPlayer;
#ifdef GRASS3D
// 3D grass and flowers (Settings; the cutout material only, and only while it's on: off, none of this is compiled, main.ts)
uniform float uSunY;                              // the sun's height (-1..1; underground 1): flowers close at night
uniform sampler2D uTrample;                       // how trodden each tile's grass is (main.ts trampleFx): r 0..1, a texel a tile
uniform vec2 uTrampleSz;
uniform float uGrassK;                            // 1, down to 0 as the grass turns off for a low frame rate (main.ts): it sinks away
uniform float uThemeGrass;                        // a theme's grass height (Winter: short), eased with its transition
vec2 trodden2() { return aTree.x > -1000.0 ? texture2D(uTrample, (floor(aTree) + 0.5) / uTrampleSz).rg : vec2(0.0); }   // r trodden, g cut
#endif
flat varying float vId;
flat varying float vNear;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
varying float vVis;
varying float vAO;
varying float vDist;
#ifdef THEMES
attribute vec2 aUvFrom;                           // a theme switching: the tile the theme being left draws here (src/themes)
varying vec2 vUvFrom;
#endif
void main() {
  vUv = uv;
#ifdef THEMES
  vUvFrom = aUvFrom;
#endif
  vec4 w = modelMatrix * vec4(position, 1.0);
  float gk = 1.0;                                                              // grass far off: 0, and no breeze moving what's left
#ifdef WORLD
#ifdef GRASS3D
  if (aGrow > 3.5) {                                                           // a flower's petal (world.ts): aGrow 4 + when it opens
    // shut at night, open by day (Pete): each flower at its own moment around sunrise and sunset, neighbours close together
    float o = aGrow - 4.0, open = smoothstep(-0.12 + 0.16 * o, -0.02 + 0.16 * o, uSunY);
    w.xz = aTree + (w.xz - aTree) * mix(0.25, 1.0, open); w.y += (1.0 - open) * 0.05;   // folded in round the centre and up
    vec2 tc = trodden2(); w.y *= (1.0 - 0.85 * tc.r) * (1.0 - tc.g) * uGrassK * uThemeGrass; w.xz = mix(w.xz, aTree, tc.g);   // (trodden: down with its stem; cut: gone)
  }
  else if (aGrow > 2.5) {
    gk = (1.0 - smoothstep(22.0, 30.0, distance(w.xz, uPlayer.xz))) * uGrassK * uThemeGrass;   // grass: none far from you (Pete), it sinks away
    // trodden (Pete: it clipped through you): walked on, a tile's grass is pressed down low, and slowly stands again
    vec2 tc = trodden2(); float tr = tc.r;
    float h0 = w.y;
    w.y = h0 * gk * (1.0 - 0.75 * tr) * (1.0 - 0.95 * tc.g);   // (trodden: pressed down, upright still: Pete, the splayed angles weren't pixel art)
    gk *= (1.0 - 0.8 * tr) * (1.0 - tc.g);                                   // (cut: down to stubs)
  }
  else
#endif
  // a crown morphing (aGrow 1.4, overhead 2.4: src/themes/crowns.ts): its corners from the old crown's box to the new one's as the
  // wave passes its tile, eased in and out (its tiles crossfade in the fragment shader by the same progress)
  if (uCrownSwap > 0.5 && aGrow > 0.5 && aGrow < 2.5 && abs(fract(aGrow) - 0.4) < 0.05) {
    float tp = texture2D(uThemeP, (floor(aTree) + 0.5) / uMapSize).r;
    w.xyz = mix(w.xyz, (modelMatrix * vec4(aMorph, 1.0)).xyz, tp * tp * (3.0 - 2.0 * tp));
  }
#ifdef WORLD
  // a theme switch changing the stones' heights (Ruins), on the card (Pete: the chunks built again and again as they moved were the
  // slow part): each column is built at the taller of its two heights and scaled down to its height now, its tile's own (aTree: the
  // tile each face was built for, so a face's corners all move together), so a wave moves them without building anything
  if (uShapeOn > 0.5 && aGrow < 0.5 && aTree.x > -1000.0) w.y *= texture2D(uShapeK, (floor(aTree) + 0.5) / uMapSize).r;
#endif
  if (aGrow > 1.5) { w.xz = aTree + (w.xz - aTree) * uShrink.x / 0.5; w.y *= uShrink.y / 0.55; }   // the overhead trees: as big as the shrinking full ones, down to their own size
  else if (aGrow > 0.5) { w.xz = aTree + (w.xz - aTree) * uShrink.x; w.y *= uShrink.y; }   // full-size trees shrinking to the overhead size
#endif
#ifdef WIND
  float ph = uTime * 1.6 + w.x * 0.7 + w.z * 0.5;
  w.xyz += aWave * gk * vec3(sin(ph), sin(ph * 1.3) * 0.4, cos(ph * 0.8)) * 0.045;
#endif
#ifdef WATER
  w.y += waves(w.xz, uTime).x * (1.0 - smoothstep(25.0, 45.0, distance(w.xyz, cameraPosition)));   // far, coarse ocean stays flat
#endif
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
#ifdef WORLD
  vVis = aVis; vAO = aAO;
  // laser level of detail, per tree (its trunk's distance, so a whole tree switches at once): far, the tree is one outlined piece
  vNear = aTree.x < -1000.0 || distance(cameraPosition.xz, aTree) < 14.0 ? 1.0 : 0.0;
  vId = vNear > 0.5 ? aId : aIdFar;
#else
  vId = 0.0; vNear = 1.0;
  vVis = 1.0; vAO = 1.0;
#endif
  vec4 mv = viewMatrix * w;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;

export const frag = /* glsl */ `
${WAVES}
uniform sampler2D map;
uniform vec3 uColor;
uniform float uEmissive;
uniform float uVisU;
uniform float uAlpha;
uniform vec2 uXfade;
uniform highp sampler3D uVox;
uniform vec3 uVoxSize;
uniform vec3 uVoxOrigin;
uniform sampler2D uBlock;
uniform vec2 uMapSize;
uniform vec3 uSunDir, uSunColor, uSkyColor, uZenith, uHorizon, uCaveColor, uFogColor;
uniform float uUnder, uRT, uTime, uFogNear, uFogFar, uOutline, uPhos, uId, uBoost, uAimed;
uniform sampler2D uOutlineMap;
uniform vec3 uPlayer;
uniform vec4 uEyeL[${EYE_LIGHTS}];
uniform vec4 uAim;
uniform vec4 uLadder;
uniform vec4 uPortalL;
uniform vec4 uTunnel;
uniform vec4 uNecroL;
uniform vec4 uSealL;
uniform vec4 uGodL;
uniform float uAimLo;
uniform vec2 uAimSz;
uniform vec4 uAimB;
uniform vec2 uAimBY;
uniform float uAimGain;
uniform vec3 uAimTint;
uniform float uLavaF;
uniform vec2 uLavaV;
uniform sampler2D uCloud;
uniform vec3 uCloudP;
uniform float uCloudK;
// the sunlight the clouds let through: their shadows as they fall at height uCloudP.y (clouds.ts), slid along the sun's ray for this
// point's own height
float cloudShade(vec3 p) {
  if (uCloudK <= 0.0 || uSunDir.y < 0.03) return 1.0;
  vec2 q = (p.xz - uSunDir.xz * ((p.y - uCloudP.y) / uSunDir.y) - uCloudP.xz) / ${CLOUD_SPAN}.0;
  // soft edges (Pete: the cloud shadows' edges too hard): nine taps a tile and a half apart over the (linear) map, a ~3-tile fade
  float c = 0.0, e = 1.5 / ${CLOUD_SPAN}.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) c += texture2D(uCloud, q + vec2(float(i), float(j)) * e).r * (i == 0 && j == 0 ? 4.0 : i == 0 || j == 0 ? 2.0 : 1.0);
  return 1.0 - 0.72 * uCloudK * c / 16.0;
}
// 1 inside the aimed square: the tile's column (x) and row (z), up to its top. Tested a hair inside the surface, so a neighbour's
// wall that faces the tile stays dark: only the tile's own ground, block and whatever stands on it light up
float aimed(vec3 w, vec3 n) {
  vec3 q = w - n * 0.01;
  float a = step(uAim.x, q.x) * step(q.x, uAim.x + uAimSz.x) * step(uAim.y, q.z) * step(q.z, uAim.y + uAimSz.y) * step(q.y, uAim.z) * step(uAimLo, q.y);
  float b = step(uAimB.x, q.x) * step(q.x, uAimB.z) * step(uAimB.y, q.z) * step(q.z, uAimB.w) * step(uAimBY.x, q.y) * step(q.y, uAimBY.y);
  return max(a, b);
}
uniform float uEyeK;                                  // 0: this surface belongs to a mob whose own eyes are the light
#ifdef THEMES
// a theme switching (src/themes/transition.ts): the atlas of the theme being left, each tile's progress (r: 0 the old … 1 the new),
// on while it runs; and the laser and phosphor drawings of the tiles themes add (atlas rows 16 on)
varying vec2 vUvFrom;
uniform sampler2D uMapFrom, uThemeP, uThemeOut;
uniform float uThemeOn, uThemeOutOn;
#endif
flat varying float vId;
flat varying float vNear;
varying vec2 vUv;
varying vec3 vN;
varying vec3 vW;
varying float vVis;
varying float vAO;
varying float vDist;

// Amanatides–Woo walk through the voxel grid; returns the light that gets through (leaves pass some, blocks none)
float trace(vec3 p, vec3 d, int maxSteps, float maxT) {
  vec3 g = p - uVoxOrigin;
  ivec3 c = ivec3(floor(g));
  ivec3 size = ivec3(uVoxSize);
  vec3 s = sign(d);
  vec3 inv = 1.0 / max(abs(d), vec3(1e-5));
  vec3 fr = g - vec3(c);
  vec3 tMax = vec3(d.x > 0.0 ? 1.0 - fr.x : fr.x, d.y > 0.0 ? 1.0 - fr.y : fr.y, d.z > 0.0 ? 1.0 - fr.z : fr.z) * inv;
  float T = 1.0, t = 0.0;
  for (int i = 0; i < 72; i++) {
    if (i >= maxSteps) break;
    if (tMax.x < tMax.y && tMax.x < tMax.z) { c.x += int(s.x); t = tMax.x; tMax.x += inv.x; }
    else if (tMax.y < tMax.z) { c.y += int(s.y); t = tMax.y; tMax.y += inv.y; }
    else { c.z += int(s.z); t = tMax.z; tMax.z += inv.z; }
    if (t > maxT) break;
    if (c.y < 0) return 0.0;
    if (c.y >= size.y || c.x < 0 || c.z < 0 || c.x >= size.x || c.z >= size.z) break;
    T *= 1.0 - texelFetch(uVox, c, 0).r;
    if (T < 0.03) return 0.0;
  }
  return T;
}

// the sun's ray traced from four points a little apart across the surface (Pete: the shadows' hard edges, a tree's crown and trunk
// cut sharp out of the grass): averaged, a shadow's edge fades over about a third of a tile. The colour look only; the line looks
// keep one ray
float softSun(vec3 p, vec3 n) {
  const float r = 0.17;
  vec3 a = abs(n.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 u = normalize(cross(n, a)) * r, v = normalize(cross(n, u)) * r;
  vec3 q0 = p + u + v, q1 = p + u - v, q2 = p - u + v, q3 = p - u - v;
  q0.y = max(q0.y, 0.02); q1.y = max(q1.y, 0.02); q2.y = max(q2.y, 0.02); q3.y = max(q3.y, 0.02);
  return 0.25 * (trace(q0, uSunDir, 72, 90.0) + trace(q1, uSunDir, 72, 90.0) + trace(q2, uSunDir, 72, 90.0) + trace(q3, uSunDir, 72, 90.0));
}

void main() {
#ifndef WORLD
  // two models crossfading (the player's outfit as a theme switches, transition.ts): a screen door, each 2-pixel cell one model's or
  // the other's, the new one's share k (x); y: 1 the new model, -1 the old, 0 no crossfade
  if (uXfade.y != 0.0) {
    float h = fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy / 2.0), vec2(0.06711056, 0.00583715))));
    if ((uXfade.y > 0.0) != (h < uXfade.x)) discard;
  }
#endif
#ifdef USE_MAP
#if defined(GLOW) && defined(WORLD)
  // lava: its face shows frame 0 of its variant; the frame of the moment is uLavaF tiles along the same atlas row (textures.ts)
  vec4 tex = texture2D(map, vUv.y > uLavaV.x && vUv.y < uLavaV.y ? vUv + vec2(uLavaF / 16.0, 0.0) : vUv);
#else
  vec4 tex = texture2D(map, vUv);
#endif
#if defined(THEMES) && defined(WORLD)
  if (uThemeOn > 0.5) {                          // a theme switching: the old tile, blended into the new by this tile's progress
    float tk = texture2D(uThemeP, (floor(vW.xz) + 0.5) / uMapSize).r;
#ifdef GLOW
    vec2 fu = vUvFrom.y > uLavaV.x && vUvFrom.y < uLavaV.y ? vUvFrom + vec2(uLavaF / 16.0, 0.0) : vUvFrom;
#else
    vec2 fu = vUvFrom;
#endif
    if (tk < 0.999) tex = mix(texture2D(uMapFrom, fu), tex, tk);
  }
#endif
#else
  vec4 tex = vec4(1.0);
#endif
#ifdef CUTOUT
  if (uOutline > 0.5) {                            // laser: leaves solid (holes would sparkle with outlines)
    float solid = textureLod(map, vUv, 2.0).a;   // averaged: leaves read solid, plants keep their shape
    if (solid < 0.8 && tex.a < 0.5) discard;     // leaves (mostly opaque) stay whole; a ladder or a plant keeps its own shape
  } else if (tex.a < 0.5) discard;
#endif
  // outline art: no lighting; write which surface this is (a hash of its id in r, g) and any line drawn on it (b): the outline pass
  // draws red where the id changes, and adds b (water's waves, glowing things)
  if (uOutline > 0.5) {
#ifdef WORLD
    float id = vId;
#else
    float id = uId;
#endif
    // uEmissive < 0: a body's last flash (fell.ts), -1 at its height: b 1.2..1.44 tells the outline pass to drive this surface's
    // outlines bright, its face left unfilled (Pete: outlines only)
    float line = uEmissive < 0.0 ? 1.2 + 0.24 * min(-uEmissive, 1.0) : uEmissive > 0.0 ? 0.35 : 0.0;
    if (uAimed > 0.5) line = 1.7;                // a creature under the cursor (main.ts): the aimed square's own mark, so laser and phosphor light it as they do a block (Pete)
#ifdef GLOW
    // lava (and torch flames): b = 2 + wave tells the outline pass to fill it laser red with slow black waves (water's waves,
    // a third the speed, thicker)
    float ly = vW.z * 1.1 + 0.3 * sin(vW.x * 1.3 + uTime * 0.55) + 0.14 * sin(vW.x * 3.4 - uTime * 0.85 + vW.z * 0.8);
    float lf = abs(fract(ly - uTime * 0.04) - 0.5), lw = fwidth(ly);
    line = 2.0 + 0.99 * (1.0 - smoothstep(lw * 1.2, lw * 2.6, lf)) * (1.0 - smoothstep(25.0, 55.0, vDist));
#endif
#if defined(USE_MAP) && defined(WORLD) && !defined(CUTOUT)        // blocks only: a textured mob's uvs are not atlas tiles
    vec2 lu = vec2(vUv.x, 1.0 - (1.0 - vUv.y) * ${OUTLINE_V.toFixed(1)});               // (the outline map holds the colour atlas's first rows only)
    if (lu.y > 0.0) line = max(line, texture2D(uOutlineMap, lu).r * 0.8 * (1.0 - smoothstep(18.0, 40.0, vDist)));   // cracks, ores, tools, planks
#ifdef THEMES
    else if (uThemeOutOn > 0.5) line = max(line, texture2D(uThemeOut, vec2(vUv.x, lu.y + 1.0)).r * 0.8 * (1.0 - smoothstep(18.0, 40.0, vDist)));   // a theme's added tiles
#endif
#endif
#ifdef WATER
    float y = vW.z * 1.4 + 0.32 * sin(vW.x * 1.6 + uTime * 1.7) + 0.16 * sin(vW.x * 4.1 - uTime * 2.6 + vW.z * 0.8);
    float f = abs(fract(y - uTime * 0.12) - 0.5), w = fwidth(y);
    line = (1.0 - smoothstep(w * 0.6, w * 1.6, f)) * (1.0 - smoothstep(25.0, 55.0, vDist));
#endif
    // laser: the aimed square is its own surface (b = 1.5 + its line), so the outline pass gives it a dim red fill and a thick
    // border that blooms
    if (uAim.w > 0.3 && line < 1.99 && aimed(vW, normalize(vN)) > 0.5) { id += 7919.0; line = 1.5 + 0.4 * min(line, 1.0); }
    uint h = uint(id + 0.5);
    h ^= h >> 16u; h *= 0x7feb352du; h ^= h >> 15u; h *= 0x846ca68bu; h ^= h >> 16u;
    // a: distance from the player (64 blocks = 1): the outline pass brightens near lines into the bloom and dims far ones
    // how lit this surface is (0..1): underground the light map and torchlight, above ground the time of day (and torchlight);
    // it rides in a's integer part (0..7) over the distance fraction, so the outline pass dims the laser lines in the dark
    float tb = texture2D(uBlock, vW.xz / uMapSize).r;
    float lit = uUnder > 0.5 ? max(vVis * uVisU * 0.6, tb) : max(clamp(length(uSkyColor) / 0.75, 0.0, 1.0), tb);
    {                                            // laser and phosphor: the colour view's own light (sun and its shadows, sky occlusion,
                                                 // cave ambient, torches, Craftax's darkness), so they see as far as it does, plus a touch
      vec3 n = normalize(vN);
#ifdef DOUBLE
      if (!gl_FrontFacing) n = -n;
#endif
      vec3 p = vW + n * 0.03;
      bool rt = uRT > 0.5;
      float ndl = max(dot(n, uSunDir), 0.0), sh = 1.0, sky = 1.0;
      if (rt && uUnder < 0.5 && ndl > 0.0) sh = trace(p, uSunDir, 72, 90.0) * cloudShade(p);
      if (rt && uUnder < 0.5) sky = 0.15 + 0.85 * (trace(p, normalize(n + vec3(0.0, 1.0, 0.0)), 8, 5.0)
          + trace(p, normalize(n + vec3(0.8, 0.6, 0.0)), 8, 5.0) + trace(p, normalize(n + vec3(-0.8, 0.6, 0.0)), 8, 5.0)) / 3.0;
      vec3 amb = uUnder > 0.5 ? uCaveColor : uSkyColor * ((0.6 + 0.4 * n.y) * sky + 0.12);
#ifdef WORLD
      amb *= vAO;
#endif
      // laser and phosphor see further in the dark (Pete): torchlight reaches wider and burns brighter (its falloff's tail lifted), and the moon
      // (and the night sky above ground) light more; by day it all clips to full anyway
      float ph = 1.0;                            // laser too, now (Pete): the same lifts in both line views; Color is untouched
      vec3 torch = vec3(1.0, 0.5, 0.2) * mix(1.15 * pow(tb, 1.3), 1.3 * pow(tb, 0.8), ph);   // (toned down from 1.7, 0.6: Pete)
      // and the mines' own light (Craftax's light map round you, vVis) reaches wider too: its falloff's tail lifted, the cave ambient up
      float vis0 = vVis * uVisU, visP = mix(vis0, pow(vis0, 0.72), ph);   // (backed off a little: Pete)
      vec3 L = (uSunColor * ndl * sh * (1.0 + 0.9 * ph) + amb * (1.0 + ph * mix(0.6, 0.15, uUnder))) * visP
             + torch * mix(vis0, max(vis0, 0.85), ph);   // (phosphor: torchlight reaches past Craftax's own dark edge)
      // the pool of light Craftax keeps round each floor's ladder up: phosphor lifts it and spreads it a little wider
      float ldr = uLadder.w * ph * clamp(1.0 - length(vW.xz - uLadder.xy) / uLadder.z, 0.0, 1.0);
      L += vec3(0.85, 0.95, 1.0) * 0.6 * ldr * ldr;
      lit = clamp(dot(L, vec3(0.2126, 0.7152, 0.0722)) * 1.1, 0.0, 1.0);
    }
#ifdef TUNNEL
    {                                            // the victory tunnel lights itself: rings of light rushing along it, spiral bands round it
      float ring = 0.5 + 0.5 * sin(vW.z * 0.9 + uTime * 11.0), ang = atan(vW.y - uTunnel.y, vW.x - uTunnel.x);
      float band = 0.5 + 0.5 * sin(ang * 3.0 + vW.z * 0.35 + uTime * 4.0);
      lit = max(lit, 0.18 + 0.82 * ring * (0.45 + 0.55 * band * band));
    }
#endif
#if defined(WORLD) || defined(STILL)              // STILL: a mob-material thing that isn't a creature (the portal's bricks)
    float MOB8 = 0.0;
#else
    float MOB8 = uPhos > 0.5 ? (uBoost > 0.5 ? 16.0 : 8.0) : 0.0;   // phosphor: a creature flags itself in a's integer part (8), the player 16
#endif
    gl_FragColor = vec4(float(h & 255u) / 255.0, float((h >> 8u) & 255u) / 255.0, line,
                        clamp(distance(vW, uPlayer) / 64.0, 0.0, 0.999) + floor(pow(clamp(lit, 0.0, 1.0), 0.7) * 7.0 + 0.5) + MOB8);   // a gentle lift (Pete): dim places show a touch sooner; pitch black stays black
    return;
  }
  vec3 albedo = tex.rgb * uColor;
  vec3 n = normalize(vN);
#ifdef DOUBLE
  if (!gl_FrontFacing) n = -n;
#endif
  float vis = vVis * uVisU;
  vec3 p = vW + n * 0.03;
  bool rt = uRT > 0.5;

  float ndl = max(dot(n, uSunDir), 0.0);
#ifdef CUTOUT
  ndl = 0.35 + 0.65 * ndl;                       // leaves and plants scatter light through themselves
#endif
  float sh = 1.0;
  if (rt && uUnder < 0.5 && ndl > 0.0) sh = softSun(p, n) * cloudShade(p);

  float sky = 1.0;
  if (rt && uUnder < 0.5) {
    sky = trace(p, normalize(n + vec3(0.0, 1.0, 0.0)), 8, 5.0)
        + trace(p, normalize(n + vec3(0.8, 0.6, 0.0)), 8, 5.0) + trace(p, normalize(n + vec3(-0.8, 0.6, 0.0)), 8, 5.0)
        + trace(p, normalize(n + vec3(0.0, 0.6, 0.8)), 8, 5.0) + trace(p, normalize(n + vec3(0.0, 0.6, -0.8)), 8, 5.0);
    sky = 0.15 + 0.85 * sky / 5.0;
  }
  vec3 amb = uUnder > 0.5 ? uCaveColor : uSkyColor * ((0.6 + 0.4 * n.y) * sky + 0.12);   // + a faint floor nothing shadows (fades at night)

  vec2 bl = texture2D(uBlock, vW.xz / uMapSize).rg;
  float b = pow(bl.r, 1.3);                                       // a gentle fall-off: farther reach, a lower peak; each torch flickers on its own (world.updateLight)
  vec3 blockLight = mix(vec3(1.0, 0.5, 0.2), vec3(0.2, 1.0, 0.35), bl.g) * 1.15 * b;   // warm, amber firelight (phosphor green from a turned torch)

#ifdef WORLD
  vec3 ambT = amb * vAO;
#else
  // mobs are bare boxes with no corner AO: a strong key light from above and to one side over a dim fill, so every face of a box
  // reads differently and faces fall into real shadow (dramatic, not flat)
  vec3 ambT = amb * (0.16 + 1.05 * max(dot(n, normalize(vec3(-0.45, 0.8, 0.45))), 0.0) + 0.12 * n.y);
#endif
  // red eye light: a soft point light per glowing pair of eyes, facing surfaces only, gone by ~4 tiles (no shadows: cheap)
  float eye = 0.0;
  for (int i = 0; i < ${EYE_LIGHTS}; i++) {
    vec4 e = uEyeL[i];
    if (e.w <= 0.0) continue;
    vec3 dv = e.xyz - vW;
    float d2 = dot(dv, dv);
    eye += e.w * (0.25 + 0.75 * max(dot(n, dv * inversesqrt(max(d2, 1e-4))), 0.0)) / (1.0 + d2 * 3.0) * (1.0 - smoothstep(2.5, 4.5, sqrt(d2)));
  }
  vec3 light = uSunColor * ndl * sh + ambT + blockLight * mix(1.0, vAO, 0.6) + vec3(1.0, 0.1, 0.04) * 2.2 * eye * uEyeK;
  // ?god's glow: a warm white light from you that reaches everything in view (no cut-off, a slow fall-off)
  if (uGodL.w > 0.0) {
    vec3 gv = uGodL.xyz - vW;
    float gd = length(gv);
    light += vec3(1.0, 0.95, 0.85) * uGodL.w * (0.45 + 0.55 * max(dot(n, gv / max(gd, 1e-3)), 0.0)) / (1.0 + gd * gd * 0.003);
  }
  // the Necromancer's force field: violet light spilling onto the floor and graves round him, out to ~6 tiles, flaring on a blow
  if (uSealL.w > 0.0) {                         // a sealed ladder (Pete): its purple light cast out round it, on the ground and up the walls
    vec3 sv = uSealL.xyz - vW;
    float sd = length(sv);
    light += vec3(0.62, 0.22, 1.0) * uSealL.w * (0.25 + 0.75 * max(dot(n, sv / max(sd, 1e-3)), 0.0)) / (1.0 + sd * sd * 0.45) * (1.0 - smoothstep(3.0, 5.5, sd));
  }
  if (uNecroL.w > 0.0) {
    vec3 fv = uNecroL.xyz - vW;
    float fd = length(fv);
    light += vec3(0.62, 0.22, 1.0) * uNecroL.w * (0.3 + 0.7 * max(dot(n, fv / max(fd, 1e-3)), 0.0)) / (1.0 + fd * fd * 0.3) * (1.0 - smoothstep(4.0, 7.0, fd));
  }
  // the victory portal: a wide pool of teal light thrown on everything facing it, out to ~9 tiles
  if (uPortalL.w > 0.0) {
    vec3 pv = uPortalL.xyz - vW;
    float pd = length(pv);
    light += vec3(0.15, 1.0, 0.3) * uPortalL.w * (0.3 + 0.7 * max(dot(n, pv / max(pd, 1e-3)), 0.0)) / (1.0 + pd * pd * 0.12) * (1.0 - smoothstep(6.0, 9.0, pd));
  }
  // the aim spot: a soft pool of warm light where the mouse points (replaces the old black box outline)
  // the aimed square, evenly lit with hard edges: relative to the light already there (a third brighter, so subtle at night and
  // clear by day), plus a faint warm floor so it still shows in the dark
  float aimK = uAim.w * aimed(vW, n);
  light = light * (1.0 + 0.6 * uAimGain * aimK * uAimTint) + vec3(1.0, 0.92, 0.75) * uAimTint * 0.035 * uAimGain * aimK;
  vec3 col = albedo * light * vis;
#ifndef WORLD
  col *= 0.6 + 0.4 * smoothstep(-0.1, 1.3, vW.y);                          // darker toward the feet, like a contact shadow
  float rim = pow(1.0 - max(dot(n, normalize(cameraPosition - vW)), 0.0), 3.0);
  col += albedo * (uUnder > 0.5 ? vec3(1.0, 0.55, 0.3) * 0.9 : uSkyColor * 1.3) * rim * 1.1 * vis;   // a bright rim: torchlight below ground, sky above
#endif
  float alpha = uAlpha;
#ifdef GLOW
  col += albedo * uEmissive * (0.85 + 0.15 * sin(uTime * 2.3 + vW.x * 2.1 + vW.z * 1.7));
#else
  col += albedo * uEmissive;
#endif
#ifdef WATER
  // swell normal from the same waves as the surface, plus fine ripples that fade with distance (they would only shimmer far away)
  vec3 V = normalize(vW - cameraPosition);
  float near = 1.0 - smoothstep(8.0, 30.0, vDist);
  vec3 sw = waves(vW.xz, uTime) * (1.0 - smoothstep(25.0, 45.0, vDist));
  vec2 rip = vec2(sin(vW.x * 7.3 + vW.z * 2.1 + uTime * 3.1) + sin(vW.x * 3.7 - vW.z * 8.9 - uTime * 2.6),
                  cos(vW.z * 6.7 - vW.x * 3.3 + uTime * 2.8) + cos(vW.z * 9.1 + vW.x * 4.3 - uTime * 3.4)) * 0.035 * near;
  vec3 wn = normalize(vec3(-sw.y + rip.x, 1.0, -sw.z + rip.y));
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(-V, wn), 0.0), 5.0);
  vec3 R = reflect(V, wn);
  vec3 skyR = uUnder > 0.5 ? uCaveColor * 0.15 * vis : mix(uHorizon, uZenith, clamp(R.y * 1.5, 0.0, 1.0));
  if (rt && uUnder < 0.5 && R.y > 0.0) skyR *= 0.35 + 0.65 * trace(p, R, 24, 24.0);    // reflected trees and hills block the sky
  // the body: deep teal lit by sun and sky, a little light scattered through the crests facing the sun
  vec3 deep = vec3(0.015, 0.09, 0.12), shallow = vec3(0.05, 0.32, 0.34);
  vec3 body = deep * (uSunColor * 0.35 + amb) * vis;
  body += shallow * uSunColor * 0.25 * max(sw.x * 14.0, 0.0) * max(dot(-V, uSunDir) * 0.5 + 0.5, 0.0) * vis;
#ifdef FOUNTAIN
  // the basin's water reads like the overworld's: a clear blue body that keeps some light of its own, a pale sheen off the ripples
  skyR = mix(vec3(0.22, 0.36, 0.48), vec3(0.42, 0.6, 0.75), clamp(R.y * 1.5, 0.0, 1.0)) * (0.55 + amb);
  body = vec3(0.05, 0.26, 0.42) * (0.6 + amb) * (0.92 + 0.15 * (rip.x + rip.y));
#endif
  float spec = pow(max(dot(R, uSunDir), 0.0), 600.0) * 6.0 * sh;
  col = mix(body, skyR, fres) + min(uSunColor * spec, vec3(1.2));       // capped: the glint glows without blooming over the view
  alpha = mix(0.82, 0.98, fres);
  // the aimed square on water too, as on the ground (Pete): its column and row only, since the waves lift it above and below the
  // ground's line; stronger than the ground's, the dark body would hardly show a third more
  float aimWK = uAim.w * step(uAim.x, vW.x) * step(vW.x, uAim.x + uAimSz.x) * step(uAim.y, vW.z) * step(vW.z, uAim.y + uAimSz.y) * step(uAimLo, 0.0);
  col = col * (1.0 + 0.9 * aimWK) + vec3(1.0, 0.92, 0.75) * 0.06 * aimWK;
#endif
  col = mix(col, uFogColor, smoothstep(uFogNear, uFogFar, vDist));
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

// kind: opaque | cutout | water | glow | mob | mobGlow
