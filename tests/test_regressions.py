"""Jalankan: python -m unittest discover -s tests -v. Tidak membuka kamera."""
from __future__ import annotations

import io
import tempfile
import time
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock, patch

import cv2
import numpy as np

from core.camera import CameraSource
from core.face import FaceData
from core.filters import OneEuroFilter
from core.tracker import HandTracker
from core.pipeline import Application, MODES, load_yaml
from gestures.engine import GestureState, TwoFingerTap
from modes.base import AppContext
from modes.meme import MemeMode, ORDER
from modes.painting import PaintingMode
from modes.photobooth import PhotoboothMode
from render import theme as T
from render.page import Page
from storage.assets import AssetLibrary
from storage.exporter import Exporter
from storage.printer import print_photo
from tools import train_model


def context(folder: str = "captures") -> AppContext:
    return AppContext(assets=AssetLibrary(), exporter=Exporter(folder), frame_size=(640, 360))


def application(ctx: AppContext) -> Application:
    app = Application.__new__(Application)
    app.ctx = ctx
    app.camera = Mock()
    app.modes = {key: cls(ctx) for key, cls in MODES.items()}
    app.active_id = "free"
    app.page = Page(load_yaml("config/menu.yaml")["items"], reduced_motion=True)
    app._fps = 30.0
    app._toast = ""
    app._toast_until = 0.0
    app._toast_error = False
    app._camera_message = ""
    app._pending_control = None
    app._mouse_hover = None
    return app


class CameraTests(unittest.TestCase):
    def test_failed_reads_clear_frame_and_back_off(self):
        camera = CameraSource()
        camera._frame = np.zeros((2, 2, 3), np.uint8)
        camera._last_frame_at = time.monotonic()
        camera._running = True
        def fail():
            camera._running = False
            return False, None
        camera._cap = Mock()
        camera._cap.read.side_effect = fail
        camera._stop_event = Mock()
        camera._loop()
        self.assertIsNone(camera.read())
        camera._stop_event.wait.assert_called_once_with(0.05)

    def test_blocked_capture_expires_and_returns_copies(self):
        camera = CameraSource()
        camera._frame = np.zeros((2, 2, 3), np.uint8)
        camera._last_frame_at = time.monotonic()
        frame = camera.read()
        frame[:] = 255
        self.assertFalse(camera._frame.any())
        camera._last_frame_at -= 2
        self.assertIsNone(camera.read())

    def test_success_after_failure_recovers(self):
        camera = CameraSource(mirror=False)
        camera._running = True
        frame = np.ones((2, 2, 3), np.uint8)
        reads = iter([(False, None), (True, frame)])
        def read():
            result = next(reads)
            if result[0]:
                camera._running = False
            return result
        camera._cap = Mock()
        camera._cap.read.side_effect = read
        camera._stop_event = Mock()
        camera._loop()
        np.testing.assert_array_equal(camera.read(), frame)


