# EGZ — Universe-inspired festival theme

Reference inspected on 2026-10-29:
[GitHub Universe 2026 recap](https://github.com/events/universe/recap).
Colors below were read from the page's computed CSS custom properties, not
estimated from a screenshot. The page loads Primer React Brand stylesheets.
EGZ adapts this selected palette to its existing fullscreen studio; this is
not a complete copy of GitHub's design system.

## Observed tokens and their EGZ roles

| Source token | Observed value | EGZ token / use |
| --- | --- | --- |
| `--brand-color-canvas-default` | `#ffffff` | `--bg`, white studio and panels |
| `--brand-color-canvas-subtle` | `#f2f5f3` | `--surface`, photo previews and controls |
| `--brand-color-text-default` | `#000000` | `--ink`, primary text |
| `--brand-color-text-muted` | `#58635b` | `--muted`, secondary labels |
| `--brand-color-border-muted` | `#e4ebe6` | decorative grid lines |
| `--brand-color-border-subtle` | `#d2d9d4` | `--line`, panel borders |
| `--brand-color-accent-primary` | `#0d6731` | `--festival-green`, links and framing |
| `--base-color-scale-green-2` | `#8cf2a6` | `--festival-mint`, highlights |
| `--base-color-scale-lime-3` | `#d1f441` | `--festival-lime`, primary action and spark |
| `--base-color-scale-purple-5` | `#8534f3` | `--festival-purple`, drawing default and accents |
| `--base-color-scale-purple-2` | `#c898fd` | `--festival-lilac`, stars and frame trim |
| `--base-color-scale-pink-3` | `#ff80d2` | `--festival-pink`, confetti and photo trim |
| `--base-color-scale-yellow-1` | `#ffe777` | `--festival-yellow`, playful accents |
| `--brand-borderRadius-medium` | `8px` | small controls |
| `--brand-borderRadius-xlarge` | `24px` | panels and overlays |

The legacy `--blue` alias now resolves to the semantic green accent; it remains
an alias so existing interactions need no structural rewrite. Focus uses
`#0055d5`, observed as the reference's brand control focus color. Large surfaces
stay white; bright colors highlight actions and decoration. Text uses dark
foregrounds on light surfaces, including lime primary buttons.

## Typography and assets

The reference uses Mona Sans. EGZ hosts the unmodified variable WOFF2 locally;
there are no requests to GitHub or a font CDN at runtime. The font comes from
the [official repository](https://github.com/github/mona-sans) at revision
`4bc6ba8b354c36b4fb66d32cd67b4c1f2beb0a06`. Its
[SIL Open Font License](https://github.com/github/mona-sans/blob/4bc6ba8b354c36b4fb66d32cd67b4c1f2beb0a06/OFL.txt)
is included in `licenses/Mona-Sans-OFL.txt` and the public build.

The lime spark character, stars, pills and confetti are original EGZ SVG/Canvas
artwork. No Octocat, GitHub event logo, proprietary illustration or event copy
is used. Decoration ignores pointer input and is hidden during live camera
use. It does not add controls, scroll sections or a new onboarding step.

## Implementation

- `web/theme.css`: shared palette, surfaces, focus, type and radius tokens.
- `web/styles.css`: existing studio layout plus the light color treatment.
- `web/studio-cloud.css` and `web/account.css`: matching light dialogs/account UI.
- `web/photo-strip.js`: exported three-photo frame reads the same CSS palette.
- `web/fonts/mona-sans.woff2`: local variable font, SHA256
  `fd40288d051171b51e3d01f36790604470dbb4d4fc5b36ee5a8119f4f4c6b3e1`.

The side tools/X, hover and touch behavior, one-page auth/cloud gallery,
camera geometry, gesture recognition, privacy and retention rules keep their
existing behavior. Palette changes do not alter backend policies.

## Photobooth frame

The output keeps the previous canvas dimensions and three-shot arrangement.
A white paper border has a green outline, lime EGZ ticket, lilac stars,
three distinct photo outlines, numbered margins, confetti and an original
smiling spark footer. All ornamentation sits outside the captured image
rectangles. A browser regression compares every channel of each synthetic
original shot with its framed counterpart.

## Validation

The responsive/keyboard suite checks nine viewport sizes, current-token text
contrast and the absence of page/tool overflow. Tests also cover side-panel
hover, click, touch, generated strips, real font decoding and pixel preservation.
The completed test counts are recorded in `docs/backend-integration-status.md`.
