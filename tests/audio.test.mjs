import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile } from "node:fs/promises";
import { build } from "esbuild";
const compile = async (path) => {
  const result = await build({
    entryPoints: [path],
    bundle: true,
    write: false,
    format: "esm",
    platform: "node",
    loader: { ".js": "text" },
    define: { "import.meta.env.BASE_URL": '"./"' },
  });
  return import(
    "data:text/javascript;base64," +
      Buffer.from(result.outputFiles[0].text).toString("base64")
  );
};
const metadata = await compile("src/audioMetadata.ts");
const pending = [];
const param = () => ({
  value: 0,
  setTargetAtTime(value) {
    this.value = value;
  },
  setValueAtTime(value) {
    this.value = value;
  },
});
const node = () => ({
  gain: param(),
  frequency: param(),
  Q: param(),
  playbackRate: param(),
  connections: [],
  connect(target) {
    this.connections.push(target);
  },
  disconnect(target) {
    this.connections = target
      ? this.connections.filter((value) => value !== target)
      : [];
  },
  start() {},
  stop() {},
  getFrequencyResponse(freq, magnitude) {
    magnitude.fill(1);
  },
});
class FakeContext {
  state = "running";
  currentTime = 0;
  sampleRate = 48000;
  destination = node();
  audioWorklet = { addModule: async () => {} };
  createGain() {
    return node();
  }
  createAnalyser() {
    return { ...node(), fftSize: 1024 };
  }
  createConvolver() {
    return { ...node(), buffer: null };
  }
  createBiquadFilter() {
    return node();
  }
  createBufferSource() {
    return node();
  }
  decodeAudioData() {
    return new Promise((resolve) => pending.push(resolve));
  }
  async resume() {
    this.state = "running";
  }
  async suspend() {
    this.state = "suspended";
  }
  async close() {
    this.state = "closed";
  }
}
Object.defineProperty(globalThis, "navigator", {
  value: { userAgent: "iPhone", platform: "iPhone", maxTouchPoints: 5 },
  configurable: true,
});
globalThis.document = {
  hidden: false,
  baseURI: "https://example.test/AudioLab_v2/",
};
globalThis.window = {
  setTimeout() {
    return 1;
  },
  setInterval() {
    return 1;
  },
};
globalThis.AudioContext = FakeContext;
globalThis.AudioWorkletNode = class {
  port = {};
  connections = [];
  connect(target) {
    this.connections.push(target);
  }
  disconnect(target) {
    this.connections = this.connections.filter((value) => value !== target);
  }
};
const { TapeAudioEngine } = await compile("src/audioEngine.ts");
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
const waitForDecode = async () => {
  for (let i = 0; i < 50 && !pending.length; i++)
    await new Promise((resolve) => setImmediate(resolve));
  assert.ok(pending.length, "reached decode");
  return pending.shift();
};
const decoded = (rate = 48000) => ({
  duration: 10,
  sampleRate: rate,
  length: 480000,
  numberOfChannels: 2,
});
function wav(rate) {
  const bytes = new Uint8Array(48),
    view = new DataView(bytes.buffer);
  for (const [offset, value] of [
    [0, "RIFF"],
    [8, "WAVE"],
    [12, "fmt "],
  ])
    for (let i = 0; i < value.length; i++)
      bytes[offset + i] = value.charCodeAt(i);
  view.setUint32(16, 16, true);
  view.setUint32(24, rate, true);
  return new Blob([bytes]);
}

