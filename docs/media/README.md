# Repository artwork

- `cover.png`: 1280 × 640 cover using the five existing EGZ 3D posters and Mona
  Sans. It also fits GitHub's recommended social-preview dimensions.
- `website-qr.png`: high-error-correction QR containing only
  `https://egz-gesture-studio.netlify.app`, with no redirect or tracking service.

From the repository root, with project dependencies and Playwright Chromium installed:

```sh
node tools/render-repo-media.mjs
python tools/render-repo-qr.py
```

The QR script uses the desktop environment's OpenCV and checks decoding both at
full size and at the README's 180-pixel display size. The cover renderer uses
local files only. Neither tool reads camera images or deployment credentials.

Original EGZ artwork follows the root MIT license; Mona Sans retains its OFL
license. See [THIRD_PARTY.md](../../THIRD_PARTY.md).
