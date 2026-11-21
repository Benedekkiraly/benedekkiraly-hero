// Motion shared by both renderers: pointer tracking, the dent spring, splash droplets,
// the slide-aside pose and the About toggle. step() returns this frame's shader inputs.
// phones and tablets render at 1x to keep the ray-marcher smooth; desktops up to 1.5x
export const maxDpr = () => (matchMedia("(pointer: coarse)").matches ? 1 : 1.5);
export const WORLD = 1.889; // screen-space -> world units at z = 0; must match the shaders
const CONTACT_R = 1.25; // pointer counts as "touching" inside this world radius

export type Frame = {
  time: number;
  aspect: number;
  energy: number;
  mouse: [number, number];
  defl: [number, number];
  drops: [number, number, number, number][]; // 6 droplets: x, y, radius, alive
  off: [number, number];
  scale: number;
};

export function createSim() {
  const t0 = performance.now();
  // pointer in screen-centred space (y up), plus velocity
  const ptr = { x: 0, y: 0, vx: 0, vy: 0, lastX: 0, lastY: 0, lastT: performance.now(), moved: false, type: "mouse" };
  // pointer left the window: stop counting it as touching
  document.documentElement.addEventListener("pointerleave", () => { ptr.moved = false; ptr.x = ptr.y = 99; });
  const track = (e: PointerEvent) => {
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
    ptr.type = e.pointerType;
  };
  addEventListener("pointermove", track);
  addEventListener("pointerdown", (e) => {
    // a fresh touch shouldn't inherit the velocity of the previous one
    if (e.pointerType === "touch") { ptr.moved = false; ptr.vx = ptr.vy = 0; }
    track(e);
    if (e.pointerType !== "touch" || (e.target as Element).closest("a")) return;
    const wx = ptr.x * WORLD, wy = ptr.y * WORLD;
    const r = Math.hypot(wx - pose.x, wy - pose.y) / pose.s;
    pinned = r < 1.05 ? !pinned : false;
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
  // resting size: shrink on narrow (portrait) screens so the blob never overflows the sides
  const baseScale = (halfW: number) => Math.min(1, halfW / 1.6);
  // while About is showing: landscape -> blob to the right half, text left;
  // portrait (phones) -> blob drops to the lower half, text goes on top
  const hoverPose = (halfW: number, aspect: number) =>
    aspect < 0.9
      ? { x: 0, y: -0.4 * WORLD, s: baseScale(halfW) * 0.8 }
      : { x: 0.5 * halfW, y: 0, s: 0.9 * baseScale(halfW) };
  // touch screens have no hover: a tap on the blob pins About open, a tap elsewhere closes it
  let pinned = false;
  const pose = { x: 0, y: 0, s: 1, vx: 0, vy: 0, vs: 0 };
  // show the bio while the pointer is on the shape, and for a moment after it leaves
  let bioUntil = 0;
  let bioShown = false;
  let last = performance.now();
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;


  function step(): Frame {
    const now = performance.now();
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;

    // pointer velocity decays when the mouse stops
    ptr.vx *= Math.pow(0.001, dt);
    ptr.vy *= Math.pow(0.001, dt);

    // blob spring toward its pose: home, or the hover pose
    const halfW = (innerWidth / innerHeight) * WORLD;
    const aspect = innerWidth / innerHeight;
    const home = { x: 0, y: 0, s: baseScale(halfW) };
    const tgt = bioShown ? hoverPose(halfW, aspect) : home;
    if (reduce) { pose.x = tgt.x; pose.y = tgt.y; pose.s = tgt.s; }
    else {
      const PK = 48, PC = 9.5;
      pose.vx += (-PK * (pose.x - tgt.x) - PC * pose.vx) * dt;
      pose.vy += (-PK * (pose.y - tgt.y) - PC * pose.vy) * dt;
      pose.vs += (-PK * (pose.s - tgt.s) - PC * pose.vs) * dt;
      pose.x += pose.vx * dt; pose.y += pose.vy * dt; pose.s += pose.vs * dt;
    }

    // pointer in world units, then in the blob's local space
    const wx = ptr.x * WORLD, wy = ptr.y * WORLD;
    const lx = (wx - pose.x) / pose.s, ly = (wy - pose.y) / pose.s;
    const dist = Math.hypot(lx, ly);
    const homeDist = Math.hypot(wx, wy);
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
      const px = lx, py = ly;
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
    // active while the pointer is on the blob where it sits now, or on the spot it left
    const onShape = ptr.moved && (dist < 0.95 || homeDist < 0.95 * home.s);
    if (onShape && ptr.type !== "touch") bioUntil = now + 1800;
    const wantBio = pinned || now < bioUntil;
    if (wantBio !== bioShown) {
      bioShown = wantBio;
      document.documentElement.classList.toggle("bio-on", wantBio);
    }


    return {
      time: (now - t0) / 1000,
      aspect: innerWidth / innerHeight,
      energy: Math.min(1, Math.hypot(s.vx, s.vy) * 0.6),
      mouse: [ptr.x, ptr.y],
      defl: [s.x, s.y],
      drops: drops.map(dropUniform),
      off: [pose.x, pose.y],
      scale: pose.s,
    };
  }
  return { step };
}
