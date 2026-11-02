// Noir's post pass: post() turns each point of color's finished picture (display colors) into a gray: its brightness, hard contrast,
// darker toward the corners, and grain that changes 24 times a second, as film's does.
export const NOIR = `
  uniform float uGrain, uVignette;
  float grain(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  vec3 post(vec3 c, vec2 uv) {
    float y = dot(c, vec3(0.2126, 0.7152, 0.0722));                    // its brightness
    y = smoothstep(0.06, 0.82, y);                                     // strong contrast: deep blacks, hard whites
    vec2 d = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
    y *= 1.0 - uVignette * smoothstep(0.4, 1.0, length(d));            // the corners fall into shadow
    y += (grain(floor(uv * uRes) + mod(floor(uTime * 24.0), 64.0) * 17.0) - 0.5) * uGrain;
    return vec3(clamp(y, 0.0, 1.0));
  }
`;
