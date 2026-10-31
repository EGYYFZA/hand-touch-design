# Tutorial video and copy decisions

30 October 2026. Scope: concise product copy and local, original 3D tutorials for menu selection, hand effects, Painting, Photobooth and Meme. No administration, login or account tutorials.

## Decisions and evidence

- Render the 3D scenes once into silent MP4s. Remotion supports frame-driven Three.js scenes through [`ThreeCanvas`](https://www.remotion.dev/docs/three-canvas), and [`renderMedia`](https://www.remotion.dev/docs/renderer/render-media) exports the compositions. The website uses native video; React and Three.js belong only to the isolated local rendering tool. This is an implementation choice to keep live camera processing separate from 3D rendering.
- Load a clip only when the tutorial opens. Use muted inline playback, native pause/seek controls and a poster. A denied autoplay request leaves Play available. This follows [MDN's video element guidance](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/video) and [autoplay guidance](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay). Reduced-motion users see a paused poster and can explicitly play.
- Use a centered native dialog with a visible close button, Escape dismissal, focus inside the modal and focus restoration after closing, following the [W3C modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).
- Auto tutorials default on when first entering the menu and when selecting a different mode. The switch persists only a local `on`/`off` setting. Manual access remains available when auto tutorials are disabled. Blocked storage falls back to the current tab's preference.
- Each 12-second video has four selectable chapters. The matching instruction is also readable outside the video, with local WebVTT captions available. Media failure never removes Skip or the chapter instructions.
- While a tutorial is open, existing modal boundaries stop painting, keyboard capture and automatic fist capture. After closing a Photobooth tutorial, the fist must be released before gesture capture is rearmed. An active photo session cannot be interrupted by a tutorial.
- Keep actionable errors and meaningful consent text. Shorten repeated promotional and explanatory copy. Cloud consent still states 30 days, admin access, no retrospective upload, and no publication or AI-training permission.

The studio has no bottom control bar. Privacy Policy is an underlined text link. Gesture calibration remains the primary entry; M opens keyboard mode selection, S captures, X stops the camera, R retries a retained export, and Escape cancels an active photo sequence. These shortcuts are also available to screen readers through the workspace description. Tutorial chapters and captions do not point to removed controls.

## Local production assets

Five original scenes, modeled with primitive meshes; no camera footage, external models, voice services or remote fonts. The generated MP4s, posters and captions are explicit entries in the static build allowlist. Render sources, the tool dependency lockfile and `web/tutorials/manifest.json` make regeneration inspectable. The rendering tool overrides Zod to the patched 4.6.7 version; root application dependencies are unchanged.

## Research limits

Focused technical research addressed three questions: frame-driven 3D rendering, browser video loading/playback, and accessible modal behavior. Four official documentation sources were read, with MDN's autoplay guide as an additional reference. Exa/Firecrawl tools were unavailable; official documentation was accessed with the available web tool. Confidence is high for the documented API and modal behavior, while responsive fit and gesture correctness require the repository's browser tests and rendered review rather than documentation alone.
