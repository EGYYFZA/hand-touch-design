# GestureCanvas studio

Purpose: a local, single-user desktop camera workspace. The camera image is the
main content; mode selection and saving must stay visible. Existing OpenCV,
NumPy and MediaPipe remain the runtime. No browser or extra UI dependency.

Direction: quiet creative studio, dark navigation, warm light workspace, teal
actions, geometric line icons. The reference is the existing four-mode workflow
in README.md and config/menu.yaml. UI UX Pro Max's local search supports minimal
Swiss spacing/type and explicit error recovery; its landing-page composition and
web font recommendations do not fit this native camera app.

Checkable constraints:

- Desktop canvases: 1120x704 and 960x640; camera aspect ratio is preserved.
- Navigation has four labeled modes and shortcuts 1-4. Tab/Enter also operate
  navigation and visible action buttons, with a visible focus outline.
- Primary and secondary text on UI surfaces have at least 4.5:1 contrast.
  Status has words as well as color. Action targets are at least 44 pixels high.
- Navigation and save controls remain outside the camera image. Painting keeps
  its gesture-targeted color palette in camera space. Long text fits its bounds.
- Hover feedback may fade briefly; reduced_motion disables UI interpolation.
  Camera content is never cross-faded. Rounded masks and static chrome are cached.
- Save failures retain Photobooth shots across mode changes until retry or
  explicit discard. Painting exports the displayed composite exactly once.

States to render and exercise:

| State | Trigger | Feedback | Next action |
| --- | --- | --- | --- |
| Loading | Camera opens | Stable stage, preparing-camera label | Wait or exit |
| Empty | No hand detected | Live preview, short pose instruction | Show a hand or use mouse/keys |
| Error | Camera disconnects or saving fails | Persistent cause and recovery action | Reconnect/retry, or explicitly discard failed photos |
| Partial | Face not detected in Meme | Camera and controls remain available; no-face status | Face camera, change mode |
| Success | Export succeeds | Saved confirmation without moving controls | Continue or begin another session |
| Permission | Camera unavailable/denied | Camera error and access guidance | Release camera/check Windows permissions, retry |

Evidence: generated synthetic-frame screenshots and local regression checks in
tests/. Screenshots are renderer output, not proof of hardware or OS permission
behavior. Live camera, actual OS permission denial, and screen-reader access are
untested until exercised on the user's desktop. OpenCV draws pixels and does not
expose native screen-reader control semantics; keyboard support is still required.

Local verification:

- 21 regression tests pass; application and hand-model initialization pass.
- Render-only median over 30 measured synthetic frames after 10 warm-up frames:
  9.2 ms at 1120x704 and 8.9 ms at 960x640. This excludes camera capture and
  model inference and is not a claim about end-to-end FPS.
- The camera-open attempt found no device; no personal images were saved.
- The bundled frontend evidence checker was run against
  ui-preview/evidence.json. It reports the permission state as incomplete;
  actual Windows permission denial remains untested. Other local checks above
  do not substitute for that hardware/OS check.
