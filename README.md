# AudioLab v2

An independent, mobile-focused rebuild of the AudioLab web player. This first release repairs playback, energy use, mobile controls, and offline installation while retaining the original palette, typography, themes, icons, and card style. A new artistic direction is deliberately deferred.

**Live:** https://harikuruvelil.github.io/AudioLab_v2/

**Original, unchanged:** https://github.com/harikuruvelil/AudioLab_iOS

## Features

- Local audio library stored in IndexedDB. Files stay on the device; the player has no upload endpoint or analytics.
- Tape speed from 0.50× to 1.50× with linked pitch, presets, seeking, queue, shuffle, repeat, and media-session controls.
- Six named EQ sliders with large plus/minus controls, four factory presets, three custom slots, and advanced frequency/resonance controls for all eight filters.
- Optional convolution reverb using the existing room responses. Rooms are downloaded and decoded only when selected.
- One linear oscilloscope, capable of up to 120 Hz when the browser/device allows it. Alternate visualizers are removed.
- Mobile modal sheets with a fixed header, a single scrolling body, focus containment, keyboard/rotation viewport handling, and safe-area spacing.
- Separate v2 home-screen installation, library, preferences, and offline caches. Updates are applied explicitly while audio is paused and importing has finished.

## Efficiency changes

The scope reuses a 1,024-sample array, limits the line to 512 points, caps canvas density at 1.5×, and avoids glow, reflection, per-frame geometry measurement, and frequency analysis. Its animation and analyser connection stop while paused, offscreen, behind a menu, on Library, in dark-screen mode, or when the page is hidden.

Playback progress updates four times per second. Settings writes happen only after changes, with a short debounce. Disabled EQ bands and both ends of bypassed reverb are disconnected. The audio context sleeps shortly after pause. Reverb uses a two-entry decoded cache and deduplicates downloads. Switching tracks releases the old PCM and serializes decoding so rapid taps cannot start several full-file decodes together.

Apple browsers retain AudioBuffer playback for reliable linked pitch/rate with Web Audio effects. Other browsers use media-element streaming. The Apple choice is conservative because of [WebKit issue 240405](https://bugs.webkit.org/show_bug.cgi?id=240405); upstream fixes do not establish behavior on every shipped iOS version. Hardware validation can inform a later streaming rollout.

## Audio correctness

Quality labels compare the original WAV/FLAC header rate against the audio-context rate rather than reading the already-resampled decoded buffer. Other codecs display an unknown source rate instead of guessing. A rate match is not a claim of bit-perfect output.

Conservative gain headroom covers stacked EQ boosts. A stereo output guard adds one render quantum of delay and bounds unexpected peaks. Large EQ boosts can lower overall loudness; this is expected headroom behavior. If AudioWorklet is unavailable, the app reports it and keeps headroom, but cannot enforce the final ceiling.

## Build and publish

Use Node.js 22.12 or newer (the deployment uses Node 24):

```sh
npm ci
npm test
npm run build
npm run preview
```

The complete uploadable site is `dist/`. Upload its **contents**, including `.nojekyll`, to a separate static-site root. Relative paths allow a GitHub Pages repository subpath. HTTPS is required for the offline worker and audio worklet; opening `index.html` directly as a local file is unsupported.

The included GitHub Actions workflow builds and publishes `main` to this repository's Pages site. Repository Settings → Pages → Source must be **GitHub Actions**. Do not use the original AudioLab repository for this deployment.

## Limitations and first device check

- This release has been tested in a Chromium browser at mobile sizes. Physical iPhone thermals, actual 120 Hz rendering, iOS Files behavior, home-screen installation, Bluetooth, and lock-screen/background continuity require an iPhone test. Reduced unnecessary work does not constitute a measured temperature reduction.
- Apple playback still decodes a whole track. Very long/high-rate tracks can have a significant temporary memory cost; buffers larger than 256 MiB are rejected after decoding. Start device testing with ordinary song lengths.
- Supported extensions do not guarantee that the browser supports every encoding in those containers.
- Browser storage is device/browser-specific and can be evicted. Keep original audio files. The v1 library is not migrated or modified.
- The original v1 code unregisters all service workers on its GitHub Pages origin. Visiting v1 may therefore unregister v2's offline worker. Opening v2 online registers it again. Its library and settings remain separate. Full offline isolation would require a different origin, such as a separate custom domain; v1 was not changed to resolve this.

See [VALIDATION.md](VALIDATION.md) for the verification record and a short device checklist.

## Attribution

Existing AudioLab styling, icons, and bundled impulse responses come from `harikuruvelil/AudioLab_iOS` at `f05263b1d96163c438eb467704b847776bab1dc0`. Their upstream licensing/provenance is retained as supplied; this release adds no new license claim for those assets. Inter is bundled locally with its OFL license in `public/fonts/LICENSE.txt`.
