import type { TapeAudioEngine } from "./audioEngine";

const holders = new WeakMap<TapeAudioEngine, Set<string>>();

/**
 * The oscilloscope and the ambient background share the engine's analyser.
 * It stays connected while at least one of them is drawing.
 */
export function setVisualDemand(
  engine: TapeAudioEngine,
  holder: "scope" | "ambient",
  needed: boolean,
) {
  let set = holders.get(engine);
  if (!set) holders.set(engine, (set = new Set()));
  const before = set.size > 0;
  if (needed) set.add(holder);
  else set.delete(holder);
  if (before !== set.size > 0) engine.setVisualizationVisible(set.size > 0);
}

/** Readers may grow the analyser window but never shrink it under another reader. */
export function ensureAnalyserSize(analyser: AnalyserNode, size: number) {
  if (analyser.fftSize < size) analyser.fftSize = size;
}

const BASS_CUTOFF_HZ = 115;
// Four Butterworth sections: about −17 dB at 130 Hz and −43 dB at 200 Hz.
const BASS_SECTIONS = 4;
const BASS_DECIMATED_HZ = 6000;
const BASS_SETTLE_SECONDS = 0.03;
const BASS_WINDOW_SECONDS = 0.05;

/** Analyser size the bass meter needs at a given context rate. */
export const bassSamplesFor = (sampleRate: number) =>
  2 **
  Math.ceil(
    Math.log2(sampleRate * (BASS_SETTLE_SECONDS + BASS_WINDOW_SECONDS)),
  );

/**
 * Returns a meter that reports the RMS level (dBFS) of the newest 50 ms of
 * time-domain data below the bass cutoff. The signal is box-averaged down to
 * ~6 kHz before filtering, so a measurement costs a few thousand additions.
 */
export function createBassMeter() {
  let rate = 0,
    factor = 1,
    b0 = 0,
    b1 = 0,
    a1 = 0,
    a2 = 0;
  const z = new Float64Array(BASS_SECTIONS * 2);
  return (data: Float32Array, length: number, sampleRate: number) => {
    if (sampleRate !== rate) {
      rate = sampleRate;
      factor = Math.max(1, Math.round(sampleRate / BASS_DECIMATED_HZ));
      const w = (2 * Math.PI * BASS_CUTOFF_HZ * factor) / sampleRate,
        cos = Math.cos(w),
        alpha = Math.sin(w) / Math.SQRT2,
        a0 = 1 + alpha;
      b0 = (1 - cos) / 2 / a0;
      b1 = (1 - cos) / a0;
      a1 = (-2 * cos) / a0;
      a2 = (1 - alpha) / a0;
    }
    const decimated = rate / factor,
      window = Math.round(decimated * BASS_WINDOW_SECONDS),
      count = Math.min(
        window + Math.round(decimated * BASS_SETTLE_SECONDS),
        Math.floor(length / factor),
      ),
      measured = Math.max(1, Math.min(window, count));
    let index = length - count * factor,
      sum = 0;
    z.fill(0);
    for (let k = 0; k < count; k++) {
      let x = 0;
      for (let j = 0; j < factor; j++) x += data[index++];
      x /= factor;
      for (let s = 0; s < z.length; s += 2) {
        const y = b0 * x + z[s];
        z[s] = b1 * x - a1 * y + z[s + 1];
        z[s + 1] = b0 * x - a2 * y;
        x = y;
      }
      if (k >= count - measured) sum += x * x;
    }
    return 10 * Math.log10(sum / measured + 1e-12);
  };
}
