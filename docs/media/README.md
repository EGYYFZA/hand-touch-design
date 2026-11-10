# Repository media

- `cover.png`: screenshot of the public EGZ studio landing page at 1440 × 900,
  showing the existing 3D scene. Camera access was not enabled.
- `website-qr.png`: high-error-correction QR containing only
  `https://egz-gesture-studio.netlify.app`, with no redirect or tracking service.

To refresh the cover, open the public website in a clean browser at 1440 × 900,
wait for the splash screen to close and the 3D scene to load, then capture the
viewport without activating the camera. Keep the screenshot free of browser
chrome, private data and added interface elements.

To regenerate the QR with the desktop environment's OpenCV installed:

```sh
python tools/render-repo-qr.py
```

The QR script checks decoding at full size and at the README's 180-pixel display
size. Original EGZ artwork follows the root MIT license; Mona Sans retains its
OFL license. See [THIRD_PARTY.md](../../THIRD_PARTY.md).
