import {
  applyEqPreset,
  createDefaultEqBands,
  REVERB_PRESET_MAP,
  sanitizeEqBands,
} from "./audioFxPresets";
import {
  headroomForBands,
  readSourceSampleRate,
  requiresBufferedPlayback,
} from "./audioMetadata";
import type {
  EqBand,
  EqGraphCurve,
  EqPresetName,
  PlaybackState,
  QualityState,
  ReverbPresetId,
} from "./types";
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
type Listener = (state: PlaybackState) => void;

export class TapeAudioEngine {
  private context: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private media: HTMLAudioElement | null = null;
  private mediaSource: MediaElementAudioSourceNode | null = null;
  private objectUrl: string | null = null;
  private input: GainNode | null = null;
  private dry: GainNode | null = null;
  private wet: GainNode | null = null;
  private master: GainNode | null = null;
  private analyser: AnalyserNode | null = null;
  private convolver: ConvolverNode | null = null;
  private limiter: AudioWorkletNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private contextPromise: Promise<void> | null = null;
  private decodeTail: Promise<void> = Promise.resolve();
  private listeners = new Set<Listener>();
  private errors = new Set<(message: string) => void>();
  private ended = new Set<() => void>();
  private generation = 0;
  private intent = 0;
  private irGeneration = 0;
  private disposed = false;
  private clock: number | null = null;
  private suspendTimer: number | null = null;
  private clipUntil = 0;
  private anchorTime = 0;
  private anchorPosition = 0;
  private sourceRate: number | null = null;
  private irRate: number | null = null;
  private irLoading = false;
  private irCache = new Map<
    ReverbPresetId,
    { buffer: AudioBuffer; rate: number | null }
  >();
  private irTasks = new Map<
    ReverbPresetId,
    Promise<{ buffer: AudioBuffer; rate: number | null }>
  >();
  private pendingMetadata: (() => void) | null = null;
  private renderVisible = true;
  private state: PlaybackState = {
    trackId: null,
    isReady: false,
    isPlaying: false,
    loading: false,
    rate: 1,
    currentTime: 0,
    duration: 0,
    reverbEnabled: false,
    reverbPresetId: "off",
    reverbWet: 0.25,
    eqEnabled: false,
    eqBands: createDefaultEqBands(),
    eqPresetName: "Flat",
    clipWarning: false,
    headroomDb: 1,
    backend: requiresBufferedPlayback(
      navigator.userAgent,
      navigator.platform,
      navigator.maxTouchPoints,
    )
      ? "buffer"
      : "stream",
    quality: {
      status: "checking",
      contextHz: null,
      trackHz: null,
      irHz: null,
      trackResampled: false,
      irResampled: false,
      reverbActive: false,
    },
  };
  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => {
      this.listeners.delete(listener);
    };
  };
  onError(listener: (message: string) => void) {
    this.errors.add(listener);
    return () => {
      this.errors.delete(listener);
    };
  }
  onEnded(listener: () => void) {
    this.ended.add(listener);
    return () => {
      this.ended.delete(listener);
    };
  }
  getAnalyserNode = () => this.analyser;
  getSnapshot = () => this.snapshot();
  private error(message: string) {
    this.errors.forEach((listener) => listener(message));
  }
  private emit() {
    if (!this.disposed) {
      const state = this.snapshot();
      this.listeners.forEach((listener) => listener(state));
    }
  }
  private position() {
    if (this.state.backend === "stream")
      return this.media?.currentTime ?? this.anchorPosition;
    return clamp(
      this.anchorPosition +
        (this.state.isPlaying && this.context
          ? (this.context.currentTime - this.anchorTime) * this.state.rate
          : 0),
      0,
      this.state.duration,
    );
  }
  private snapshot(): PlaybackState {
    const contextHz = this.context?.sampleRate ?? null;
    const active =
      this.state.reverbEnabled &&
      !!this.convolver?.buffer &&
      this.state.reverbWet > 0;
    const mismatch =
      !!this.sourceRate && !!contextHz && this.sourceRate !== contextHz;
    const irMismatch = active && !!this.irRate && this.irRate !== contextHz;
    const status: QualityState["status"] =
      this.state.loading || this.irLoading || !this.state.isReady
        ? "checking"
        : this.sourceRate === null || (active && this.irRate === null)
          ? "unknown"
          : mismatch || irMismatch
            ? "resampled"
            : "full_rate_match";
    return {
      ...this.state,
      currentTime: this.position(),
      clipWarning: performance.now() < this.clipUntil,
      quality: {
        status,
        contextHz,
        trackHz: this.sourceRate,
        irHz: active ? this.irRate : null,
        trackResampled: mismatch,
        irResampled: irMismatch,
        reverbActive: active,
      },
    };
  }
  unlock = async () => {
    await this.ensureContext();
  };
  async ensureContext() {
    if (this.disposed) throw new Error("Audio engine has been closed.");
    if (this.suspendTimer !== null) {
      clearTimeout(this.suspendTimer);
      this.suspendTimer = null;
    }
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: "playback" });
      const ctx = this.context;
      this.input = ctx.createGain();
      this.dry = ctx.createGain();
      this.wet = ctx.createGain();
      this.master = ctx.createGain();
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = 1024;
      this.analyser.smoothingTimeConstant = 0;
      this.filters = this.state.eqBands.map(() => ctx.createBiquadFilter());
      this.dry.connect(this.master);
      this.contextPromise = (async () => {
        try {
          await ctx.audioWorklet.addModule(
            new URL(
              `${import.meta.env.BASE_URL}worklets/output-guard.js`,
              document.baseURI,
            ).href,
          );
          if (this.disposed) return;
          this.limiter = new AudioWorkletNode(ctx, "output-guard", {
            numberOfInputs: 1,
            numberOfOutputs: 1,
            outputChannelCount: [2],
            channelCount: 2,
            channelCountMode: "explicit",
            channelInterpretation: "speakers",
          });
          this.limiter.port.onmessage = (event) => {
            if (event.data.limited) {
              this.clipUntil = performance.now() + 1100;
              this.emit();
            }
          };
          this.master!.connect(this.limiter);
          this.limiter.connect(ctx.destination);
        } catch {
          if (!this.disposed) {
            this.master!.connect(ctx.destination);
            this.error(
              "Output protection unavailable. Extra headroom remains enabled.",
            );
          }
        }
        if (this.disposed) return;
        this.connectInput();
        this.applyFilters();
        this.updateMix();
        this.setVisualizationVisible(this.renderVisible);
      })();
      ctx.onstatechange = () => {
        if (ctx.state === "running" && this.state.isPlaying) this.startClock();
        this.emit();
      };
      void ctx.resume().catch(() => {});
    }
    if (this.context.state === "closed")
      throw new Error(
        "The browser closed its audio service. Reload AudioLab to continue.",
      );
    if (this.context.state !== "running") await this.context.resume();
    await this.contextPromise;
    if (!this.state.isPlaying && !this.state.loading) this.scheduleSuspend();
  }
  setVisualizationVisible(visible: boolean) {
    this.renderVisible = visible;
    const output = this.limiter ?? this.master;
    if (!output || !this.analyser) return;
    try {
      output.disconnect(this.analyser);
    } catch {
      /* not connected */
    }
    if (visible) output.connect(this.analyser);
  }
  private connectInput() {
    if (!this.input || !this.dry) return;
    this.input.disconnect();
    this.filters.forEach((filter) => filter.disconnect());
    const active = this.state.eqEnabled
      ? this.filters.filter((_, index) => this.state.eqBands[index].enabled)
      : [];
    let tail: AudioNode = this.input;
    active.forEach((filter) => {
      tail.connect(filter);
      tail = filter;
    });
    tail.connect(this.dry);
    if (
      this.convolver &&
      this.wet &&
      this.state.reverbEnabled &&
      this.state.reverbWet > 0 &&
      this.convolver.buffer
    )
      tail.connect(this.convolver);
  }
  private applyFilters() {
    if (!this.context) return;
    this.filters.forEach((filter, index) => {
      const band = this.state.eqBands[index];
      filter.type = band.type;
      filter.frequency.setTargetAtTime(
        Math.min(band.frequency, this.context!.sampleRate * 0.49),
        this.context!.currentTime,
        0.015,
      );
      filter.gain.setTargetAtTime(
        band.gainDb,
        this.context!.currentTime,
        0.015,
      );
      filter.Q.setTargetAtTime(band.q, this.context!.currentTime, 0.015);
    });
  }
  private updateMix() {
    if (!this.context || !this.dry || !this.wet || !this.master) return;
    const wet =
      this.state.reverbEnabled && this.convolver?.buffer
        ? this.state.reverbWet
        : 0;
    this.state.headroomDb = headroomForBands(
      this.state.eqEnabled ? this.state.eqBands : [],
      wet,
    );
    const now = this.context.currentTime;
    this.dry.gain.setTargetAtTime(1 - wet, now, 0.025);
    this.wet.gain.setTargetAtTime(wet, now, 0.025);
    this.master.gain.setTargetAtTime(
      10 ** (-this.state.headroomDb / 20),
      now,
      0.015,
    );
    this.connectInput();
    // Detach both ends of the convolution branch while bypassed or at zero wet mix.
    this.convolver?.disconnect();
    this.wet.disconnect();
    if (wet > 0 && this.convolver) {
      this.convolver.connect(this.wet);
      this.wet.connect(this.master);
    }
  }
  getEqGraphCurve(pointCount = 160): EqGraphCurve | null {
    if (!this.context) return null;
    const frequencies = Float32Array.from(
      { length: pointCount },
      (_, i) =>
        20 *
        (Math.min(20000, this.context!.sampleRate * 0.49) / 20) **
          (i / (pointCount - 1)),
    );
    const magnitude = new Float32Array(pointCount),
      phase = new Float32Array(pointCount),
      gain = new Float32Array(pointCount).fill(1);
    this.filters.forEach((filter, index) => {
      if (!this.state.eqBands[index].enabled) return;
      filter.getFrequencyResponse(frequencies, magnitude, phase);
      for (let i = 0; i < pointCount; i++) gain[i] *= magnitude[i];
    });
    return {
      frequencies: Array.from(frequencies),
      gainsDb: Array.from(
        gain,
        (value) => 20 * Math.log10(Math.max(1e-10, value)),
      ),
    };
  }
  async playTrack(trackId: string, blob: Blob): Promise<boolean> {
    const generation = ++this.generation,
      intent = ++this.intent;
    this.pendingMetadata?.();
    this.stopSource();
    this.media?.pause();
    this.stopClock();
    this.buffer = null;
    this.anchorPosition = 0;
    this.sourceRate = null;
    this.state = {
      ...this.state,
      trackId,
      isReady: false,
      isPlaying: false,
      loading: true,
      duration: 0,
    };
    this.emit();
    try {
      await this.ensureContext();
      if (generation !== this.generation || this.disposed) return false;
      const sourceRate = await readSourceSampleRate(blob);
      if (generation !== this.generation || this.disposed) return false;
      this.sourceRate = sourceRate;
      if (this.state.backend === "stream") {
        if (!this.media) {
          this.media = new Audio();
          this.media.preload = "metadata";
          this.media.preservesPitch = false;
          (
            this.media as HTMLAudioElement & { webkitPreservesPitch?: boolean }
          ).webkitPreservesPitch = false;
          this.mediaSource = this.context!.createMediaElementSource(this.media);
          this.mediaSource.connect(this.input!);
          this.media.addEventListener("ended", () => this.handleEnded());
        }
        if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
        this.objectUrl = URL.createObjectURL(blob);
        this.media.src = this.objectUrl;
        await this.waitForMedia();
        if (generation !== this.generation || this.disposed) return false;
        this.state.duration = this.media.duration;
      } else {
        // Release the previous PCM before decoding; don't make a full encoded-byte copy.
        const buffer = await this.decodeSerially(blob, generation);
        if (!buffer || generation !== this.generation || this.disposed)
          return false;
        if (buffer.length * buffer.numberOfChannels * 4 > 256 * 1024 * 1024)
          throw new Error(
            "This track needs too much iPhone memory. Import a shorter or lower-rate copy.",
          );
        this.buffer = buffer;
        this.state.duration = buffer.duration;
      }
      this.state.loading = false;
      this.state.isReady = true;
      this.emit();
      if (this.state.reverbEnabled && this.state.reverbPresetId !== "off")
        void this.setReverbPreset(this.state.reverbPresetId);
      if (intent === this.intent) await this.play();
      else this.scheduleSuspend();
      return generation === this.generation && !this.disposed;
    } catch (error) {
      if (generation !== this.generation || this.disposed) return false;
      this.state.loading = false;
      this.state.isReady = false;
      this.emit();
      this.scheduleSuspend();
      this.error(
        error instanceof Error
          ? error.message
          : "Could not load this audio file.",
      );
      return false;
    }
  }
  private waitForMedia() {
    return new Promise<void>((resolve, reject) => {
      const media = this.media!;
      const timer = window.setTimeout(
        () =>
          finish(new Error("Audio loading timed out. Try a different file.")),
        15000,
      );
      const success = () => finish(),
        failure = () =>
          finish(new Error("This browser cannot play this file."));
      const finish = (error?: Error) => {
        clearTimeout(timer);
        media.removeEventListener("loadedmetadata", success);
        media.removeEventListener("error", failure);
        this.pendingMetadata = null;
        error ? reject(error) : resolve();
      };
      this.pendingMetadata = () => finish(new Error("Cancelled"));
      media.addEventListener("loadedmetadata", success, { once: true });
      media.addEventListener("error", failure, { once: true });
      media.load();
    });
  }
  private async decodeSerially(
    blob: Blob,
    generation: number,
  ): Promise<AudioBuffer | null> {
    const previous = this.decodeTail;
    let release!: () => void;
    this.decodeTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      if (generation !== this.generation || this.disposed) return null;
      const bytes = await blob.arrayBuffer();
      if (generation !== this.generation || this.disposed) return null;
      return await this.context!.decodeAudioData(bytes);
    } finally {
      release();
    }
  }
  async play() {
    const generation = this.generation,
      intent = ++this.intent;
    if (!this.state.isReady || this.state.isPlaying) return;
    await this.ensureContext();
    if (
      generation !== this.generation ||
      intent !== this.intent ||
      this.disposed
    )
      return;
    if (this.media && this.state.backend === "stream") {
      if (this.media.ended || this.media.currentTime >= this.state.duration)
        this.media.currentTime = 0;
      this.media.playbackRate = this.state.rate;
      await this.media.play();
      if (generation !== this.generation || this.disposed) return;
      if (intent !== this.intent) {
        this.media.pause();
        return;
      }
    } else
      this.startSource(
        this.anchorPosition >= this.state.duration ? 0 : this.anchorPosition,
      );
    this.state.isPlaying = true;
    this.emit();
    this.startClock();
  }
  pause() {
    ++this.intent;
    this.anchorPosition = this.position();
    this.media?.pause();
    this.stopSource();
    this.state.isPlaying = false;
    this.stopClock();
    this.emit();
    this.scheduleSuspend();
  }
  stop() {
    this.pause();
    this.anchorPosition = 0;
    if (this.media) this.media.currentTime = 0;
    this.emit();
  }
  seek(seconds: number) {
    if (!this.state.isReady) return;
    const target = clamp(seconds, 0, this.state.duration);
    if (this.media && this.state.backend === "stream")
      this.media.currentTime = target;
    else {
      const playing = this.state.isPlaying;
      this.stopSource();
      this.anchorPosition = target;
      if (playing) this.startSource(target);
    }
    this.emit();
  }
  setRate(rate: number) {
    this.anchorPosition = this.position();
    this.anchorTime = this.context?.currentTime ?? 0;
    this.state.rate = clamp(rate, 0.5, 1.5);
    this.source?.playbackRate.setValueAtTime(this.state.rate, this.anchorTime);
    if (this.media) this.media.playbackRate = this.state.rate;
    this.emit();
  }
  setEqEnabled(enabled: boolean) {
    this.state.eqEnabled = enabled;
    this.updateMix();
    this.emit();
  }
  setEqBands(bands: readonly EqBand[], preset: EqPresetName | null = null) {
    this.state.eqBands = sanitizeEqBands(bands);
    this.state.eqPresetName = preset;
    this.applyFilters();
    this.updateMix();
    this.emit();
  }
  setEqPreset(preset: EqPresetName) {
    this.setEqBands(applyEqPreset(createDefaultEqBands(), preset), preset);
  }
  setEqBandConfig(
    id: string,
    patch: Partial<Pick<EqBand, "frequency" | "gainDb" | "q" | "enabled">>,
  ) {
    this.setEqBands(
      this.state.eqBands.map((band) =>
        band.id === id ? { ...band, ...patch } : band,
      ),
    );
  }
  setReverbEnabled(enabled: boolean) {
    this.state.reverbEnabled = enabled;
    ++this.irGeneration;
    this.irLoading = false;
    this.updateMix();
    this.emit();
    if (enabled) void this.setReverbPreset(this.state.reverbPresetId);
  }
  setReverbWet(value: number) {
    this.state.reverbWet = clamp(value, 0, 0.6);
    this.updateMix();
    this.emit();
  }
  async setReverbPreset(preset: ReverbPresetId) {
    const token = ++this.irGeneration;
    this.state.reverbPresetId = preset;
    if (this.convolver) this.convolver.buffer = null;
    this.irRate = null;
    this.irLoading = false;
    this.updateMix();
    this.emit();
    if (preset === "off" || !this.state.reverbEnabled || !this.context) return;
    this.irLoading = true;
    this.emit();
    try {
      let result = this.irCache.get(preset);
      if (!result) {
        let task = this.irTasks.get(preset);
        if (!task) {
          const context = this.context;
          task = (async () => {
            const response = await fetch(REVERB_PRESET_MAP.get(preset)!.url!);
            if (!response.ok) throw new Error("IR unavailable");
            const blob = await response.blob();
            const rate = await readSourceSampleRate(blob);
            const buffer = await context.decodeAudioData(
              await blob.arrayBuffer(),
            );
            return { buffer, rate };
          })();
          this.irTasks.set(preset, task);
        }
        try {
          result = await task;
        } finally {
          if (this.irTasks.get(preset) === task) this.irTasks.delete(preset);
        }
        if (this.disposed) return;
        this.irCache.set(preset, result);
        while (this.irCache.size > 2)
          this.irCache.delete(this.irCache.keys().next().value!);
      }
      if (token !== this.irGeneration || this.disposed) return;
      if (!this.convolver) this.convolver = this.context.createConvolver();
      this.convolver.buffer = result.buffer;
      this.irRate = result.rate;
    } catch {
      if (token === this.irGeneration && !this.disposed)
        this.error(
          "That reverb is unavailable offline. Play it once online to save it.",
        );
    }
    if (token === this.irGeneration && !this.disposed) {
      this.irLoading = false;
      this.updateMix();
      this.emit();
    }
  }
  private startSource(offset: number) {
    if (!this.buffer || !this.context) return;
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.playbackRate.value = this.state.rate;
    source.connect(this.input!);
    source.onended = () => {
      if (this.source === source) {
        this.source = null;
        source.disconnect();
        this.handleEnded();
      }
    };
    this.anchorPosition = offset;
    this.anchorTime = this.context.currentTime;
    source.start(0, offset);
    this.source = source;
  }
  private stopSource() {
    if (this.source) {
      this.source.onended = null;
      try {
        this.source.stop();
      } catch {}
      this.source.disconnect();
      this.source = null;
    }
  }
  private handleEnded() {
    this.state.isPlaying = false;
    this.anchorPosition = this.state.duration;
    this.stopClock();
    this.emit();
    this.ended.forEach((listener) => listener());
    this.scheduleSuspend();
  }
  private startClock() {
    this.stopClock();
    if (!document.hidden)
      this.clock = window.setInterval(() => this.emit(), 250);
  }
  private stopClock() {
    if (this.clock !== null) clearInterval(this.clock);
    this.clock = null;
  }
  private scheduleSuspend() {
    if (this.suspendTimer !== null) clearTimeout(this.suspendTimer);
    this.suspendTimer = window.setTimeout(() => {
      this.suspendTimer = null;
      if (!this.state.isPlaying && !this.state.loading)
        void this.context?.suspend().catch(() => {});
    }, 750);
  }
  setPageVisible(visible: boolean) {
    if (visible && this.state.isPlaying) this.startClock();
    else this.stopClock();
    this.emit();
  }
  clearTrack(id?: string) {
    if (id && id !== this.state.trackId) return;
    ++this.generation;
    ++this.intent;
    this.pendingMetadata?.();
    this.pause();
    this.buffer = null;
    if (this.media) {
      this.media.removeAttribute("src");
      this.media.load();
    }
    if (this.objectUrl) URL.revokeObjectURL(this.objectUrl);
    this.objectUrl = null;
    this.anchorPosition = 0;
    this.sourceRate = null;
    this.state = {
      ...this.state,
      trackId: null,
      isReady: false,
      loading: false,
      duration: 0,
    };
    this.emit();
  }
  async dispose() {
    this.clearTrack();
    this.disposed = true;
    ++this.irGeneration;
    if (this.suspendTimer !== null) clearTimeout(this.suspendTimer);
    this.stopClock();
    this.irCache.clear();
    this.irTasks.clear();
    this.listeners.clear();
    this.errors.clear();
    this.ended.clear();
    if (this.context) {
      this.context.onstatechange = null;
      await this.context.close();
    }
  }
}
