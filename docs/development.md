# Development

Use Node.js 22+ for the browser app. Install locked dependencies with
`npm ci --ignore-scripts`, then run `npm run dev`. The local server binds to
`http://127.0.0.1:4173`. Backend credentials are not needed for the public studio.

## Source layout

| Path | Purpose |
| :-- | :-- |
| `web/` | Browser UI, gestures, local gallery, 3D scene and public media |
| `server/`, `api/`, `netlify/` | Optional account/archive service and hosting adapters |
| `supabase/` | Database schema, authorization tests and retention function |
| `core/`, `effects/`, `gestures/`, `modes/`, `render/`, `storage/` | Python desktop app |
| `config/` | Shared settings and security headers |
| `tests/` | Unit and browser regression suites |
| `tools/` | Build, preview, media and validation utilities |
| `docs/` | Maintained guides and repository presentation assets |

## Checks

```sh
npm test
npm run build
npx --no-install playwright install chromium
npm run test:e2e
```

`npm run audit:repository` checks available source/history for private paths and
secret signatures without uploading code. CI also checks dependencies, desktop
tests, tutorial scene state and [isolated API security fixtures](security-sandbox.md).
Camera tests use synthetic input; check actual cameras and printers separately.

## Media

The landing character is procedural artwork in `web/mascot.js`. Run the local
demo with `npm run dev:demo`, then `npm run home:poster` to update its posters.
See the [tutorial renderer](../tools/tutorial-video/README.md) for video regeneration
and the [asset guide](../assets/README.md) for desktop custom images.

Repository artwork and its website QR live in `docs/media/`; their reproduction
steps are in [docs/media/README.md](media/README.md). Reuse synthetic examples and
original EGZ assets for public illustrations. Keep test output and operational
notes local; do not add them to the documentation index.

The build emits an explicit allowlist into a fresh `dist/`. Do not serve the
source tree or copy private files into `web/`.
