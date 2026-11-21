import { clock, effect, frameLoop, init, surface } from "vgpu";
import shape from "./aurora.wgsl";
import "./style.css";
import { initSite } from "./site";

initSite();

const canvas = document.querySelector<HTMLCanvasElement>("#gl")!;
const WORLD = 1.889; // must match WORLD in the shader
const CONTACT_R = 1.25; // pointer counts as "touching" inside this world radius

async function start() {
  if (!("gpu" in navigator)) throw new Error("WebGPU not available");
  const gpu = await init();
  const target = surface(gpu, canvas, { dpr: [1, 1.5] });
  const fx = effect(gpu, shape);
  const time = clock(gpu);

  // pointer in screen-centred space (y up), plus velocity
  const ptr = { x: 0, y: 0, vx: 0, vy: 0, lastX: 0, lastY: 0, lastT: performance.now(), moved: false };
  // pointer left the window: stop counting it as touching
  document.documentElement.addEventListener("pointerleave", () => { ptr.moved = false; ptr.x = ptr.y = 99; });
  addEventListener("pointermove", (e) => {
    const aspect = innerWidth / innerHeight;
    const x = (e.clientX / innerWidth - 0.5) * aspect * 2;
    const y = (0.5 - e.clientY / innerHeight) * 2;
    const now = performance.now();
    const dt = Math.max(1, now - ptr.lastT) / 1000;
    if (ptr.moved) {
      // smoothed velocity in world units / second
      ptr.vx = ptr.vx * 0.5 + ((x - ptr.lastX) / dt) * WORLD * 0.5;
      ptr.vy = ptr.vy * 0.5 + ((y - ptr.lastY) / dt) * WORLD * 0.5;
    }
    ptr.x = ptr.lastX = x;
    ptr.y = ptr.lastY = y;
    ptr.lastT = now;
    ptr.moved = true;
  });

  // damped spring: pointer speed pushes it, it springs back to rest.
  const s = { x: 0, y: 0, vx: 0, vy: 0 };
  const K = 70, C = 7; // stiffness, damping (underdamped => wobbly rebound)
  // splash: a few small droplets thrown off the surface where you touch it
  type Drop = { x: number; y: number; vx: number; vy: number; age: number; life: number; size: number; alive: boolean };
  const drops: Drop[] = Array.from({ length: 6 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, age: 0, life: 1, size: 0, alive: false }));
  let lastSplash = 0;
  const GRAV = 3.0;
  const dropUniform = (d: Drop): [number, number, number, number] =>
    d.alive ? [d.x, d.y, d.size * (1 - d.age / d.life), 1] : [0, 0, 0, 0];
  // show the bio while the pointer is on the shape, and for a moment after it leaves
  let bioUntil = 0;
  let bioShown = false;
  let last = performance.now();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  frameLoop(gpu, (frame) => {
    const now = performance.now();
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    // pointer velocity decays when the mouse stops
    ptr.vx *= Math.pow(0.001, dt);
    ptr.vy *= Math.pow(0.001, dt);

    const dist = Math.hypot(ptr.x * WORLD, ptr.y * WORLD);
    const contact = dist < CONTACT_R ? 1 - dist / CONTACT_R : 0;
    const gain = reduce ? 0 : 0.35;
    // force scales with speed, so a fast swipe deforms much more than a slow one
    const speed = Math.hypot(ptr.vx, ptr.vy);
    const boost = 1 + speed * 0.35;
    s.vx += ptr.vx * contact * gain * boost * dt * 8;
    s.vy += ptr.vy * contact * gain * boost * dt * 8;
    s.vx += (-K * s.x - C * s.vx) * dt;
    s.vy += (-K * s.y - C * s.vy) * dt;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    // cap so extreme flicks stay a shape, not a smear
    const m = Math.hypot(s.x, s.y);
    if (m > 0.7) { s.x *= 0.7 / m; s.y *= 0.7 / m; }

    if (!reduce && contact > 0.05 && Math.hypot(ptr.vx, ptr.vy) > 0.3 && now / 1000 - lastSplash > 0.2) {
      lastSplash = now / 1000;
      // launch from the silhouette point nearest the pointer, outward plus a little scatter
      const px = ptr.x * WORLD, py = ptr.y * WORLD;
      const len = Math.max(0.001, Math.hypot(px, py));
      const nx = px / len, ny = py / len;
      for (let i = 0; i < 3; i++) {
        const slot = drops.find((d) => !d.alive);
        if (!slot) break;
        const spread = (Math.random() - 0.5) * 1.2;
        const sp = 0.7 + Math.random() * 0.9;
        slot.x = nx * 0.92; slot.y = ny * 0.92;
        slot.vx = (nx - ny * spread) * sp;
        slot.vy = (ny + nx * spread) * sp + 0.4;
        slot.age = 0;
        slot.life = 0.55 + Math.random() * 0.35;
        slot.size = 0.045 + Math.random() * 0.03;
        slot.alive = true;
      }
    }
    for (const d of drops) {
      if (!d.alive) continue;
      d.age += dt;
      d.vy -= GRAV * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.age > d.life) d.alive = false;
    }

    // only a real pointer sitting on the blob itself counts (radius ~ the shape's edge)
    const onShape = ptr.moved && dist < 0.95;
    if (onShape) bioUntil = now + 1800;
    const wantBio = now < bioUntil;
    if (wantBio !== bioShown) {
      bioShown = wantBio;
      document.documentElement.classList.toggle("bio-on", wantBio);
    }

    fx.set({
      time: time.time,
      aspect: innerWidth / innerHeight,
      energy: Math.min(1, Math.hypot(s.vx, s.vy) * 0.6),
      mouse: [ptr.x, ptr.y],
      defl: [s.x, s.y],
      d0: dropUniform(drops[0]),
      d1: dropUniform(drops[1]),
      d2: dropUniform(drops[2]),
      d3: dropUniform(drops[3]),
      d4: dropUniform(drops[4]),
      d5: dropUniform(drops[5]),
    });
    frame.pass(target, fx);
  });
  document.documentElement.dataset.gpu = "on";
}

start().catch((err) => {
  console.warn(err);
  document.documentElement.dataset.gpu = "off";
});