class CaptureTests(unittest.TestCase):
    def test_failed_photobooth_save_retains_shots_until_retry(self):
        with tempfile.TemporaryDirectory() as folder:
            ctx = context(folder)
            app = application(ctx)
            app.active_id = "photobooth"
            photo = app.modes["photobooth"]
            photo.shots = [np.zeros((360, 640, 3), np.uint8) for _ in range(3)]
            with patch.object(ctx.exporter, "save", side_effect=OSError("disk full")):
                photo._finish()
            self.assertEqual(photo.phase, "error")
            with patch("modes.photobooth.time.perf_counter", return_value=time.perf_counter() + 100):
                photo.update(np.zeros((360, 640, 3), np.uint8), GestureState())
            app.switch_to("painting")
            app.switch_to("photobooth")
            self.assertEqual(len(photo.shots), 3)
            self.assertIsNotNone(photo._strip)
            self.assertFalse(app._handle_key(27, None))
            app._handle_key(ord("s"), None)
            self.assertEqual(photo.phase, "review")
            self.assertEqual(len(list(Path(folder).glob("*.png"))), 1)
            self.assertEqual(len(list(Path(folder).glob("*.json"))), 1)

    def test_explicit_discard_allows_exit(self):
        app = application(context())
        photo = app.modes["photobooth"]
        photo.phase = "error"
        photo.shots = [np.ones((2, 2, 3), np.uint8)]
        self.assertFalse(app._handle_key(27, None))
        self.assertEqual(app.active_id, "photobooth")
        app._handle_key(ord("r"), None)
        self.assertEqual(photo.shots, [])
        self.assertTrue(app._handle_key(27, None))

    def test_camera_wait_pauses_countdown(self):
        photo = PhotoboothMode(context())
        photo.start()
        deadline = photo._deadline
        photo.on_camera_wait(12)
        self.assertEqual(photo._deadline, deadline + 12)
        self.assertEqual(photo.shots, [])

    def test_painting_snapshot_matches_preview(self):
        mode = PaintingMode(context())
        mode.canvas[:] = 100
        mode.mask[:] = 128
        preview = mode.update(np.zeros((360, 640, 3), np.uint8), GestureState())
        snapshot, _ = mode.snapshot(preview.copy())
        np.testing.assert_array_equal(snapshot, preview)

    def test_missing_camera_cannot_save_stale_preview(self):
        app = application(context())
        with patch.object(app.ctx.exporter, "save") as save:
            app._handle_key(ord("s"), None)
            save.assert_not_called()
        self.assertTrue(app._toast_error)

    def test_missing_camera_cannot_start_session(self):
        app = application(context())
        app.active_id = "photobooth"
        app._handle_key(ord(" "), None)
        self.assertEqual(app.modes["photobooth"].phase, "idle")


class SmoothingTests(unittest.TestCase):
    def test_reappearing_hand_does_not_inherit_old_position(self):
        tracker = HandTracker.__new__(HandTracker)
        tracker._mp = SimpleNamespace(Image=lambda **kwargs: None, ImageFormat=SimpleNamespace(SRGB=1))
        tracker._last_time, tracker._stamp = time.perf_counter(), 0
        tracker._filters = {}
        tracker._smoothing_on, tracker._min_cutoff, tracker._beta = True, 0.7, 0.012
        def result(hands):
            return SimpleNamespace(
                hand_landmarks=[[SimpleNamespace(x=x, y=0.5) for _ in range(21)] for _, x in hands],
                handedness=[[SimpleNamespace(category_name=name, score=1.0)] for name, _ in hands],
            )
        tracker._landmarker = Mock()
        tracker._landmarker.detect_for_video.side_effect = [
            result([("Left", 0.1), ("Right", 0.2)]), result([("Right", 0.2)]),
            result([("Left", 0.9), ("Right", 0.2)]),
        ]
        frame = np.zeros((360, 640, 3), np.uint8)
        tracker.process(frame)
        tracker.process(frame)
        hands = tracker.process(frame)
        np.testing.assert_array_equal(hands[0].points[:, 0], [576] * 21)


class MemeTests(unittest.TestCase):
    def setUp(self):
        self.mode = MemeMode(context())
        self.mode.show_meter = False
        self.mode._draw_meme = lambda frame: frame
        self.frame = np.zeros((360, 640, 3), np.uint8)

    def tick(self, now, face=None, scores=None):
        with patch("modes.meme.time.perf_counter", return_value=now):
            if scores is None:
                self.mode.update(self.frame, GestureState(face=face))
            else:
                with patch("modes.meme._triggers", return_value=scores):
                    self.mode.update(self.frame, GestureState())

    def test_release_margin_preserves_raw_confidence(self):
        face = FaceData(tongue=0.6)
        self.tick(100, face)
        self.tick(100.2, face)
        self.assertEqual(self.mode._showing, "tongue")
        face.tongue = 0.4
        self.tick(100.3, face)
        self.assertEqual(self.mode._showing, "tongue")
        face.tongue = 0.2
        self.tick(100.4, face)
        self.assertIsNone(self.mode._showing)

    def test_candidate_change_restarts_timer(self):
        def scores(name):
            return {key: 0.8 if key == name else 0.0 for key in ORDER}
        self.tick(100, scores=scores("idea"))
        self.tick(100.2, scores=scores("shock"))
        self.assertIsNone(self.mode._showing)
        self.tick(100.4, scores=scores("shock"))
        self.assertEqual(self.mode._showing, "shock")

    def test_ineligible_high_score_does_not_hide_eligible_candidate(self):
        scores = {"tongue": 0.44, "idea": 0.4, "shock": 0.0, "clingy": 0.0}
        self.tick(100, scores=scores)
        self.tick(100.2, scores=scores)
        self.assertEqual(self.mode._showing, "idea")

    def test_no_face_status_is_truthful(self):
        self.tick(100)
        self.assertIn("belum terlihat", self.mode.status())


