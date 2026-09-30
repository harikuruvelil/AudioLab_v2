import { useState } from "react";
import { bandSupportsGain, formatEqFrequency } from "../audioFxPresets";
import type { EqBand, PlaybackState } from "../types";
import type { TapeAudioEngine } from "../audioEngine";
const names: Record<string, string> = {
  low: "Bass",
  b1: "Warmth",
  b2: "Body",
  b3: "Presence",
  b4: "Detail",
  high: "Air",
  hp: "Low cut",
  lp: "High cut",
};
export function Equalizer({
  engine,
  playback,
  onEdit,
  selection,
  onSelect,
}: {
  engine: TapeAudioEngine;
  playback: PlaybackState;
  onEdit: (id: string, patch: Partial<EqBand>) => void;
  selection: string;
  onSelect: (value: string) => void;
}) {
  const [advanced, setAdvanced] = useState(false);
  return (
    <section className="v2-effect">
      <div className="v2-effect-heading">
        <h4>Equalizer</h4>
        <label className="v2-toggle">
          <input
            type="checkbox"
            checked={playback.eqEnabled}
            onChange={(event) => engine.setEqEnabled(event.target.checked)}
          />{" "}
          Enabled
        </label>
      </div>
      <label className="v2-field">
        Preset
        <select
          value={selection}
          onChange={(event) => onSelect(event.target.value)}
        >
          {[
            "Flat",
            "Bass Boost",
            "Vocal",
            "Treble Boost",
            "Custom 1",
            "Custom 2",
            "Custom 3",
          ].map((name) => (
            <option key={name}>{name}</option>
          ))}
        </select>
      </label>
      <p className="v2-help">
        Move a slider toward − to soften a range or + to bring it forward.
        Changes are saved to your custom preset.
      </p>
      {!playback.eqEnabled && (
        <p className="v2-help">
          EQ is bypassed. Enable it to hear your changes.
        </p>
      )}
      {playback.eqBands
        .filter((band) => bandSupportsGain(band.type))
        .map((band) => (
          <div key={band.id} className="v2-eq-row">
            <label htmlFor={`gain-${band.id}`}>
              <strong>{names[band.id]}</strong>
              <span>
                {!band.enabled ? "Bypassed · " : ""}
                {formatEqFrequency(band.frequency)} ·{" "}
                {band.gainDb > 0 ? "+" : ""}
                {band.gainDb.toFixed(1)} dB
              </span>
            </label>
            <div className="v2-eq-control">
              <button
                type="button"
                aria-label={`Reduce ${names[band.id]}`}
                onClick={() =>
                  onEdit(band.id, { gainDb: Math.max(-18, band.gainDb - 0.5) })
                }
              >
                −
              </button>
              <input
                id={`gain-${band.id}`}
                type="range"
                min={-18}
                max={18}
                step={0.5}
                value={band.gainDb}
                onChange={(event) =>
                  onEdit(band.id, { gainDb: Number(event.target.value) })
                }
              />
              <button
                type="button"
                aria-label={`Increase ${names[band.id]}`}
                onClick={() =>
                  onEdit(band.id, { gainDb: Math.min(18, band.gainDb + 0.5) })
                }
              >
                +
              </button>
            </div>
          </div>
        ))}
      <div className="v2-button-row">
        <button
          type="button"
          className="transport-button"
          onClick={() => onSelect("Flat")}
        >
          Reset to flat
        </button>
        <button
          type="button"
          className="transport-button"
          aria-expanded={advanced}
          onClick={() => setAdvanced((value) => !value)}
        >
          {advanced ? "Hide advanced" : "Advanced controls"}
        </button>
      </div>
      {advanced && (
        <div className="v2-advanced">
          {playback.eqBands.map((band) => (
            <details key={band.id}>
              <summary>
                {names[band.id]} · {formatEqFrequency(band.frequency)}
              </summary>
              <label className="v2-toggle">
                <input
                  type="checkbox"
                  checked={band.enabled}
                  onChange={(event) =>
                    onEdit(band.id, { enabled: event.target.checked })
                  }
                />
                Use this band
              </label>
              <label className="v2-field">
                Frequency (Hz)
                <input
                  type="number"
                  inputMode="decimal"
                  min={20}
                  max={20000}
                  step={10}
                  value={Math.round(band.frequency)}
                  onChange={(event) => {
                    if (event.target.value)
                      onEdit(band.id, {
                        frequency: Number(event.target.value),
                      });
                  }}
                />
              </label>
              <label className="v2-field">
                Q / resonance
                <input
                  type="range"
                  min={0.1}
                  max={18}
                  step={0.1}
                  value={band.q}
                  onChange={(event) =>
                    onEdit(band.id, { q: Number(event.target.value) })
                  }
                />
                <output>{band.q.toFixed(1)}</output>
              </label>
            </details>
          ))}
        </div>
      )}
      <p className="v2-help">
        Automatic headroom: −{playback.headroomDb.toFixed(1)} dB. Output
        protection handles unexpected peaks.
      </p>
    </section>
  );
}
