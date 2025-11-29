# Changelog

All notable changes to this project will be documented in this file.

## Unreleased
- 

## v1.0.0-rc.8.1 (Release Candidate)
### Added
- **Network History Collection**: Automated data gathering from Bittensor SDK (15 min intervals)
- **`GET /api/network/history`**: New API endpoint returning timestamped network snapshots
- **Dedicated R2 Backup Workflow**: `backup-network-history-r2.yml` (every 3 hours) for long-term storage
- **Python Merge Script**: `merge-network-history.py` for robust KV history updates
- **Monitoring Tools**: Interactive dashboard (`monitor-network-history.sh`) for collection tracking
- **Documentation**: Complete guide (`docs/NETWORK_HISTORY_MONITORING.md`)

### Changed
- `publish-network.yml`: Now includes network history merge step (KV append logic)
- `fetch_network.py`: Generates `network_latest.json` for history tracking
- R2 archival moved to separate `backup-network-history-r2.yml` workflow

### Fixed
- Network history merging: Replaced bash/jq with Python for reliable JSON handling
- Eliminated jq type mismatch errors ("object and array cannot be added")
- Workflow name cleanup: Removed "(fixed)" suffix

## v1.0.0-rc.8 (Release Candidate)
### Added
- **Multi-Timeframe Volume Analysis**: 3-day and 7-day moving averages with independent alerts
- **Hierarchical Trend Detection**: Priority system (7d > 3d > 1d > short) for intelligent alerts
- **Progressive MA Display**: Tooltips automatically show longer timeframes as data accumulates
- **Accurate Data Gating**: MAs only calculated when full data window exists (no fake calculations)

### Changed
- 3-day MA: Appears in tooltip after 3 days of data (N ≥ 432)
- 7-day MA: Appears in tooltip after 7 days of data (N ≥ 1008)
- Trend direction evaluates longest available MA first (more structural = higher priority)
- API response includes all MA fields (returns `null` when insufficient data)

### Fixed
- Eliminated false "3-day MA" calculations with only 1-2 days of data
- Prevented misleading long-term trend signals from insufficient datasets
- Improved tooltip accuracy: only displays MAs backed by full data window

## v1.0.0-rc.7.1 (Release Candidate)
### Changed
- **Priority-Weighted MA Strategy**: 1-day MA is now primary trend indicator
  - 1-day ≤ -3% triggers DOWN immediately (structural volume loss)
  - 1-day ≥ +3% triggers UP immediately (structural volume gain)
  - Short-term MA only needed for confirmation when 1-day is weak (±1-3%)
- Refined thresholds to better catch real trends (e.g., 250M → 80M volume shifts)

### Fixed
- Volume Card now correctly alerts on structural trends (-3.41% 1-day)
- No longer requires short-term MA to confirm what 1-day MA already shows
- Better balance: sensitive to real trends, resistant to intraday noise

## v1.0.0-rc.7 (Release Candidate)
### Added
- **Dual-MA Confirmation Logic**: Volume alerts require both short-term and medium-term moving averages to agree
- **Enhanced Tooltips**: Display both MA values (100min and 1day) plus confidence level
- **Improved Confidence Tiers**: Based on actual time windows (Low <1d, Medium 1-3d, High ≥3d)

### Changed
- Volume alert thresholds refined to ±3% short-term (100min) + ±1% medium-term (1day)
- Eliminated short-term noise filtering by requiring dual-MA confirmation
- Backend now computes `trend_direction`; frontend consumes it directly
- Confidence calculation now reflects data accumulation time, not sample count
- Tooltip format now shows: "Δ vs MA (100min): X%", "Δ vs MA (1day): Y%", "confidence: Z"

### Fixed
- "Whiplash effect" where card color changed rapidly on small volume fluctuations
- False positives from single-MA logic that triggered on minor intraday movements
- Confidence appearing "high" too early when data was still fresh

## v1.0.0-rc.6 (Release Candidate)
### Added
- **Volume 24h Card Alert System**: Static color-based visual feedback
  - 🟢 Green background when volume change is positive
  - 🔴 Red background when volume change is negative
  - Strong 2px borders with 40% opacity for clear visibility
  - Tooltip with percentage change and confidence level (info-badge only)

### Changed
- Removed pulsing animation from Volume Card in favor of static color alerts
- Simplified threshold logic: any positive % → green, any negative % → red (removed ENTER/EXIT hysteresis)
- Link styling: Subnets & Validators links now only on text values with underline, not entire card
- Links inherit stat-value color (white in dark mode, black in light mode)
- Tooltip formatting: newline instead of em-dash for better readability

### Fixed
- Fixed animation blockade from `@media (prefers-reduced-motion: reduce)`
- Removed duplicate browser tooltips from Volume Card
- Fixed `.stat-card` animation not applying due to CSS specificity issues
- Resolved pulsing effect persisting despite CSS removal
- Inline styles in JS now bypass CSS override issues

