
# CI / Releases — Minimal Notes

This file provides a short, actionable overview of the repository's CI and release expectations.

1) Release Drafter
- Requires a repo secret named `GH_TOKEN` with at least write permissions for `contents` and `pull-requests`.
- This is configured in the `release-drafter-action.yml` workflow.

2) Smoke Test (Smoke-test workflow)
- Trigger: `workflow_dispatch` or when tag pushed (for release validation).
- Inputs:
  - `url` (Network API URL, defaults to production API)
  - `skip_cloudflare_check` (true/false — when true, Cloudflare challenge pages are tolerated and JSON validation is skipped)
- The job uses Playwright fallback to fetch pages if `curl` fails; Playwright is installed in `dev-tests`.

3) Deterministic Installs
- The smoke test uses `npm ci` when a `dev-tests/package-lock.json` exists, otherwise falls back to `npm install` to avoid failure when no lockfile is present in the repository.
- For best CI reproducibility, generate and commit `dev-tests/package-lock.json` using:
  - in the repo: `cd dev-tests && npm install` (this creates the file)
  - `git add dev-tests/package-lock.json && git commit -m "chore(ci): add package-lock for smoke-test"`

4) Client debug
- To enable client-side debug output (halving/fallback debug logs), set `window._debug = true` in the browser console.
