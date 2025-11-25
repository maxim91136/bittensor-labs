# bittensor-labs

Bittensor-Labs.com ultra-compact Dashboard

## Overview
Started: November 3, 2025

This project provides a compact dashboard for visualizing and monitoring key Bittensor metrics. It is designed for anyone interested in understanding the Bittensor ecosystem. 

First it was just a learning and hobby project, but now it is passion.
PS: This is my first ever GitHub and website project, with many headaches but also much fun.

## Features

- Clear display of network statistics
- Node status and performance overview
- Real-time updates of important metrics / price
- Easily extendable and customizable

## Installation

```bash
git clone https://github.com/your-username/bittensor-labs.git
cd bittensor-labs
npm install
```

## Usage

```bash
npm run start
```

Then open [http://localhost:3000](http://localhost:3000) in your browser.

## Contributing

Pull requests and issues are welcome! Please follow the guidelines in CONTRIBUTING.md.

## CI & Releases

This repository uses a simple, manual release process. The smoke-test and release drafter workflows were intentionally removed in favor of a deterministic, human-controlled process. For a detailed step-by-step checklist, see `RELEASE_CHECKLIST.md`.

Quick Release Checklist (summary):

- 1) Ensure CI checks on `main` have passed and the site is stable.
- 2) Update `CHANGELOG.md` and the `VERSION` file if bumping the version.
- 3) Create a tag locally and push (e.g., `git tag -a v1.0.0 -m "Release v1.0.0" && git push origin v1.0.0`).
- 4) Create the GitHub Release via the UI or the `gh` CLI: `gh release create v1.0.0 --title "v1.0.0" --notes-file CHANGELOG.md`.
- 5) Wait for GitHub Pages/CI deployments to finish, then verify the production site and API endpoints.

If you need the full step-by-step tasks and validation points, open `RELEASE_CHECKLIST.md`.

For debugging in the client, set `window._debug = true` in the browser console to get debug logs about halving calculation and fallback behavior.

## License

MIT License

## Contact

For questions or feedback, please open an [Issue](https://github.com/maxim91136/bittensor-labs/issues) or submit a Pull Request on GitHub.

## Disclaimer & Data Sources

This dashboard is an independent, community-run project provided for informational purposes only and is not affiliated with, endorsed by, or certified by the Opentensor Foundation.

- Primary data is acquired on-chain via the repository's network API (`/api/network`).
- Price and supplementary supply metrics may be provided by third-party services (e.g. Taostats, CoinGecko) as fallbacks; these can be subject to rate limits and may not always be real-time.
- This project is not financial, legal, or investment advice. Always verify critical information using authoritative sources and consult a professional before acting on any data shown here.
- All data is provided "as-is" without warranty of any kind; the project maintainer disclaims liability for losses resulting from the use of this site.
- This site uses Cloudflare for security and performance; personal data is not stored by the project unless explicitly submitted by you.
- "Bittensor", "TAO" and other asset names are trademarks of their respective owners and are used for identification only.

## Docs

Detailed documentation for issuance history and halving projections lives under the `docs/` folder:

- `docs/README.md` — index of available docs about issuance history and halving projections.
- `docs/HALVING_ESTIMATES.md` — field-level specification for `halving_estimates`, `emission_used`, `step`, `delta`, and projection metadata.
- `docs/ISSUANCE_HISTORY_README.md` — operational notes about how issuance snapshots are collected and stored in Cloudflare KV.

Visit the `docs/` directory for more details on using the network API and interpreting projection results.

## Deployment (Cloudflare Worker)

The repository includes a GitHub Actions workflow to deploy the Cloudflare Worker that serves the ATH/ATL API.

- When the workflow runs: it is triggered automatically on `push` to `main` **only** when one of the following paths changes:
	- `functions/**`
	- `worker-entry.js`
	- `.github/workflows/deploy-worker.yml`

- Manual trigger: you can also start the deploy from the Actions UI using the **Run workflow** button (or via `gh workflow run deploy-worker.yml --ref main`).

- What the workflow does: it generates a `wrangler.toml` from repository secrets and runs `wrangler deploy` to publish the Worker.

- Safety: only worker-related pushes start the workflow (prevents accidental deploys from unrelated edits). If you want full manual-only deploys, run the workflow from the Actions UI.

Example quick checks after deploy:

```bash
curl -sS https://<your-worker>.workers.dev/api/ath-atl | jq .
curl -sS https://<your-worker>.workers.dev/api/ath-atl/health | jq .
```