test("source header rate stays independent of decoded context rate", async () => {
  const engine = new TapeAudioEngine(),
    loading = engine.playTrack("A", wav(44100));
  (await waitForDecode())(decoded());
  assert.equal(await loading, true);
  const state = engine.getSnapshot();
  assert.equal(state.quality.trackHz, 44100);
  assert.equal(state.quality.contextHz, 48000);
  assert.equal(state.quality.status, "resampled");
  await engine.dispose();
});
test("stale selection cannot resume a newer paused track", async () => {
  const engine = new TapeAudioEngine(),
    a = engine.playTrack("A", wav(44100)),
    resolveA = await waitForDecode();
  const b = engine.playTrack("B", wav(48000));
  resolveA(decoded());
  assert.equal(await a, false);
  (await waitForDecode())(decoded());
  assert.equal(await b, true);
  engine.pause();
  await flush();
  assert.equal(engine.getSnapshot().trackId, "B");
  assert.equal(engine.getSnapshot().isPlaying, false);
  assert.equal(engine.getSnapshot().quality.trackHz, 48000);
  await engine.dispose();
});
test("rapid selections serialize decoding and skip superseded queued files", async () => {
  const engine = new TapeAudioEngine(),
    a = engine.playTrack("A", wav(48000)),
    resolveA = await waitForDecode();
  const b = engine.playTrack("B", wav(48000));
  await flush();
  const c = engine.playTrack("C", wav(48000));
  resolveA(decoded());
  assert.equal(await a, false);
  assert.equal(await b, false);
  (await waitForDecode())(decoded());
  assert.equal(await c, true);
  assert.equal(engine.getSnapshot().trackId, "C");
  await engine.dispose();
});
test("clearing during decode cannot resurrect a track", async () => {
  const engine = new TapeAudioEngine(),
    loading = engine.playTrack("A", wav(48000)),
    resolve = await waitForDecode();
  engine.clearTrack();
  resolve(decoded());
  assert.equal(await loading, false);
  assert.equal(engine.getSnapshot().isReady, false);
  assert.equal(engine.getSnapshot().trackId, null);
  await engine.dispose();
});
test("pause during load prevents autoplay but leaves track ready", async () => {
  const engine = new TapeAudioEngine(),
    loading = engine.playTrack("A", wav(48000)),
    resolve = await waitForDecode();
  engine.pause();
  resolve(decoded());
  await loading;
  assert.equal(engine.getSnapshot().isReady, true);
  assert.equal(engine.getSnapshot().isPlaying, false);
  await engine.dispose();
});
test("disabled EQ filters, convolver and analyser are disconnected", async () => {
  const engine = new TapeAudioEngine();
  await engine.unlock();
  assert.equal(
    engine.filters.some((filter) => filter.connections.length),
    false,
  );
  assert.equal(engine.convolver, null);
  engine.setVisualizationVisible(false);
  assert.ok(!engine.limiter.connections.includes(engine.analyser));
  await engine.dispose();
});
test("reverb is detached at zero wet and when bypassed, then reconnects once", async () => {
  const engine = new TapeAudioEngine();
  await engine.unlock();
  engine.convolver = { ...node(), buffer: decoded() };
  engine.state.reverbEnabled = true;
  engine.setReverbWet(0.25);
  assert.equal(engine.convolver.connections.length, 1);
  assert.equal(engine.wet.connections.length, 1);
  engine.setReverbWet(0);
  assert.equal(engine.convolver.connections.length, 0);
  assert.equal(engine.wet.connections.length, 0);
  engine.setReverbWet(0.25);
  assert.equal(engine.convolver.connections.length, 1);
  engine.setReverbEnabled(false);
  assert.equal(engine.convolver.connections.length, 0);
  assert.equal(engine.wet.connections.length, 0);
  await engine.dispose();
});
test("unknown codec metadata is never guessed as lossless or rate matched", async () => {
  assert.equal(
    await metadata.readSourceSampleRate(new Blob(["not a wav"])),
    null,
  );
  assert.equal(metadata.requiresBufferedPlayback("iPhone"), true);
  assert.equal(
    metadata.requiresBufferedPlayback("Mozilla Chrome/130 AppleWebKit/537.36"),
    false,
  );
});
test("headroom covers stacked gain boosts instead of only the largest band", () => {
  const bands = [
    { enabled: true, gainDb: 18, type: "peaking", q: 1 },
    { enabled: true, gainDb: 18, type: "peaking", q: 1 },
  ];
  assert.ok(metadata.headroomForBands(bands, 0) >= 36);
});
test("output guard preserves stereo and bounds full-scale overloads", async () => {
  let Processor;
  const context = vm.createContext({
    AudioWorkletProcessor: class {
      port = { postMessage() {} };
    },
    Float32Array,
    Math,
    sampleRate: 48000,
    registerProcessor(name, value) {
      Processor = value;
    },
  });
  vm.runInContext(
    await readFile("src/worklets/output-guard.js", "utf8"),
    context,
  );
  const guard = new Processor();
  for (let block = 0; block < 80; block++) {
    const input = [
      Float32Array.from(
        { length: 128 },
        (_, i) => Math.sin(i / 5) * (block % 3 ? 4 : 0.1),
      ),
      Float32Array.from({ length: 128 }, (_, i) => Math.cos(i / 7) * 2),
    ];
    const output = [new Float32Array(128), new Float32Array(128)];
    guard.process([input], [output]);
    assert.ok(
      output.every((channel) =>
        channel.every(
          (value) => Number.isFinite(value) && Math.abs(value) <= 0.980001,
        ),
      ),
    );
    if (block > 0) assert.notDeepEqual(output[0], output[1]);
  }
});
test("FLAC STREAMINFO sample rate is parsed from original metadata", async () => {
  const bytes = new Uint8Array(42);
  bytes.set([102, 76, 97, 67]);
  bytes[4] = 0;
  bytes[7] = 34;
  const rate = 96000;
  bytes[18] = rate >> 12;
  bytes[19] = (rate >> 4) & 255;
  bytes[20] = (rate & 15) << 4;
  assert.equal(await metadata.readSourceSampleRate(new Blob([bytes])), 96000);
});
test("output guard passes ordinary mono equally to both channels after one quantum", async () => {
  let Processor;
  const context = vm.createContext({
    AudioWorkletProcessor: class {
      port = { postMessage() {} };
    },
    Float32Array,
    Math,
    sampleRate: 48000,
    registerProcessor(name, value) {
      Processor = value;
    },
  });
  vm.runInContext(
    await readFile("src/worklets/output-guard.js", "utf8"),
    context,
  );
  const guard = new Processor(),
    input = Float32Array.from({ length: 128 }, (_, i) => Math.sin(i / 8) * 0.5),
    output = [new Float32Array(128), new Float32Array(128)];
  guard.process([[input]], [output]);
  assert.ok(output[0].every((value) => value === 0));
  guard.process([[input]], [output]);
  assert.deepEqual(output[0], input);
  assert.deepEqual(output[1], input);
});
test("generated offline worker parses and has only relative app-shell URLs", async () => {
  // Validates the build generator without exposing the original site's caches.
  const source = await readFile("public/sw.js", "utf8");
  new vm.Script(source);
  assert.ok(!source.includes("music-slowing-shell"));
  assert.ok(source.includes("self.registration.scope"));
});
