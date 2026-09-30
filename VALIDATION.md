# AudioLab v2 verification

Date: 2026-09-30. This record distinguishes browser verification from checks that need physical iPhone hardware.

## Completed

- Production TypeScript/Vite build passes; generated service worker passes JavaScript syntax validation.
- All 17 automated checks pass. They cover original sample-rate metadata, stale/rapid load cancellation, serialized decoding, pause/clear during loading, bypassed processing connections, stacked EQ headroom, stereo/mono peak protection, and offline-cache behavior. Installation embeds the matching built HTML and reloads public assets to prevent mixed releases from HTTP caches.
- Dependency audit: zero known vulnerabilities reported for the installed dependency tree.
- Chromium browser: imported and played synthetic 45-second stereo WAVs with a 44,100 Hz source. The 48,000 Hz output context correctly reports resampling. Speed changes, EQ edits, and Auditorium reverb operate without reported browser errors.
- Mobile layouts checked at 393 × 852, 852 × 393, and 320 × 568. Settings have one modal and one scroll region; headers remain separate from scrolling content. No horizontal overflow was observed.
- Scope loop stops behind settings, in dark-screen mode, when paused, and when scrolled out of view. It resumes when visible during playback. The display control retains the 120 Hz maximum.
- Native modal focus containment, Escape dismissal, and focus restoration checked.
- Two-track queue priority and consumption, previous-track navigation, shuffle advancement, and stopping after a shuffle cycle with repeat off checked.
- Paused update activates and reloads the new release while preserving library/settings. An update-handler race and stale HTTP-cached HTML were found and corrected during verification.
- Preview server stopped, its listening port confirmed closed, then browser reloaded successfully from the installed shell. Stored audio, the output worklet, fonts, EQ settings, and previously used reverb remained available offline.
- A separate fresh offline start verified the bundled output guard without its former external module request; no protection-unavailable notice or browser error appeared. The disabled scope remains completely unmounted after reload.
- Original local checkout is clean. Original remote `main` remains `f05263b1d96163c438eb467704b847776bab1dc0`; original `gh-pages` remains `9b196c175c62a2e0f47d25a29990344f49a56dd9`.

## Physical iPhone check still required

1. Open the v2 URL in Safari and add it to the Home Screen. Verify it is clearly a separate v2 installation.
2. Import one ordinary song from Files. Test play, pause/resume, seeking, fast switching, and rates of 0.75× and 1.25×. Pitch should move with speed without stuttering.
3. Open EQ, scroll to reverb, expand advanced controls, edit a frequency with the keyboard, and rotate the phone. The close control must remain reachable and the page behind the menu must not move.
4. Check the linear scope at 120, 60, and 30 Hz. Actual cadence depends on Safari, the display, and device power settings; the browser check cannot establish physical 120 Hz output.
5. Compare ten minutes of the same song in v1 and v2 at the same brightness, output route, rate, and effects. Allow the phone to cool between runs. Repeat v2 with the scope off to separate graphics load from audio processing. No thermal improvement percentage has been claimed.
6. Test headphones/Bluetooth, screen locking, backgrounding, and returning to the app. iOS controls background audio; this web release does not promise native-app continuity.
7. Use a reverb online, then reload v2 without connectivity and play it again. Visit v1 only after this check: its existing global service-worker unregister behavior can remove v2's offline registration on the shared GitHub Pages origin.

Apple playback and lifecycle logic have automated coverage using Web Audio test doubles; those checks do not substitute for Safari device testing. Very long/high-rate files remain a memory limitation of the Apple buffered path.
