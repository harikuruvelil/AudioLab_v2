import { memo, useMemo } from "react";
import type { EqBand } from "../types";

const RATE = 48000;
const POINTS = 96;
const WIDTH = 320;
const HEIGHT = 112;
const RANGE_DB = 20;
const frequencies = Array.from(
  { length: POINTS },
  (_, i) => 20 * 1000 ** (i / (POINTS - 1)),
);
const angles = frequencies.map((f) => {
  const w = (2 * Math.PI * f) / RATE;
  return [Math.cos(w), Math.cos(2 * w)];
});
const GRID = [100, 1000, 10000].map((f) => ({
  f,
  x: (Math.log10(f / 20) / 3) * WIDTH,
}));
const y = (db: number) =>
  HEIGHT / 2 -
  (Math.max(-RANGE_DB, Math.min(RANGE_DB, db)) / RANGE_DB) * (HEIGHT / 2 - 8);

// Magnitude-only evaluation of the Web Audio BiquadFilterNode formulas.
function coefficients(band: EqBand) {
  const w0 = (2 * Math.PI * Math.min(band.frequency, RATE * 0.49)) / RATE;
  const cos = Math.cos(w0),
    sin = Math.sin(w0),
    A = 10 ** (band.gainDb / 40);
  if (band.type === "lowpass" || band.type === "highpass") {
    const alpha = sin / (2 * 10 ** (band.q / 20));
    const b1 = band.type === "lowpass" ? 1 - cos : -(1 + cos);
    const b0 = Math.abs(b1) / 2;
    return [b0, b1, b0, 1 + alpha, -2 * cos, 1 - alpha];
  }
  if (band.type === "peaking") {
    const alpha = sin / (2 * band.q);
    return [
      1 + alpha * A,
      -2 * cos,
      1 - alpha * A,
      1 + alpha / A,
      -2 * cos,
      1 - alpha / A,
    ];
  }
  // Web Audio shelves ignore Q and use a slope of 1.
  const s = Math.SQRT2 * Math.sqrt(A) * sin;
  if (band.type === "lowshelf")
    return [
      A * (A + 1 - (A - 1) * cos + s),
      2 * A * (A - 1 - (A + 1) * cos),
      A * (A + 1 - (A - 1) * cos - s),
      A + 1 + (A - 1) * cos + s,
      -2 * (A - 1 + (A + 1) * cos),
      A + 1 + (A - 1) * cos - s,
    ];
  return [
    A * (A + 1 + (A - 1) * cos + s),
    -2 * A * (A - 1 + (A + 1) * cos),
    A * (A + 1 + (A - 1) * cos - s),
    A + 1 - (A - 1) * cos + s,
    2 * (A - 1 - (A + 1) * cos),
    A + 1 - (A - 1) * cos - s,
  ];
}

export const EqCurve = memo(function EqCurve({
  bands,
  enabled,
}: {
  bands: EqBand[];
  enabled: boolean;
}) {
  const { line, area } = useMemo(() => {
    const total = new Float64Array(POINTS);
    for (const band of bands) {
      if (!band.enabled) continue;
      const [b0, b1, b2, a0, a1, a2] = coefficients(band);
      for (let i = 0; i < POINTS; i++) {
        const [c1, c2] = angles[i];
        const num =
          b0 * b0 + b1 * b1 + b2 * b2 + 2 * (b0 * b1 + b1 * b2) * c1 +
          2 * b0 * b2 * c2;
        const den =
          a0 * a0 + a1 * a1 + a2 * a2 + 2 * (a0 * a1 + a1 * a2) * c1 +
          2 * a0 * a2 * c2;
        total[i] += 10 * Math.log10(Math.max(1e-12, num / den));
      }
    }
    let path = "";
    for (let i = 0; i < POINTS; i++)
      path += `${i ? "L" : "M"}${((i * WIDTH) / (POINTS - 1)).toFixed(1)} ${y(total[i]).toFixed(1)}`;
    return {
      line: path,
      area: `${path}L${WIDTH} ${HEIGHT / 2}L0 ${HEIGHT / 2}Z`,
    };
  }, [bands]);
  return (
    <div className={`eq-curve ${enabled ? "" : "is-bypassed"}`} aria-hidden="true">
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none">
        <path
          className="eq-curve-grid"
          d={`${GRID.map((g) => `M${g.x} 0V${HEIGHT}`).join("")}M0 ${y(12)}H${WIDTH}M0 ${y(-12)}H${WIDTH}`}
        />
        <path className="eq-curve-zero" d={`M0 ${HEIGHT / 2}H${WIDTH}`} />
        <path className="eq-curve-area" d={area} />
        <path className="eq-curve-line" d={line} />
      </svg>
      {GRID.map((g) => (
        <span
          key={g.f}
          className="eq-curve-label"
          style={{ left: `${(g.x / WIDTH) * 100}%` }}
        >
          {g.f >= 1000 ? `${g.f / 1000}k` : g.f}
        </span>
      ))}
      <span className="eq-curve-db">+12</span>
      <span className="eq-curve-db is-low">−12</span>
    </div>
  );
});
