// WEAPON SKINS: small GLSL shaders (no textures, no downloads). Purely cosmetic: the server only relays the skin name.
//   gold      - polished gold with a sheen
//   damascus  - folded-steel wavy bands
//   magma     - dark basalt with glowing, pulsing cracks
//   carbon    - carbon-fibre twill weave with a clear-coat shine
//   reactive  - oil-slick colours that flare up when YOU shoot or get a kill
// All five share one vertex shader and the same cheap lighting (one light, fake environment), so they cost almost nothing.
import * as THREE from 'three';

export const SKIN_INFO = {
  gold: { label: 'GOLD', css: 'linear-gradient(135deg,#8a5a10,#ffd76a 45%,#b8801e)' },
  damascus: { label: 'DAMASCUS', css: 'repeating-linear-gradient(115deg,#2a2d33 0 5px,#9aa3ad 5px 8px,#3c4048 8px 13px)' },
  magma: { label: 'MAGMA', css: 'linear-gradient(135deg,#1a0f0d,#ff4a10 45%,#ffb52e 55%,#1a0f0d)' },
  carbon: { label: 'CARBON', css: 'repeating-conic-gradient(#15171b 0 25%,#2b2f36 0 50%) 0 0/8px 8px' },
  reactive: { label: 'REACTIVE', css: 'linear-gradient(135deg,#1b2a5e,#17e0c8 40%,#c04bff 70%,#1b2a5e)' },
};

const shared = { uTime: { value: 0 }, uReact: { value: 0 } };
let react = 0;
/** call once per frame */
export function tickSkins(t, dt) { react = Math.max(0, react - dt * 1.4); shared.uTime.value = t; shared.uReact.value = react; }
/** shot fired / kill scored: the Reactive skin flares (1 = full) */
export function skinReact(v = 0.35) { react = Math.min(1, react + v); }

