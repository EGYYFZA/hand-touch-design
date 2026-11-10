# Python desktop app

The desktop app uses OpenCV and MediaPipe. It has its own window and shortcuts;
the browser studio is a separate interface.

Requires **Python 3.11–3.12**. On Windows:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe app.py
```

On Linux/macOS, use `python3.12 -m venv .venv` and `.venv/bin/python` for the
remaining commands. Install platform camera/OpenCV system libraries as needed.

Use `--camera 1` for another camera or `--config config` for a settings folder.
The supplied hand and face model files are in `models/`. Missing models are
downloaded from Google's official model host; an internet connection is then needed.

## Controls

- `1`–`4`: switch modes; `Tab`/`Enter` or the mouse operate menus.
- `S`: save; `P`: print a saved photo; `Q`/`Escape`: exit.
- Photobooth: hold a fist or press Space to start; `R` cancels.
- Painting: pinch to draw; `[`/`]` changes brush size, `E` toggles eraser,
  `C` changes color and `R` clears the canvas.
- Memes: `M` shows expression diagnostics; `+`/`-` resizes the sticker.

Photos and print previews are stored locally in `captures/` and are excluded
from Git. Custom desktop assets are described in [assets/README.md](../assets/README.md).

If the camera cannot open, check OS permissions, its privacy shutter, and whether
another app is using it. Camera interruption pauses capture. Resolve pending
unsaved photos before closing the application.

Run tests with `.venv/Scripts/python.exe -m unittest discover -s tests -v`
(use `.venv/bin/python` on Linux/macOS). Tests do not operate a physical printer.
