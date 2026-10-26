# Print and browser release audit

Production audit: **80/100, launchable with caveats**. The static Vercel build
and local camera/print flows pass automated checks. Physical devices, a live
Vercel deployment and historical capture review remain manual release checks.

## Blockers for broader public distribution

- Old public Git commits still contain files under captures/ and the original
  meme PNGs. Review their content and redistribution rights before advertising
  the repository as a history-sanitized release. The current tree excludes them;
  this work does not rewrite public Git history or remove existing forks.

## High-value follow-up checks

- Test a real camera and physical printer, including paper size and scaling.
  The app opens a print dialog; it cannot confirm that paper was printed.
- After importing main into Vercel, check camera permission, model loading,
  download and Print on the actual HTTPS deployment.
- Browser automation currently targets Chromium. Test Safari and mobile hardware
  before promising equivalent gesture support there. Manual controls remain
  available if model initialization fails.

## Evidence checked

- 25 Python regression tests pass, including preserved Photobooth captures,
  original generated stickers, saved-image printing and camera recovery.
- 6 Node tests pass, including a rebuild containing a deliberately stale
  synthetic capture fixture; the rebuild removes the fixture and excludes
  private workspace paths from the output.
- 6 Chromium browser tests pass: camera capture, selected-photo download/Print,
  same-origin hand/face model execution, denied permission recovery, three-shot
  strips, mobile layout/keyboard/reduced motion, and security headers.
- Print tests intercept the browser print call and inspect print-only CSS.
  They do not send jobs to a physical printer.
- Production npm dependency audit reported zero advisories in this work session.
- MIT code license, Apache license copy, third-party notices, contribution guide,
  Vercel configuration, deployment instructions and rollback instructions exist.
- GitHub Actions repeats desktop and browser checks on push/pull request.
  Check the release commit's Actions run for the remote Linux result.

## Data and deployment boundaries

The browser has no upload API, payment flow, authentication service or database.
Camera frames and captured photo blobs stay in the tab. The gallery is limited
to 12 entries and warns before closing; download PNG to keep photos permanently.
Production CSP permits same-origin application connections only. Vercel host
access logs and third-party model licenses are separate concerns, documented
in the privacy page and THIRD_PARTY.md.

The build cleans only the verified repository dist directory before copying
the web allowlist. Desktop virtual environments, captures and local original
asset backups remain excluded. The old meme files were backed up locally in
.local-assets/original-memes and replaced with stickers drawn by project code.

## Next action

Import the tested main branch into Vercel using the repository root, Framework
Preset **Other**, Build Command **npm run build**, Output Directory **dist**.
No environment variables are needed. Follow deploy-vercel.md for verification
and rollback. No Vercel deployment is claimed by this audit.
