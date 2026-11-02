// Pixel's post pass: post() gets each drawn pixel's color (the host point-samples the picture in scale-sized blocks: uv is the block's
// middle) and gives back the palette's nearest, nudged first by a 4 × 4 Bayer threshold so gradients dither instead of banding.
export const PIXEL = `
  uniform vec3 uPal[16];
  uniform float uDither;
  float bayer2(vec2 a) { a = floor(a); return fract(dot(a, vec2(0.5, a.y * 0.75))); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }   // 0..1, a 4 x 4 ordered pattern
  vec3 post(vec3 c, vec2 uv) {
    c += (bayer4(floor(uv * uRes / uScale)) - 0.5) * uDither;           // which drawn pixel this is picks its threshold
    vec3 best = uPal[0]; float bd = 1e9;
    for (int i = 0; i < 16; i++) {                                     // the nearest color, weighted as the eye weighs them
      vec3 d = c - uPal[i]; float e = dot(d * d, vec3(0.30, 0.59, 0.11));
      if (e < bd) { bd = e; best = uPal[i]; }
    }
    return best;
  }
`;
