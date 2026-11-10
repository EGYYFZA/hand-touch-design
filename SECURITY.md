# Security policy

## Report a vulnerability

Use [GitHub's private vulnerability reporting](https://github.com/EGYYFZA/hand-touch-design/security/advisories/new).
Include the affected version, reproduction steps with dummy data, and expected
versus observed behavior. Do not post credentials, camera images, or exploit
details in a public issue. Maintainers will review reports privately; no fixed
response time is guaranteed.

## Photo privacy

The public studio processes camera frames on the device and stores new photos in
the browser's local gallery. Capture, preview, PNG download and printing do not
require login. People sharing a browser profile share that gallery; download and
delete photos before leaving a shared device.

The optional account/archive backend is separate from the default public studio.
Keep its authentication, CSRF checks, owner-scoped database/storage policies and
admin MFA enabled. Cloud storage requires consent and expires photos after
30 days. See the [privacy policy](https://egz-gesture-studio.netlify.app/privacy).

## Safe development and hosting

- Keep secrets in local environment files or your hosting provider's environment
  settings. `.env.example` contains placeholders only.
- Never commit photographs, datasets, trained personal models, credentials,
  traces, local configuration, or operational reports.
- Serve the generated `dist/` directory over HTTPS, not the repository root.
  Preserve the security headers and same-origin restrictions.
- Use trusted dependency/model sources and review dependency updates.
- If a secret is exposed, revoke it at its provider. Deleting a file does not
  remove it from Git history, forks, caches, or existing clones.

CI includes dependency checks and [isolated security fixtures](docs/security-sandbox.md).
Passing checks provide bounded evidence, not a guarantee against every attack.
