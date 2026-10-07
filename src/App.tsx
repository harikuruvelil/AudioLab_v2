import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TapeAudioEngine } from "./audioEngine";
import {
  getAllTracks,
  getTrackBlob,
  getLibraryStoredBytes,
  putTrack,
  deleteTrackById,
} from "./db";
import {
  createTrackId,
  getMimeFromFileName,
  isSupportedAudioFileName,
  probeDurationFromFile,
  stripExtension,
} from "./utils";
import {
  createDefaultEqBands,
  REVERB_PRESETS,
  sanitizeEqBands,
} from "./audioFxPresets";
import { LibraryScreen } from "./components/LibraryScreen";
import { PlayerScreen } from "./components/PlayerScreen";
import { Equalizer } from "./components/Equalizer";
import { Sheet } from "./components/Sheet";
import { Toast } from "./components/Toast";
import { DarkScreen } from "./components/DarkScreen";
import { AmbientBackground } from "./components/AmbientBackground";
import {
  ICON_LIBRARY,
  ICON_MINUS,
  ICON_MOON,
  ICON_WAVEFORM,
} from "./components/Icons";
import { applyUpdate } from "./updates";
import type {
  EqBand,
  EqPresetName,
  RepeatMode,
  StorageSummary,
  TrackMeta,
} from "./types";

