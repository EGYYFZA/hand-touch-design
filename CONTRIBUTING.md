# Contributing

Small, focused changes are welcome. For a bug report, include your browser/OS,
steps to reproduce, and what you expected. Use a synthetic example rather than a
personal camera image. Report security issues [privately](SECURITY.md).

## Before opening a pull request

1. Create a branch from `main` and keep the change focused on one issue.
2. Follow the surrounding code; add a regression check for changed behavior.
3. Run the relevant checks in the [development guide](docs/development.md).
4. Describe the change, how you checked it, and any hardware checks not performed.

Use clear commit titles such as `fix: preserve photos after a camera disconnect`.
For UI changes, verify keyboard access, small screens and reduced motion. Preserve
click/touch alternatives to gesture controls.

Only contribute media you created or have permission to redistribute. Record
third-party sources and licenses in [THIRD_PARTY.md](THIRD_PARTY.md).

Do not include secrets, personal photos, local setup files, generated test output
or operational reports. Check the staged diff before pushing. The build publishes
only its explicit public-asset allowlist; keep that boundary intact.
