import { memo, useEffect, useRef } from "react";
import type { TapeAudioEngine } from "../audioEngine";
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
  useEffect(() => {
    const canvas = ref.current!,
      ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;
    let width = 1,
      height = 1,
      handle = 0,
      last = 0,
      frames = 0,
      active = false;
    const data = new Float32Array(1024);
    const interval = 1000 / fps;
    const idle = () => {
      ctx.fillStyle = "#03060e";
      ctx.fillRect(0, 0, width, height);
      ctx.strokeStyle = "#26384d";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, height / 2);
      ctx.lineTo(width, height / 2);
      ctx.stroke();
    };
    const resize = () => {
      const box = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      width = Math.max(1, Math.round(box.width * dpr));
      height = Math.max(1, Math.round(box.height * dpr));
      canvas.width = width;
      canvas.height = height;
      idle();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);
    resize();
    canvas.dataset.loopActive = "false";
    engine.setVisualizationVisible(false);
    const frame = (time: number) => {
      if (!active) return;
      if (time - last + 0.2 >= interval) {
        last = time - ((time - last) % interval);
        const analyser = engine.getAnalyserNode();
        if (analyser) {
          analyser.getFloatTimeDomainData(data);
          // One line, no shadow blur, fill, reflection, frequency FFT, or per-frame layout.
          ctx.fillStyle = "#03060e";
          ctx.fillRect(0, 0, width, height);
          ctx.strokeStyle = "#162338";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, height / 2);
          ctx.lineTo(width, height / 2);
          ctx.stroke();
          let start = 0;
          for (let i = 1; i < 256; i++) {
            if (data[i - 1] <= 0 && data[i] > 0) {
              start = i;
              break;
            }
          }
          const points = Math.max(2, Math.min(512, Math.floor(width)));
          ctx.strokeStyle = color;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          for (let i = 0; i < points; i++) {
            const value = data[start + Math.floor((i * 511) / points)];
            const x = (i * width) / (points - 1),
              y = height / 2 - value * height * 0.43;
            i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
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
      engine.setVisualizationVisible(active);
      canvas.dataset.loopActive = String(active);
      if (active) {
        last = 0;
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
      engine.setVisualizationVisible(false);
      canvas.dataset.loopActive = "false";
    };
  }, [engine, playing, visible, fps, color]);
  return (
    <div className="waveform-card">
      <canvas ref={ref} aria-label="Live oscilloscope" role="img" />
    </div>
  );
});
