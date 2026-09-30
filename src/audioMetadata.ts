export async function readSourceSampleRate(blob: Blob): Promise<number | null> {
  const bytes = new Uint8Array(await blob.slice(0, 256 * 1024).arrayBuffer());
  const view = new DataView(bytes.buffer);
  const text = (offset: number, length: number) =>
    String.fromCharCode(...bytes.slice(offset, offset + length));
  if (bytes.length >= 12 && text(0, 4) === "RIFF" && text(8, 4) === "WAVE") {
    for (let offset = 12; offset + 8 <= bytes.length;) {
      const size = view.getUint32(offset + 4, true);
      if (
        text(offset, 4) === "fmt " &&
        size >= 16 &&
        offset + 24 <= bytes.length
      ) {
        const rate = view.getUint32(offset + 12, true);
        return rate >= 8000 && rate <= 768000 ? rate : null;
      }
      offset += 8 + size + (size % 2);
    }
  }
  if (bytes.length >= 26 && text(0, 4) === "fLaC" && (bytes[4] & 127) === 0) {
    const rate = (bytes[18] << 12) | (bytes[19] << 4) | (bytes[20] >> 4);
    return rate >= 8000 && rate <= 768000 ? rate : null;
  }
  return null;
}
export function requiresBufferedPlayback(
  userAgent: string,
  platform = "",
  touchPoints = 0,
): boolean {
  // WebKit issue 240405 affects tape pitch/rate with MediaElementAudioSource.
  // Keep the established buffer path on Apple until physical-device validation.
  return (
    /iPhone|iPad|iPod/.test(userAgent) ||
    (platform === "MacIntel" && touchPoints > 1) ||
    (/AppleWebKit/.test(userAgent) &&
      !/Chrome|Chromium|Edg|Android/.test(userAgent))
  );
}
export function headroomForBands(
  bands: readonly import("./types").EqBand[],
  wet: number,
): number {
  return (
    bands.reduce(
      (sum, band) =>
        !band.enabled
          ? sum
          : sum +
            Math.max(0, band.gainDb) +
            (band.type === "highpass" || band.type === "lowpass"
              ? Math.max(0, band.q)
              : 0),
      0,
    ) + (wet > 0 ? 6 : 1)
  );
}
