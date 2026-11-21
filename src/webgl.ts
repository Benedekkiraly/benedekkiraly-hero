// WebGL2 fallback: draws the same blob as the WebGPU path, for browsers without WebGPU
// (and for plain http://, where WebGPU is switched off).
import frag from "./aurora.frag?raw";
import { maxDpr, type createSim } from "./sim";

const VERT = `#version 300 es
out vec2 vUv;
void main() {
  // one triangle that covers the screen; uv runs top-down like the WebGPU path
  vec2 p = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0))[gl_VertexID];
  vUv = vec2(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  gl_Position = vec4(p, 0.0, 1.0);
}`;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh) ?? "shader error");
  return sh;
}

export function startWebGL(canvasIn: HTMLCanvasElement, sim: ReturnType<typeof createSim>) {
  let canvas = canvasIn;
  const opts: WebGLContextAttributes = { antialias: false, alpha: false, powerPreference: "high-performance" };
  let gl = canvas.getContext("webgl2", opts);
  if (!gl) {
    // the canvas may already be claimed by a failed WebGPU attempt: swap in a fresh one
    const fresh = canvas.cloneNode() as HTMLCanvasElement;
    canvas.replaceWith(fresh);
    canvas = fresh;
    gl = canvas.getContext("webgl2", opts);
  }
  if (!gl) throw new Error("no WebGL2");

  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? "link error");
  gl.useProgram(prog);
  gl.bindVertexArray(gl.createVertexArray());

  const u = (name: string) => gl!.getUniformLocation(prog, name);
  const loc = {
    time: u("uTime"), aspect: u("uAspect"), energy: u("uEnergy"), scale: u("uScale"), resY: u("uResY"),
    mouse: u("uMouse"), defl: u("uDefl"), off: u("uOff"), drops: u("uDrops"),
  };
  const drops = new Float32Array(24);

  const resize = () => {
    const dpr = Math.min(Math.max(devicePixelRatio || 1, 1), maxDpr());
    const w = Math.round(canvas.clientWidth * dpr), h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl!.viewport(0, 0, w, h);
    return h;
  };

  const frame = () => {
    const h = resize();
    const f = sim.step();
    f.drops.forEach((d, i) => drops.set(d, i * 4));
    gl!.uniform1f(loc.time, f.time);
    gl!.uniform1f(loc.aspect, f.aspect);
    gl!.uniform1f(loc.energy, f.energy);
    gl!.uniform1f(loc.scale, f.scale);
    gl!.uniform1f(loc.resY, h);
    gl!.uniform2fv(loc.mouse, f.mouse);
    gl!.uniform2fv(loc.defl, f.defl);
    gl!.uniform2fv(loc.off, f.off);
    gl!.uniform4fv(loc.drops, drops);
    gl!.drawArrays(gl!.TRIANGLES, 0, 3);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return "webgl";
}
