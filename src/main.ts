import { effect, frameLoop, init, surface } from "vgpu";
import shape from "./aurora.wgsl";
import "./style.css";
import { initSite } from "./site";
import { createSim, maxDpr, type Frame } from "./sim";
import { startWebGL } from "./webgl";

initSite();

const canvas = document.querySelector<HTMLCanvasElement>("#gl")!;
const sim = createSim();
const forceGL = new URL(location.href).searchParams.has("gl"); // ?gl tests the fallback

// Preferred path: WebGPU through vgpu.
async function startWebGPU() {
  if (!window.isSecureContext) throw new Error("WebGPU needs https");
  if (!("gpu" in navigator)) throw new Error("no WebGPU in this browser");
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) throw new Error("no WebGPU adapter");
  const gpu = await init();
  const target = surface(gpu, canvas, { dpr: [1, maxDpr()] });
  const fx = effect(gpu, shape);
  frameLoop(gpu, (frame) => {
    const f: Frame = sim.step();
    const [d0, d1, d2, d3, d4, d5] = f.drops;
    fx.set({
      time: f.time, aspect: f.aspect, energy: f.energy, mouse: f.mouse, defl: f.defl,
      d0, d1, d2, d3, d4, d5, off: f.off, scale: f.scale,
      resy: innerHeight * Math.min(Math.max(devicePixelRatio || 1, 1), maxDpr()),
    });
    frame.pass(target, fx);
  });
  return "webgpu";
}

// Last resort: no GPU drawing at all. Keep the hover text working over a static backdrop.
function startStatic() {
  const loop = () => { sim.step(); requestAnimationFrame(loop); };
  requestAnimationFrame(loop);
  return "static";
}

async function start() {
  if (!forceGL) {
    try { return await startWebGPU(); } catch (err) { console.info("WebGPU unavailable, using WebGL:", err); }
  }
  try { return startWebGL(canvas, sim); } catch (err) { console.warn("WebGL unavailable:", err); }
  return startStatic();
}

start().then((mode) => {
  document.documentElement.dataset.gpu = mode === "static" ? "off" : "on";
  document.documentElement.dataset.renderer = mode;
});
