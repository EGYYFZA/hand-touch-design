# Security

Do not commit credentials, private keys, local environment files, or personal data. Use `.env.example` for empty configuration templates. Browser bundles and public demo data must contain no secrets.

If you find a vulnerability, use this repository's **Security > Report a vulnerability** option if available. Do not publish credentials, personal data, or exploit details in a public issue. If private reporting is unavailable, ask the maintainer to enable it without including sensitive details.

A clean scan is not a guarantee of security. Rotate any exposed secret at its provider; removing it from the latest commit does not remove Git history.

The Netlify guest beta and its accepted environment-scope limitations are
documented in [the online production audit](docs/netlify-production-audit.md).
Public email signup/recovery remains closed pending SMTP and abuse protection.

The account service uses a same-origin BFF, verified Supabase users, opaque
HttpOnly cookies, encrypted server-side token storage, CSRF/Origin checks,
owner-scoped metadata/Storage RLS and MFA admin membership. Browser camera
processing stays local; cloud uploads require explicit consent. All cloud
photos expire after 30 days and a cloud job removes physical objects through
Storage API. Account cache is scoped by UID and cleared on logout/account switch.
Public camera/effects/capture/Print work without login. Guest photos share a
local browser-profile namespace until explicit login claims them; legacy demo
photos remain separate. PNG download requests inline login. This client-side
product gate cannot prevent screenshots, DevTools or physical access to local images.
Guest gallery and Print use reduced, watermarked previews; verified login restores
the original for official export. If preview generation fails, the original is
never substituted into the guest gallery or Print. The original remains in the
local cache for recovery and is accessible to the person controlling the browser.
Login and MFA rotate the opaque session ID and CSRF token and revoke the replaced
session. A revoked session cannot be upgraded through an in-flight MFA request.
Guest/older photos require consent plus a specific manual cloud-save action;
they are never uploaded just because login or consent succeeded.
Public signup stays disabled until
SMTP, verified sender domain, abuse protection and production hosting are ready.
See [the pre-publication security audit](docs/security-prepublish-audit.md),
docs/backend-integration-status.md and docs/public-backend-audit.md.

## What belongs in GitHub

Keep source code, tests, dependency manifests and lockfiles, public configuration,
CI/build scripts, maintained documentation, and license notices. The two named
MediaPipe `.task` models are required public runtime assets; the four monkey WebP
images are intentional feature assets with provenance limits in THIRD_PARTY.md.

Keep the following local only:

- `captures/`, `data/`, print previews, and locally trained models/labels.
- `docs/ui-preview/`, `docs_preview.png`, `.ecc/`, browser traces, and test output.
- Virtual environments, installed dependencies, build output, caches and IDE settings.
- `.env` values, cloud/SSH credentials, private keys, agent state and local tool config.

`.gitignore` prevents ordinary additions; it is not a security boundary and can
be bypassed by `git add -f`. The Node repository tests reject tracked files that
match ignore rules and verify representative private paths stay ignored. Before
pushing, inspect `git diff --cached --stat` and the staged text diff locally.
Never publish actual tokens or personal camera images as audit evidence.

The Vercel ignore list also excludes private local material from CLI uploads.
Serve only the generated `dist/` directory, not the repository root. Do not copy
private files into `web/`; everything in that directory is a public application asset.

## Existing history

The 28 October 2026 review found camera captures and a virtual environment in
older commits. Removing files from the current tree does not revoke access to
old commits, PR refs, cached downloads, forks or existing clones. A coordinated
history rewrite requires changing commit IDs and updating affected branches;
collaborators must then resync or reclone. GitHub Support may be needed for
sensitive cached objects and PR references. This cleanup does not claim that
those historical copies have been purged.