const KEY = "audiolab-v2-settings";
// `mesh` is the ambient background: base colour, then four light sources.
const themes = [
  {
    id: "arctic",
    label: "Arctic Glass",
    accent: "#7BE0FF",
    accent2: "#8EAEFF",
    bg: "#0A1220",
    bgDeep: "#060B15",
    tint: "rgba(180, 223, 255, 0.26)",
    mesh: ["#020817", "#1F5CF5", "#14B8E0", "#6A3AE6", "#7FE3FA"],
  },
  {
    id: "mint",
    label: "Mint Frost",
    accent: "#78F1D4",
    accent2: "#4FC3AE",
    bg: "#081A18",
    bgDeep: "#05110F",
    tint: "rgba(143, 255, 218, 0.24)",
    mesh: ["#02100D", "#0BB58A", "#0A86B8", "#2D4FD8", "#8AF0CC"],
  },
  {
    id: "sunset",
    label: "Sunset Glass",
    accent: "#FFB087",
    accent2: "#FF6EA7",
    bg: "#1A101D",
    bgDeep: "#0D0812",
    tint: "rgba(255, 184, 150, 0.24)",
    mesh: ["#13040B", "#F24E2C", "#E0236F", "#6A2AD8", "#F7AE5C"],
  },
  {
    id: "midnight",
    label: "Midnight Frost",
    accent: "#B9C5FF",
    accent2: "#7D8FFF",
    bg: "#090B1A",
    bgDeep: "#04060F",
    tint: "rgba(184, 193, 255, 0.23)",
    mesh: ["#030418", "#3A3AF0", "#8A3FE6", "#182AA8", "#A898FA"],
  },
  {
    id: "ocean",
    label: "Ocean Prism",
    accent: "#5FE8FF",
    accent2: "#3A9CFF",
    bg: "#071A26",
    bgDeep: "#041019",
    tint: "rgba(109, 228, 255, 0.22)",
    mesh: ["#020D18", "#0070E8", "#00B0C0", "#2A2FD8", "#52E6CC"],
  },
  {
    id: "ember",
    label: "Ember Glass",
    accent: "#FFB16F",
    accent2: "#FF5D6C",
    bg: "#1D1110",
    bgDeep: "#0D0708",
    tint: "rgba(255, 170, 120, 0.23)",
    mesh: ["#130402", "#F04412", "#D01236", "#7A0C38", "#F5A030"],
  },
  {
    id: "orchid",
    label: "Orchid Haze",
    accent: "#F3A8FF",
    accent2: "#8F84FF",
    bg: "#160F24",
    bgDeep: "#090612",
    tint: "rgba(222, 170, 255, 0.22)",
    mesh: ["#0E0418", "#A042EC", "#E83592", "#4A2CD8", "#F08ED6"],
  },
  {
    id: "aurora",
    label: "Aurora Mist",
    accent: "#7BFFC5",
    accent2: "#61C9FF",
    bg: "#0A1C1A",
    bgDeep: "#04100E",
    tint: "rgba(145, 255, 220, 0.22)",
    mesh: ["#020F0A", "#0FB86C", "#0E92E0", "#6232DC", "#78EEBC"],
  },
  {
    id: "light",
    label: "Light",
    appearance: "light",
    accent: "#2C2C2E",
    accent2: "#6E6E73",
    onAccent: "#F5F5F7",
    bg: "#C4C4C4",
    bgDeep: "#B4B4B4",
    tint: "rgba(255, 255, 255, 0.3)",
    mesh: ["#B4B4B4", "#D8D8D8", "#C6C6C6", "#9E9E9E", "#E4E4E4"],
  },
  {
    id: "metallic",
    label: "Metallic",
    accent: "#C7C7CC",
    accent2: "#8E8E93",
    onAccent: "#1C1C1E",
    bg: "#1C1C1E",
    bgDeep: "#0B0B0C",
    tint: "rgba(229, 229, 234, 0.22)",
    mesh: ["#0B0B0C", "#6E6E73", "#2C2C2E", "#9C9CA1", "#D1D1D6"],
  },
  {
    id: "dark",
    label: "Dark",
    accent: "#B4B4B4",
    accent2: "#8A8A8A",
    onAccent: "#000000",
    bg: "#0A0A0A",
    bgDeep: "#000000",
    tint: "rgba(200, 200, 200, 0.16)",
    mesh: ["#000000", "#262626", "#121212", "#363636", "#474747"],
  },
];
function readSettings() {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : {};
  } catch {
    return {};
  }
}
const presetNames = ["Flat", "Bass Boost", "Vocal", "Treble Boost"];
export default function App() {
  const [initial] = useState(readSettings);
  const [engine] = useState(() => {
    const value = new TapeAudioEngine();
    value.setRate(initial.rate ?? 1);
    value.setEqEnabled(initial.eqEnabled === true);
    value.setEqBands(sanitizeEqBands(initial.eqBands));
    value.setReverbWet(initial.wet ?? 0.25);
    value.setReverbEnabled(initial.reverbEnabled === true);
    if (REVERB_PRESETS.some((p) => p.id === initial.reverbPreset))
      void value.setReverbPreset(initial.reverbPreset);
    return value;
  });
  const [playback, setPlayback] = useState(engine.getSnapshot);
  const [tracks, setTracks] = useState<TrackMeta[]>([]);
  const [tab, setTab] = useState<"player" | "library">("player");
  const [sheet, setSheet] = useState<"audio" | "appearance" | "queue" | null>(
    null,
  );
  const [visible, setVisible] = useState(!document.hidden);
  const [locked, setLocked] = useState(false);
  const [waveform, setWaveform] = useState(initial.waveform !== false);
  const [fps, setFps] = useState(
    Number.isFinite(initial.fps)
      ? Math.max(24, Math.min(120, initial.fps))
      : 120,
  );
  const [color, setColor] = useState(
    /^#[0-9a-f]{6}$/i.test(initial.color ?? "") ? initial.color : "#65d4ff",
  );
  const [theme, setTheme] = useState(
    themes.some((value) => value.id === initial.theme)
      ? initial.theme
      : "arctic",
  );
  const [ambient, setAmbient] = useState(initial.ambient !== false);
  const [repeat, setRepeat] = useState<RepeatMode>(
    ["off", "one", "all"].includes(initial.repeat) ? initial.repeat : "off",
  );
  const [shuffle, setShuffle] = useState(initial.shuffle === true);
  const [queue, setQueue] = useState<string[]>(
    Array.isArray(initial.queue)
      ? initial.queue.filter((id: unknown) => typeof id === "string")
      : [],
  );
  const [selection, setSelection] = useState(
    presetNames.includes(initial.selection) ||
      /^Custom [123]$/.test(initial.selection ?? "")
      ? initial.selection
      : "Flat",
  );
  const [slots, setSlots] = useState<EqBand[][]>(
    [0, 1, 2].map((index) => sanitizeEqBands(initial.slots?.[index])),
  );
  const [toast, setToast] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [storage, setStorage] = useState<StorageSummary>({
    appBytes: 0,
    usageBytes: null,
    quotaBytes: null,
  });
  const [updateReady, setUpdateReady] = useState(false);
  const request = useRef(0),
    toastTimer = useRef<number>(),
    history = useRef<string[]>([]),
    shuffleBag = useRef<string[]>([]),
    shuffledPlayed = useRef(new Set<string>());
  const live = useRef({ tracks, queue, repeat, shuffle });
  live.current = { tracks, queue, repeat, shuffle };
  const notify = useCallback((message: string) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4500);
  }, []);
  const refresh = useCallback(async () => {
    const all = await getAllTracks();
    setTracks(all);
    const bytes = await getLibraryStoredBytes();
    const estimate = await navigator.storage
      ?.estimate?.()
      .catch(() => ({ usage: undefined, quota: undefined }));
    setStorage({
      appBytes: bytes,
      usageBytes: estimate?.usage ?? null,
      quotaBytes: estimate?.quota ?? null,
    });
    setQueue((previous) =>
      previous.filter((id) => all.some((track) => track.id === id)),
    );
  }, []);
  const playTrack = useCallback(
    async (id: string, rememberPrevious = true, continueShuffle = false) => {
      const token = ++request.current;
      // Preserve activation before asynchronous storage access on iOS.
      const unlock = engine.unlock();
      try {
        const blob = await getTrackBlob(id);
        await unlock;
        if (token !== request.current) return;
        if (!blob) {
          notify("Audio bytes are missing. Re-import the track.");
          return;
        }
        const previous = engine.getSnapshot().trackId;
        const success = await engine.playTrack(id, blob);
        if (success && token === request.current) {
          if (rememberPrevious && previous && previous !== id)
            history.current.push(previous);
          if (!continueShuffle) {
            shuffleBag.current = [];
            shuffledPlayed.current.clear();
          }
          shuffledPlayed.current.add(id);
          setTab("player");
        }
      } catch (error) {
        notify(
          error instanceof Error ? error.message : "Could not play this track.",
        );
      }
    },
    [engine, notify],
  );
  const next = useCallback(
    async (auto = false) => {
      const state = engine.getSnapshot(),
        values = live.current,
        ids = values.tracks.map((track) => track.id);
      if (!ids.length) return;
      if (auto && values.repeat === "one") {
        engine.seek(0);
        await engine.play();
        return;
      }
      const queued = values.queue.find((id) => ids.includes(id));
      if (queued) {
        setQueue((previous) => previous.slice(previous.indexOf(queued) + 1));
        await playTrack(queued, true, true);
        return;
      }
      let target: string | undefined;
      if (values.shuffle) {
        shuffleBag.current = shuffleBag.current.filter(
          (id) =>
            ids.includes(id) &&
            id !== state.trackId &&
            !shuffledPlayed.current.has(id),
        );
        if (!shuffleBag.current.length) {
          let remaining = ids.filter(
            (id) => id !== state.trackId && !shuffledPlayed.current.has(id),
          );
          if (!remaining.length) {
            if (auto && values.repeat === "off") return;
            shuffledPlayed.current.clear();
            if (state.trackId) shuffledPlayed.current.add(state.trackId);
            remaining = ids.filter((id) => id !== state.trackId);
          }
          // Fisher-Yates keeps every remaining track equally likely.
          for (let i = remaining.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [remaining[i], remaining[j]] = [remaining[j], remaining[i]];
          }
          shuffleBag.current = remaining;
        }
        target =
          shuffleBag.current.shift() ??
          (values.repeat === "all" ? ids[0] : undefined);
      } else {
        const index = ids.indexOf(state.trackId ?? "");
        target =
          ids[index + 1] ?? (values.repeat === "all" ? ids[0] : undefined);
      }
      if (target) await playTrack(target, true, true);
    },
    [engine, playTrack],
  );
  const nextRef = useRef(next);
  nextRef.current = next;
  useEffect(() => {
    const off = engine.subscribe(setPlayback),
      offError = engine.onError(notify),
      offEnded = engine.onEnded(() => {
        void nextRef
          .current(true)
          .catch(() => notify("Could not move to the next track."));
      });
    void refresh().catch(() =>
      notify("Library storage is unavailable. Check browser storage settings."),
    );
    const visibility = () => {
      const shown = !document.hidden;
      setVisible(shown);
      engine.setPageVisible(shown);
      if (shown && engine.getSnapshot().isPlaying)
        void engine
          .ensureContext()
          .catch(() => notify("Tap Play to resume audio."));
    };
    const update = () => setUpdateReady(true);
    document.addEventListener("visibilitychange", visibility);
    window.addEventListener("pageshow", visibility);
    window.addEventListener("audiolab-update-ready", update);
    return () => {
      off();
      offError();
      offEnded();
      clearTimeout(toastTimer.current);
      document.removeEventListener("visibilitychange", visibility);
      window.removeEventListener("pageshow", visibility);
      window.removeEventListener("audiolab-update-ready", update);
      void engine.dispose();
    };
  }, [engine, notify, refresh]);
  const serialized = useMemo(
    () =>
      JSON.stringify({
        rate: playback.rate,
        eqEnabled: playback.eqEnabled,
        eqBands: playback.eqBands,
        reverbEnabled: playback.reverbEnabled,
        reverbPreset: playback.reverbPresetId,
        wet: playback.reverbWet,
        waveform,
        fps,
        color,
        theme,
        ambient,
        repeat,
        shuffle,
        queue,
        selection,
        slots,
      }),
    [
      playback.rate,
      playback.eqEnabled,
      playback.eqBands,
      playback.reverbEnabled,
      playback.reverbPresetId,
      playback.reverbWet,
      waveform,
      fps,
      color,
      theme,
      ambient,
      repeat,
      shuffle,
      queue,
      selection,
      slots,
    ],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(KEY, serialized);
      } catch {
        notify("Settings could not be saved: browser storage is full.");
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [serialized, notify]);
  const track =
    tracks.find((value) => value.id === playback.trackId) ??
    (!playback.trackId ? (tracks[0] ?? null) : null);
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = track
      ? new MediaMetadata({ title: track.displayName, artist: "AudioLab v2" })
      : null;
    navigator.mediaSession.playbackState = playback.isPlaying
      ? "playing"
      : "paused";
  }, [track, playback.isPlaying]);
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    const handlers: Partial<
      Record<MediaSessionAction, MediaSessionActionHandler>
    > = {
      play: () => {
        void engine.play().catch(() => notify("Tap Play to resume."));
      },
      pause: () => engine.pause(),
      nexttrack: () => {
        void nextRef.current();
      },
      previoustrack: () => {
        if (engine.getSnapshot().currentTime > 3) {
          engine.seek(0);
          return;
        }
        const id = history.current.pop();
        id ? void playTrack(id, false) : engine.seek(0);
      },
      seekto: (details) => engine.seek(details.seekTime ?? 0),
      seekbackward: (details) =>
        engine.seek(
          engine.getSnapshot().currentTime - (details.seekOffset ?? 10),
        ),
      seekforward: (details) =>
        engine.seek(
          engine.getSnapshot().currentTime + (details.seekOffset ?? 10),
        ),
    };
    for (const [action, handler] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(
          action as MediaSessionAction,
          handler!,
        );
      } catch {}
    }
    return () => {
      for (const action of Object.keys(handlers)) {
        try {
          navigator.mediaSession.setActionHandler(
            action as MediaSessionAction,
            null,
          );
        } catch {}
      }
    };
  }, [engine, notify, playTrack]);
  const importFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const selectedFiles = Array.from(files);
    setImporting(true);
    try {
      await navigator.storage?.persist?.().catch(() => false);
      let count = 0;
      for (const file of selectedFiles) {
        if (!isSupportedAudioFileName(file.name)) {
          notify(`Skipped ${file.name}: unsupported extension.`);
          continue;
        }
        try {
          const duration = await probeDurationFromFile(file).catch(() => 0);
          await putTrack(
            {
              id: createTrackId(),
              filename: file.name,
              displayName: stripExtension(file.name),
              addedAt: Date.now(),
              durationSeconds: duration,
              mimeType: file.type || getMimeFromFileName(file.name),
              sizeBytes: file.size,
            },
            file,
          );
          count++;
        } catch {
          notify(`Could not store ${file.name}. Check available storage.`);
        }
      }
      await refresh();
      if (count) notify(`Imported ${count} track${count === 1 ? "" : "s"}.`);
    } finally {
      setImporting(false);
    }
  };
  const selectEq = (name: string) => {
    setSelection(name);
    if (presetNames.includes(name)) engine.setEqPreset(name as EqPresetName);
    else
      engine.setEqBands(
        slots[Number(name.slice(-1)) - 1] ?? createDefaultEqBands(),
      );
  };
  const editEq = (id: string, patch: Partial<EqBand>) => {
    engine.setEqBandConfig(id, patch);
    const name = selection.startsWith("Custom") ? selection : "Custom 1";
    setSelection(name);
    const index = Number(name.slice(-1)) - 1,
      bands = engine.getSnapshot().eqBands;
    setSlots((previous) =>
      previous.map((slot, i) => (i === index ? bands : slot)),
    );
  };
  const togglePlay = () => {
    if (playback.loading) {
      ++request.current;
      engine.clearTrack();
      return;
    }
    if (playback.isPlaying) {
      engine.pause();
      return;
    }
    if (playback.isReady) {
      void engine.play().catch(() => notify("Tap Play again to resume audio."));
      return;
    }
    if (track) void playTrack(track.id);
    else {
      setTab("library");
      notify("Import audio from Library first.");
    }
  };
  const activeTheme = themes.find((value) => value.id === theme)!;
  useEffect(() => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", activeTheme.bgDeep);
  }, [activeTheme]);
  return (
    <div
      className={`app-root ${playback.isPlaying ? "is-playing" : ""}`}
      data-appearance={activeTheme.appearance ?? "dark"}
      style={
        {
          "--accent": activeTheme.accent,
          "--accent-2": activeTheme.accent2,
          ...(activeTheme.onAccent && { "--on-accent": activeTheme.onAccent }),
          "--bg": activeTheme.bg,
          "--bg-deep": activeTheme.bgDeep,
          "--theme-tint": activeTheme.tint,
          "--m0": activeTheme.mesh[0],
          "--m1": activeTheme.mesh[1],
          "--m2": activeTheme.mesh[2],
          "--m3": activeTheme.mesh[3],
          "--m4": activeTheme.mesh[4],
        } as React.CSSProperties
      }
    >
      <AmbientBackground
        engine={engine}
        palette={activeTheme.mesh}
        light={activeTheme.appearance === "light"}
        playing={playback.isPlaying}
        animate={ambient}
        running={visible && !sheet && !locked}
      />
      <main className="app-main">
        {updateReady && (
          <div className="glass v2-update" role="status">
            <span>An update is ready.</span>
            <button
              type="button"
              className="glass-button is-prominent"
              disabled={playback.isPlaying || playback.loading || importing}
              onClick={() => {
                void applyUpdate().catch(() =>
                  notify(
                    "Update could not be applied. Try again while online.",
                  ),
                );
              }}
            >
              Update when paused
            </button>
          </div>
        )}
        {tab === "library" ? (
          <LibraryScreen
            tracks={tracks}
            selectedTrackId={playback.trackId}
            onImportFiles={importFiles}
            onDeleteTrack={async (id) => {
              if (id === engine.getSnapshot().trackId) {
                ++request.current;
                engine.clearTrack(id);
              }
              try {
                await deleteTrackById(id);
                await refresh();
              } catch {
                notify("Could not delete that track.");
              }
            }}
            onPlayTrack={playTrack}
            onQueueTrack={(id) => {
              setQueue((previous) => [...previous, id]);
              notify("Added to queue.");
            }}
            storage={storage}
            importing={importing}
          />
        ) : (
          <PlayerScreen
            engine={engine}
            playback={playback}
            track={track}
            scopeEnabled={waveform}
            scopeVisible={waveform && visible && !sheet && !locked}
            fps={fps}
            color={color}
            repeat={repeat}
            shuffle={shuffle}
            onShuffle={() => {
              setShuffle((value) => !value);
              shuffleBag.current = [];
              shuffledPlayed.current.clear();
              if (playback.trackId)
                shuffledPlayed.current.add(playback.trackId);
            }}
            onRepeat={() =>
              setRepeat((value) =>
                value === "off" ? "one" : value === "one" ? "all" : "off",
              )
            }
            onPlay={togglePlay}
            onPrev={() => {
              if (playback.currentTime > 3) {
                engine.seek(0);
                return;
              }
              const previous =
                history.current.pop() ??
                tracks[
                  tracks.findIndex((value) => value.id === playback.trackId) - 1
                ]?.id;
              if (previous) void playTrack(previous, false);
              else engine.seek(0);
            }}
            onNext={() => {
              void next();
            }}
            onSheet={setSheet}
          />
        )}
      </main>
      <nav className="tabbar" aria-label="Main navigation">
        <div className="tabbar-capsule">
          <button
            type="button"
            className={`tabbar-button ${tab === "player" ? "is-active" : ""}`}
            aria-current={tab === "player" ? "page" : undefined}
            onClick={() => setTab("player")}
          >
            {ICON_WAVEFORM}
            <span>Player</span>
          </button>
          <button
            type="button"
            className={`tabbar-button ${tab === "library" ? "is-active" : ""}`}
            aria-current={tab === "library" ? "page" : undefined}
            onClick={() => setTab("library")}
          >
            {ICON_LIBRARY}
            <span>Library</span>
          </button>
        </div>
      </nav>
      {sheet && (
        <Sheet
          title={
            sheet === "audio"
              ? "Audio settings"
              : sheet === "queue"
                ? "Queue"
                : "Display settings"
          }
          onClose={() => setSheet(null)}
        >
          {sheet === "audio" && (
            <>
              <Equalizer
                engine={engine}
                playback={playback}
                onEdit={editEq}
                selection={selection}
                onSelect={selectEq}
              />
              <section className="fx-section">
                <div className="fx-heading">
                  <h4>Reverb</h4>
                  <label className="switch-label">
                    <span>Enabled</span>
                    <input
                      type="checkbox"
                      role="switch"
                      className="switch"
                      checked={playback.reverbEnabled}
                      onChange={(event) =>
                        engine.setReverbEnabled(event.target.checked)
                      }
                    />
                  </label>
                </div>
                <div
                  className={`group ${playback.reverbEnabled ? "" : "is-dimmed"}`}
                >
                  <div className="row">
                    <label className="row-label" htmlFor="reverb-room">
                      Room
                    </label>
                    <select
                      id="reverb-room"
                      className="glass-select"
                      value={playback.reverbPresetId}
                      onChange={(event) => {
                        void engine.setReverbPreset(
                          event.target.value as typeof playback.reverbPresetId,
                        );
                      }}
                    >
                      {REVERB_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="row row--stack">
                    <span className="row-head">
                      <span className="row-label">Wet mix</span>
                      <strong className="row-value">
                        {Math.round(playback.reverbWet * 100)}%
                      </strong>
                    </span>
                    <input
                      className="range"
                      type="range"
                      min={0}
                      max={60}
                      value={Math.round(playback.reverbWet * 100)}
                      style={
                        {
                          "--p": Math.round(playback.reverbWet * 100) / 60,
                        } as React.CSSProperties
                      }
                      onChange={(event) =>
                        engine.setReverbWet(Number(event.target.value) / 100)
                      }
                    />
                  </label>
                </div>
                <p className="footnote">
                  Rooms you use online are saved for offline playback.
                </p>
              </section>
            </>
          )}
          {sheet === "appearance" && (
            <>
              <section className="fx-section">
                <div className="fx-heading">
                  <h4>Oscilloscope</h4>
                </div>
                <div className="group">
                  <label className="row">
                    <span className="row-label">Show oscilloscope</span>
                    <input
                      type="checkbox"
                      role="switch"
                      className="switch"
                      checked={waveform}
                      onChange={(event) => setWaveform(event.target.checked)}
                    />
                  </label>
                  <div className="row row--stack">
                    <label className="row-head" htmlFor="scope-fps">
                      <span className="row-label">Oscilloscope refresh</span>
                      <strong className="row-value">up to {fps} Hz</strong>
                    </label>
                    <input
                      id="scope-fps"
                      className="range"
                      type="range"
                      min={24}
                      max={120}
                      step={1}
                      value={fps}
                      style={{ "--p": (fps - 24) / 96 } as React.CSSProperties}
                      onChange={(event) => setFps(Number(event.target.value))}
                    />
                    <div className="range-ticks" aria-hidden="true">
                      <span style={{ "--t": 0 } as React.CSSProperties}>
                        24
                      </span>
                      <span style={{ "--t": 0.375 } as React.CSSProperties}>
                        60
                      </span>
                      <span style={{ "--t": 1 } as React.CSSProperties}>
                        120
                      </span>
                    </div>
                  </div>
                  <label className="row">
                    <span className="row-label">Waveform color</span>
                    <input
                      className="color-input"
                      type="color"
                      value={color}
                      onChange={(event) => setColor(event.target.value)}
                    />
                  </label>
                </div>
                <p className="footnote">
                  120 Hz remains available. Lower refresh uses less power.
                  Drawing pauses behind menus and when the display is hidden.
                </p>
              </section>
              <section className="fx-section">
                <div className="fx-heading">
                  <h4>Background</h4>
                </div>
                <div className="group">
                  <label className="row">
                    <span className="row-label">Moving background</span>
                    <input
                      type="checkbox"
                      role="switch"
                      className="switch"
                      checked={ambient}
                      onChange={(event) => setAmbient(event.target.checked)}
                    />
                  </label>
                </div>
                <p className="footnote">
                  Drifts constantly and moves faster only with bass below 130
                  Hz. Pauses behind menus and in Dark screen. Turn it off to
                  save power.
                </p>
              </section>
              <section className="fx-section">
                <div className="fx-heading">
                  <h4 id="theme-heading">Theme</h4>
                </div>
                <div
                  className="theme-grid"
                  role="radiogroup"
                  aria-labelledby="theme-heading"
                >
                  {themes.map((value) => (
                    <label
                      key={value.id}
                      className={`theme-option ${theme === value.id ? "is-selected" : ""}`}
                    >
                      <input
                        type="radio"
                        name="theme"
                        className="v2-visually-hidden"
                        value={value.id}
                        checked={theme === value.id}
                        onChange={() => setTheme(value.id)}
                      />
                      <span
                        className="theme-swatch"
                        aria-hidden="true"
                        style={{
                          background: `radial-gradient(circle at 52% 46%, ${value.mesh[4]}, transparent 42%), radial-gradient(circle at 22% 24%, ${value.mesh[1]}, transparent 62%), radial-gradient(circle at 84% 34%, ${value.mesh[2]}, transparent 58%), radial-gradient(circle at 30% 86%, ${value.mesh[3]}, transparent 64%), ${value.mesh[0]}`,
                        }}
                      />
                      <span className="theme-name">{value.label}</span>
                    </label>
                  ))}
                </div>
              </section>
              <section className="fx-section">
                <button
                  type="button"
                  className="glass-button is-block"
                  onClick={() => {
                    setSheet(null);
                    setLocked(true);
                  }}
                >
                  {ICON_MOON}
                  Dark screen
                </button>
                <p className="footnote">
                  Blacks out the display while audio keeps playing. The
                  oscilloscope stops drawing until you exit.
                </p>
              </section>
            </>
          )}
          {sheet === "queue" &&
            (queue.length ? (
              <section className="fx-section">
                <div className="fx-heading">
                  <h4>
                    Up next · {queue.length} track
                    {queue.length === 1 ? "" : "s"}
                  </h4>
                  <button
                    type="button"
                    className="glass-button is-destructive is-compact"
                    onClick={() => setQueue([])}
                  >
                    Clear queue
                  </button>
                </div>
                <ul className="group queue-list">
                  {queue.map((id, index) => {
                    const queued = tracks.find((value) => value.id === id);
                    return queued ? (
                      <li className="queue-row" key={`${id}-${index}`}>
                        <button
                          type="button"
                          className="queue-main"
                          onClick={() => {
                            setQueue((previous) =>
                              previous.filter((_, i) => i !== index),
                            );
                            setSheet(null);
                            void playTrack(id);
                          }}
                        >
                          <span className="queue-index">{index + 1}</span>
                          <span className="queue-title">
                            {queued.displayName}
                          </span>
                        </button>
                        <button
                          type="button"
                          className="icon-button is-destructive"
                          aria-label={`Remove ${queued.displayName} from queue`}
                          title="Remove"
                          onClick={() =>
                            setQueue((previous) =>
                              previous.filter((_, i) => i !== index),
                            )
                          }
                        >
                          {ICON_MINUS}
                        </button>
                      </li>
                    ) : null;
                  })}
                </ul>
              </section>
            ) : (
              <div className="empty-card is-plain">
                <p className="empty-state">
                  Queue is empty. Add tracks from Library.
                </p>
              </div>
            ))}
        </Sheet>
      )}
      {locked && <DarkScreen onClose={() => setLocked(false)} />}
      <Toast message={toast} />
    </div>
  );
}
