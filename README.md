# bittensor-labs

Bittensor-Labs.com ultra-compact Dashboard

## Overview
Started: November 3, 2025

This project provides a compact dashboard for visualizing and monitoring key Bittensor metrics. It is designed for anyone interested in understanding the Bittensor ecosystem. 

First it was just a learning and hobby project, but now it is passion.
PS: This is my first ever GitHub and website project, with many headaches but also much fun.

**Latest release:** `v1.0.0-rc4` — see `RELEASE_NOTES/v1.0.0-rc.4.md` and `CHANGELOG.md` for details.

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

Brief: A small GitHub Actions workflow publishes the Cloudflare Worker that serves the ATH/ATL API.

- Trigger: the workflow runs on `push` to `main` **only** when one of these paths changes:
	- `functions/**`
	- `worker-entry.js`
	- `.github/workflows/deploy-worker.yml`

- Manual run: you can also start the workflow from the Actions UI (`Run workflow`) or with the GH CLI:

	```bash
	gh workflow run deploy-worker.yml --ref main
	```

- What it does: generates `wrangler.toml` from repository secrets and runs `wrangler deploy` to publish the Worker.

- Required repo secrets used by the workflow (make sure they exist in Settings → Secrets):
	- `CF_API_TOKEN` (passed to Wrangler as `CLOUDFLARE_API_TOKEN`)
	- `CF_ACCOUNT_ID`
	- `CF_METRICS_NAMESPACE_ID`

- Safety: the workflow is limited to worker-related pushes to avoid accidental deploys from unrelated changes.

Quick smoke checks after a deploy:

```bash
curl -sS https://<your-worker>.workers.dev/api/ath-atl | jq .
curl -sS https://<your-worker>.workers.dev/api/ath-atl/health | jq .
```

If you prefer fully manual deploys only, run the workflow from the Actions UI; if you want assistance changing triggers, I can update the workflow.

## Automated Backups — `issuance_history`

Brief: The repository runs a scheduled, opt-in job that collects the `issuance_history` value from Cloudflare Workers KV and stores a timestamped copy. This job runs every 6 hours and can optionally upload the snapshot to an R2 bucket.

- What is backed up: the `issuance_history` KV value, written as `issuance_history-YYYYMMDDTHHMMSSZ.json`.
- Schedule: every 6 hours (GitHub Actions cron). The workflow also supports manual runs via the Actions UI.
- Upload: uploads to R2 are strictly opt-in. To enable uploading set `ENABLE_R2=true` and provide the following repository secrets (see below).

Required repository secrets for backups
- `CF_ACCOUNT_ID` — Cloudflare account id (used to read KV)
- `CF_API_TOKEN` — Cloudflare API token with KV read rights
- `CF_METRICS_NAMESPACE_ID` — KV namespace id where `issuance_history` lives

Optional (for R2 uploads; only required if `ENABLE_R2=true`)
- `ENABLE_R2` = `true` to enable uploads (string `true`)
- `R2_ENDPOINT` — S3-compatible endpoint URL for your R2 account
- `R2_BUCKET` — R2 bucket name
- `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` — R2 access credentials
- `R2_PREFIX` — optional path prefix for uploaded objects

How to test (manual run)

```bash
# trigger a manual run
gh workflow run backup-issuance-history-r2.yml --ref main

# then stream logs
gh run list --workflow backup-issuance-history-r2.yml --limit 5
gh run view <run-id> --log
```

Behavior: If R2 secrets are not provided or `ENABLE_R2` is not `true`, the workflow will still fetch `issuance_history` and write a local timestamped file, but it will skip any upload.

If you want me to also back up additional KV keys or other datasets, I can add modular scripts and hook them into the same scheduled job.

### Taostats (price & volume) history backup

- We now collect price and `volume_24h` snapshots into a separate `taostats_history` JSON and store it in Cloudflare Workers KV under the key `taostats_history`.
- The `publish-taostats` workflow appends to `taostats_history.json` and writes it to KV on every run (defaults to every 10 minutes).
- A new scheduled workflow `backup-taostats-r2` runs every 3 hours and will fetch `taostats_history` from KV and upload a timestamped copy to R2. To enable the R2 upload set `ENABLE_R2=true` and the R2 credentials mentioned above.
 - A new per-run archival step in the `publish-taostats` workflow optionally uploads a timestamped entry to R2 for each fetch (if `ENABLE_R2=true`), so we can retain as much history as possible in R2 while keeping the recent history compact in KV. This ensures the dashboard can display long-term history later even if KV has size limits.
 - (Previously) A daily consolidation job aggregated `taostats_entry-` files into daily files. Consolidation has now been removed.
- The history file stores a compact array of entries: `{ _timestamp, price, volume_24h }`. The collector keeps a bounded number of entries (default 10,000) which can be adjusted with `HISTORY_MAX_ENTRIES` environment variable.

### Cloudflare Worker & KV setup (if starting from scratch)

If you don't have a Cloudflare Worker or KV namespace set up, follow these steps to create one and enable the `taostats_history` endpoint used by the workflows:

1. Create a KV namespace (via the dashboard or Wrangler):

	 Using Wrangler:
	 ```bash
	 wrangler login
	 wrangler kv:namespace create "metrics_kv" --binding METRICS_KV
	 ```

	 Or via the API (requires `CF_API_TOKEN` and `CF_ACCOUNT_ID`):
	 ```bash
	 curl -s -X POST "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces" \
		 -H "Authorization: Bearer ${CF_API_TOKEN}" \
		 -H "Content-Type: application/json" \
		 --data '{"title":"metrics_kv"}'
	 ```

	 The response will include an `id` — set that as `CF_METRICS_NAMESPACE_ID` (or `CF_KV_NAMESPACE_ID`) in your repository secrets.

2. Deploy or add a Worker to serve the `taostats_history` endpoint. A simple Worker can be implemented using the KV binding from step 1 and exposing this route:

	 - GET `/api/taostats_history` -> return `TAO_STATS_KV.get("taostats_history")`
	 - PUT `/api/taostats_history` -> `TAO_STATS_KV.put("taostats_history", body)` (if you want writes through a Worker)

	 Bind the KV namespace in `wrangler.toml` or the dashboard for the Worker to use (avoid naming collision).

3. Validate KV access & API setup (manual quick test):

	 - Check account id is correct:
		 ```bash
		 curl -s -H "Authorization: Bearer ${CF_API_TOKEN}" "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}" | jq .
		 ```
	 - Check KV namespace exists:
		 ```bash
		 curl -s -H "Authorization: Bearer ${CF_API_TOKEN}" "https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}" | jq .
		 ```
		 If this returns `404` or `No route for that URI`, verify your `CF_ACCOUNT_ID` / `CF_KV_NAMESPACE_ID` are correct and that the `CF_API_TOKEN` was created under the same Cloudflare account.

4. Set these as repository secrets: `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_METRICS_NAMESPACE_ID` (or `CF_KV_NAMESPACE_ID`). The workflows use those to write to KV.

Notes:
 - If you expect historical data already present in KV, we can implement a merge strategy (fetch and merge arrays) before overwriting the `taostats_history` key. Currently the `publish-taostats` workflow POSTs the latest entry to the Worker (worker appends server-side) and then downloads the merged history back. The workflow performs a pre/post GET check when `CF_WORKER_URL` is set, and will fail if the history count does not increase after the POST — this helps detect route/permission issues before any direct PUT would run.
 - If you are starting from scratch (no existing KV entries), the current workflow will create new `taostats_history` payloads and write them to the KV key on the first run.

