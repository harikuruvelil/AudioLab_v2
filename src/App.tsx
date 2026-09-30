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
import { applyUpdate } from "./updates";
import type {
  EqBand,
  EqPresetName,
  RepeatMode,
  StorageSummary,
  TrackMeta,
} from "./types";

const KEY = "audiolab-v2-settings";
const themes = [
  {
    id: "arctic",
    label: "Arctic Glass",
    accent: "#7BE0FF",
    accent2: "#8EAEFF",
    bg: "#0A1220",
    bgDeep: "#060B15",
    tint: "rgba(180, 223, 255, 0.26)",
  },
  {
    id: "mint",
    label: "Mint Frost",
    accent: "#78F1D4",
    accent2: "#4FC3AE",
    bg: "#081A18",
    bgDeep: "#05110F",
    tint: "rgba(143, 255, 218, 0.24)",
  },
  {
    id: "sunset",
    label: "Sunset Glass",
    accent: "#FFB087",
    accent2: "#FF6EA7",
    bg: "#1A101D",
    bgDeep: "#0D0812",
    tint: "rgba(255, 184, 150, 0.24)",
  },
  {
    id: "midnight",
    label: "Midnight Frost",
    accent: "#B9C5FF",
    accent2: "#7D8FFF",
    bg: "#090B1A",
    bgDeep: "#04060F",
    tint: "rgba(184, 193, 255, 0.23)",
  },
  {
    id: "ocean",
    label: "Ocean Prism",
    accent: "#5FE8FF",
    accent2: "#3A9CFF",
    bg: "#071A26",
    bgDeep: "#041019",
    tint: "rgba(109, 228, 255, 0.22)",
  },
  {
    id: "ember",
    label: "Ember Glass",
    accent: "#FFB16F",
    accent2: "#FF5D6C",
    bg: "#1D1110",
    bgDeep: "#0D0708",
    tint: "rgba(255, 170, 120, 0.23)",
  },
  {
    id: "orchid",
    label: "Orchid Haze",
    accent: "#F3A8FF",
    accent2: "#8F84FF",
    bg: "#160F24",
    bgDeep: "#090612",
    tint: "rgba(222, 170, 255, 0.22)",
  },
  {
    id: "aurora",
    label: "Aurora Mist",
    accent: "#7BFFC5",
    accent2: "#61C9FF",
    bg: "#0A1C1A",
    bgDeep: "#04100E",
    tint: "rgba(145, 255, 220, 0.22)",
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
  return (
    <div
      className={`app-root ${playback.isPlaying ? "is-playing" : ""}`}
      style={
        {
          "--accent": activeTheme.accent,
          "--accent-2": activeTheme.accent2,
          "--bg": activeTheme.bg,
          "--bg-deep": activeTheme.bgDeep,
          "--theme-tint": activeTheme.tint,
        } as React.CSSProperties
      }
    >
      <header className="app-header">
        <p className="app-kicker">Audio Lab · v2</p>
        <h1>Slowed HQ</h1>
      </header>
      {updateReady && (
        <div className="v2-update" role="status">
          An update is ready.
          <button
            type="button"
            disabled={playback.isPlaying || playback.loading || importing}
            onClick={() => {
              void applyUpdate().catch(() =>
                notify("Update could not be applied. Try again while online."),
              );
            }}
          >
            Update when paused
          </button>
        </div>
      )}
      <main className="app-main">
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
        <button
          type="button"
          className={`tabbar-button ${tab === "player" ? "is-active" : ""}`}
          onClick={() => setTab("player")}
        >
          Player
        </button>
        <button
          type="button"
          className={`tabbar-button ${tab === "library" ? "is-active" : ""}`}
          onClick={() => setTab("library")}
        >
          Library
        </button>
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
              <section className="v2-effect">
                <div className="v2-effect-heading">
                  <h4>Reverb</h4>
                  <label className="v2-toggle">
                    <input
                      type="checkbox"
                      checked={playback.reverbEnabled}
                      onChange={(event) =>
                        engine.setReverbEnabled(event.target.checked)
                      }
                    />
                    Enabled
                  </label>
                </div>
                <label className="v2-field">
                  Room
                  <select
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
                </label>
                <label className="v2-field">
                  Wet mix: {Math.round(playback.reverbWet * 100)}%
                  <input
                    type="range"
                    min={0}
                    max={60}
                    value={Math.round(playback.reverbWet * 100)}
                    onChange={(event) =>
                      engine.setReverbWet(Number(event.target.value) / 100)
                    }
                  />
                </label>
                <p className="v2-help">
                  Rooms you use online are saved for offline playback.
                </p>
              </section>
            </>
          )}
          {sheet === "appearance" && (
            <section className="v2-effect">
              <label className="v2-toggle">
                <input
                  type="checkbox"
                  checked={waveform}
                  onChange={(event) => setWaveform(event.target.checked)}
                />
                Show oscilloscope
              </label>
              <label className="v2-field">
                Oscilloscope refresh: up to {fps} Hz
                <input
                  type="range"
                  min={24}
                  max={120}
                  step={1}
                  value={fps}
                  onChange={(event) => setFps(Number(event.target.value))}
                />
              </label>
              <p className="v2-help">
                120 Hz remains available. Lower refresh uses less power. Drawing
                pauses behind menus and when the display is hidden.
              </p>
              <label className="v2-field">
                Waveform color
                <input
                  type="color"
                  value={color}
                  onChange={(event) => setColor(event.target.value)}
                />
              </label>
              <label className="v2-field">
                Theme
                <select
                  value={theme}
                  onChange={(event) => setTheme(event.target.value)}
                >
                  {themes.map((value) => (
                    <option key={value.id} value={value.id}>
                      {value.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="transport-button"
                onClick={() => {
                  setSheet(null);
                  setLocked(true);
                }}
              >
                Dark screen
              </button>
            </section>
          )}
          {sheet === "queue" &&
            (queue.length ? (
              <>
                <button
                  type="button"
                  className="transport-button"
                  onClick={() => setQueue([])}
                >
                  Clear queue
                </button>
                <ul className="queue-list">
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
                          {index + 1}. {queued.displayName}
                        </button>
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() =>
                            setQueue((previous) =>
                              previous.filter((_, i) => i !== index),
                            )
                          }
                        >
                          Remove
                        </button>
                      </li>
                    ) : null;
                  })}
                </ul>
              </>
            ) : (
              <p className="empty-state">
                Queue is empty. Add tracks from Library.
              </p>
            ))}
        </Sheet>
      )}
      {locked && <DarkScreen onClose={() => setLocked(false)} />}
      <Toast message={toast} />
    </div>
  );
}
