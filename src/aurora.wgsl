// Chrome blob on a near-black film backdrop. WebGPU version; aurora.frag is the WebGL2 twin,
// keep the two in step. The pointer dents the surface (defl); `energy` drives a ripple.
struct Params {
  time: f32,
  aspect: f32,
  energy: f32,
  pad: f32,
  mouse: vec2f,   // pointer in screen-centred space, y up
  defl: vec2f,    // spring-driven displacement, world units
  // splash droplets: xy = position, z = radius, w = 1 while alive
  d0: vec4f,
  d1: vec4f,
  d2: vec4f,
  d3: vec4f,
  d4: vec4f,
  d5: vec4f,
  off: vec2f,     // where the blob sits in world units (it slides aside on hover)
  scale: f32,     // blob size multiplier
  resy: f32,      // canvas height in pixels, for edge anti-aliasing
}
@group(0) @binding(0) var<uniform> params: Params;

const WORLD: f32 = 1.889; // screen-space -> world units at z = 0
const LIGHT: vec3f = vec3f(-0.5964, 0.4880, 0.6375); // key light, matches the key softbox

fn hash(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}

fn rot(a: f32) -> mat2x2f {
  let c = cos(a);
  let s = sin(a);
  return mat2x2f(c, -s, s, c);
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = max(k - abs(a - b), 0.0) / k;
  return min(a, b) - h * h * k * 0.25;
}

fn splash(p: vec3f, d: vec4f, body: f32) -> f32 {
  if (d.w < 0.5) { return body; }
  return smin(body, length(p - vec3f(d.xy, 0.0)) - d.z, 0.14);
}

fn mapl(p0: vec3f) -> f32 {
  let t = params.time * 0.3;
  let pw = (params.mouse * WORLD - params.off) / params.scale;
  var p = p0;
  let dd = p.xy - pw;
  let fall = exp(-dot(dd, dd) * 0.7);
  p = vec3f(p.xy - params.defl * fall * 1.6, p.z);
  let xz = rot(t) * p.xz;
  p = vec3f(xz.x, p.y, xz.y);
  let w = sin(p.x * 3.0 + t) * sin(p.y * 3.0 - t * 1.3) * sin(p.z * 3.0 + t * 0.7);
  let w2 = sin(p.x * 5.3 - t * 0.8) * sin(p.z * 4.7 + t) * sin(p.y * 4.1 + t * 0.5);
  var d = length(p) - 0.95 + w * 0.09 + w2 * 0.025;
  d = splash(p0, params.d0, d);
  d = splash(p0, params.d1, d);
  d = splash(p0, params.d2, d);
  d = splash(p0, params.d3, d);
  d = splash(p0, params.d4, d);
  d = splash(p0, params.d5, d);
  d += sin(length(dd) * 9.0 - params.time * 14.0) * params.energy * 0.05 * fall;
  return d * 0.8;
}

// World-space distance field: the blob lives in its own local space, moved and scaled here.
fn map(q: vec3f) -> f32 {
  return mapl((q - vec3f(params.off, 0.0)) / params.scale) * params.scale;
}

