// Chrome blob + old-film look. The pointer dents the surface (defl), and
// `energy` drives a ripple that dies out as the spring settles.
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
}
@group(0) @binding(0) var<uniform> params: Params;

const WORLD: f32 = 1.889; // screen-space -> world units at z = 0

fn hash(p: vec2f) -> f32 {
  var q = fract(p * vec2f(123.34, 456.21));
  q += dot(q, q + 45.32);
  return fract(q.x * q.y);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i), hash(i + vec2f(1, 0)), u.x),
    mix(hash(i + vec2f(0, 1)), hash(i + vec2f(1, 1)), u.x),
    u.y);
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

// One splash droplet: a small sphere that blends into the body while it is close.
fn splash(p: vec3f, d: vec4f, body: f32) -> f32 {
  if (d.w < 0.5) { return body; }
  return smin(body, length(p - vec3f(d.xy, 0.0)) - d.z, 0.14);
}

fn map(p0: vec3f) -> f32 {
  let t = params.time * 0.3;
  let pw = params.mouse * WORLD;

  // Dent: drag the sampling point with the spring displacement, strongest
  // near the pointer. Sampling shifted means the surface shifts the other way.
  var p = p0;
  let dd = p.xy - pw;
  let fall = exp(-dot(dd, dd) * 0.7);
  p = vec3f(p.xy - params.defl * fall * 1.6, p.z);

  let xz = rot(t) * p.xz;
  p = vec3f(xz.x, p.y, xz.y);

  let w = sin(p.x * 3.0 + t) * sin(p.y * 3.0 - t * 1.3) * sin(p.z * 3.0 + t * 0.7);
  var d = length(p) - 0.95 + w * 0.1; // roughly round, gently lumpy

  // ripple radiating from the contact point while energy is high
  d = splash(p0, params.d0, d);
  d = splash(p0, params.d1, d);
  d = splash(p0, params.d2, d);
  d = splash(p0, params.d3, d);
  d = splash(p0, params.d4, d);
  d = splash(p0, params.d5, d);
  d += sin(length(dd) * 9.0 - params.time * 14.0) * params.energy * 0.05 * fall;
  return d * 0.8;
}

fn normal(p: vec3f) -> vec3f {
  let e = vec2f(0.002, 0.0);
  return normalize(vec3f(
    map(p + e.xyy) - map(p - e.xyy),
    map(p + e.yxy) - map(p - e.yxy),
    map(p + e.yyx) - map(p - e.yyx)));
}

// Studio environment: gradient sky, dark horizon, graded floor, strip lights
// and window panes so the mirror has real structure to reflect.
fn env(r: vec3f) -> vec3f {
  let h = r.y * 1.4 + 0.1;
  let sky = mix(vec3f(0.30, 0.36, 0.46), vec3f(1.0), smoothstep(0.0, 0.9, h));
  let floorc = mix(vec3f(0.03, 0.03, 0.03), vec3f(0.62, 0.56, 0.48), smoothstep(0.0, 1.1, -h));
  var c = mix(floorc, sky, smoothstep(-0.03, 0.03, h));
  c *= 1.0 - 0.92 * exp(-pow(h * 16.0, 2.0)); // thin dark horizon line
  // key softbox
  c += vec3f(1.0) * smoothstep(0.93, 0.97, dot(r, normalize(vec3f(-0.5, 0.6, 0.6)))) * 1.5;
  return c;
}

const LIGHT: vec3f = vec3f(-0.5547, 0.5547, 0.6934); // normalised key-light direction

// Soft shadow: march toward the light, darken by how closely the ray grazes the blob.
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

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let st = vec2f(uv.x - 0.5, 0.5 - uv.y) * vec2f(params.aspect, 1.0) * 2.0;
  let ro = vec3f(0.0, 0.0, 3.4);
  let rd = normalize(vec3f(st, -1.8));

  var t = 0.0;
  var hit = false;
  for (var i = 0; i < 80; i++) {
    let d = map(ro + rd * t);
    if (d < 0.001) { hit = true; break; }
    t += d;
    if (t > 8.0) { break; }
  }

  // ---- film base: dark, blotchy, vignetted
  let ft = floor(params.time * 6.0); // slow grain refresh
  var lum = 0.02;
  lum *= 1.0 - 0.9 * dot(uv - 0.5, uv - 0.5) * 1.6;

  var tint = vec3f(1.0);
  if (!hit && rd.z < 0.0) {
    // faint light pool on an invisible backdrop; the blob throws a soft shadow across it
    let tp = (-1.5 - ro.z) / rd.z;
    let pp = ro + rd * tp;
    let pool = exp(-dot(pp.xy - vec2f(-0.5, 0.4), pp.xy - vec2f(-0.5, 0.4)) * 0.18);
    lum += 0.035 * pool * softshadow(pp, LIGHT);
  }
  if (hit) {
    let p = ro + rd * t;
    let n = normal(p);
    let r = reflect(rd, n);
    let fres = pow(1.0 - max(dot(n, -rd), 0.0), 4.0);
    var refl = env(r);

    // ambient occlusion: darker where the surface is crowded by itself
    var occ = 0.0;
    for (var k = 1; k < 4; k++) {
      let hk = 0.08 * f32(k);
      occ += (hk - map(p + n * hk)) / f32(k * k);
    }
    let ao = clamp(1.0 - occ * 1.6, 0.35, 1.0);

    let sh = softshadow(p + n * 0.03, LIGHT);
    let chrome = refl * mix(0.55, 1.0, sh) * ao * (0.82 + 0.45 * fres);
    lum = dot(chrome, vec3f(0.3, 0.59, 0.11));
    // very light oil-slick: thin-film hue shifts with view angle and surface slope
    let ndv = 1.0 - max(dot(n, -rd), 0.0);
    let film = 0.5 + 0.5 * cos(6.2832 * (vec3f(0.0, 0.33, 0.67) + ndv * 1.2 + n.y * 0.35 + params.time * 0.02));
    tint = mix(vec3f(1.0), film, 0.7 * smoothstep(0.4, 0.95, ndv));
  }

  // ---- film artefacts
  var col = vec3f(lum) * tint * vec3f(1.0, 0.97, 0.92);
  // grain, re-rolled at 24 fps, stronger in the shadows
  let g = hash(uv * vec2f(params.aspect, 1.0) * 900.0 + ft * 13.7) - 0.5;
  let g2 = hash(uv * vec2f(params.aspect, 1.0) * 380.0 + ft * 5.3) - 0.5;
  // grain lives on the background layer only; the chrome sits clean on top
  let bg = select(1.0, 0.0, hit);
  col += (g * 0.03 + g2 * 0.014) * (1.2 - lum) * bg;
  // slight gate weave darkening at the edges
  col *= 1.0 - 0.15 * smoothstep(0.42, 0.5, abs(uv.y - 0.5));

  return vec4f(clamp(col, vec3f(0.0), vec3f(1.0)), 1.0);
}
