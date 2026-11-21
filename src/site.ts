import { CONTACT, PROFILE } from "./content";

export function initSite() {
  document.querySelector("#bio-sub")!.textContent = PROFILE.bio;
  const list = document.querySelector<HTMLUListElement>("#contact")!;
  list.replaceChildren(
    ...CONTACT.map(({ label, href }) => {
      const li = document.createElement("li");
      if (href) {
        const a = document.createElement("a");
        a.href = href.includes("@") && !href.startsWith("http") ? `mailto:${href}` : href;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = label;
        a.className = "pill";
        springPill(a);
        li.append(a);
      } else {
        li.className = "soon";
        li.textContent = `${label} (soon)`;
      }
      return li;
    }),
  );
}

// Chrome-like motion for the buttons: a specular highlight that follows the cursor,
// and a damped spring that squashes the button along the pointer's motion, then lets it settle.
type Pill = { el: HTMLElement; x: number; y: number; vx: number; vy: number; hx: number; hy: number; thx: number; thy: number; hover: boolean; lx: number; ly: number; lt: number };
const pills: Pill[] = [];
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let loopOn = false;

function springPill(el: HTMLElement) {
  const p: Pill = { el, x: 0, y: 0, vx: 0, vy: 0, hx: 0, hy: 0, thx: 0, thy: 0, hover: false, lx: 0, ly: 0, lt: 0 };
  const rest = () => { const r = el.getBoundingClientRect(); p.thx = r.width * 0.28; p.thy = r.height * 0.32; };
  rest(); p.hx = p.thx; p.hy = p.thy;
  el.addEventListener("pointerenter", (e) => {
    const r = el.getBoundingClientRect();
    p.hover = true; p.lx = e.clientX; p.ly = e.clientY; p.lt = performance.now();
    p.thx = e.clientX - r.left; p.thy = e.clientY - r.top;
    start();
  });
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    p.thx = e.clientX - r.left; p.thy = e.clientY - r.top;
    const now = performance.now();
    const dt = Math.max(1, now - p.lt) / 1000;
    if (!reduceMotion) {
      // faster pointer, bigger push; the spring then pulls it back
      p.vx += ((e.clientX - p.lx) / dt) * 0.12;
      p.vy += ((e.clientY - p.ly) / dt) * 0.12;
    }
    p.lx = e.clientX; p.ly = e.clientY; p.lt = now;
  });
  el.addEventListener("pointerleave", () => { p.hover = false; rest(); start(); });
  pills.push(p);
  if (!reduceMotion) { el.style.setProperty("--hx", `${p.hx}px`); el.style.setProperty("--hy", `${p.hy}px`); }
}

function start() {
  if (loopOn) return;
  loopOn = true;
  let last = performance.now();
  const tick = (now: number) => {
    const dt = Math.min(0.033, (now - last) / 1000);
    last = now;
    let busy = false;
    for (const p of pills) {
      const K = 190, C = 13;
      const tx = 0, ty = p.hover ? -2 : 0; // lift a touch while hovered
      p.vx += (-K * (p.x - tx) - C * p.vx) * dt;
      p.vy += (-K * (p.y - ty) - C * p.vy) * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const m = 7;
      p.x = Math.max(-m, Math.min(m, p.x)); p.y = Math.max(-m, Math.min(m, p.y));
      p.hx += (p.thx - p.hx) * Math.min(1, dt * 10);
      p.hy += (p.thy - p.hy) * Math.min(1, dt * 10);
      const stretch = Math.min(0.09, Math.hypot(p.x, p.y) * 0.012);
      const sx = 1 + (Math.abs(p.x) > Math.abs(p.y) ? stretch : -stretch * 0.6);
      const sy = 1 + (Math.abs(p.x) > Math.abs(p.y) ? -stretch * 0.6 : stretch);
      p.el.style.transform = `translate(${p.x * 0.6}px,${p.y * 0.6}px) scale(${sx.toFixed(4)},${sy.toFixed(4)}) skewX(${(-p.x * 0.35).toFixed(3)}deg)`;
      p.el.style.setProperty("--hx", `${p.hx.toFixed(1)}px`);
      p.el.style.setProperty("--hy", `${p.hy.toFixed(1)}px`);
      const still = Math.abs(p.x - tx) < 0.02 && Math.abs(p.y - ty) < 0.02 && Math.abs(p.vx) < 0.05 && Math.abs(p.vy) < 0.05
        && Math.abs(p.thx - p.hx) < 0.2 && Math.abs(p.thy - p.hy) < 0.2;
      if (!still || p.hover) busy = true;
    }
    if (busy) requestAnimationFrame(tick); else loopOn = false;
  };
  requestAnimationFrame(tick);
}