fn normal(p: vec3f) -> vec3f {
  let e = vec2f(0.0015, 0.0);
  return normalize(vec3f(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

// Studio the chrome reflects: soft sky, blurred horizon, dark floor, an overhead strip,
// a key softbox, a cool backlight and a warm bounce. Values go above 1 (tone-mapped later).
fn env(r: vec3f) -> vec3f {
  let h = r.y;
  let sky = mix(vec3f(0.07, 0.08, 0.10), vec3f(0.78, 0.81, 0.88), smoothstep(0.0, 0.9, h));
  let flo = mix(vec3f(0.015), vec3f(0.20, 0.18, 0.16), smoothstep(-0.2, -1.0, h));
  var c = mix(flo, sky, smoothstep(-0.12, 0.06, h));
  c *= 1.0 - 0.75 * exp(-pow((h + 0.03) * 14.0, 2.0));
  c += vec3f(2.6) * smoothstep(0.60, 0.64, h) * smoothstep(0.73, 0.69, h) * smoothstep(0.75, 0.45, abs(r.x)); // thin overhead light streak
  c += vec3f(1.2) * smoothstep(0.86, 0.9, h) * smoothstep(0.97, 0.93, h); // second, softer streak
  c += vec3f(3.5) * smoothstep(0.955, 0.99, dot(r, LIGHT)); // key softbox
  c += vec3f(0.6, 0.75, 1.0) * 1.6 * smoothstep(0.75, 0.95, dot(r, normalize(vec3f(0.8, 0.3, -0.5))));
  c += vec3f(0.95, 0.85, 0.75) * 0.22 * smoothstep(0.88, 0.97, dot(r, normalize(vec3f(0.6, -0.5, 0.6))));
  return c;
}

fn softshadow(ro: vec3f, rd: vec3f) -> f32 {
  var res = 1.0;
  var t = 0.05;
  for (var i = 0; i < 36; i++) {
    let h = map(ro + rd * t);
    if (h < 0.001) { return 0.0; }
    res = min(res, 6.0 * h / t);
    t += clamp(h, 0.02, 0.35);
    if (t > 6.0) { break; }
  }
  return clamp(res, 0.0, 1.0);
}

fn aces(x: vec3f) -> vec3f {
  return clamp(x * (2.51 * x + 0.03) / (x * (2.43 * x + 0.59) + 0.14), vec3f(0.0), vec3f(1.0));
}

fn filmHue(k: f32) -> vec3f {
  return 0.5 + 0.5 * cos(6.2832 * (vec3f(0.0, 0.33, 0.67) + k));
}

fn shade(p: vec3f, rd: vec3f) -> vec3f {
  let n = normal(p);
  let r = reflect(rd, n);
  let ndv = max(dot(n, -rd), 0.0);
  let fres = pow(1.0 - ndv, 5.0);
  var occ = 0.0;
  for (var k = 1; k < 4; k++) {
    let hk = 0.08 * f32(k);
    occ += (hk - map(p + n * hk)) / f32(k * k);
  }
  let ao = clamp(1.0 - occ * 1.6, 0.35, 1.0);
  let sh = softshadow(p + n * 0.03, LIGHT);
  var col = env(r) * (0.78 + 0.22 * fres) * mix(0.6, 1.0, sh) * ao;
  col += vec3f(0.7, 0.8, 1.0) * pow(1.0 - ndv, 3.0) * 0.35; // thin backlit rim
  let film = filmHue((1.0 - ndv) * 1.2 + n.y * 0.35 + params.time * 0.02);
  col *= mix(vec3f(1.0), film, 0.7 * smoothstep(0.45, 0.95, 1.0 - ndv)); // oil slick, edges only
  return aces(col * 1.05) * vec3f(1.0, 0.99, 0.97);
}

// Background texture: a fine dot matrix that flickers slightly. `glow` (1 at the blob's
// edge, 0 far away) lights it up near the outline.
fn texLayer(uv: vec2f, ft: f32, glow: f32) -> vec3f {
  let px = uv * vec2f(params.aspect * params.resy, params.resy);
  let cell = 6.0;
  let q = fract(px / cell) - 0.5;
  let dotv = smoothstep(0.24, 0.1, length(q));
  let flick = 0.55 + 0.45 * hash(floor(px / cell) + ft * 0.37);
  return vec3f(dotv * flick * (0.028 + 0.22 * glow));
}

fn background(uv: vec2f, st: vec2f, ro: vec3f, rd: vec3f, edge: f32) -> vec3f {
  var col = vec3f(0.010, 0.011, 0.014);
  // soft cool glow behind the blob, plus a faint oil-slick halo just outside its edge
  let sc = params.off / WORLD;
  let rad = 0.95 * params.scale / WORLD;
  let rel = st - sc;
  let dist = length(rel);
  col += vec3f(0.05, 0.06, 0.08) * exp(-pow(dist / (rad * 2.2), 2.0)) * 0.8;
  // edge glow that follows the real outline (edge = how close this ray passed the surface)
  let glow = exp(-edge * 10.0);
  let tight = exp(-edge * 28.0);
  col += vec3f(0.55, 0.62, 0.75) * 0.08 * glow;
  col += filmHue(atan2(rel.y, rel.x) * 0.16 + params.time * 0.03) * 0.025 * tight;
  // light pool on an unseen backdrop, with the blob's soft shadow across it
  let tp = (-1.5 - ro.z) / rd.z;
  let pp = ro + rd * tp;
  let pc = pp.xy - vec2f(-0.5, 0.4);
  col += vec3f(0.85, 0.9, 1.0) * 0.035 * exp(-dot(pc, pc) * 0.18) * softshadow(pp, LIGHT);
  col *= 1.0 - 0.9 * dot(uv - 0.5, uv - 0.5) * 1.6;
  // fine grain, refreshed slowly
  let ft = floor(params.time * 6.0);
  col += texLayer(uv, ft, glow);
  col *= 1.0 - 0.15 * smoothstep(0.42, 0.5, abs(uv.y - 0.5));
  return max(col, vec3f(0.0));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let st = vec2f(uv.x - 0.5, 0.5 - uv.y) * vec2f(params.aspect, 1.0) * 2.0;
  let ro = vec3f(0.0, 0.0, 3.4);
  let rd = normalize(vec3f(st, -1.8));

  var t = 0.0;
  var dmin = 1e9;
  var tmin = 0.0;
  var hit = false;
  for (var i = 0; i < 90; i++) {
    let d = map(ro + rd * t);
    if (d < dmin) { dmin = d; tmin = t; }
    if (d < 0.001) { hit = true; break; }
    t += d;
    if (t > 8.0) { break; }
  }

  var col: vec3f;
  if (hit) {
    col = shade(ro + rd * t, rd);
  } else {
    col = background(uv, st, ro, rd, dmin);
    // anti-aliased silhouette: blend in the surface where the ray only just missed
    let pw = 2.0 * tmin / (params.resy * 1.8);
    if (dmin < 2.0 * pw) {
      let a = 1.0 - smoothstep(0.0, 2.0 * pw, dmin);
      col = mix(col, shade(ro + rd * tmin, rd), a);
    }
  }
  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}
