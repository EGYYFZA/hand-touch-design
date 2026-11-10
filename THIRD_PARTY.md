# Licenses and assets

The root [MIT License](LICENSE) covers project code and original EGZ artwork,
including the procedural mascot, frame illustrations and repository cover.
It does not relicense libraries, model weights, fonts, supplied images or trademarks.

## Libraries and tooling

| Material | License / source |
| :-- | :-- |
| MediaPipe Tasks Vision 0.10.35 | [Apache-2.0](licenses/Apache-2.0.txt) · [source](https://github.com/google-ai-edge/mediapipe) |
| Three.js 0.187.0 | MIT · [source](https://github.com/mrdoob/three.js) |
| Supabase JavaScript client | MIT · [source](https://github.com/supabase/supabase-js) |
| Sharp | Apache-2.0 · [source](https://github.com/lovell/sharp) |
| Playwright | Apache-2.0 · [source](https://github.com/microsoft/playwright) |
| OpenCV | Apache-2.0 · [source](https://github.com/opencv/opencv) |
| Python dependencies | Respective package licenses; see `requirements.txt` and installed package notices |

The build copies MediaPipe's runtime and the two Three.js browser modules
unmodified from their npm packages. Three.js's MIT text is included in the built
site as `licenses/Three-MIT.txt`. Playwright's browser/compositor downloads retain
their upstream notices and are not shipped as website runtime files.

The tutorial authoring package uses Three.js 0.186.1, React and React Three Fiber
(MIT), and [Remotion 4.0.539 under its own license](https://github.com/remotion-dev/remotion/blob/v4.0.539/LICENSE.md).
Check Remotion's terms for your organization before commercial rendering.
These tools are separate from the public tutorial player.

## Font

Mona Sans is by GitHub and the Mona Sans Project Authors, licensed under the
[SIL Open Font License 1.1](licenses/Mona-Sans-OFL.txt).
[Source revision](https://github.com/github/mona-sans/tree/4bc6ba8b354c36b4fb66d32cd67b4c1f2beb0a06):
`web/fonts/mona-sans.woff2` is the unmodified variable font. GitHub Universe is a
visual reference; EGZ is not affiliated with GitHub.

## Pretrained models

The unmodified [hand model](https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task)
and [face model](https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task)
are Google model bundles, separate from the project's MIT license. Review their
[upstream documentation](https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker)
and applicable terms before redistributing modified weights or claiming ownership.

## Images and privacy

The landing posters, photobooth decorations and mascot-led tutorials are original
EGZ artwork. Tutorial portraits are synthetic; no visitor photographs are included.
The website QR contains only the direct public studio URL.

The four monkey images in `web/memes/` are supplied images. Their original creator
and redistribution license have **not been verified**. They are excluded from the
MIT grant: obtain permission or replace them before redistributing those images.

Camera processing and new photos stay on the device in the default studio.
See the [privacy policy](https://egz-gesture-studio.netlify.app/privacy) and
[MediaPipe's SDK privacy notice](https://ai.google.dev/edge/mediapipe/solutions/tasks#mediapipe_tasks_privacy_notice).
