import { useState } from "react";
import { Oscilloscope } from "./Oscilloscope";
import {
  ICON_QUEUE,
  ICON_APPEAR,
  ICON_GEAR,
  ICON_PREV,
  ICON_PLAY,
  ICON_PAUSE,
  ICON_NEXT,
  ICON_CLOSE,
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
  const commit = () => {
    if (scrub !== null) {
      engine.seek(scrub);
      setScrub(null);
    }
  };
  return (
    <section className="screen">
      <div className="player-header">
        <div>
          <h2 className="section-title">Player</h2>
          <span
            className="quality-chip"
            title={`Source ${quality.trackHz ?? "unknown"} Hz; output ${quality.contextHz ?? "not started"} Hz`}
          >
            {label}
          </span>
          <p className="quality-format">
            {track
              ? `${getAudioFileExtension(track.filename)?.toUpperCase() ?? "Audio"}${quality.trackHz ? ` · ${quality.trackHz.toLocaleString()} Hz source` : ""}`
              : "Import a track to start"}
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="header-button"
            aria-label="Open queue"
            onClick={() => onSheet("queue")}
          >
            {ICON_QUEUE}
          </button>
          <button
            type="button"
            className="header-button"
            aria-label="Open display settings"
            onClick={() => onSheet("appearance")}
          >
            {ICON_APPEAR}
          </button>
          <button
            type="button"
            className="header-button"
            aria-label="Open audio settings"
            onClick={() => onSheet("audio")}
          >
            {ICON_GEAR}
          </button>
        </div>
      </div>
      <div className="now-playing-card">
        <p className="now-playing-label">Now playing</p>
        <h3>{track?.displayName ?? "No track selected"}</h3>
        <p>
          {playback.loading
            ? "Loading audio…"
            : track
              ? "Tape speed · linked pitch"
              : "Add local audio from Library."}
        </p>
        {playback.clipWarning && (
          <span role="status">Output peak protected</span>
        )}
      </div>
      <Oscilloscope
        engine={engine}
        playing={playback.isPlaying}
        visible={scopeVisible}
        fps={fps}
        color={color}
      />
      <label className="v2-visually-hidden" htmlFor="seek">
        Playback position
      </label>
      <input
        id="seek"
        className="seek-slider"
        type="range"
        min={0}
        max={Math.max(0.01, playback.duration)}
        step={0.01}
        value={scrub ?? playback.currentTime}
        disabled={!playback.isReady}
        onChange={(event) => setScrub(Number(event.target.value))}
        onPointerUp={commit}
        onPointerCancel={() => setScrub(null)}
        onKeyUp={commit}
        onBlur={commit}
      />
      <div className="time-row">
        <span>{formatDuration(scrub ?? playback.currentTime)}</span>
        <span>{formatDuration(playback.duration)}</span>
      </div>
      <div className="mode-row">
        <button
          type="button"
          className="mode-button"
          aria-pressed={shuffle}
          onClick={onShuffle}
        >
          Shuffle {shuffle ? "On" : "Off"}
        </button>
        <button type="button" className="mode-button" onClick={onRepeat}>
          Repeat {repeat}
        </button>
      </div>
      <div className="speed-card">
        <label htmlFor="speed" className="v2-label-row">
          <span>Speed</span>
          <strong>{playback.rate.toFixed(2)}x</strong>
        </label>
        <input
          id="speed"
          type="range"
          min={0.5}
          max={1.5}
          step={0.01}
          value={playback.rate}
          onChange={(event) => engine.setRate(Number(event.target.value))}
        />
        <p className="pitch-shift">
          Pitch shift: {semitonesFromRate(playback.rate).toFixed(2)} semitones
        </p>
        <div className="v2-button-row">
          <select
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
            className="transport-button"
            onClick={() => engine.setRate(1)}
          >
            1.0x Unity
          </button>
        </div>
      </div>
      <div className="transport-row">
        <button
          type="button"
          className="transport-button"
          aria-label="Previous track"
          disabled={!track}
          onClick={onPrev}
        >
          {ICON_PREV}
        </button>
        <button
          type="button"
          className="transport-button play-button"
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
          className="transport-button"
          aria-label="Next track"
          disabled={!track}
          onClick={onNext}
        >
          {ICON_NEXT}
        </button>
      </div>
    </section>
  );
}
