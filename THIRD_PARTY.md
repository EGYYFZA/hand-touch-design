# Third-party materials

The root MIT license covers project code and original generated UI/stickers.
It does not relicense third-party libraries, pretrained weights, trademarks,
or user photographs.

- MediaPipe Tasks Vision 0.10.35: Google / MediaPipe authors, Apache-2.0.
  Source: https://github.com/google-ai-edge/mediapipe
  npm: https://www.npmjs.com/package/@mediapipe/tasks-vision/v/0.10.35
  License text: licenses/Apache-2.0.txt. The package's prebuilt JS/WASM is
  copied unmodified by the build. Upstream package metadata identifies its
  license; the tarball does not include a separate NOTICE file.
- Hand model: https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
- Face model: https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task
  These are unmodified Google pretrained model bundles, not project-created
  assets and not covered by the project's MIT license. Consult their upstream
  documentation/model cards and applicable Google terms before redistributing
  modified models or representing ownership of them:
  https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker
  https://developers.google.com/edge/mediapipe/solutions/vision/face_landmarker
- Python dependencies retain their own package licenses. Install them from
  requirements.txt; the virtual environment is not distributed in source builds.
- Playwright is a development/test dependency under Apache-2.0. Its browser
  downloads retain their respective Chromium/FFmpeg notices and are not shipped
  in the static site.

Google's SDK privacy notice:
https://developers.google.com/edge/mediapipe/solutions/tasks#mediapipe_tasks_privacy_notice

The web build hosts model and runtime files on the same origin. Its production
Content-Security-Policy disallows external connections. No application endpoint
receives camera frames or captured images.

The four monkey images in `web/memes/` are optimized WebP copies of the
user-supplied originals in `.local-assets/original-memes/`, restored for the
requested web experience. They are not generated project stickers and are not
covered by the code's MIT license. Their original creator/license has not been
recorded. The private originals remain excluded; the four WebP derivatives are
included in the web build. No camera captures are included.
Older public Git commits may still contain original images and camera captures;
deleting files at HEAD does not remove them from history.
