import { memo, useEffect, useRef, useState } from "react";
import type { TapeAudioEngine } from "../audioEngine";
import {
  bassSamplesFor,
  createBassMeter,
  ensureAnalyserSize,
  setVisualDemand,
} from "../visuals";

// Palette index, peak opacity, rest position and sway (fractions of the
// viewport), radius (fraction of its mean side), then angular speeds in rad/s
// at rest speed for horizontal sway, vertical sway, and breathing.
const LIGHTS = [
  [1, 0.95, 0.14, 0.14, 0.16, 0.08, 0.66, 0.17, 0.13, 0.09],
  [2, 0.9, 0.9, 0.34, 0.12, 0.12, 0.58, 0.14, 0.19, 0.11],
  [3, 0.95, 0.2, 0.82, 0.16, 0.08, 0.7, 0.12, 0.16, 0.08],
  [1, 0.85, 0.86, 0.88, 0.12, 0.08, 0.54, 0.2, 0.13, 0.12],
  [4, 0.6, 0.5, 0.5, 0.2, 0.16, 0.38, 0.22, 0.17, 0.14],
].map(([color, alpha, x, y, sx, sy, r, wx, wy, wr]) => ({
  color,
  alpha,
  x,
  y,
  sx,
  sy,
  r,
  wx,
  wy,
  wr,
}));
// Each warp layer circles through the noise field (radius, rad/s at rest
// speed, start angle), so shader inputs stay small however long it runs.
const FLOWS = [
  [2.6, 0.017, 0],
  [3.1, -0.014, 2.1],
  [2.2, 0.021, 4.2],
].map(([radius, rate, angle]) => ({ radius, rate, angle }));
// How far the noise field pushes the colour pools, in mean-side units.
const WARP = 0.16;
// Bass level (dBFS below ~115 Hz) where speeding up begins and where it peaks.
const QUIET_DB = -28;
const LOUD_DB = -12;
// Speed added by sustained bass, and by bass rising above its recent average.
const LEVEL_BOOST = 2.6;
const ONSET_BOOST = 4;
const AVERAGE_SECONDS = 0.8;
const ATTACK_SECONDS = 0.04;
const RELEASE_SECONDS = 0.35;
const MEASURE_MS = 33;
// Darkening at the top and bottom edges. The home-screen app always draws
// white status-bar text, so the light appearance keeps its top edge dim.
const DARK_SHADE = [0.34, 0.5];
const LIGHT_SHADE = [0.24, 0.2];

const VERTEX = `attribute vec2 position;
void main() { gl_Position = vec4(position, 0.0, 1.0); }`;

// Colour pools sampled through a twice domain-warped noise field, so their
// edges flow like ink in water. Packed into 14 uniform vectors; WebGL 1
// guarantees 16.
const FRAGMENT = `#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec4 view;
uniform vec4 base;
uniform vec3 colors[5];
uniform vec4 lights[5];
uniform vec4 flowA;
uniform vec2 flowB;

vec3 permute(vec3 x) {
  return mod((x * 34.0 + 1.0) * x, 289.0);
}

float noise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = x0.x > x0.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 a0 = x - floor(x + 0.5);
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g = vec3(a0.x * x0.x + h.x * x0.y, a0.yz * x12.xz + h.yz * x12.yw);
  return 130.0 * dot(m, g);
}

float fbm(vec2 p) {
  return 0.6 * noise(p) + 0.3 * noise(p * 2.03 + 19.1);
}

void main() {
  vec2 size = view.xy;
  float side = 0.5 * (size.x + size.y);
  vec2 point = vec2(gl_FragCoord.x, size.y - gl_FragCoord.y) / side;
  vec2 field = point * 0.9;
  vec2 q = vec2(fbm(field + flowA.xy), fbm(field + flowA.zw + vec2(5.2, 1.3)));
  vec2 r = vec2(
    fbm(field + 1.2 * q + flowB + vec2(1.7, 9.2)),
    fbm(field + 1.2 * q - flowB + vec2(8.3, 2.8))
  );
  vec2 at = point + view.z * r;
  vec3 color = base.rgb;
  for (int i = 0; i < 5; i++) {
    float d = length(at - lights[i].xy) / lights[i].z;
    color = mix(color, colors[i], lights[i].w * (1.0 - smoothstep(0.0, 1.0, d)));
  }
  float y = 1.0 - gl_FragCoord.y / size.y;
  float shade = y < 0.26 ? mix(view.w, 0.1, y / 0.26)
    : y < 0.6 ? mix(0.1, 0.14, (y - 0.26) / 0.34)
    : mix(0.14, base.w, (y - 0.6) / 0.4);
  gl_FragColor = vec4(color * (1.0 - shade), 1.0);
}`;

