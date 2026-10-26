# Contributing

Use a short feature branch and a pull request against main. Keep camera frames,
captures, credentials, local printer previews and virtual environments out of Git.
Only contribute assets you created or have permission to redistribute, with their
license and source recorded in THIRD_PARTY.md.

## Desktop

Use Python 3.12 and install requirements.txt in a virtual environment:

```text
python -m unittest discover -s tests -v
```

Tests simulate camera failures and printing; they do not send anything to a
physical printer. The real camera/printer path still needs a manual check.

## Browser

Use Node.js 22 or newer (Windows PowerShell: use npm.cmd if npm.ps1 is blocked).

```text
npm ci --ignore-scripts
npm test
npm run build
npx playwright install chromium
npm run test:e2e
npm run dev
```

The build publishes only dist/. Do not add an API that accepts photographs
without a separate privacy/security review. Preserve the same-origin model
delivery and CSP. Keep button/keyboard alternatives to gesture controls.

Commit messages use feat:, fix:, test:, docs:, ci:, or chore:. Include test
results and screenshots for UI changes, and disclose hardware checks not run.