const VERT = /* glsl */`
  varying vec3 vObj; varying vec3 vON; varying vec3 vN; varying vec3 vView;
  void main() {
    vObj = position; vON = normal;
    vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;

const COMMON = /* glsl */`
  uniform float uTime; uniform float uReact;
  varying vec3 vObj; varying vec3 vON; varying vec3 vN; varying vec3 vView;
  float h31(vec3 p) { p = fract(p * 0.3183099 + .1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 x) {
    vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(h31(i), h31(i + vec3(1,0,0)), f.x), mix(h31(i + vec3(0,1,0)), h31(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(h31(i + vec3(0,0,1)), h31(i + vec3(1,0,1)), f.x), mix(h31(i + vec3(0,1,1)), h31(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
  // one light + a fake sky/ground environment: diffuse, specular, fresnel, reflection
  struct L { float diff; float spec; float fres; vec3 R; };
  L light(vec3 N, vec3 V, float shin) {
    vec3 ld = normalize(vec3(0.45, 0.75, 0.55));
    L l; l.diff = max(dot(N, ld), 0.0) * 0.8 + 0.2 + 0.1 * N.y;
    l.R = reflect(-V, N);
    l.spec = pow(max(dot(l.R, ld), 0.0), shin);
    l.fres = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    return l;
  }`;

const FRAG = {
  gold: /* glsl */`
    void main() {
      vec3 N = normalize(vN), V = normalize(vView); L l = light(N, V, 60.0);
      float n = fbm(vObj * 70.0) * 0.12;
      // fake studio reflection: dark floor, bright horizon band, softer sky -> reads as polished metal even on flat boxes
      float band = smoothstep(-0.35, 0.05, l.R.y) * (1.0 - smoothstep(0.1, 0.55, l.R.y));
      vec3 base = mix(vec3(0.30, 0.17, 0.03), vec3(0.95, 0.70, 0.22), smoothstep(-0.6, 0.35, l.R.y));
      base += vec3(1.0, 0.86, 0.45) * band * 0.55 + n;
      vec3 col = base * (0.5 + 0.6 * l.diff) + vec3(1.0, 0.96, 0.75) * (l.spec * 1.4 + l.fres * 0.35);
      gl_FragColor = vec4(col, 1.0);
    }`,
  damascus: /* glsl */`
    void main() {
      vec3 N = normalize(vN), V = normalize(vView); L l = light(N, V, 30.0);
      float warp = fbm(vObj * vec3(16.0, 30.0, 6.0)) * 9.0;
      float w = sin(vObj.z * 170.0 + warp + sin(vObj.y * 70.0 + vObj.x * 40.0) * 2.0);
      float fine = sin(vObj.z * 520.0 + warp * 2.0) * 0.5 + 0.5;
      float bands = smoothstep(-0.6, 0.6, w);
      vec3 col = mix(vec3(0.15, 0.16, 0.19), vec3(0.50, 0.53, 0.58), bands * 0.8 + fine * 0.2);
      col = col * (0.45 + 0.7 * l.diff) + vec3(0.9, 0.95, 1.0) * l.spec * (0.2 + 0.4 * bands) + l.fres * 0.06;
      gl_FragColor = vec4(col, 1.0);
    }`,
  magma: /* glsl */`
    void main() {
      vec3 N = normalize(vN), V = normalize(vView); L l = light(N, V, 12.0);
      float n = fbm(vObj * 22.0 + vec3(0.0, uTime * 0.12, 0.0));
      float crack = 1.0 - smoothstep(0.0, 0.075, abs(n - 0.5));
      float pulse = 0.65 + 0.35 * sin(uTime * 2.4 + n * 9.0);
      vec3 rock = vec3(0.075, 0.058, 0.052) * (0.35 + 0.9 * l.diff) + l.spec * 0.06;
      vec3 lava = mix(vec3(0.95, 0.14, 0.02), vec3(1.0, 0.78, 0.2), crack * pulse);
      vec3 col = mix(rock, lava, crack) + lava * crack * pulse * 0.55 + vec3(0.9, 0.25, 0.05) * l.fres * 0.12;
      gl_FragColor = vec4(col, 1.0);
    }`,
  carbon: /* glsl */`
    void main() {
      vec3 N = normalize(vN), V = normalize(vView); L l = light(N, V, 70.0);
      vec3 an = abs(vON); vec2 q = (an.x > an.y && an.x > an.z) ? vObj.zy : (an.y > an.z ? vObj.xz : vObj.xy);
      q *= 240.0;
      float cell = mod(floor(q.x) + floor(q.y), 2.0);
      float twill = 0.5 + 0.5 * sin((q.x + q.y) * 3.14159);
      float weave = mix(0.22, 0.58, cell) * (0.7 + 0.3 * twill);
      vec3 col = vec3(0.2, 0.21, 0.23) * weave * (0.5 + 0.9 * l.diff) + vec3(0.8, 0.88, 1.0) * l.spec * (0.35 + 0.65 * cell) * 0.85 + vec3(0.05, 0.07, 0.1) * l.fres;
      gl_FragColor = vec4(col, 1.0);
    }`,
  reactive: /* glsl */`
    void main() {
      vec3 N = normalize(vN), V = normalize(vView); L l = light(N, V, 40.0);
      float h = uReact;
      vec3 irid = 0.5 + 0.5 * cos(6.2831 * (l.fres * 1.3 + vObj.z * 1.4 + uTime * 0.07 + vec3(0.0, 0.33, 0.67)));
      float pulse = 0.5 + 0.5 * sin(uTime * 3.2 + vObj.z * 28.0);
      vec3 col = vec3(0.06, 0.08, 0.12) * (0.4 + 0.9 * l.diff) + irid * (0.22 + 0.85 * l.fres) * (0.6 + 0.9 * h)
               + vec3(0.15, 0.85, 1.0) * h * (0.35 + 0.65 * pulse) * 0.9 + l.spec * 0.5;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

const cache = new Map();
export function skinMaterial(id) {
  if (!FRAG[id]) return null;
  let m = cache.get(id);
  if (!m) { m = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: COMMON + FRAG[id], uniforms: shared }); cache.set(id, m); }
  return m;
}
