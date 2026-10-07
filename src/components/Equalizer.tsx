import { useState, type CSSProperties } from "react";
import { bandSupportsGain, formatEqFrequency } from "../audioFxPresets";
import type { EqBand, PlaybackState } from "../types";
import type { TapeAudioEngine } from "../audioEngine";
import { EqCurve } from "./EqCurve";
import { ICON_MINUS, ICON_PLUS } from "./Icons";
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
const factory = ["Flat", "Bass Boost", "Vocal", "Treble Boost"];
const custom = ["Custom 1", "Custom 2", "Custom 3"];
const formatGain = (gain: number) =>
  `${gain > 0 ? "+" : gain < 0 ? "−" : ""}${Math.abs(gain).toFixed(1)} dB`;
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
  const chip = (name: string, label = name) => (
    <button
      key={name}
      type="button"
      className="chip"
      aria-pressed={selection === name}
      onClick={() => onSelect(name)}
    >
      {label}
    </button>
  );
  return (
    <section className="fx-section">
      <div className="fx-heading">
        <h4>Equalizer</h4>
        <label className="switch-label">
          <span>Enabled</span>
          <input
            type="checkbox"
            role="switch"
            className="switch"
            checked={playback.eqEnabled}
            onChange={(event) => engine.setEqEnabled(event.target.checked)}
          />
        </label>
      </div>
      <div className="group group--padded">
        <EqCurve bands={playback.eqBands} enabled={playback.eqEnabled} />
        <div className="chip-block" role="group" aria-label="EQ preset">
          <p className="group-caption">Preset</p>
          <div className="chip-grid">{factory.map((name) => chip(name))}</div>
          <div className="chip-grid chip-grid--three">
            {custom.map((name) => chip(name))}
          </div>
        </div>
      </div>
      <p className="footnote">
        Move a slider toward − to soften a range or + to bring it forward.
        Changes are saved to your custom preset.
      </p>
      {!playback.eqEnabled && (
        <p className="footnote is-notice">
          EQ is bypassed. Enable it to hear your changes.
        </p>
      )}
      <div className="group">
        {playback.eqBands
          .filter((band) => bandSupportsGain(band.type))
          .map((band) => {
            const position = (band.gainDb + 18) / 36;
            return (
              <div
                key={band.id}
                className={`eq-row ${band.enabled ? "" : "is-bypassed"}`}
              >
                <label htmlFor={`gain-${band.id}`} className="eq-row-head">
                  <strong className="eq-name">{names[band.id]}</strong>
                  <span className="eq-freq">
                    {!band.enabled ? "Bypassed · " : ""}
                    {formatEqFrequency(band.frequency)}
                  </span>
                  <span
                    className={`eq-gain ${band.gainDb > 0 ? "is-boost" : band.gainDb < 0 ? "is-cut" : ""}`}
                  >
                    {formatGain(band.gainDb)}
                  </span>
                </label>
                <div className="eq-control">
                  <button
                    type="button"
                    className="step-button"
                    aria-label={`Reduce ${names[band.id]}`}
                    onClick={() =>
                      onEdit(band.id, {
                        gainDb: Math.max(-18, band.gainDb - 0.5),
                      })
                    }
                  >
                    {ICON_MINUS}
                  </button>
                  <input
                    id={`gain-${band.id}`}
                    className="range is-bipolar"
                    type="range"
                    min={-18}
                    max={18}
                    step={0.5}
                    value={band.gainDb}
                    aria-valuetext={formatGain(band.gainDb)}
                    style={
                      {
                        "--from": Math.min(position, 0.5),
                        "--to": Math.max(position, 0.5),
                      } as CSSProperties
                    }
                    onChange={(event) =>
                      onEdit(band.id, { gainDb: Number(event.target.value) })
                    }
                  />
                  <button
                    type="button"
                    className="step-button"
                    aria-label={`Increase ${names[band.id]}`}
                    onClick={() =>
                      onEdit(band.id, {
                        gainDb: Math.min(18, band.gainDb + 0.5),
                      })
                    }
                  >
                    {ICON_PLUS}
                  </button>
                </div>
              </div>
            );
          })}
      </div>
      <div className="button-row">
        <button
          type="button"
          className="glass-button"
          onClick={() => onSelect("Flat")}
        >
          Reset to flat
        </button>
        <button
          type="button"
          className="glass-button"
          aria-expanded={advanced}
          onClick={() => setAdvanced((value) => !value)}
        >
          {advanced ? "Hide advanced" : "Advanced controls"}
        </button>
      </div>
      {advanced && (
        <div className="group advanced">
          {playback.eqBands.map((band) => (
            <details key={band.id} className="advanced-band">
              <summary>
                <span className="advanced-name">{names[band.id]}</span>
                <span className="advanced-meta">
                  {band.enabled ? "" : "Off · "}
                  {formatEqFrequency(band.frequency)}
                </span>
              </summary>
              <div className="advanced-body">
                <label className="row">
                  <span className="row-label">Use this band</span>
                  <input
                    type="checkbox"
                    role="switch"
                    className="switch"
                    checked={band.enabled}
                    onChange={(event) =>
                      onEdit(band.id, { enabled: event.target.checked })
                    }
                  />
                </label>
                <div className="row">
                  <label className="row-label" htmlFor={`freq-${band.id}`}>
                    Frequency (Hz)
                  </label>
                  <input
                    id={`freq-${band.id}`}
                    className="field-input"
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
                </div>
                <label className="row row--stack">
                  <span className="row-head">
                    <span className="row-label">Q / resonance</span>
                    <output className="row-value">{band.q.toFixed(1)}</output>
                  </span>
                  <input
                    className="range"
                    type="range"
                    min={0.1}
                    max={18}
                    step={0.1}
                    value={band.q}
                    style={{ "--p": (band.q - 0.1) / 17.9 } as CSSProperties}
                    onChange={(event) =>
                      onEdit(band.id, { q: Number(event.target.value) })
                    }
                  />
                </label>
              </div>
            </details>
          ))}
        </div>
      )}
      <p className="footnote">
        Automatic headroom: −{playback.headroomDb.toFixed(1)} dB. Output
        protection handles unexpected peaks.
      </p>
    </section>
  );
}
