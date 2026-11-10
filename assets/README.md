# Desktop assets

The desktop app includes procedural fallback stickers, so custom images are
optional. The browser's public artwork lives separately in `web/`.

| Path | Used for |
| :-- | :-- |
| `memes/idea.png` | Raised index + smile |
| `memes/tongue.png` | Tongue expression |
| `memes/clingy.png` | Finger near mouth + smile |
| `memes/shock.png` | Surprised face + hands near chest |
| `photobooth/frame.png` | Overlay on each desktop shot |
| `photobooth/logo.png` | Optional strip logo |

PNG, WebP, JPG and JPEG are supported, in that lookup order. Keep the filename
stem exactly as listed; use transparent PNG for overlays and a transparent center
for frames. Restart the app after changing an image. Expression thresholds live
in `config/settings.yaml`.

Custom images remain local and are ignored by Git. Only redistribute artwork
you created or have permission to use; record third-party terms in
[THIRD_PARTY.md](../THIRD_PARTY.md).