## v1.0.0-rc.5 (Release Candidate)
### Added
- Volume 24h card with hysteresis-based pulse animation
- Tooltip integration with percentage change and confidence metadata
- Support for legacy `.stat-card` markup alongside new `.tao-volume-card`

### Changed
- Animation: halving pulse with 7s duration for breathing effect
- CSS: strong glow effects with drop-shadow filters
- JS: applyToLegacy() and applyToCard() functions for flexible card rendering

### Fixed
- CSS animation rule conflicts resolved with !important flags
- Tooltip positioning and content structure improved
- Reduced-motion media query handling

## v1.0.0-rc.4 (Release Candidate)
### Added
- Opt-in R2 uploader with Cloudflare API fallback; uploader now prefers S3-compatible credentials when present.
- Worker health endpoint and KV-first behavior for safer reads/publishes.
- `issuance_history` fetcher and scheduled backup job (every 6 hours) with opt‑in upload.
### Changed
- Backups narrowed to `issuance_history` only; uploads are opt-in and guarded by `ENABLE_R2`.
- Frontend: exact-number formatting (thousands separators + 2 decimals) and halving tooltip arrow notation.
### Fixed
- CI workflow adjustments for Worker deploy; improved stability in publish/deploy steps.

## v1.0.0-rc.3 (Release Candidate)
### Added
- Backend: sequential halving simulation and per-step projection fields (`emission_used`, `step`, `delta`).
- API: `halving_estimates`, `avg_emission_for_projection`, `projection_method`, `projection_confidence`, `projection_days_used`, `history_samples`, and diagnostics are returned in `network.json`.
- Frontend: `AVG. EMISSION / DAY` now prefers `avg_emission_for_projection`; halving pill tooltip shows projection metadata and confidence.
### Changed
- Tooltip system: dynamic reading of `data-tooltip`, persistent mobile halving tooltip, and a wider desktop tooltip (`.dynamic-tooltip.wide`).
- Halving pill: confidence classes (`confidence-low|medium|high`) and subtle color accents added.
### Fixed
- Halving projection logic in the producer: emission halves sequentially between thresholds (previously the same emission was used for all steps).


## v1.0.0-rc.2 (Release Candidate)
### Added
- TAO Tensor Law embed card under the price chart with live iframe (and preview fallback image).
- Fullscreen modal to open TAO Tensor Law without reloading the embed; icon button (magnifying-glass) added.
- Mobile overlay CTA to open the TAO Tensor Law embed full-screen, avoiding clipped tooltips on phones.
- Mobile-first adjustments: increased TAO Tensor embed height and responsive clamp values to ensure key content (disclaimer, chart) is visible.
### Fixed
- Prevented tooltip overlap and removed the inline info badge ('i') in the TAO Tensor Law card header.
- Improved Light Mode contrast for the 'Open full' action and ensured the overlay CTA is readable.
### Changed
- Tooltip binding skipped on `taotensor-card` elements to avoid orphaned or duplicate tooltips.
- `script.js` cleanup: improved modal logic, overlay handling, and fallback checks.

## v1.0.0-rc.1 (Release Candidate)
### Added
- Prefer on-chain `totalIssuanceHuman` for halving calculations, fallback to `circulating_supply` provided by Taostats.
- `halvingThresholds` added to the metrics payload (generated on backend and returned by API worker). 
- API worker now returns `halvingThresholds` and provides a fallback if KV is missing.
- Map preview: removed duplicate `learnbittensor.org` link; preserved the 'Open Map' button.

### Fixed
- Scope bug in frontend halving logic (`ReferenceError: supplyForHalving`).

### Notes
- This is a release candidate. CI workflows and smoke tests should be performed prior to final release.

## v1.0.0-rc.5 (Release Candidate)
### Added
- Append-capable Cloudflare Worker `bittensor-taostats` to support server-side appends to `taostats_history` (GET/POST).
- Per-run archival of Taostats snapshots to R2 (timestamped files) and scheduled R2 backups for long-term retention.
- `publish-taostats` workflow: worker validation, pre/post append checks, and optional safe fallback merge-to-KV.

### Changed
- Publish workflow now prefers worker POST append and only performs a KV PUT when explicitly allowed (`ALLOW_KV_PUT_FALLBACK`).
- Renamed CI scripts/workflows to kebab-case and standardized worker name to `bittensor-taostats`.
- Improved environment parsing (`_int_env`) across scripts to handle empty strings safely.

### Fixed
- Prevent accidental writes to the wrong worker (old `bittensor-ath-atl`) by validating `CF_WORKER_URL` before append.
- Coercion for legacy single-object KV values: the worker treats single-object values as single-element arrays when appending.

