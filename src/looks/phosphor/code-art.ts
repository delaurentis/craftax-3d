// Phosphor's code art: the GLSL that redraws the line frame in characters (the glyphs, the Necromancer's chaos, the shockwaves, the
// static in the dark), spliced into the shared outline pass (src/looks/shared/outline-pass.ts), whose uniforms it reads.
export const CODE_ART = `    float hash(float x) { return fract(sin(x * 127.1) * 43758.5453); }
    // code art: the frame drawn in characters, as Shellcaster's ASCII cinema draws its pictures. A cell (5 x 8.4 CSS px) looks at a
    // 3 x 4 grid of the laser's lines inside it; if they cross it, their direction picks the glyph (| - / \ ( ) _ =, # @ when packed,
    // o O for a knot), as asciiEngine's strokes do; a plain surface gets a fill glyph by how lit and near it is (: ; . , up to 8 # B &).
    // Fills retype now and then and a band of scrambled glyphs sweeps the screen: it reads like code being written.
    const float NG = 32.0, CW = 5.0, CH = 8.4;          // a cell, CSS px (Shellcaster's 0.6 aspect): small enough to read shapes
    float edgeAt(vec2 uv) {
      vec4 a = texture2D(tDiffuse, uv); vec2 s = uStep * 1.5; float d = step(0.4, a.b) * step(a.b, 1.19);   // its own line art too (not a dying body's flash, 1.2..1.44)
      vec4 b = texture2D(tDiffuse, uv + vec2(s.x, 0.0)); d = max(d, step(0.003, max(abs(a.r - b.r), abs(a.g - b.g))));
      b = texture2D(tDiffuse, uv - vec2(s.x, 0.0)); d = max(d, step(0.003, max(abs(a.r - b.r), abs(a.g - b.g))));
      b = texture2D(tDiffuse, uv + vec2(0.0, s.y)); d = max(d, step(0.003, max(abs(a.r - b.r), abs(a.g - b.g))));
      b = texture2D(tDiffuse, uv - vec2(0.0, s.y)); d = max(d, step(0.003, max(abs(a.r - b.r), abs(a.g - b.g))));
      return d;
    }
    float maskAt(int i, vec2 uv) {             // a hit thing's silhouette (white on clear), as the camera saw it when it was hit
      if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return 0.0;
      return i == 0 ? texture2D(uMask0, uv).r : i == 1 ? texture2D(uMask1, uv).r : i == 2 ? texture2D(uMask2, uv).r : texture2D(uMask3, uv).r;
    }
    float pick(float h, float a, float b, float c, float d) { return h < 0.25 ? a : h < 0.5 ? b : h < 0.75 ? c : d; }
    vec3 codeArt0();
    // the Necromancer in code art (Pete: more powerful, brighter): his own characters burn about twice as bright, and while his shield
    // is up a halo of chaos, scrambled characters flickering fast, stands round his silhouette, thick at his edge and thinning outward;
    // a blow (on the shield or a real hit) turns him and it white-hot. uNecro: his middle on screen, w: shown; z: shield (0..1);
    // uNecroW: whiteness; uMaskN: his silhouette (drawMask, refreshed every few frames)
    float maskN(vec2 uv) { return any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0))) ? 0.0 : texture2D(uMaskN, uv).r; }
    vec3 codeArt() {
      vec3 c = codeArt0();
      if (uNecro.w <= 0.0) return c;
      vec2 v = vUv - uNecro.xy;
      float body = maskN(vUv);
      float halo = max(maskN(uNecro.xy + v / 1.18), max(0.6 * maskN(uNecro.xy + v / 1.4), 0.3 * maskN(uNecro.xy + v / 1.7))) * (1.0 - body) * uNecro.z;
      vec2 cs = vec2(CW, CH) * uPx * uCellK, px = vUv * uRes, cell = floor(px / cs), f = fract(px / cs);
      float roll = hash(cell.x * 1.91 + cell.y * 5.37 + floor(uTime / 0.05) * 0.73);
      float sg = 1.0 + floor(hash(cell.x * 3.3 + cell.y * 7.1 + floor(uTime / 0.045)) * (NG - 1.0));
      float g2 = texture2D(uGlyphs, vec2((sg + f.x) / NG, f.y)).r;
      vec3 hot = vec3(0.55, 1.0, 0.62), white = vec3(1.0);
      if (body > 0.5) {
        float l = max(max(c.r, c.g), c.b);
        if (l < 0.05 && roll < 0.55) c = uInk * g2 * 0.5;                      // never a dark hole in him: characters all through
        c = mix(c * 2.0, vec3(max(max(c.r, c.g), c.b)) * 3.2, uNecroW);       // twice as bright; white-hot on a blow
        return c;
      }
      if (halo > 0.02 && roll < 0.25 + 0.5 * halo) {                           // the chaos round him
        vec3 ink = mix(mix(uInk, hot, 0.35 + 0.4 * halo), white, uNecroW);
        return max(c, ink * g2 * (0.5 + 1.1 * halo) * (1.0 + 1.5 * uNecroW));
      }
      return c;
    }
    vec3 codeArt0() {
      // far away the cells split, 2 x 2 then 4 x 4 (Pete): small far things still get enough characters to read (judged per big cell,
      // by how far its middle is, so a big cell is all one size)
      vec2 cs = vec2(CW, CH) * uPx * uCellK, px = vUv * uRes, cell = floor(px / cs);   // uCellK: smaller from the 3/4 view's height
      vec4 c0 = texture2D(tDiffuse, (cell + 0.5) * cs / uRes);
      if (texture2D(tDiffuse, vUv).b > 2.99) {   // the victory portal (b 3.5): the brightest thing, in big phosphor-white characters (Pete),
        vec2 bs = cs * 2.0, bc = floor(px / bs), bf = fract(px / bs);   // twice the size, columns of them streaming down
        float sp = 3.0 + 5.0 * hash(bc.x * 1.73), row = bc.y + floor(uTime * sp);
        float gb = 1.0 + floor(hash(bc.x * 3.17 + row * 7.31 + floor(uTime / (0.25 + 0.5 * hash(row + bc.x)))) * (NG - 1.0));
        float head = fract(uTime * 0.35 + hash(bc.x * 9.1)), y = 1.0 - fract(bc.y * bs.y / uRes.y);   // a brighter wave falling down each column
        float wv = 0.6 + 0.4 * (1.0 - smoothstep(0.0, 0.25, abs(fract(y - head + 0.5) - 0.5)));
        float gp = texture2D(uGlyphs, vec2((gb + bf.x) / NG, bf.y)).r;
        return vec3(0.62, 1.0, 0.7) * gp * 1.7 * wv + vec3(0.03, 0.09, 0.04);   // a faint green-white glow behind the characters too
      }
      float d0 = c0.r == 0.0 && c0.g == 0.0 && c0.a == 0.0 ? 0.0 : fract(c0.a);
      float sub = d0 > 0.3 ? 4.0 : d0 > 0.12 ? 2.0 : 1.0;
      cs /= sub; cell = floor(px / cs);
      vec2 f = fract(px / cs), base = cell * cs / uRes, cu = cs / uRes;
      float n = 0.0, mx = 0.0, my = 0.0, sxx = 0.0, syy = 0.0, sxy = 0.0;
      for (int j = 0; j < 4; j++) for (int i = 0; i < 3; i++) {
        vec2 q = vec2((float(i) + 0.5) / 3.0, (float(j) + 0.5) / 4.0);
        float e = edgeAt(base + q * cu);
        n += e; mx += e * q.x; my += e * q.y; sxx += e * q.x * q.x; syy += e * q.y * q.y; sxy += e * q.x * q.y;
      }
      vec4 cc = texture2D(tDiffuse, base + 0.5 * cu);
      bool sky = cc.r == 0.0 && cc.g == 0.0 && cc.a == 0.0;
      // light and distance as the ray tracer sees them: lit faces burn bright, shadowed and far ones fade toward the dark
      // (a creature writes 8 over its light, shading.ts: it always stands out a little, and close and lit it burns green-white)
      float li = floor(cc.a + 0.001); bool me = li >= 15.5, mob = li >= 7.5; li -= me ? 16.0 : mob ? 8.0 : 0.0;   // me: the player
      float litc = pow(li / 7.0, 1.35),  // (dim places draw dimmer, but mild shade, a tree in its own shadow by day, stays readable: Pete)
            farc = sky ? 1.0 : fract(cc.a), kk = mix(1.5, 0.28, smoothstep(0.02, 0.5, farc));
      float h = hash(cell.x * 7.13 + cell.y * 91.7), gi = 0.0, bright = 0.0;
      if (n > 0.5) {                                         // a stroke: which way it runs, in pixels
        mx /= n; my /= n;
        float vx = (sxx / n - mx * mx) * CW * CW, vy = (syy / n - my * my) * CH * CH, cxy = (sxy / n - mx * my) * CW * CH;
        float ang = 0.5 * atan(2.0 * cxy, vx - vy), tr = vx + vy, det = vx * vy - cxy * cxy, disc = sqrt(max(tr * tr / 4.0 - det, 0.0));
        float elong = sqrt((tr / 2.0 + disc) / max(tr / 2.0 - disc, 1e-3)), cov = n / 12.0, deg = abs(degrees(ang));
        if (cov > 0.6) gi = h < 0.5 ? 27.0 : 30.0;                                  // packed: # @
        else if (elong >= 1.7 || n < 2.5) {
          if (deg > 67.5) gi = mx < 0.36 ? 5.0 : mx > 0.64 ? 6.0 : 1.0;              // ( | )
          else if (deg < 22.5) gi = my < 0.3 ? 7.0 : cov > 0.34 ? 8.0 : 2.0;        // _ = -
          else gi = ang > 0.0 ? 3.0 : 4.0;                                          // slash or backslash
        } else gi = h < 0.5 ? 18.0 : 31.0;                                          // a knot: o O
        bright = kk * (0.04 + 0.96 * litc);   // (no fixed floor: dim places fade out, as in laser)
      } else if (!sky) {                                     // a surface: a fill glyph, retyped now and then
        float b = 0.75 * litc * (1.0 - 0.55 * smoothstep(0.05, 0.5, farc));   // fills stay light: the strokes carry the shapes
        float hh = hash(cell.x * 3.7 + cell.y * 11.3 + floor(uTime * (0.4 + 1.6 * h)));
        gi = b < 0.25 ? pick(hh, 9.0, 10.0, 11.0, 12.0) : b < 0.45 ? pick(hh, 13.0, 14.0, 8.0, 15.0) : b < 0.65 ? pick(hh, 17.0, 18.0, 19.0, 20.0)
           : b < 0.85 ? pick(hh, 22.0, 23.0, 24.0, 25.0) : pick(hh, 26.0, 27.0, 28.0, 29.0);
        bright = 0.25 * b;                   // fills too fade out in the dark
        if (cc.b > 1.99) { gi = pick(hh, 14.0, 14.0, 8.0, 15.0); bright = 0.9; }   // lava: churning ~ = *
      } else if (h < 0.025) { gi = 11.0; bright = 0.12; }    // the sky: a few far dots
      bool aimedC = cc.b > 1.45 && cc.b < 1.99;
      if (aimedC) bright = n > 0.5 ? max(bright, 0.5) * 1.8 : bright * 1.4;   // the aimed square: its drawing burns, its fill only a little (Pete: lifting the fill lit the whole face)
      if (aimedC && uAimGlow > 0.5) bright *= n > 0.5 ? 1.35 : 1.9;            // the green box (Pete): all of it brighter, fill too, in proportion, so its own pattern (water's waves) still shows
      // the churn: a band of scrambled glyphs sweeping by, flipping every 90 ms
      float p = fract(uTime * 0.11), fl = 0.04 + 0.92 * hash(cell.x * 1.37 + cell.y * 3.11);
      if (gi > 0.0 && abs(fl - p) < 0.035) { gi = 1.0 + floor(hash(cell.x * 5.3 + cell.y * 2.9 + floor(uTime / 0.09)) * (NG - 1.0)); bright *= 1.25; }
      float g = gi > 0.0 ? texture2D(uGlyphs, vec2((gi + f.x) / NG, f.y)).r : 0.0;
      // shockwaves: a ring of scrambled, bright characters racing out from whoever was hit (uShock: screen place, start, strength)
      float BAND = mix(2.0, 1.0, (1.0 - uCellK) / 0.4);   // the band, in characters: 2 up close, 1 from the 3/4 view (finer cells too)
      for (int i = 0; i < 4; i++) {
        vec4 sk = uShock[i]; float age = uTime - sk.z;
        if (sk.w <= 0.0 || age < 0.0 || age > 0.7) continue;
        float fade = 1.0 - age / 0.7, on, chaos = 0.0;   // short now: a burst of chaos round the thing, a ripple that dies out close
        if (uShape[i] > 0.5) {                   // the thing's own outline (in the 3/4 view too: no ground ring), swelling out a little: copies of its
          vec2 v = vUv - sk.xy;                  // silhouette: lit just outside its edge, a band about 2 characters thick (Pete), however big
          vec2 inw = normalize(v * uRes + 1e-4) * (BAND * CW * uPx * uCellK) / uRes;   // ~2 cells (1 from above) toward the middle
          float s1 = 1.0 + age * 0.5 * sk.w, s2 = 1.0 + max(age - 0.15, 0.0) * 0.5 * sk.w;   // barely out from it before it's gone
          on = step(age, 0.4) * max(maskAt(i, sk.xy + (v - inw) / s1) - maskAt(i, sk.xy + v / s1),   // the rings: gone in 0.4 s
                   0.7 * step(0.15, age) * (maskAt(i, sk.xy + (v - inw) / s2) - maskAt(i, sk.xy + v / s2)));
          // the chaos: the thing itself and a halo of cells round it scramble, thickest on it and thinning outward, then settle
          chaos = max(maskAt(i, sk.xy + v), 0.35 * maskAt(i, sk.xy + v / 1.2)) * max(0.0, 1.0 - age / 0.45);   // gentler: a thin halo, settled by 0.45 s
        } else {                                 // no thing to trace (a hit on you, in first person): a ring
          float d = length((vUv - sk.xy) * uRes / uPx), ring = age * 520.0 * sk.w;
          on = 1.0 - step(0.5 * BAND * CW * uCellK, abs(d - ring));   // ~2 characters thick (1 from above)
        }
        // a cell of the chaos (picked anew every 40 ms, so the glyphs flicker fast) or of the ripple: a scrambled glyph
        float roll = hash(cell.x * 1.91 + cell.y * 5.37 + floor(uTime / 0.07) * 0.73 + float(i) * 3.1);   // flickering every 70 ms
        if (roll < chaos * 0.45) on = max(on, 0.5 + 0.5 * chaos);   // under half the cells scramble, even at its peak
        if (on > 0.05) {
          float sg = 1.0 + floor(hash(cell.x * 3.3 + cell.y * 7.1 + floor(uTime / 0.04)) * (NG - 1.0));
          float g2 = texture2D(uGlyphs, vec2((sg + f.x) / NG, f.y)).r, w = on * fade;
          // as bright as the thing that was hit (its light and distance, read at its middle, a creature's boost and all), so the
          // rings and the chaos read as part of it, not brighter or dimmer than it
          vec4 h0 = texture2D(tDiffuse, sk.xy); float hl = floor(h0.a + 0.001); bool hme = hl >= 15.5, hmob = hl >= 7.5;
          hl -= hme ? 16.0 : hmob ? 8.0 : 0.0;
          float hk = mix(1.5, 0.28, smoothstep(0.02, 0.5, fract(h0.a))), hb = hk * (0.18 + 0.82 * max(hl / 7.0, 0.1));
          if (hmob) hb = max(hb * (hme ? 1.5 : 1.25), hme ? 0.45 : 0.32);   // (as the creature itself is drawn now)
          if (uShape[i] < 0.5) hb = kk * (0.55 + 0.45 * litc);   // (a ring with no thing: the scene's own brightness there)
          return uInk * g2 * hb * (0.6 + 0.4 * w) + vec3(0.004, 0.008, 0.005);
        }
      }
      if (mob) bright = max(bright * (me ? 1.5 : 1.25), me ? 0.45 : 0.32);  // the player a touch brighter still (Pete: both were near white, toned down)
      // pitch black is not empty (Pete): a dim, soft static of green characters, retyped some eight times a second, under half the
      // cells lit at a time and the edges of things a little more often, so shapes only hint through: changing and mysterious
      if (li < 0.5 && !me && !sky) {
        float t8 = floor(uTime / 0.12), r1 = hash(cell.x * 2.17 + cell.y * 7.91 + t8 * 1.31);
        float show = max(step(0.58, r1), n > 0.5 ? step(0.35, r1) : 0.0);
        float sg = 1.0 + floor(hash(cell.x * 4.1 + cell.y * 1.7 + t8 * 0.57) * (NG - 1.0));
        float gd = (texture2D(uGlyphs, vec2((sg + f.x) / NG, f.y)).r * 0.5                      // soft: the glyph smeared sideways
          + texture2D(uGlyphs, vec2((sg + clamp(f.x - 0.14, 0.0, 0.999)) / NG, f.y)).r * 0.25
          + texture2D(uGlyphs, vec2((sg + clamp(f.x + 0.14, 0.0, 0.999)) / NG, f.y)).r * 0.25);
        float dim = (0.035 + 0.055 * hash(cell.y * 3.9 + cell.x * 0.7 + t8 * 2.3)) * (n > 0.5 ? 1.5 : 1.0) * (1.0 - 0.6 * farc);
        return uInk * gd * dim * show + vec3(0.004, 0.008, 0.005);
      }
      if (li < 0.5 && !me) bright = 0.0;          // the sky in the dark: nothing
      float hot = mob ? 0.35 * smoothstep(0.55, 1.0, litc) * (1.0 - smoothstep(0.05, 0.25, farc)) : 0.0;   // near and lit: a touch toward green-white (it was all of it)
      if (aimedC && uAimGlow > 0.5) hot = max(hot, n > 0.5 ? 0.9 : 0.45);    // the target: its lines near white, its fill tinted toward whitish green, its pattern kept (Pete)
      return mix(uInk, vec3(0.45, 1.0, 0.55), hot) * g * bright * (1.0 + 0.6 * hot) + vec3(0.004, 0.008, 0.005);
    }`;