const rgb = (hex: string) =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);

type Liquid = NonNullable<ReturnType<typeof createLiquid>>;

function createLiquid(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    powerPreference: "low-power",
  });
  if (!gl) return null;
  const program = gl.createProgram()!;
  for (const [type, source] of [
    [gl.VERTEX_SHADER, VERTEX],
    [gl.FRAGMENT_SHADER, FRAGMENT],
  ] as const) {
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(program, shader);
    gl.deleteShader(shader);
  }
  gl.bindAttribLocation(program, 0, "position");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    gl.deleteProgram(program);
    return null;
  }
  gl.useProgram(program);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 3, -1, -1, 3]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const at = (name: string) => gl.getUniformLocation(program, name);
  const uniforms = {
    view: at("view"),
    base: at("base"),
    colors: at("colors"),
    lights: at("lights"),
    flowA: at("flowA"),
    flowB: at("flowB"),
  };
  let top = 0;
  return {
    palette(base: number[], colors: Float32Array, shade: number[]) {
      gl.uniform4f(uniforms.base, base[0], base[1], base[2], shade[1]);
      gl.uniform3fv(uniforms.colors, colors);
      top = shade[0];
    },
    draw(
      width: number,
      height: number,
      warp: number,
      lights: Float32Array,
      flows: Float32Array,
    ) {
      gl.viewport(0, 0, width, height);
      gl.uniform4f(uniforms.view, width, height, warp, top);
      gl.uniform4fv(uniforms.lights, lights);
      gl.uniform4f(uniforms.flowA, flows[0], flows[1], flows[2], flows[3]);
      gl.uniform2f(uniforms.flowB, flows[4], flows[5]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    dispose() {
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
    },
  };
}

/**
 * A blurred, liquid colour field rendered by WebGL at a quarter of the
 * viewport's resolution or less and scaled up by the compositor. It flows
 * constantly, surges with energy below ~130 Hz, and stops behind sheets, in
 * Dark screen, while the page is hidden, and under reduced motion. Without
 * WebGL the canvas hides and the static gradient on .app-root shows instead.
 */
export const AmbientBackground = memo(function AmbientBackground({
  engine,
  palette,
  light,
  playing,
  animate,
  running,
}: {
  engine: TapeAudioEngine;
  palette: readonly string[];
  light: boolean;
  playing: boolean;
  animate: boolean;
  running: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const liquid = useRef<Liquid | null>(null);
  const motion = useRef({ phase: Math.random() * 600, speed: 1 });
  const [generation, setGeneration] = useState(0);
  const [reduced, setReduced] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);
  useEffect(() => {
    const canvas = ref.current!;
    const lost = (event: Event) => {
      event.preventDefault();
      liquid.current = null;
      setGeneration((count) => count + 1);
    };
    const restored = () => {
      liquid.current = createLiquid(canvas);
      setGeneration((count) => count + 1);
    };
    canvas.addEventListener("webglcontextlost", lost);
    canvas.addEventListener("webglcontextrestored", restored);
    liquid.current = createLiquid(canvas);
    return () => {
      canvas.removeEventListener("webglcontextlost", lost);
      canvas.removeEventListener("webglcontextrestored", restored);
      liquid.current?.dispose();
      liquid.current = null;
    };
  }, []);
  useEffect(() => {
    const canvas = ref.current!,
      renderer = liquid.current;
    canvas.dataset.renderer = renderer ? "webgl" : "none";
    if (!renderer) {
      canvas.dataset.motion = "static";
      return;
    }
    const state = motion.current,
      meter = createBassMeter(),
      moving = animate && running && !reduced,
      listening = moving && playing,
      lights = new Float32Array(LIGHTS.length * 4),
      flows = new Float32Array(FLOWS.length * 2);
    renderer.palette(
      rgb(palette[0]),
      new Float32Array(LIGHTS.flatMap((pool) => rgb(palette[pool.color]))),
      light ? LIGHT_SHADE : DARK_SHADE,
    );
    let width = 1,
      height = 1,
      handle = 0,
      last = 0,
      measuredAt = 0,
      drive = 0,
      average = 0,
      shown = "",
      data = new Float32Array(0);
    const draw = () => {
      const t = state.phase,
        side = (width + height) / 2;
      for (let i = 0; i < LIGHTS.length; i++) {
        const pool = LIGHTS[i];
        lights[i * 4] =
          ((pool.x + pool.sx * Math.sin(pool.wx * t + i * 1.7)) * width) /
          side;
        lights[i * 4 + 1] =
          ((pool.y + pool.sy * Math.sin(pool.wy * t + i * 2.3)) * height) /
          side;
        lights[i * 4 + 2] = pool.r * (1 + 0.12 * Math.sin(pool.wr * t + i));
        lights[i * 4 + 3] = pool.alpha;
      }
      for (let k = 0; k < FLOWS.length; k++) {
        const flow = FLOWS[k],
          angle = flow.angle + flow.rate * t;
        flows[k * 2] = flow.radius * Math.cos(angle);
        flows[k * 2 + 1] = flow.radius * Math.sin(angle);
      }
      const surge = Math.min(1, (state.speed - 1) / 5);
      renderer.draw(width, height, WARP * (1 + 0.35 * surge), lights, flows);
    };
    const resize = () => {
      const box = canvas.getBoundingClientRect(),
        scale = Math.max(4, Math.max(box.width, box.height) / 400);
      width = Math.max(16, Math.round(box.width / scale));
      height = Math.max(16, Math.round(box.height / scale));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      draw();
    };
    // 0 below QUIET_DB, 1 at LOUD_DB and above.
    const measure = () => {
      const analyser = engine.getAnalyserNode();
      if (!analyser) return 0;
      const rate = analyser.context.sampleRate;
      ensureAnalyserSize(analyser, bassSamplesFor(rate));
      const size = analyser.fftSize;
      if (data.length < size) data = new Float32Array(size);
      analyser.getFloatTimeDomainData(data);
      const level = meter(data, size, rate);
      return Math.min(1, Math.max(0, (level - QUIET_DB) / (LOUD_DB - QUIET_DB)));
    };
    const frame = (now: number) => {
      handle = requestAnimationFrame(frame);
      const elapsed = now - last;
      // About 60 fps while audio plays and 30 fps while idle.
      if (elapsed < (playing ? 15.5 : 31.5)) return;
      last = now;
      const dt = Math.min(0.1, elapsed / 1000);
      if (listening && now - measuredAt >= MEASURE_MS) {
        measuredAt = now;
        drive = measure();
      }
      average += (drive - average) * (1 - Math.exp(-dt / AVERAGE_SECONDS));
      const target =
          1 +
          LEVEL_BOOST * drive ** 1.4 +
          ONSET_BOOST * Math.max(0, drive - average),
        tau = target > state.speed ? ATTACK_SECONDS : RELEASE_SECONDS;
      state.speed += (target - state.speed) * (1 - Math.exp(-dt / tau));
      state.phase += dt * state.speed;
      draw();
      const speed = state.speed.toFixed(1);
      if (speed !== shown) canvas.dataset.speed = shown = speed;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    setVisualDemand(engine, "ambient", listening);
    canvas.dataset.motion = moving
      ? "running"
      : animate && !reduced
        ? "paused"
        : "static";
    if (moving) {
      last = performance.now();
      handle = requestAnimationFrame(frame);
    } else {
      state.speed = 1;
      canvas.dataset.speed = "1.0";
    }
    return () => {
      cancelAnimationFrame(handle);
      observer.disconnect();
      setVisualDemand(engine, "ambient", false);
    };
  }, [engine, palette, light, playing, animate, running, reduced, generation]);
  return <canvas ref={ref} className="ambient" aria-hidden="true" />;
});
