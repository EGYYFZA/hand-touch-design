# EGZ tutorial renderer

This isolated, private tooling package renders the original five 3D feature tutorials. It is not installed by the website build and is never included in browser or backend bundles. The static build copies only the generated MP4/JPEG/WebVTT allowlist under `web/tutorials/`.

From the repository root:

```powershell
npm.cmd ci --prefix tools/tutorial-video --ignore-scripts
npm.cmd audit --prefix tools/tutorial-video
npm.cmd exec --no -- playwright install chromium
npm.cmd run tutorials:render
npm.cmd run build
```

Render selected scenes with `node tools/tutorial-video/render.mjs painting photobooth`. Timeline, geometry and lighting live in `index.jsx`; chapter copy lives in `web/tutorial-catalog.js`. All animation is driven by Remotion's current frame. Edit the chapter copy before rendering so MP4 labels, captions and browser instructions remain synchronized.

The renderer uses the root project's installed Playwright Chromium. Set `REMOTION_BROWSER_EXECUTABLE` to use another compatible Chromium executable. On native Windows ARM, Remotion's automatic browser/compositor discovery is unavailable. Windows' x64 emulation can run the official matching compositor:

```powershell
New-Item -ItemType Directory -Force .cache/tutorial-compositor
npm.cmd pack @remotion/compositor-win32-x64-msvc@4.0.539 --pack-destination .cache/tutorial-compositor
tar.exe -xf .cache/tutorial-compositor/remotion-compositor-win32-x64-msvc-4.0.539.tgz -C .cache/tutorial-compositor
npm.cmd run tutorials:render
```

Only the validated official version is used. The local cache is ignored. Other platforms use Remotion's matching compositor by default; `REMOTION_BINARIES_DIR` can explicitly select a compatible installed compositor. Never point it to untrusted binaries.

The video source and generated artwork are original to EGZ. Third-party tooling retains its own licenses, including [Remotion's license](https://www.remotion.dev/license). The Zod override pins the patched version for transitive tooling; it is not part of the production application.
