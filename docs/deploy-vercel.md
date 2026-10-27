# Deploy GestureCanvas to Vercel

The Python app opens native OpenCV windows and talks to the local camera.
Vercel hosts the browser implementation in web/ instead. Camera capture,
MediaPipe, painting, photo strips, download and printing run in the browser.
There is no photo-upload API, database, authentication service or Python server
in the web deployment. Custom desktop joblib models are not loaded by the web app.

## Check locally

Node.js 22+ is required. On Windows PowerShell use npm.cmd when npm.ps1 is
blocked by the machine's execution policy; no policy change is needed.

```text
npm ci --ignore-scripts
npm test
npm run build
npm run dev
```

Open http://127.0.0.1:4173. Click Aktifkan kamera and grant permission. Only
localhost or HTTPS can request the camera. A browser with WebAssembly,
OffscreenCanvas and Web Workers is recommended (current Chrome/Edge).
If the model cannot load, camera capture and manual mode buttons remain usable.

## Import from GitHub

1. Select the tested main branch, or review and merge any subsequent feature
   pull request before deploying it. Configure main as the production branch.
2. In your Vercel account choose Add New → Project and import
   https://github.com/EGYYFZA/hand-touch-design.
3. Root Directory: repository root. Framework Preset: Other. No environment
   variables or secrets are needed.
4. vercel.json supplies Install Command `npm ci --ignore-scripts`, Build Command
   `npm run build`, and Output Directory `dist`.
5. Deploy. Open the HTTPS deployment, grant camera permission, capture a photo,
   download PNG and select Print on that saved photo. Test your actual printer
   and paper settings; the app opens the browser print dialog and does not
   silently submit print jobs.

Only dist/ is public. The build copies a fixed allowlist of web source,
model/runtime files and license notices. .venv/, captures/, data/, local asset
backups and desktop code are not published. Do not override Output Directory
with the repository root. No camera or print credentials should be added to
Vercel environment variables.

## Privacy and persistence

The gallery is local to the current browser tab and limited to 12 entries.
Download the PNG to keep it after leaving the page. Print uses the selected
saved image, even after the camera stops. Closing a print dialog does not prove
that printing succeeded. Closing/reloading the page discards undownloaded photos.

Models and WASM are served from the same origin. CSP blocks external application
connections; host access logs are still governed by Vercel's policies. Microphone
and geolocation are disabled by Permissions-Policy.

## Rollback

Keep the previous successful Vercel deployment. If a new deployment fails its
camera/print checks, promote the previous working deployment using Vercel's
rollback controls. For code changes, revert the feature commit through a pull
request rather than rewriting main history. No data migration is needed.

## Existing repository history

The repository was already public before this work. Its original commit includes
camera PNGs under captures/, and former meme PNGs had no provenance record. The
current tree excludes camera captures and original PNGs, but includes the four
requested monkey WebP derivatives in web/memes/. Old commits remain accessible. Review
that history before advertising a public release. Removing it would rewrite
public Git history and invalidate existing clones/forks; it is not done by this
release. A GitHub source archive of the new commit contains the cleaned
current tree, not the old history.

References:
- https://vercel.com/docs/builds/configure-a-build
- https://vercel.com/docs/project-configuration/vercel-json
- https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/web_js
- https://developer.mozilla.org/en-US/docs/Web/API/Window/print
