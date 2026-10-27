# EGZ production audit

Production audit: **80/100, launchable with caveats**. The minimal fullscreen UI and automated camera flows pass; physical-camera acceptance and deployed HTTPS verification remain release checks.

Reviewed on **28 October 2026 (Asia/Jakarta)**. Application baseline: `8e40159`, merged in [PR #7](https://github.com/EGYYFZA/hand-touch-design/pull/7). This report supersedes the earlier print-release audit. Scope: browser studio, build/deployment boundaries, and existing desktop CI coverage. No external audit service or remote scanner received repository contents.

## Blockers

No reproducible application blocker remains in the tested paths. This verdict covers a controlled rollout, not validated gesture accuracy across real users and devices.

Before broader public distribution, resolve the already documented provenance of the supplied monkey images and review historical camera captures. Current static output excludes captures and private originals; old Git commits still contain capture paths. No history rewrite was performed.

## UI and recovery changes verified

- Onboarding and mode selection are centered. Redundant slogans, duplicate instructions, the separate introductory sidebar, and FPS decoration were removed.
- The camera fills one viewport. Navigation floats above it; contextual tools sit at the right and primary actions are centered below. Tool labels, gaps, and button sizes remain consistent.
- Painting retains the hue and saturation/brightness picker, gesture selection, shapes, undo, and keyboard alternatives. Fewer words do not remove calibration or error recovery.
- On a phone, stopping the camera hides the tool panel so it cannot cover the restart button. Resuming a paused photobooth session still produces one three-photo strip.
- The gallery shows one photo at a time without page scrolling. Download, printing, deletion confirmation, and focus restoration remain available.

## Evidence checked

[GitHub Actions Checks on the merged application commit](https://github.com/EGYYFZA/hand-touch-design/actions/runs/40545381137) completed successfully:

| Check | Result |
| --- | --- |
| Python regression suite | 25 passed |
| Node gesture/build tests | 13 passed |
| Chromium browser tests | 16 passed |
| Clean dependency install and static build | Passed |

Local checks also passed: `npm.cmd test`, `npm.cmd run build`, responsive/keyboard checks, and mobile camera interruption/recovery. The first local full browser run had one 15-second photobooth timeout; that test passed when rerun in isolation without relaxing its timeout or changing capture logic. The subsequent complete GitHub CI suite passed. Real-device latency is still unmeasured.

Seven viewport sizes were checked: 375x667, 390x844, 768x900, 1024x768, 1366x768, 1440x900, and 844x390. Assertions cover camera bounds, absence of document overflow, controls within the viewport, and tool-panel separation from header/actions. Setup/menu centering is asserted at the default desktop viewport. Screenshots of setup, menu, painting/picker and mobile controls were inspected under `docs/ui-preview/egz-minimal-*.png`.

Gesture tests use deterministic landmark fixtures. Separate tests run the actual same-origin MediaPipe hand and face workers on synthetic camera frames. Other checks cover permission denial, stale results, three shot notifications, PNG export retry with exact retained pixels, gallery selection/download/print, and reduced motion. These are not measurements of human recognition accuracy or a complete accessibility certification.

Reviewed files: `web/index.html`, `web/styles.css`, `web/app.js`, `web/gestures.js`, `web/vision-worker.js`, browser/build tests, `package.json`, `tools/build-web.mjs`, `tools/serve-web.mjs`, `vercel.json`, `.github/workflows/checks.yml`, `.gitignore`, `.vercelignore`, `THIRD_PARTY.md`, and `docs/deploy-vercel.md`.

## Runtime and release boundaries

- No authentication service, payment flow, database, upload API, or LLM agent exists in this web release; corresponding risk lenses are not applicable.
- Camera frames and saved blobs stay in tab memory. Gallery capacity is 12 entries; closing/reloading loses undownloaded work. Export failures retain the image for retry. Camera tracks stop when the tab becomes inactive.
- Models and WASM are served from the same origin. CSP restricts application connections; permissions disable microphone and geolocation. Private workspace paths return 404 in browser tests.
- The build cleans only the verified `dist` directory. It publishes the web assets, runtime, models, and licenses. The four monkey WebP derivatives are intentionally public; their original source/license remains unrecorded in `THIRD_PARTY.md`.
- Dependencies are pinned in the lockfile. This UI refinement adds none. No fresh registry advisory scan was run, so this report makes no current zero-vulnerability claim.
- Vercel configuration and rollback to a previous deployment are documented. No migration or production secret is required. This audit did not deploy the website.

## High-value fixes and missing evidence

1. Run the four modes with real hands/faces on the intended laptop and phone, including dim lighting, dropped tracking, and sustained use. Tongue color and chest-region heuristics can miss or falsely match poses.
2. Verify camera permission, model loading, capture, download, and recovery on the actual HTTPS deployment; check a physical printer separately.
3. Test Safari/Firefox and slow devices before promising equivalent support. The browser suite currently targets Chromium.

Next action: perform a real-camera acceptance session on the intended device, then repeat capture/download on the deployed HTTPS URL. See [deployment and rollback instructions](deploy-vercel.md). Benchmarks and screenshots can be generated locally and are excluded from Git; earlier measurements were not rerun for the styling-only refinement.

## Repository privacy review, 28 October 2026

Generated screenshots, benchmark output, and superseded session audit reports
were removed from tracking while preserving local copies. Runtime models,
feature assets, source, tests, lockfiles, licenses and maintained documentation
remain. Dataset and locally trained model outputs are now ignored. Repository
tests reject ignored files if they are forced into the index.

GitHub reported zero secret-scanning alerts and zero Dependabot alerts; secret
scanning and secret push protection were enabled. A local signature scan of
4,733 historical text blobs below 2 MB found no supported provider-token or
private-key signature. The only credential-URL match was placeholder example
credentials in vendored library text;
this limited scan is not proof that all historical content is safe. Binary
content, unknown secret formats and large text blobs were not classified.

Historical paths include three camera PNGs, four capture metadata files, and
a checked-in virtual environment with local-machine paths. Latest-tree cleanup
does not erase that history. See [SECURITY.md](../SECURITY.md) for the remaining
history-removal boundary and the file publication policy.

Cleanup validation: 15 Node tests (including two repository-privacy checks) and
the static build passed locally. The 54-test application baseline above remains
identified by its original commit and CI run.
