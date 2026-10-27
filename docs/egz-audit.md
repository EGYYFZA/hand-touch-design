# EGZ: final code and experience audit

What this repo does: EGZ is a local camera studio with hand effects, painting, a three-shot photobooth, and expression-triggered monkey memes. It has a browser app and a separate Python desktop app. Assumed load: one person, one camera, one active browser tab, up to 12 saved images or strips per tab.

Date: 27 October 2026. This audit includes the requested revision to a full-viewport camera with floating controls and no studio-page scrolling.

For the subsequent minimal UI refinement and verified merged-commit CI, see the [28 October production audit](release-audit.md). Performance numbers below describe the earlier fullscreen revision.

## Verdict

No reproducible unresolved blocker was found in the checked paths. The tested browser flows pass. This is not a claim of recognition accuracy on a physical camera, a full WCAG certification, or a production deployment result.

The requested Ponytail audit covered correctness, data retention, runtime boundaries, performance, and unnecessary dependencies. The final audit pass changes no application code. Issues found during implementation were corrected and tested before this report.

## What was checked

- Browser entry point, styles, gesture functions, worker lifecycle, crop mapping, painting, gallery, export, and print paths.
- Build allowlist, localhost server, security headers, dependency manifest, CI, asset handling, and documentation.
- Desktop startup/pipeline boundaries, camera capture, storage/export, printing, photobooth, model loading, and the desktop regression suite. Desktop UI and gesture behavior were not redesigned by this web change.
- Seven viewport sizes: 375x667, 390x844, 768x900, 1024x768, 1366x768, 1440x900, and 844x390. Camera matches viewport bounds; studio document does not scroll; visible controls stay inside the viewport. A wheel event does not move the studio.
- Actual screenshots inspected for setup, painting/picker, meme result, photostrip, phone layout, and the phone gallery.

## Verification evidence

| Check | Result |
|---|---|
| Node web/build tests | 13 passed |
| Browser suite | 16 passed after the fullscreen change |
| Expanded seven-viewport and keyboard/accessibility check | Passed after the final responsive refinements |
| Desktop regression suite | 25 passed; no physical camera opened |
| Build and diff whitespace validation | Passed |
| Real MediaPipe hand and face workers | Loaded same-origin files and returned results; face model loads only on entering Meme |
| New runtime dependencies | None |

Browser tests use two distinct sources of evidence. Deterministic landmarks exercise calibration, dwell navigation, colors, shapes, meme rules, and fist capture. Separate tests run the real MediaPipe worker on Chromium's synthetic camera stream. Neither source is a human recognition dataset.

Relevant tests: `tests/browser/gestures.spec.mjs`, `tests/browser/quality.spec.mjs`, `tests/browser/studio.spec.mjs`, and `tests/web/interaction.test.mjs`.

## Resolved issues and final behavior

1. Menu selection used to be absent on the web. Calibration now checks two open hands, then a pointing target. Pointer movement is interpolated on animation frames; a held target activates once. A new control appearing under an unmoved finger cannot activate automatically. Stale worker results are discarded. See `web/app.js` (`trackPointer`, `gestureControls`) and `web/gestures.js` (`DwellSelector`, `smoothPoint`).
2. Small-screen layouts overflowed, and the old page needed scrolling to reach tools/results. The camera now fills the viewport. Menus and tools float over it. The color picker is a separate popup, and the native gallery dialog shows one photo at a time. Keyboard focus is constrained by the native dialog and returns on close. See `web/styles.css`, `web/index.html`, and `web/app.js` (`showGalleryPhoto`, `openGallery`).
3. Fullscreen camera cropping could have misaligned mouse painting or exported a different composition. Cover coordinates and exported crop now share the visible camera geometry. See `canvasPoint` in `web/gestures.js` and `visibleCameraRect` in `web/app.js`.
4. Lost tracking could have committed a shape. It now cancels the preview; an observed release with both hands visible commits it. A closed fist does not draw a brush stroke. One undo restores the preceding change, including clearing the canvas.
5. A PNG encoding failure could have lost a completed photostrip. The exact canvas now remains in memory and can be retried after the camera stops. The regression deliberately fails encoding, retries, and compares the recovered pixels. See `savePhoto` in `web/app.js`.
6. Original monkey assets were previously replaced with text. The four requested images now load from the optimized local WebP files. Clingy requires a pointing finger near the mouth and a smile; Idea requires a raised finger and a smile; Shock requires the chest region plus surprise; Tongue also requires a smile. No manual meme override bypasses these conditions.

## Performance

See `.ecc/benchmarks/egz-2026-10-27.json`. Reproduce with `node tools/benchmark-web.mjs` while the localhost server is running.

- Initial transfer: 216,386 bytes, eight requests, excluding on-demand models/WASM.
- Three localhost loads: FCP/LCP 140-164 ms; CLS 0.
- Measured worker round-trip after warmup: hand path p50 58.0 ms / p95 70.9 ms; hand-plus-face path p50 63.8 ms / p95 88.7 ms.
- App and gesture JavaScript together: about 14.2 KB gzip. These numbers exclude the MediaPipe runtime and model files.
- Hand model: 7.82 MB; face model: 3.76 MB. Four monkey images together: 128,976 bytes.
- No page errors occurred in the benchmark. The worker keeps only one inference in flight; the gallery is bounded to 12 entries and deleted object URLs are revoked.

These are unthrottled local measurements with warm OS cache and synthetic camera pixels. A stream without people does not measure worst-case human inference. The intentional 800 ms selection hold is separate from render/inference latency. Field INP and real-world mobile/network performance were not measured.

## Agent architecture audit

Not applicable to an LLM agent stack. Source searches found no prompt assembly, LLM provider calls, tool-call router, conversational memory, or hidden repair-agent loop. MediaPipe is a computer-vision runtime. Its worker execution, stale results, UI rendering, and session persistence were checked through the ordinary runtime tests above. The machine-readable assessment is `egz-agent-architecture-audit.json`.

## Documented limits

- Tongue uses a color heuristic; the chest region is estimated relative to the face. They are explicitly marked `shortcut:` in code. Lighting, occlusion, lip color, and pose can cause false or missed matches. No accuracy percentage is asserted.
- “Calibration” checks hand visibility and the pointing interaction; it does not train a personalized recognition model.
- Camera permission and the browser/OS print dialog require their native user interactions. Studio navigation after activation can use gestures.
- Photos remain in tab memory until downloaded. Reloading/closing loses undownloaded work despite the before-unload prompt.
- Source attribution for the user-provided monkey images is recorded as unknown in `THIRD_PARTY.md`; use of the supplied images does not relicense them as project code.

Verdict: the implementation is ready for local use and physical-camera acceptance testing within the stated limits.

Not checked: live human gesture accuracy, physical webcam calibration, actual printer output, Safari/Firefox, field INP, long-session thermal behavior, production deployment, and every unchanged desktop rendering/training file. No new framework, cloud inference service, or unrelated feature was added.
