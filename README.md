
# bittensor-labs

**Live Bittensor network terminal with Matrix aesthetics**

## Overview
Started: November 3, 2025

A Matrix-styled terminal for exploring Bittensor network metrics. Track TAO price, halving projections, network stats, and market conditions with a unique terminal aesthetic.

**Latest release:** `v1.0.0-rc.33.15` — see [Releases](https://github.com/maxim91136/bittensor-labs/releases) for details.

> 🎯 **RC33.8 - Post-Halving Fixes & Decentralization 2.0**:
> - **Halving Counter Post-Halving Fix**: Counter now shows countdown to next halving after >24h (was stuck on "Halved!")
> - **Backend Integration Fix**: Correctly picks first future halving estimate (`remaining > 0`) from API
> - **Decentralization 2.0**: TDS/EDS/Hybrid history tracking with interactive charts
> - **R2 Cleanup**: Complete migration patterns for all old flat-structure files
>
> **RC33 Legacy - WORLD'S FIRST: Doug's Cheat + Triple-Precision GPS**:
> - **100% Halving Accuracy**: Predicted Halving #1 to the exact second (13:31 UTC)
> - **Doug's Cheat**: Using REAL pre-halving emission from chain history (halved)
> - **Triple-Precision GPS**: Distance-adaptive emission selection methodology
> - **Real Data**: Measured 7193.74 τ/day → halved to 3596.87 τ/day (vs theoretical 3600)
> - **0.09% more accurate** than protocol-defined theoretical values!
> - Props to **Doug from Taostats** for the brilliant methodology

## Features

### 🎯 Halving Projections: Doug's Cheat + Triple-Precision GPS

**World's first implementation of "Doug's Cheat" halving projection methodology**

Instead of using protocol-defined theoretical emission (7200/2^n), we calculate the **actual emission rate** from historical data BEFORE the halving, then halve it. This accounts for real-world protocol variations and provides higher accuracy than theoretical approximations.

**How It Works**:
1. **Measure pre-halving emission** from chain history (7 days before halving)
2. **Halve it** for post-halving projections: `measured_emission / (2 ^ halvings_since_last)`
3. **Result**: Real-world accuracy using actual on-chain data

**Example** (Halving #1 → #2):
- Pre-halving measured: **7193.74 τ/day** (not theoretical 7200)
- Post-halving: 7193.74 / 2 = **3596.87 τ/day** 🎯
- Theoretical would be: 3600 τ/day
- **0.09% more accurate!**

**Triple-Precision GPS (Global Positioning System)**:
Distance-adaptive emission selection methodology that ensures accurate projections across all time horizons:

- **Stage 1 (0-7 days post-halving)**: Doug's Cheat for all projections
  - Both 7d and 30d averages contaminated with pre-halving data
  - Solution: Use real pre-halving emission (halved) - zero contamination!

- **Stage 2 (7-30 days)**: Transition Period
  - Terminal approach (<30d away): Clean 7d empirical data
  - Long-range (>30d away): Theoretical (30d still contaminated)

- **Stage 3 (30+ days)**: Full GPS Operation
  - Terminal approach: 7d for real-time precision
  - Long-range: 30d for stable noise-resistant forecasts

**Transparency Metadata**:
- GPS stage indicators (`post_halving_stabilization`, `terminal_approach`, `long_range`)
- Confidence levels (`empirical_halved`, `high`, `medium`, `low`)
- Days since halving + days until clean data
- Exact emission rate used for each threshold

**Results**:
- ✅ Halving #1: **100% accuracy** (0 seconds error) - predicted 13:31 UTC, occurred 13:31 UTC
- 🔮 Halving #2-4: Using Doug's Cheat (3596.87 τ/day → 1798.44 τ/day → 899.22 τ/day)

Props to **Doug from Taostats** for pioneering this methodology!

See [docs/HALVING_ESTIMATES.md](docs/HALVING_ESTIMATES.md) for complete technical documentation.

### 📊 Network Metrics
- **TAO price** with 24h change indicator and breathing animation
- **Live pricing** from Binance API (<1 second delay)
- **EUR/USD toggle** on price pill and chart (synced, persisted)
- **Circulating Supply** tracking against the 21M cap
- **Total Issuance** from on-chain data via Bittensor SDK
- **Active Neurons** count across all subnets
- **Tooltip Transparency**: Every stat card shows data source + last updated timestamp

### 📈 Price Chart (RC29+)
- **Candlestick Chart**: Professional OHLC visualization with green/red candles
- **Volume Bars**: Trading volume displayed below price chart
- **Multiple time ranges**: 1D, 7D, 30D, 90D, Max (~600 days)
- **Multi-asset comparison**: Compare TAO vs BTC, ETH, and SOL performance
- **EUR currency support**: View prices in Euros with live conversion
- **Smart Toggle Logic**: Candle/Volume and Compare modes are mutually exclusive
- **Data sources**: Binance (primary), Taostats, CoinGecko (fallbacks)

### 📊 TAO Distribution Analysis (RC30+)
Institutional-grade wealth distribution metrics:

**Percentile Rankings**:
- Find out where you rank among all TAO holders
- Top 1% threshold: 395 τ
- Top 10% threshold: 25 τ
- Top 50% threshold: 1 τ

**Distribution Metrics**:
- **Gini Coefficient**: Measures wealth inequality (0 = perfect equality, 1 = total inequality)
- **Total Wallets**: Track the growth of the TAO holder base
- **Decentralization Score**: Comprehensive analysis of wallet distribution

**Data Quality**:
- Based on real on-chain wallet data
- Updated weekly from Taostats API
- Transparent sample counts and timestamps

### 🎯 Network Decentralization Score (RC30+)
First institutional-grade decentralization analysis for Bittensor:

**Composite Score** (0-100):
- Combines Wallets (30%), Validators (30%), and Subnets (40%)
- Color-coded thresholds: Critical (<40), Low (40-60), Moderate (60-80), High (80+)

**Key Metrics**:
- **Nakamoto Coefficient**: Minimum entities needed to control 51% of stake
  - Higher is better (more decentralized)
  - Separate calculations for Validators and Subnets
- **Gini Index**: Inequality measure (0 = perfect equality, 1 = total inequality)
  - Lower is better (more equal distribution)
- **HHI (Herfindahl-Hirschman Index)**: Market concentration (0-10,000)
  - Lower is better (less concentrated)

**Three Pillars**:
1. **Wallets**: TAO holder distribution analysis
2. **Validators**: Stake concentration among validators
3. **Subnets**: Emission distribution across subnets

**Visual Features**:
- Score gauge with threshold indicators
- Historical tracking (shows trend over time)
- Expandable details with plain-language explanations
- Last updated timestamps

### 🧪 Decentralization Score 2.0 (RC30.37+)
Experimental model separating **Technical** vs **Economic** decentralization:

**Three Scores**:
- **TDS (Technical)**: Who controls the keys? CEX holdings + validator concentration
- **EDS (Economic)**: Who owns the tokens? Wallet distribution + subnet strength
- **Hybrid**: Combined score (50% TDS + 50% EDS)

**Why Two Models?**
- A protocol can be **technically centralized** (CEX custody, few validators) but **economically decentralized** (broad ownership)
- Classic score mixes everything → hides CEX/validator risk
- Score 2.0 exposes it: "EDS 67 but TDS 32" tells a clearer story

**Technical Metrics (TDS)**:
- CEX Holdings % (Binance, Coinbase, etc.)
- Validator Top10 concentration

**Economic Metrics (EDS)**:
- Wallet distribution (35%)
- Subnet score (35%)
- Gini + Stake spread (30%)

### 🎯 Market Conditions Intelligence (RC25+)
Real-time market analysis card combining multiple data sources into actionable intelligence:

**Four Key Metrics** (Matrix-style 2x2 grid):
- **Signal** 🟢 Bullish/🔴 Bearish/🟠 Watch/🟡 Caution - Multi-factor short-term signal
- **Volume 24h** - Dollar amount ($180M) + percentage change (+145%)
- **Price 24h** - Short-term price change percentage
- **Trend (3d/7d)** - Medium-term price trend (3-day vs 7-day MA comparison)

**Market Phase Analysis**:
- Contextual phase detection (Bullish/Bearish/Neutral)
- Fear & Greed Index integration (CMC current + Alternative.me historical)
- Weekend activity context
- Clear explanations in expandable section

**Moving Averages Dashboard**:
- MA-2h, MA-4h, MA-3d, MA-7d live tracking
- Percentage difference from current price
- Green (above MA) / Red (below MA) indicators
- Trend analysis at a glance

**Data Quality & Transparency**:
- Confidence scoring (high/medium/low)
- Sample count and hours of data displayed
- Last updated timestamps
- Transparent data provenance

**Visual Design**:
- Strategic color usage: Neutral values (white), conditional signals (green/red)
- Matrix console aesthetic with monospace typography
- Fully responsive (4 → 2 → 1 columns on mobile)
- Complete light/dark mode support

### ⚡ Emission & Halving
- **AVG. Emission/Day** calculated from on-chain issuance history
- **Halving Countdown** with Triple-Precision GPS projections
- **Emission curve visualization** showing TAO distribution over time
- **GPS Metadata**: Real-time contamination tracking and confidence levels

### 😱 Fear & Greed Index
- **Hybrid data source**: CoinMarketCap (current, frequent updates) + Alternative.me (historical)
- Spoon gauge visualization (0-100 scale)
- Historical timeline: Now → Yesterday → Week → Month
- Integration with Market Conditions Card for comprehensive analysis
- Tooltip shows both sources with individual timestamps

### 🏆 Leaderboards
- **Top Validators** by stake with delegation info
- **Top Wallets** by TAO holdings
- **Top Subnets** by emission allocation

### 📈 Leaderboard Ranking System (RC26+)
Track position changes across all Top 10 cards with visual indicators:
- **Position Change Indicators**: ▲ (rank up), ▼ (rank down), NEW (new entry)
- **Historical Comparison**: Compares current ranking against previous snapshot
- **Color-Coded Signals**: Green for improvements, Red for drops, Blue for new entries
- **Compact Display**: Rank + change indicator in single column (e.g., "1 ▲2")
- **Supported Cards**: Subnets (netuid), Validators (hotkey), Wallets (address)

### 🌗 Dark/Light Mode
- Auto-detects system preference
- Manual toggle with smooth transitions
- Optimized color palettes for both modes

### 📱 Responsive Design
- Mobile-first layout
- Touch-friendly tooltips
- Optimized for all screen sizes

### 🥚 Easter Eggs
- Hidden Matrix-themed surprises - can you find them?

### 🔌 API Status Card
- Real-time health monitoring of all 7 data sources
- Color-coded status chips: OK (green), Partial (yellow), Error (red)
- Critical vs Non-critical API classification
- Tooltip with detailed per-source status

### ♿ Accessibility
- `prefers-reduced-motion` support
- High contrast text
- Semantic HTML structure

## Installation

```bash
git clone https://github.com/maxim91136/bittensor-labs.git
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

This repository uses a release script for consistent releases:

```bash
# 1. Update VERSION file with new version
# 2. Add entry to CHANGELOG.md
# 3. Run the release script
./scripts/release.sh
```

The script automatically:
- Updates `README.md` with the version from `VERSION`
- Commits changes and pushes to main
- Creates a git tag
- Creates a GitHub Release with commit list

For debugging in the client, set `window._debug = true` in the browser console to get debug logs about halving calculation and fallback behavior.

## License

MIT License

## Contact

For questions or feedback, please open an [Issue](https://github.com/maxim91136/bittensor-labs/issues) or submit a Pull Request on GitHub.

## Disclaimer & Data Sources

This terminal is an independent, community-run project provided for informational purposes only and is not affiliated with, endorsed by, or certified by the Opentensor Foundation.

### Data Sources (7 APIs)

| Source | Data Provided | Update Frequency |
|--------|---------------|------------------|
| **Bittensor SDK** | On-chain data: subnets, validators, neurons, issuance, block height | Every 10 min |
| **Taostats** | Supply, validators, wallets, subnets, price history | Every 10 min |
| **Binance** | Real-time TAO price, 24h volume, candlestick data, EUR/USD rate | Real-time (<1s) |
| **CoinGecko** | Fallback price data | On-demand |
| **CoinMarketCap** | Fear & Greed Index (current), global metrics, BTC dominance | Hourly |
| **Alternative.me** | Fear & Greed historical (yesterday, week, month) | Daily |
| **DexScreener** | wTAO DEX pairs, liquidity, trading volume | Every 15 min |

### Legal

- **Not financial advice**: This project is not financial, legal, or investment advice. Always verify critical information using authoritative sources and consult a professional before acting on any data shown here.
- **No warranty**: All data is provided "as-is" without warranty of any kind; the project maintainer disclaims liability for losses resulting from the use of this site.
- **Privacy**: This site uses Cloudflare for security and performance; personal data is not stored by the project unless explicitly submitted by you.
- **Trademarks**: "Bittensor", "TAO" and other asset names are trademarks of their respective owners and are used for identification only.
- **Rate limits**: Third-party APIs may be subject to rate limits; data may be temporarily unavailable.

### Community

- **Reddit**: [u/WrongdoerSweet3851](https://reddit.com/u/WrongdoerSweet3851)
- **Discord**: STRM1109

### Special Thanks

**Doug from Taostats** - For pioneering the "Doug's Cheat" methodology and providing invaluable insights into halving projection accuracy. The world's first implementation of real pre-halving emission tracking is built on his brilliant work.

## Docs

Detailed documentation for issuance history and halving projections lives under the `docs/` folder:

- `docs/README.md` — index of available docs about issuance history and halving projections.
- `docs/HALVING_ESTIMATES.md` — **Complete specification** for Doug's Cheat + Triple-Precision GPS methodology, field-level docs for `halving_estimates`, `emission_used`, `step`, GPS metadata, and projection confidence.
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
curl -sS https://<your-worker>.workers.dev/api/taostats | jq .
curl -sS https://<your-worker>.workers.dev/api/taostats_history | jq .
curl -sS https://<your-worker>.workers.dev/api/taostats_history/health | jq .
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
 - Note: The workflow now writes `taostats_history` directly to Cloudflare KV (PUT), so a dedicated write-appending Worker is optional; if you prefer server-side appends, you can deploy the `taostats_history` Worker and configure `CF_WORKER_URL` in secrets.
 - Note: The workflow will attempt to append via a deployed `taostats_history` Worker (preferred) if `CF_WORKER_URL` is set, otherwise it will fall back to direct KV PUT/merge. If you deploy the Worker and want server-side appends, set these repo secrets:
	 - `CF_WORKER_URL` (e.g., https://bittensor-taostats.<xxx>.workers.dev)
	 - `CF_WORKER_WRITE_TOKEN` (optional): The write token if configured in the Worker `HISTORY_WRITE_TOKEN`. If not provided, the workflow will POST without a token (Worker must allow unauthenticated writes).
	 - `ALLOW_KV_PUT_FALLBACK` (optional): set to `true` to allow client-side PUT fallback if the Worker POST fails (default: false). If you want strict server-only appends, do not set this or set to `false`.
- A new scheduled workflow `backup-taostats-r2` runs every 3 hours and will fetch `taostats_history` from KV and upload a timestamped copy to R2. To enable the R2 upload set `ENABLE_R2=true` and the R2 credentials mentioned above.
 - A new per-run archival step in the `publish-taostats` workflow optionally uploads a timestamped entry to R2 for each fetch (if `ENABLE_R2=true`), so we can retain as much history as possible in R2 while keeping the recent history compact in KV. This ensures the terminal can display long-term history later even if KV has size limits.
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