class PrintTests(unittest.TestCase):
    def test_default_memes_do_not_require_external_images(self):
        with tempfile.TemporaryDirectory() as folder:
            library = AssetLibrary(folder)
            for name in ("idea", "tongue", "clingy", "shock"):
                image = library.sticker("memes", name)
                self.assertEqual(image.shape, (320, 320, 4))
                self.assertGreater(np.count_nonzero(image[:, :, 3]), 1000)

    def test_saved_png_opens_self_contained_print_preview(self):
        with tempfile.TemporaryDirectory() as folder:
            exporter = Exporter(folder)
            saved = exporter.save(np.zeros((20, 10, 3), np.uint8))
            self.assertEqual(exporter.last_saved, saved)
            with patch("storage.printer.webbrowser.open", return_value=True) as open_browser:
                preview = print_photo(saved)
            content = preview.read_text(encoding="utf-8")
            self.assertIn("data:image/png;base64,", content)
            self.assertIn("@media print", content)
            self.assertIn("window.print()", content)
            open_browser.assert_called_once_with(preview.resolve().as_uri())

    def test_print_rejects_missing_photo_and_browser_failure(self):
        with self.assertRaisesRegex(RuntimeError, "Simpan foto"):
            print_photo(None)
        with tempfile.TemporaryDirectory() as folder:
            saved = Exporter(folder).save(np.zeros((2, 2, 3), np.uint8))
            with patch("storage.printer.webbrowser.open", return_value=False), self.assertRaisesRegex(RuntimeError, "Browser"):
                print_photo(saved)

    def test_print_dispatch_and_buttons_without_camera(self):
        with tempfile.TemporaryDirectory() as folder:
            app = application(context(folder))
            saved = app.ctx.exporter.save(np.zeros((2, 2, 3), np.uint8))
            self.assertIn(("Print foto", ord("p")), app._actions(False))
            with patch("core.pipeline.print_photo") as print_saved:
                app._handle_key(ord("p"), None)
                print_saved.assert_called_once_with(saved)


