// Post-processing: the composer, the outline pass both line looks draw with (laser's lines; phosphor's code art, its GLSL in
// src/looks/phosphor/code-art.ts) and the bloom.
import { camera, renderer, scene } from "../../render/scene";
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { CODE_ART } from "../phosphor/code-art";

// post: bloom on the HDR image (lava, torches, fireballs, the sun on water), then filmic tone mapping
export const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
// outline art (M): the scene renders surface ids (shading.ts); this pass draws the ink where the id changes, over a dark fill, plus
// the lines each surface draws itself (water's waves)
export const outlinePass = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uStep: { value: new THREE.Vector2() }, uInk: { value: new THREE.Vector3(1.0, 0.0232, 0.0091) },
    uAimGlow: { value: 0 }, uPhosphor: { value: 0 }, uTime: { value: 0 }, uShock: { value: [0, 1, 2, 3].map(() => new THREE.Vector4(0, 0, -99, 0)) }, uShape: { value: [0, 0, 0, 0] }, uCellK: { value: 1 }, uShockW: { value: [0, 1, 2, 3].map(() => new THREE.Vector3()) },
    uInvVP: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() },
    uMask0: { value: null }, uMask1: { value: null }, uMask2: { value: null }, uMask3: { value: null }, uRes: { value: new THREE.Vector2(1, 1) }, uPx: { value: 1 }, uGlyphs: { value: null },
    uNecro: { value: new THREE.Vector4() }, uNecroW: { value: 0 }, uMaskN: { value: null } },   // the Necromancer in code art (phosphor/fx.ts necroCode)
  vertexShader: "varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uStep; varying vec2 vUv;
    uniform vec4 uNecro; uniform float uNecroW; uniform sampler2D uMaskN;
    uniform vec3 uInk; uniform float uPhosphor, uTime, uPx, uAimGlow; uniform vec4 uShock[4]; uniform float uCellK; uniform vec3 uShockW[4], uCam; uniform mat4 uInvVP; uniform float uShape[4]; uniform sampler2D uMask0, uMask1, uMask2, uMask3; uniform vec2 uRes; uniform sampler2D uGlyphs;
    ${CODE_ART}
    float near = 1.0;                                     // the nearest distance seen (a: distance from the player / 64)
    float differs(vec4 a, vec2 o) { vec4 b = texture2D(tDiffuse, vUv + o); near = min(near, fract(b.a)); return step(0.003, max(abs(a.r - b.r), abs(a.g - b.g))); }
    float aimedAt(vec2 o) { float b = texture2D(tDiffuse, vUv + o).b; return step(1.45, b) * step(b, 1.99); }   // the aimed square (b 1.5..1.9)
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      near = fract(c.a);
      // how lit the surface is: the colour view's light, lifted a touch (shading.ts); none in pitch black. Raised to 1.35: a glowing line
      // reads brighter than a lit surface of the same light, so dim places draw dimmer lines, but mild shade (a tree in its own shadow
      // by day) stays readable (Pete; it was squared)
      float lit = pow(floor(c.a + 0.001) / 7.0, 1.35);
      float e = max(max(differs(c, vec2(uStep.x, 0.0)), differs(c, vec2(-uStep.x, 0.0))), max(differs(c, vec2(0.0, uStep.y)), differs(c, vec2(0.0, -uStep.y))));
      float k = mix(1.8, 0.75, smoothstep(0.03, 0.6, near));    // bloom by distance: near lines glow, fading off to none by ~38 blocks
      vec3 red = uInk;                                      // the HUD's #ff2a18 in linear light (the output pass turns it back); phosphor: green
      float near0 = near;
      // a dying body's flash (b 1.2..1.44, fell.ts): its outlines burn up to 4x, its face stays unfilled
      float fb = step(1.195, c.b) * step(c.b, 1.445), boost = 1.0 + 3.0 * fb * clamp((c.b - 1.2) / 0.24, 0.0, 1.0);
      vec3 col = vec3(0.022, 0.016, 0.016) + red * k * max(e * boost, fb > 0.5 ? 0.0 : min(c.b, 1.0)) * lit;   // lines add light over the fill: a dark line fades into it, never cuts a black seam
      // the aimed square: a dim red fill (its own lines still drawn) and a thick border, 3 px each side of its edge, bright to bloom
      float ac = aimedAt(vec2(0.0)), border = 0.0;
      for (int i = 1; i <= 3; i++) {
        vec2 s = uStep * float(i);
        border = max(border, max(max(abs(ac - aimedAt(vec2(s.x, 0.0))), abs(ac - aimedAt(vec2(-s.x, 0.0)))),
                                 max(abs(ac - aimedAt(vec2(0.0, s.y))), abs(ac - aimedAt(vec2(0.0, -s.y))))));
      }
      if (ac > 0.5 && lit > 0.0) col = red * 0.16 + red * k * max(e, clamp((c.b - 1.5) / 0.4, 0.0, 1.0));
      if (border > 0.5 && lit > 0.0) col = red * 2.8;   // (not in pitch black: what you cannot see does not light up, Pete)
      if (c.b > 1.99) {                                      // lava: a fill in the ink crossed by slow black waves
        float wave = clamp(c.b - 2.0, 0.0, 1.0);
        col = e > 0.5 ? red * k * 1.2 : mix(red * 0.55, vec3(0.012, 0.006, 0.006), wave);
      }
      if (uPhosphor > 0.5) col = codeArt();                    // code art: characters instead of lines
      gl_FragColor = vec4(col, 1.0);
    }`,
});
outlinePass.enabled = false;
composer.addPass(outlinePass);
export const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.5, 3.0);
// the line looks: the glow saturates (b / (1 + k·b)), so where lines crowd their glows don't stack into a haze; a lone line glows about as before
bloom.compositeMaterial.uniforms.bloomSat = { value: 0 };
bloom.compositeMaterial.uniforms.bloomSatAxis = { value: new THREE.Vector3(1, -2, 0) };   // the lines' own colour: red, or green in phosphor
bloom.compositeMaterial.fragmentShader = bloom.compositeMaterial.fragmentShader
  .replace("uniform float bloomRadius;", "uniform float bloomRadius;\nuniform float bloomSat;\nuniform vec3 bloomSatAxis;")
  .replace("float bloomAlpha = max( bloom.r, max( bloom.g, bloom.b ) );",
    "bloom /= 1.0 + bloomSat * max( dot( bloom.rgb, bloomSatAxis ), 0.0 );\nfloat bloomAlpha = max( bloom.r, max( bloom.g, bloom.b ) );");
// (the crowding measure is the red the lines add; lava's orange glow carries green, so it is held back far less and blooms hard)
bloom.compositeMaterial.needsUpdate = true;
composer.addPass(bloom);
composer.addPass(new OutputPass());
