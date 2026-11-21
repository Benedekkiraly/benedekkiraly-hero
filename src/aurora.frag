#version 300 es
// WebGL2 twin of aurora.wgsl. Keep the two in step: same uniforms, same maths.
precision highp float;

uniform float uTime;
uniform float uAspect;
uniform float uEnergy;
uniform float uScale;
uniform float uResY;
uniform vec2 uMouse;
uniform vec2 uDefl;
uniform vec2 uOff;
uniform vec4 uDrops[6];

in vec2 vUv;
out vec4 outColor;

const float WORLD = 1.889;
const vec3 LIGHT = vec3(-0.5964, 0.4880, 0.6375); // key light, matches the key softbox

float hash(vec2 p) {
  vec2 q = fract(p * vec2(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}

mat2 rot(float a) {
  float c = cos(a), s = sin(a);
  return mat2(c, -s, s, c);
}

float smin(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

float splash(vec3 p, vec4 d, float body) {
  if (d.w < 0.5) return body;
  return smin(body, length(p - vec3(d.xy, 0.0)) - d.z, 0.14);
}

float mapl(vec3 p0) {
  float t = uTime * 0.3;
  vec2 pw = (uMouse * WORLD - uOff) / uScale;
  vec3 p = p0;
  vec2 dd = p.xy - pw;
  float fall = exp(-dot(dd, dd) * 0.7);
  p.xy -= uDefl * fall * 1.6;
  p.xz = rot(t) * p.xz;
  float w = sin(p.x * 3.0 + t) * sin(p.y * 3.0 - t * 1.3) * sin(p.z * 3.0 + t * 0.7);
  float w2 = sin(p.x * 5.3 - t * 0.8) * sin(p.z * 4.7 + t) * sin(p.y * 4.1 + t * 0.5);
  float d = length(p) - 0.95 + w * 0.09 + w2 * 0.025;
  for (int i = 0; i < 6; i++) d = splash(p0, uDrops[i], d);
  d += sin(length(dd) * 9.0 - uTime * 14.0) * uEnergy * 0.05 * fall;
  return d * 0.8;
}

float map(vec3 q) {
  return mapl((q - vec3(uOff, 0.0)) / uScale) * uScale;
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

// Studio the chrome reflects: soft sky, blurred horizon, dark floor, an overhead strip,
// a key softbox, a cool backlight and a warm bounce. Values go above 1 (tone-mapped later).
vec3 env(vec3 r) {
  float h = r.y;
  vec3 sky = mix(vec3(0.07, 0.08, 0.10), vec3(0.78, 0.81, 0.88), smoothstep(0.0, 0.9, h));
  vec3 flo = mix(vec3(0.015), vec3(0.20, 0.18, 0.16), smoothstep(-0.2, -1.0, h));
  vec3 c = mix(flo, sky, smoothstep(-0.12, 0.06, h));
  c *= 1.0 - 0.75 * exp(-pow((h + 0.03) * 14.0, 2.0));
  c += vec3(2.6) * smoothstep(0.60, 0.64, h) * smoothstep(0.73, 0.69, h) * smoothstep(0.75, 0.45, abs(r.x)); // thin overhead light streak
  c += vec3(1.2) * smoothstep(0.86, 0.9, h) * smoothstep(0.97, 0.93, h); // second, softer streak
  c += vec3(3.5) * smoothstep(0.955, 0.99, dot(r, LIGHT)); // key softbox
  c += vec3(0.6, 0.75, 1.0) * 1.6 * smoothstep(0.75, 0.95, dot(r, normalize(vec3(0.8, 0.3, -0.5))));
  c += vec3(0.95, 0.85, 0.75) * 0.22 * smoothstep(0.88, 0.97, dot(r, normalize(vec3(0.6, -0.5, 0.6))));
  return c;
}

float softshadow(vec3 ro, vec3 rd) {
  float res = 1.0;
  float t = 0.05;
  for (int i = 0; i < 36; i++) {
    float h = map(ro + rd * t);
    if (h < 0.001) return 0.0;
    res = min(res, 6.0 * h / t);
    t += clamp(h, 0.02, 0.35);
    if (t > 6.0) break;
  }
  return clamp(res, 0.0, 1.0);
}

vec3 aces(vec3 x) {
  return clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

vec3 filmHue(float k) {
  return 0.5 + 0.5 * cos(6.2832 * (vec3(0.0, 0.33, 0.67) + k));
}

vec3 shade(vec3 p, vec3 rd) {
  vec3 n = calcNormal(p);
  vec3 r = reflect(rd, n);
  float ndv = max(dot(n, -rd), 0.0);
  float fres = pow(1.0 - ndv, 5.0);
  float occ = 0.0;
  for (int k = 1; k < 4; k++) {
    float hk = 0.08 * float(k);
    occ += (hk - map(p + n * hk)) / float(k * k);
  }
  float ao = clamp(1.0 - occ * 1.6, 0.35, 1.0);
  float sh = softshadow(p + n * 0.03, LIGHT);
  vec3 col = env(r) * (0.78 + 0.22 * fres) * mix(0.6, 1.0, sh) * ao;
  col += vec3(0.7, 0.8, 1.0) * pow(1.0 - ndv, 3.0) * 0.35; // thin backlit rim
  vec3 film = filmHue((1.0 - ndv) * 1.2 + n.y * 0.35 + uTime * 0.02);
  col *= mix(vec3(1.0), film, 0.7 * smoothstep(0.45, 0.95, 1.0 - ndv)); // oil slick, edges only
  return aces(col * 1.05) * vec3(1.0, 0.99, 0.97);
}

// Background texture: a fine dot matrix that flickers slightly. `glow` (1 at the blob's
// edge, 0 far away) lights it up near the outline.
vec3 texLayer(vec2 uv, float ft, float glow) {
  vec2 px = uv * vec2(uAspect * uResY, uResY);
  float cell = 6.0;
  vec2 q = fract(px / cell) - 0.5;
  float dotv = smoothstep(0.24, 0.1, length(q));
  float flick = 0.55 + 0.45 * hash(floor(px / cell) + ft * 0.37);
  return vec3(dotv * flick * (0.028 + 0.22 * glow));
}

vec3 background(vec2 uv, vec2 st, vec3 ro, vec3 rd, float edge) {
  vec3 col = vec3(0.010, 0.011, 0.014);
  // soft cool glow behind the blob, plus a faint oil-slick halo just outside its edge
  vec2 sc = uOff / WORLD;
  float rad = 0.95 * uScale / WORLD;
  vec2 rel = st - sc;
  float dist = length(rel);
  col += vec3(0.05, 0.06, 0.08) * exp(-pow(dist / (rad * 2.2), 2.0)) * 0.8;
  // edge glow that follows the real outline (edge = how close this ray passed the surface)
  float glow = exp(-edge * 10.0);
  float tight = exp(-edge * 28.0);
  col += vec3(0.55, 0.62, 0.75) * 0.08 * glow;
  col += filmHue(atan(rel.y, rel.x) * 0.16 + uTime * 0.03) * 0.025 * tight;
  // light pool on an unseen backdrop, with the blob's soft shadow across it
  float tp = (-1.5 - ro.z) / rd.z;
  vec3 pp = ro + rd * tp;
  vec2 pc = pp.xy - vec2(-0.5, 0.4);
  col += vec3(0.85, 0.9, 1.0) * 0.035 * exp(-dot(pc, pc) * 0.18) * softshadow(pp, LIGHT);
  col *= 1.0 - 0.9 * dot(uv - 0.5, uv - 0.5) * 1.6;
  // fine grain, refreshed slowly
  float ft = floor(uTime * 6.0);
  col += texLayer(uv, ft, glow);
  col *= 1.0 - 0.15 * smoothstep(0.42, 0.5, abs(uv.y - 0.5));
  return max(col, vec3(0.0));
}

void main() {
  vec2 uv = vUv;
  vec2 st = vec2(uv.x - 0.5, 0.5 - uv.y) * vec2(uAspect, 1.0) * 2.0;
  vec3 ro = vec3(0.0, 0.0, 3.4);
  vec3 rd = normalize(vec3(st, -1.8));

  float t = 0.0;
  float dmin = 1e9;
  float tmin = 0.0;
  bool hit = false;
  for (int i = 0; i < 90; i++) {
    float d = map(ro + rd * t);
    if (d < dmin) { dmin = d; tmin = t; }
    if (d < 0.001) { hit = true; break; }
    t += d;
    if (t > 8.0) break;
  }

  vec3 col;
  if (hit) {
    col = shade(ro + rd * t, rd);
  } else {
    col = background(uv, st, ro, rd, dmin);
    // anti-aliased silhouette: blend in the surface where the ray only just missed
    float pw = 2.0 * tmin / (uResY * 1.8);
    if (dmin < 2.0 * pw) {
      float a = 1.0 - smoothstep(0.0, 2.0 * pw, dmin);
      col = mix(col, shade(ro + rd * tmin, rd), a);
    }
  }
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
