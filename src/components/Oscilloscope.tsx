import { memo, useEffect, useRef } from "react";
import type { TapeAudioEngine } from "../audioEngine";
import { ensureAnalyserSize, setVisualDemand } from "../visuals";

// Drawn span, the trigger search just before it and the filter warm-up
// before that, in seconds of audio.
const WINDOW_SECONDS = 0.15;
const SEARCH_SECONDS = 0.045;
const WARM_SECONDS = 0.005;
// A 25 Hz half-cycle, measured past the search to size each crossing.
const HALF_SECONDS = 0.02;
const TRIGGER_HZ = 160;
const MAX_COLUMNS = 512;
const MAX_CROSSINGS = 64;
// How quickly the trace settles on each new span, and how long it holds the
// last one when the bass drops out before running free.
const SETTLE_MS = 14;
const HOLD_MS = 60;
const analyserSizeFor = (rate: number) =>
  Math.min(
    32768,
    2 **
      Math.ceil(
        Math.log2(rate * (WINDOW_SECONDS + SEARCH_SECONDS + WARM_SECONDS)),
      ),
  );

export const Oscilloscope = memo(function Oscilloscope({
  engine,
  playing,
  visible,
  fps,
  color,
}: {
  engine: TapeAudioEngine;
  playing: boolean;
  visible: boolean;
  fps: number;
  color: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const samples = useRef(new Float32Array(0));
  useEffect(() => {
    const canvas = ref.current!,
      ctx = canvas.getContext("2d");
    if (!ctx) return;
    // Sample values per vertex: the newest triggered span, and the trace on
    // screen that eases toward it.
    const target = new Float32Array(2 * MAX_COLUMNS),
      shown = new Float32Array(2 * MAX_COLUMNS),
      crossings = new Int32Array(MAX_CROSSINGS),
      heights = new Float32Array(MAX_CROSSINGS);
    let width = 1,
      height = 1,
      scale = 1,
      handle = 0,
      last = 0,
      drawn = 0,
      locked = 0,
      frames = 0,
      active = false,
      level = 0,
      span = 0,
      data = samples.current;
    const interval = 1000 / fps;
    // A resting, silent trace rather than a grid line.
    const idle = () => {
      ctx.clearRect(0, 0, width, height);
      ctx.globalAlpha = 0.35;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.75 * scale;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    };
    const resize = () => {
      const box = canvas.getBoundingClientRect();
      scale = Math.min(window.devicePixelRatio || 1, 1.5);
      width = Math.max(1, Math.round(box.width * scale));
      height = Math.max(1, Math.round(box.height * scale));
      canvas.width = width;
      canvas.height = height;
      target.fill(0);
      shown.fill(0);
      idle();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    canvas.dataset.loopActive = "false";
    // The newest rising crossing of the bass band that opens a full-size
    // half-cycle, so harmonics, kick tails and noise never anchor the span
    // part-way through a cycle. -1 when there is none.
    const trigger = (latest: number, rate: number) => {
      const from = latest - Math.round(rate * SEARCH_SECONDS),
        to = latest + Math.round(rate * HALF_SECONDS),
        a = 1 - Math.exp((-2 * Math.PI * TRIGGER_HZ) / rate),
        threshold = Math.max(0.002, level * 0.1);
      let low = 0,
        smooth = 0,
        armed = false,
        open = -1,
        found = 0;
      for (let i = from - Math.round(rate * WARM_SECONDS); i < to; i++) {
        low += a * (data[i] - low);
        smooth += a * (low - smooth);
        if (i < from) continue;
        if (open >= 0) {
          if (smooth > heights[open]) heights[open] = smooth;
          else if (smooth < 0) open = -1;
        }
        if (smooth < -threshold) armed = true;
        else if (armed && smooth >= 0 && i <= latest && found < MAX_CROSSINGS) {
          crossings[found] = i;
          heights[found] = smooth;
          open = found++;
          armed = false;
        }
      }
      let top = 0;
      for (let k = 0; k < found; k++) if (heights[k] > top) top = heights[k];
      level = top;
      for (let k = found - 1; k >= 0; k--)
        if (heights[k] >= top * 0.5) return crossings[k];
      return -1;
    };
    const frame = (time: number) => {
      if (!active) return;
      const elapsed = time - last;
      // A fixed grid holds the cap on displays faster than it; the 1 ms
      // allowance absorbs timestamp jitter when the display matches it.
      if (elapsed >= interval - 1) {
        last = elapsed > 2 * interval ? time : last + interval;
        const analyser = engine.getAnalyserNode();
        if (analyser) {
          const rate = analyser.context.sampleRate;
          ensureAnalyserSize(analyser, analyserSizeFor(rate));
          const length = analyser.fftSize;
          // Grows once per analyser size; frames reuse it.
          if (data.length < length)
            data = samples.current = new Float32Array(length);
          analyser.getFloatTimeDomainData(data);
          const count = Math.min(
              Math.round(rate * WINDOW_SECONDS),
              length - Math.round(rate * (SEARCH_SECONDS + WARM_SECONDS)),
            ),
            columns = Math.max(2, Math.min(MAX_COLUMNS, Math.floor(width))),
            anchor = trigger(length - count, rate);
          if (count !== span) canvas.dataset.samples = String((span = count));
          if (anchor >= 0) locked = time;
          const start =
            anchor >= 0 ? anchor : time - locked > HOLD_MS ? length - count : -1;
          if (start >= 0) {
            const step = count / columns;
            for (let c = 0; c < columns; c++) {
              let i = start + Math.floor(c * step);
              const end = start + Math.floor((c + 1) * step);
              let low = data[i],
                high = low;
              for (i++; i < end; i++) {
                const value = data[i];
                if (value < low) low = value;
                else if (value > high) high = value;
              }
              target[2 * c] = c & 1 ? low : high;
              target[2 * c + 1] = c & 1 ? high : low;
            }
          }
          // A span only advances by whole bass cycles, so easing every vertex
          // toward it changes the trace each frame instead of in jumps.
          const settle = 1 - Math.exp(Math.min(0, drawn - time) / SETTLE_MS),
            mid = height / 2,
            gain = height * 0.45;
          drawn = time;
          // One min/max stroke: no grid, shadow blur, fill, reflection,
          // frequency FFT, or per-frame layout. At most 2 × 512 vertices.
          ctx.clearRect(0, 0, width, height);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.75 * scale;
          ctx.lineJoin = "bevel";
          ctx.beginPath();
          for (let v = 0; v < 2 * columns; v++) {
            shown[v] += (target[v] - shown[v]) * settle;
            const x = ((v >> 1) * width) / (columns - 1),
              y = mid - shown[v] * gain;
            v ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
          }
          ctx.stroke();
          frames++;
          if (frames % 120 === 0)
            canvas.dataset.renderedFrames = String(frames);
        }
      }
      handle = requestAnimationFrame(frame);
    };
    const setActive = (intersects: boolean) => {
      const next = playing && visible && intersects;
      if (next === active) return;
      active = next;
      setVisualDemand(engine, "scope", active);
      canvas.dataset.loopActive = String(active);
      if (active) {
        // Rises out of the resting line.
        target.fill(0);
        shown.fill(0);
        last = 0;
        drawn = locked = performance.now();
        handle = requestAnimationFrame(frame);
      } else {
        cancelAnimationFrame(handle);
        idle();
      }
    };
    const intersection = new IntersectionObserver((entries) =>
      setActive(entries[0].isIntersecting),
    );
    intersection.observe(canvas);
    return () => {
      active = false;
      cancelAnimationFrame(handle);
      observer.disconnect();
      intersection.disconnect();
      setVisualDemand(engine, "scope", false);
      canvas.dataset.loopActive = "false";
    };
  }, [engine, playing, visible, fps, color]);
  return (
    <div className="waveform-card">
      <canvas ref={ref} aria-label="Live oscilloscope" role="img" />
    </div>
  );
});
