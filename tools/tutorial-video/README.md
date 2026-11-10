# Tutorial renderer

The five feature tutorials reuse the EGZ mascot in 3D scenes. Each silent clip is
960 × 540, 30 fps and 12 seconds long, with captions and four chapters. The
website serves the rendered videos; it does not load Remotion or React.

From the repository root:

```sh
npm ci --prefix tools/tutorial-video --ignore-scripts
npx --no-install playwright install chromium
npm run tutorials:render
npm run build
```

To render selected scenes, use `node tools/tutorial-video/render.mjs painting photobooth`.
Add `--stills` for chapter previews. Run `npm --prefix tools/tutorial-video run inspect`
to check deterministic scene state without rendering videos.

| File | Edit here for |
| :-- | :-- |
| `index.jsx` | Timeline, captions and lighting |
| `scene.mjs` | Demonstrations and character poses |
| `../../web/mascot.js` | Shared mascot geometry |
| `../../web/tutorial-catalog.js` | Chapter copy and browser instructions |

Keep captions, rendered labels and tutorial controls synchronized. Intermediate
files and previews remain local; completed MP4/JPEG/WebVTT assets are written to
`web/tutorials/` after the selected batch succeeds.

The renderer uses the installed Playwright Chromium. `REMOTION_BROWSER_EXECUTABLE`
and `REMOTION_BINARIES_DIR` can select compatible, trusted local binaries. Native
Windows ARM may require Remotion's matching Windows x64 compositor under emulation.

Review [Remotion's license](https://www.remotion.dev/license) and the project's
[third-party notices](../../THIRD_PARTY.md) before commercial rendering.
