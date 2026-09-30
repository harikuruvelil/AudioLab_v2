class OutputGuard extends AudioWorkletProcessor {
  constructor() {
    super();
    this.previous = [new Float32Array(128), new Float32Array(128)];
    this.previousPeak = 0;
    this.gain = 1;
    this.frames = 0;
    this.limited = false;
    this.release = Math.exp(-1 / (sampleRate * 0.08));
  }
  process(inputs, outputs) {
    const input = inputs[0],
      output = outputs[0],
      frames = output[0]?.length || 128;
    let peak = 0;
    for (let c = 0; c < input.length; c++)
      for (let i = 0; i < frames; i++)
        peak = Math.max(peak, Math.abs(input[c][i] || 0));
    const ceiling = 0.98,
      target = Math.min(
        1,
        ceiling / Math.max(ceiling, peak, this.previousPeak),
      );
    if (target < 0.999) this.limited = true;
    if (this.previous[0].length !== frames)
      this.previous = [new Float32Array(frames), new Float32Array(frames)];
    for (let i = 0; i < frames; i++) {
      this.gain =
        target < this.gain
          ? target
          : target + (this.gain - target) * this.release;
      for (let c = 0; c < output.length; c++) {
        const previous = this.previous[Math.min(c, 1)];
        output[c][i] = Math.max(
          -ceiling,
          Math.min(ceiling, previous[i] * this.gain),
        );
        previous[i] = input[Math.min(c, input.length - 1)]?.[i] || 0;
      }
    }
    this.previousPeak = peak;
    this.frames += frames;
    if (this.frames >= sampleRate / 4) {
      if (this.limited) this.port.postMessage({ limited: true });
      this.frames = 0;
      this.limited = false;
    }
    return true;
  }
}
registerProcessor("output-guard", OutputGuard);
