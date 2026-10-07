import { useState, type CSSProperties } from "react";
import { Oscilloscope } from "./Oscilloscope";
import {
  ICON_QUEUE,
  ICON_APPEAR,
  ICON_SLIDERS,
  ICON_PREV,
  ICON_PLAY,
  ICON_PAUSE,
  ICON_NEXT,
  ICON_CLOSE,
  ICON_SHUFFLE,
  ICON_REPEAT,
  ICON_WAVEFORM,
} from "./Icons";
import type { TapeAudioEngine } from "../audioEngine";
import type { PlaybackState, RepeatMode, TrackMeta } from "../types";
import {
  formatDuration,
  semitonesFromRate,
  getAudioFileExtension,
} from "../utils";
export function PlayerScreen({
  engine,
  playback,
  track,
  scopeEnabled,
  scopeVisible,
  fps,
  color,
  repeat,
  shuffle,
  onShuffle,
  onRepeat,
  onPlay,
  onPrev,
  onNext,
  onSheet,
}: {
  engine: TapeAudioEngine;
  playback: PlaybackState;
  track: TrackMeta | null;
  scopeEnabled: boolean;
  scopeVisible: boolean;
  fps: number;
  color: string;
  repeat: RepeatMode;
  shuffle: boolean;
  onShuffle: () => void;
  onRepeat: () => void;
  onPlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSheet: (sheet: "queue" | "audio" | "appearance") => void;
}) {
  const [scrub, setScrub] = useState<number | null>(null);
  const quality = playback.quality;
  const label = !playback.isReady
    ? playback.loading
      ? "LOADING…"
      : "READY"
    : quality.status === "checking"
      ? "LOADING REVERB…"
      : quality.status === "unknown"
        ? "SOURCE RATE UNKNOWN"
        : quality.status === "resampled"
          ? "RESAMPLED"
          : "RATE MATCH";
  const tone = !playback.isReady
    ? "idle"
    : quality.status === "full_rate_match"
      ? "ok"
      : quality.status === "resampled"
        ? "warn"
        : "idle";
  const commit = () => {
    if (scrub !== null) {
      engine.seek(scrub);
      setScrub(null);
    }
  };
  const position = scrub ?? playback.currentTime;
  const progress =
    playback.duration > 0 ? Math.min(1, position / playback.duration) : 0;
  const speed = playback.rate - 0.5;
  const semitones = semitonesFromRate(playback.rate);
  return (
    <section className="screen player-screen">
      <header className="screen-header">
        <div className="screen-heading">
          <p className="app-kicker">AudioLab V3</p>
          <h1 className="screen-title is-brand">AudioLab HQ</h1>
        </div>
        <div className="toolbar-capsule">
          <button
            type="button"
            className="toolbar-button"
            aria-label="Open queue"
            title="Queue"
            onClick={() => onSheet("queue")}
          >
            {ICON_QUEUE}
          </button>
          <button
            type="button"
            className="toolbar-button"
            aria-label="Open display settings"
            title="Display"
            onClick={() => onSheet("appearance")}
          >
            {ICON_APPEAR}
          </button>
          <button
            type="button"
            className="toolbar-button"
            aria-label="Open audio settings"
            title="Audio"
            onClick={() => onSheet("audio")}
          >
            {ICON_SLIDERS}
          </button>
        </div>
      </header>
      <div className="now-playing">
        <div className={`np-art ${scopeEnabled ? "" : "is-off"}`}>
          {scopeEnabled ? (
            <Oscilloscope
              engine={engine}
              playing={playback.isPlaying}
              visible={scopeVisible}
              fps={fps}
              color={color}
            />
          ) : (
            <span className="np-art-glyph" aria-hidden="true">
              {ICON_WAVEFORM}
            </span>
          )}
          {playback.clipWarning && (
            <span className="clip-chip" role="status">
              Output peak protected
            </span>
          )}
        </div>
        <div className="now-playing-text">
          <h2 className="now-playing-title" title={track?.displayName}>
            {track?.displayName ?? "No track selected"}
          </h2>
          {!track && (
            <p className="now-playing-subtitle">
              Add local audio from Library.
            </p>
          )}
          {track && (
            <p className="quality-format">
              {`${getAudioFileExtension(track.filename)?.toUpperCase() ?? "Audio"}${quality.trackHz ? ` · ${quality.trackHz.toLocaleString()} Hz source` : ""}`}
            </p>
          )}
        </div>
        <div className="seek">
          <label className="v2-visually-hidden" htmlFor="seek">
            Playback position
          </label>
          <input
            id="seek"
            className="range seek-slider"
            type="range"
            min={0}
            max={Math.max(0.01, playback.duration)}
            step={0.01}
            value={position}
            aria-valuetext={`${formatDuration(position)} of ${formatDuration(playback.duration)}`}
            style={{ "--p": progress } as CSSProperties}
            disabled={!playback.isReady}
            onChange={(event) => setScrub(Number(event.target.value))}
            onPointerUp={commit}
            onPointerCancel={() => setScrub(null)}
            onKeyUp={commit}
            onBlur={commit}
          />
          <div className="time-row">
            <span>{formatDuration(position)}</span>
            <span
              className="quality-chip"
              data-tone={tone}
              title={`Source ${quality.trackHz ?? "unknown"} Hz; output ${quality.contextHz ?? "not started"} Hz`}
            >
              {label}
            </span>
            <span>{formatDuration(playback.duration)}</span>
          </div>
        </div>
        <div className="transport">
          <button
            type="button"
            className="transport-mode"
            aria-label="Shuffle"
            aria-pressed={shuffle}
            title={`Shuffle ${shuffle ? "on" : "off"}`}
            onClick={onShuffle}
          >
            {ICON_SHUFFLE}
          </button>
          <button
            type="button"
            className="transport-skip"
            aria-label="Previous track"
            disabled={!track}
            onClick={onPrev}
          >
            {ICON_PREV}
          </button>
          <button
            type="button"
            className="transport-play"
            aria-label={
              playback.loading
                ? "Cancel loading"
                : playback.isPlaying
                  ? "Pause playback"
                  : "Play track"
            }
            onClick={onPlay}
          >
            {playback.loading
              ? ICON_CLOSE
              : playback.isPlaying
                ? ICON_PAUSE
                : ICON_PLAY}
          </button>
          <button
            type="button"
            className="transport-skip"
            aria-label="Next track"
            disabled={!track}
            onClick={onNext}
          >
            {ICON_NEXT}
          </button>
          <button
            type="button"
            className="transport-mode"
            aria-label={`Repeat ${repeat}`}
            data-mode={repeat}
            title={`Repeat ${repeat}`}
            onClick={onRepeat}
          >
            {ICON_REPEAT}
            {repeat === "one" && (
              <span className="repeat-badge" aria-hidden="true">
                1
              </span>
            )}
          </button>
        </div>
      </div>
      <div className="glass speed-card">
        <div className="speed-head">
          <label htmlFor="speed" className="speed-label">
            <span className="eyebrow">Speed</span>
            <strong className="speed-value">
              {playback.rate.toFixed(2)}
              <span>×</span>
            </strong>
          </label>
          <p className="pitch-shift">
            Pitch shift{" "}
            <strong>
              {semitones > 0.004 ? "+" : semitones < -0.004 ? "−" : ""}
              {Math.abs(semitones).toFixed(2)}
            </strong>{" "}
            semitones
          </p>
        </div>
        <input
          id="speed"
          className="range is-bipolar"
          type="range"
          min={0.5}
          max={1.5}
          step={0.01}
          value={playback.rate}
          style={
            {
              "--from": Math.min(speed, 0.5),
              "--to": Math.max(speed, 0.5),
            } as CSSProperties
          }
          onChange={(event) => engine.setRate(Number(event.target.value))}
        />
        <div className="range-ticks" aria-hidden="true">
          <span style={{ "--t": 0 } as CSSProperties}>0.50×</span>
          <span style={{ "--t": 0.5 } as CSSProperties}>1.00×</span>
          <span style={{ "--t": 1 } as CSSProperties}>1.50×</span>
        </div>
        <div className="button-row">
          <select
            className="glass-select"
            aria-label="Speed preset"
            value=""
            onChange={(event) => engine.setRate(Number(event.target.value))}
          >
            <option value="" disabled>
              Preset…
            </option>
            {[0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.05, 1.1, 1.15, 1.2].map(
              (rate) => (
                <option key={rate} value={rate}>
                  {rate.toFixed(2)}x
                </option>
              ),
            )}
          </select>
          <button
            type="button"
            className="glass-button"
            onClick={() => engine.setRate(1)}
          >
            1.00× Unity
          </button>
        </div>
      </div>
    </section>
  );
}
