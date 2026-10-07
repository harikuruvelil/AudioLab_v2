import { useRef } from "react";
import type { StorageSummary, TrackMeta } from "../types";
import { formatBytes, formatDuration } from "../utils";
import {
  ICON_NOTE,
  ICON_PLUS,
  ICON_QUEUE_ADD,
  ICON_TRASH,
  ICON_WAVEFORM,
} from "./Icons";

interface LibraryScreenProps {
  tracks: TrackMeta[];
  selectedTrackId: string | null;
  onImportFiles: (files: FileList | null) => Promise<void> | void;
  onDeleteTrack: (trackId: string) => Promise<void> | void;
  onPlayTrack: (trackId: string) => Promise<void> | void;
  onQueueTrack: (trackId: string) => void;
  storage: StorageSummary;
  importing: boolean;
}

export function LibraryScreen({
  tracks,
  selectedTrackId,
  onImportFiles,
  onDeleteTrack,
  onPlayTrack,
  onQueueTrack,
  storage,
  importing,
}: LibraryScreenProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const estimate =
    storage.usageBytes !== null && storage.quotaBytes !== null
      ? {
          line: `${formatBytes(storage.usageBytes)} of ${formatBytes(storage.quotaBytes)}`,
          share:
            storage.quotaBytes > 0
              ? Math.min(1, storage.usageBytes / storage.quotaBytes)
              : 0,
        }
      : null;
  const importButton = (className: string) => (
    <button
      type="button"
      className={className}
      disabled={importing}
      onClick={() => inputRef.current?.click()}
    >
      {ICON_PLUS}
      {importing ? "Importing…" : "Import files"}
    </button>
  );

  return (
    <section className="screen library-screen">
      <header className="screen-header">
        <div className="screen-heading">
          <p className="app-kicker">AudioLab V3</p>
          <h1 className="screen-title">Library</h1>
        </div>
        {importButton("glass-button is-prominent")}
        <input
          ref={inputRef}
          type="file"
          hidden
          multiple
          accept=".wav,.mp3,.flac,.m4a,.aac,.alac,audio/wav,audio/mpeg,audio/flac,audio/mp4,audio/aac,audio/alac"
          onChange={(event) => {
            void onImportFiles(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
      </header>

      <div className="glass storage-card">
        <div className="storage-row">
          <span>Stored in library</span>
          <strong>{formatBytes(storage.appBytes)}</strong>
        </div>
        {estimate ? (
          <>
            <div className="storage-row">
              <span>Device estimate</span>
              <strong>{estimate.line}</strong>
            </div>
            <div className="storage-meter" aria-hidden="true">
              <span style={{ width: `${Math.max(1, estimate.share * 100)}%` }} />
            </div>
          </>
        ) : (
          <p className="storage-line">
            Device estimate unavailable on this browser.
          </p>
        )}
      </div>

      {tracks.length === 0 ? (
        <div className="glass platter empty-card">
          <span className="empty-icon" aria-hidden="true">
            {ICON_NOTE}
          </span>
          <h2>No tracks yet</h2>
          <p className="empty-state">
            Import WAV, FLAC, ALAC, MP3, AAC, or M4A from the iOS Files picker.
            Files stay on this device.
          </p>
          {importButton("glass-button is-prominent")}
        </div>
      ) : (
        <>
          <p className="list-caption">
            {tracks.length} track{tracks.length === 1 ? "" : "s"}
          </p>
          <ul className="glass track-list">
            {tracks.map((track) => {
              const selected = track.id === selectedTrackId;
              return (
                <li
                  key={track.id}
                  className={`track-row ${selected ? "is-selected" : ""}`}
                >
                  <button
                    className="track-main"
                    type="button"
                    aria-current={selected ? "true" : undefined}
                    onClick={() => {
                      void onPlayTrack(track.id);
                    }}
                  >
                    <span className="track-art" aria-hidden="true">
                      {selected ? ICON_WAVEFORM : ICON_NOTE}
                    </span>
                    <span className="track-text">
                      <span className="track-title" title={track.displayName}>
                        {track.displayName}
                      </span>
                      <span className="track-subtitle">
                        {formatDuration(track.durationSeconds)} ·{" "}
                        {formatBytes(track.sizeBytes)}
                      </span>
                    </span>
                  </button>

                  <div className="track-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Queue ${track.displayName}`}
                      title="Add to queue"
                      onClick={() => {
                        onQueueTrack(track.id);
                      }}
                    >
                      {ICON_QUEUE_ADD}
                    </button>

                    <button
                      type="button"
                      className="icon-button is-destructive"
                      aria-label={`Delete ${track.displayName}`}
                      title="Delete"
                      onClick={() => {
                        const ok = window.confirm(
                          `Delete "${track.displayName}" from your library?`,
                        );
                        if (ok) {
                          void onDeleteTrack(track.id);
                        }
                      }}
                    >
                      {ICON_TRASH}
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