class TrainingTests(unittest.TestCase):
    def test_valid_dataset_writes_model_and_labels(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            dataset = root / "dataset.csv"
            rows = ["label," + ",".join("f" + str(i) for i in range(42))]
            rng = np.random.default_rng(42)
            for label, center in (("fist", 0.0), ("peace", 2.0)):
                rows += [label + "," + ",".join(map(str, vector)) for vector in rng.normal(center, 0.1, (30, 42))]
            dataset.write_text("\n".join(rows) + "\n", encoding="utf-8")
            with patch.object(train_model, "DATASET", dataset), patch.object(train_model, "MODEL_OUT", root / "model.joblib"), \
                    patch.object(train_model, "LABELS_OUT", root / "labels.json"), redirect_stdout(io.StringIO()):
                self.assertEqual(train_model.main(), 0)
            self.assertTrue((root / "model.joblib").is_file())
            self.assertIn("peace", (root / "labels.json").read_text())

    def test_small_dataset_returns_guidance(self):
        with tempfile.TemporaryDirectory() as folder:
            dataset = Path(folder) / "dataset.csv"
            rows = ["label," + ",".join("f" + str(i) for i in range(42))]
            rows += [label + "," + ",".join(["0"] * 42) for label in ("fist", "fist", "peace", "peace")]
            dataset.write_text("\n".join(rows) + "\n", encoding="utf-8")
            output = io.StringIO()
            with patch.object(train_model, "DATASET", dataset), redirect_stdout(output):
                self.assertEqual(train_model.main(), 1)
            self.assertIn("Data belum cukup", output.getvalue())
            self.assertFalse((Path(folder) / "pose_model.joblib").exists())


class WorkspaceTests(unittest.TestCase):
    def run_with_keys(self, app, keys):
        app._last_time = time.perf_counter()
        app._cursor_filter = OneEuroFilter()
        app.reduced_motion = False
        app.tap = TwoFingerTap()
        app.tracker = Mock()
        app.tracker.process.return_value = []
        app.engine = Mock()
        app.engine.update.return_value = GestureState()
        app.classifier = SimpleNamespace(using_model=False)
        app._face_tracker = None
        with patch.multiple(cv2, namedWindow=Mock(), resizeWindow=Mock(), setMouseCallback=Mock(),
                            getWindowProperty=Mock(return_value=1),
                            getWindowImageRect=Mock(return_value=(0, 0, 1120, 704)),
                            imshow=Mock(), waitKey=Mock(side_effect=keys), destroyAllWindows=Mock()):
            app.run()
        app.tracker.close.assert_called_once()

    def test_main_loop_keyboard_session_and_cleanup(self):
        app = application(context())
        app.camera.read.return_value = np.zeros((360, 640, 3), np.uint8)
        app.camera.size = (640, 360)
        self.run_with_keys(app, [255, 9, 13, ord("3"), ord(" "), ord("r"), 27])
        self.assertEqual(app.active_id, "photobooth")
        self.assertEqual(app.modes["photobooth"].phase, "idle")
        app.camera.stop.assert_called_once()

    def test_main_loop_recovers_after_camera_start_failure(self):
        app = application(context())
        app.camera.start.side_effect = [RuntimeError("camera denied"), None]
        app.camera.read.side_effect = [None, np.zeros((360, 640, 3), np.uint8)]
        self.run_with_keys(app, [255, ord("c"), 27])
        self.assertEqual(app.camera.start.call_count, 2)
        self.assertEqual(app.camera.stop.call_count, 2)
        self.assertEqual(app._camera_message, "")

    def test_navigation_and_actions_share_keyboard_dispatch(self):
        app = application(context())
        app.page.focused = "painting"
        app._handle_key(13, None)
        self.assertEqual(app.active_id, "painting")
        app.page.actions = app.modes["painting"].actions()
        app.page.focused = "meme"
        app._handle_key(9, None)
        self.assertEqual(app.page.focused, ord("s"))
        with patch.object(app, "_save") as save:
            app._handle_key(13, None)
            save.assert_called_once_with(None)

    def test_viewports_controls_and_aspect_ratio(self):
        items = load_yaml("config/menu.yaml")["items"]
        for size in ((960, 640), (1120, 704)):
            page = Page(items, size, reduced_motion=True)
            page.actions = PhotoboothMode(context()).actions()
            for i, item in enumerate(items):
                x, y, w, h = page.nav_item_rect(i)
                self.assertGreaterEqual(h, 44)
                self.assertEqual(page.hit_test(x + w / 2, y + h / 2), item["id"])
            for key, (x, y, w, h) in page.action_rects():
                self.assertLessEqual(x + w, size[0] - 28)
                self.assertEqual(page.hit_test(x + w / 2, y + h / 2), key)
            image = page.render(np.full((300, 300, 3), 120, np.uint8), active_id="free",
                                hover_id="painting", mode_label="Efek Tangan", effect="Siap",
                                fps=30, hint="Petunjuk panjang " * 50, status="", using_model=False)
            self.assertEqual(image.shape, (size[1], size[0], 3))
            sx, sy, sw, sh = page.stage
            self.assertTrue(np.array_equal(image[sy, sx], T.BG))
            self.assertTrue(np.array_equal(image[sy + sh // 2, sx + 2], T.STAGE))
            self.assertTrue(np.array_equal(image[sy + sh // 2, sx + sw // 2], [120] * 3))
            self.assertEqual(page._hover["painting"], 1.0)

    def test_text_contrast(self):
        def luminance(bgr):
            rgb = np.asarray(bgr[::-1]) / 255
            linear = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
            return float(linear @ [0.2126, 0.7152, 0.0722])
        for fg, bg in ((T.INK, T.BG), (T.MUTED, T.BG), (T.NAV_TEXT, T.NAV),
                       (T.NAV_MUTED, T.NAV), (T.SURFACE, T.ACCENT),
                       (T.INK, T.MINT), (T.DANGER, T.SURFACE)):
            a, b = sorted((luminance(fg), luminance(bg)))
            self.assertGreaterEqual((b + 0.05) / (a + 0.05), 4.5)


if __name__ == "__main__":
    unittest.main()
