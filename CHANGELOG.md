# Changelog

All notable changes to this project will be documented in this file.

## Unreleased
-
## v1.0.0-rc.23.3 (2025-12-06)
### Fixed
- **Spoon Position**: Fine-tuned positioning for optimal visual balance on all screen sizes (top: 0, translateX: -33%)

## v1.0.0-rc.23.2 (2025-12-06)
### Fixed
- **FEAR Badge**: Desktop positioning now forced via JavaScript (CSS specificity issues resolved)
- **Vertical Centering**: Spoon and barometer better centered within card for improved visual balance

## v1.0.0-rc.23.1 (2025-12-06)
### Improved
- **Card Layout**: Fear & Greed Index and Miner Map cards now display side-by-side on wider screens
  - Responsive container: side-by-side at ≥800px, stacked below
  - Equal card widths for balanced appearance
  - Centered spoon graphic in F&G card
  - Adjusted Matrix quote positioning for better spacing

### Technical
- New `.fng-map-container` grid layout
- Spoon background centered with `translateX(-35%)`
- Matrix quote repositioned (top: 6px, smaller font)

### Notes
- Pure frontend layout enhancement
- See `RELEASE_NOTES/v1.0.0-rc.23.1.md` for full details

## v1.0.0-rc.23 (2025-12-06)
### Added
- **Sound System**: Complete procedural Matrix-themed audio engine
  - Sound toggle button in header (speaker icon desktop, ♪ music note mobile)
  - Price Pill click sound (400Hz, 0.15s smooth fade)
  - Halving Pill click sound (300Hz, 0.18s fade)
  - Auto-refresh beep (220Hz, subtle notification)
  - Sound toggle confirmation (440Hz→660Hz dual-tone)
  - Neo Easter Egg glitch sound (digital noise burst)
  - Morpheus typewriter sounds (150Hz bass per character)
  - Audio unlock system for browser compatibility
  - Settings persist via localStorage

### Technical
- MatrixSound engine with Web Audio API
- Procedurally generated sounds (no external files)
- Bass-heavy frequencies (110Hz-660Hz)
- Low volume levels (0.02-0.06 gain)
- Smooth ADSR-style envelopes
- Immediate sound stop on overlay close

### Notes
- Pure frontend enhancement, zero licensing concerns
- See `RELEASE_NOTES/v1.0.0-rc.23.md` for full technical details

## v1.0.0-rc.22.1 (2025-12-06)
### Fixed
- **Mobile Display**: Morpheus message (Neo Easter Egg) now fully visible on iPhone Pro Max and other mobile devices
  - Responsive box with max-height 85vh and scrollable overflow
  - Reduced padding and font size for mobile (15px vs 18px)
  - Smooth iOS scrolling with native momentum
  - Green Matrix-themed scrollbar

### Notes
- Pure frontend fix for mobile UX
- See `RELEASE_NOTES/v1.0.0-rc.22.1.md` for full details

## v1.0.0-rc.22 (2025-12-06)
### Added
- **Easter Egg**: "Wake up, Neo..." Matrix-themed Easter Egg for engaged users
  - Floating green snippet appears after 15-45 seconds (random)
  - Visible for 30 seconds with Matrix-style glow and float animations
  - Click triggers full-screen Morpheus message with Matrix rain and typewriter effect
  - Gender-neutral message text customized for the dashboard
  - Only appears once per session, targets intensive users

### Notes
- Pure frontend enhancement, no backend changes
- Fully self-contained with inline CSS animations, no external dependencies
- See `RELEASE_NOTES/v1.0.0-rc.22.md` for full details

## v1.0.0-rc.21.3.2 (2025-12-06)
### Fixed / Improved
- Add retries with exponential backoff and respect `Retry-After` for the Taostats Block API; avoid failing CI on transient `429` responses.

### Changed
- Reduced `per_page` to `100` for block requests to lower burst pressure on the Taostats API.
- Limit block sample size to `100` blocks per run (was 200 in some earlier invocations); still sufficient for block time estimation.

### Notes
- Operational/CI focused release — monitor scheduled runs for 24–48 hours to confirm reduced 429 frequency.

## v1.0.0-rc.21.3.1 (2025-12-06)
### Fixed
- Removed duplicate clickable `alternative.me` link from the About section; attribution text retained. The only visible source link remains in the Disclaimer & Data Sources grid.

### Changed
- Default Price Chart timeframe set to **3D** on first load (was 7D).
- Persist chart timeframe selection in `localStorage` under `priceRange` so user preference survives page reloads (client-side only).

### Notes
- Frontend-only, low-risk release. Hard-refresh recommended after deployment to pick up updated assets and script changes.
## v1.0.0-rc.21.1 (2025-12-06)
### Fixed
- Hidden the small `.barometer-class` label to rely on the larger left-side status badge only.

- Minor JS/CSS cleanup around F&G asset loading and light-mode overrides.
### Notes
- See `RELEASE_NOTES/v1.0.0-rc.21.1.md` for full details and testing notes.

## v1.0.0-rc.21.2 (2025-12-06)
### Added / Changed
- Timeline labels expanded and reordered for clarity: Now → Yesterday → Week → Month.
- Timeline text styling changed to monospace/console (Matrix-like) with responsive sizing.

### Fixed
- Light-mode spoon loader and fallback now use the white-background PNG reliably; toggle behavior corrected.
- Matrix easter-egg moved to the F&G card header to avoid overlapping timeline content.

### Notes
- Small frontend polish release; recommended to hard-refresh after deploy to clear cached assets.

## v1.0.0-rc.21.3 (2025-12-06)
### Added / Changed
- Docs: Disclaimer now attributes the Fear & Greed Index values to `alternative.me` and includes a direct source link in the Data Sources grid.
- Layout: Data sources grid converted to a 4×2 layout; one slot intentionally left empty for future links.
- UI: Minor polish to the F&G card — timeline monospace styling, Matrix quote moved to header, and small easter-egg repositioning.

### Notes
- Low-risk frontend patch. Hard-refresh recommended to ensure updated assets and CSS rules are loaded correctly.

## v1.0.0-rc.21 (2025-12-05)
### Added
- Fear & Greed (F&G) UI: improved card layout with history matrix and a spoon-shaped gauge. Support for user-provided spoon graphics added (`assets/fng-spoon-*.webp`).
- `useFngGraphics()` loader to automatically switch spoon images for dark/light themes.

### Changed
- Ampelsystem (Volume Signal): tuned heuristics (tradedShare guard, hysteresis, soft strict-down rule, runtime override `STRICT_DOWN_ALWAYS_RED`) to reduce false positives and add debug info.
- Desktop layout: increased `fng-card` max-width on wide screens to improve spoon/gauge scale.

### Fixed
- Resolved a syntax regression in `script.js` and validated parse via Node.
- Image handling: optimized supplied spoon PNGs to WebP and updated loader to prefer WebP assets.

### Notes
- Release candidate focusing on F&G UI polish, Ampelsystem robustness, and image optimization.


## v1.0.0-rc.20.6 (2025-12-05)
### Changed
- Volume signal: `Slightly bearish` (Volume ↓ + Price ↓ with price ≤ -2%) now maps to **red** (stronger visual alert). Tooltip and client logic updated.
- Documentation: `README.md` updated to reflect the new mapping for `Slightly bearish`.

### Notes
- Bumped `VERSION` to `v1.0.0-rc.20.6`.

## v1.0.0-rc.20.3 (2025-12-05)
### Added
- Release notes and documentation for RC20.3.

### Changed
- Matrix overlay behaviour: DOM-based RC20.2 look restored and refined; palette updated to emphasize deeper greens.
- Glitch behavior updated to run only on automated refreshes.

### Fixed
- Snowfall Light Mode color issue (flakes were rendering as white instead of blue).
- Matrix overlay alignment and width across the dashboard; clamped to 1–2 rows and improved centering.
- Restored global dashboard update functions to prevent 'Loading...' regressions.

### Notes
- Version bumped to `v1.0.0-rc.20.3` and all release notes updated.

## v1.0.0-rc.20.3.1 (2025-12-05)
### Fixed
- Darker Light Mode snowflakes for better contrast and unify `body.light-bg` and `prefers-color-scheme` behavior.

## v1.0.0-rc.20.4 (2025-12-05)
### Changed
- Reduced Snowfall count by 50% to reduce visual CPU/GPU load and improve accessibility.
- Reduced Matrix Glitch font size for improved visual balance and readability.
- Unified Light Mode snowflake styling across `prefers-color-scheme` and `body.light-bg` toggles.

### Notes
- This release is visual and UX-only; no functional/back-end changes.


## v1.0.0-rc.20 (2025-12-04)
### Added
- Lightweight seasonal snowfall overlay (active Dec 1 → Jan 31). Toggle via `?holiday=1` or `body.holiday`.
- NYE visuals: sparkles, confetti bursts, and small rockets (active Dec 31 & Jan 1). Toggle via `?nye=1` or `body.nye`.

### Changed
- Holiday visuals isolated in overlay containers to avoid modifying the logo SVG directly.

### Notes
- Cherry-picked commit `b17ad377f4e2370d6b580ef7148a04ff6fee158c` from `feature/holiday-snow` and applied to `main`.


## v1.0.0-rc.19.2.1 (2025-12-04)
### Fixed
- Tooltip chip ordering: initial HTML and dynamic updates now consistently show Bittensor SDK, Taostats, CoinGecko.
- Prevent JS from overwriting rich HTML tooltips when a descriptive tooltip already exists in the markup.
- Reduce visual dominance of the API status chip (padding/font-size adjustments) for better card hierarchy.

### Changed
- API Status card: single centered status chip (OK / Partial / Error); detailed per-source status is available in the info-badge tooltip (HTML chips).
- Tooltip engine: support for trusted HTML via `data-tooltip-html="true"` is now canonical and used for API status.


## v1.0.0-rc.19 (2025-12-03)
### Added
- **Top-10 History collection & APIs**: scheduled collector + API endpoints for validators, wallets, and subnets. Snapshots stored in Cloudflare KV and backed up locally by workflow.
- **Terminal Boot Intro**: Matrix-style terminal overlay on page load that dispatches `terminalBootDone` to avoid init race conditions.
- **Price Pill Three-State**: price pill now always displays one of `price-up`, `price-down`, or `price-neutral` for consistent visuals (dark & light modes).
### Fixed
- **Initialization Race**: Added init guards and fallback refresh to ensure dashboard initializes even if the overlay interferes.
### Changed
- **Workflow cadence**: Top history collector updated to run every 30 minutes (`:13, :43`).

## v1.0.0-rc.18.6 (2025-12-03)
### Changed
- **Ampelsystem**: Merged 'Stable' and 'Neutral' into single 'Stable' state
  - Reduced signal matrix from 7 to 6 states
  - White glow now shows `⚪ Stable` for all quiet conditions
- **README**: Complete rewrite of Features section with actual highlights
- **Documentation**: Removed misleading "live/real-time" wording
- **Halving description**: Fixed to "issuance-based" (not block-based)

## v1.0.0-rc.18.5 (2025-12-03)
### Fixed
- **MA Thresholds**: Changed from sample-count to time-based thresholds
  - MA-3d now shows when ≥48h of data available (was: ≥432 samples)
  - MA-7d now shows when ≥120h of data available (was: ≥1008 samples)
- **Ampelsystem Logic**: Vol↓ + Price stable now shows neutral (white) instead of yellow
  - Yellow reserved for actual warnings (momentum loss, consolidation)
  - More intuitive: quiet market = no alert needed

## v1.0.0-rc.18.4 (2025-12-03)
### Added
- **Neutral Glow**: White/subtle glow animation for neutral signal state
  - Users can now see the Volume card is interactive even when neutral
  - Added `blink-white` CSS class with dezent white pulse

### Fixed
- **Tooltip Unification**: Single source of truth for Volume tooltip in `script.js`
  - Removed duplicate tooltip code from `taostats-card.js`
  - Combined Ampelsystem signal + confidence + Moving Averages in one tooltip
- **Red Border Bug**: Removed CSS rules in `taostats-card.css` that overrode Ampelsystem
  - `.stat-card.pulse-down` no longer sets border/background colors
- **Neutral Signal Emoji**: Added `⚪ Neutral` emoji for consistency
- **Confidence Line**: Removed colored emoji from confidence to reduce visual noise

## v1.0.0-rc.18.3 (2025-12-02)
### Fixed
- **Emission Calculation**: Fixed incorrect AVG. EMISSION / DAY showing ~5,781 instead of ~7,185 TAO/day
  - Added `sanitize_history()` to correct issuance drops (data anomalies)
  - Switched to winsorized mean of interval rates for robust statistics
  - Filters anomalous rates and trims outliers
- **Volume Signal Ampelsystem**: Added missing case for `Volume ↓ + Price stable` → Yellow
  - Previously fell through to neutral, keeping old signal color
  - Now correctly shows yellow glow per Readme specification

## v1.0.0-rc.18.2 (2025-12-01)
### Added
- Decorative "only 21 Mio." handwritten note in header (Caveat font, diagonal, light/dark auto-switch).
- Circ Supply card: shortened label, removed "/ 21M" from value.

### Fixed
- Mobile layout and toggle button alignment polished for iPhone and iPad.

## v1.0.0-rc.18.1 (2025-12-01)
### Fixed
- CSS cleanup: removed duplicate rules (tooltip, skeleton, chart container) to prevent drift and reduce CSS weight.
- Unified Light Mode pill value styling and added `prefers-reduced-motion` support to disable pulses/glows for sensitive users.
- No visual changes compared to RC18; behavior is identical.

## v1.0.0-rc.18 (2025-12-01)
### Improved
- **Halving Pill Palette**: Base gradient and default border now use brighter corals, and the light-mode accent stripe is softened so the pill remains readable on pale backgrounds.

### Fixed
- **Light-Mode Price Pill Stripe**: Enforced neutral borders on three sides so only the right-edge stripe stays visible; it now defaults to the brand accent and flips green/red according to the 24h change without rendering a second stripe.

## v1.0.0-rc.17.1 (2025-12-01)
### Improved
- **Price Pill Visuals**: Default pill now mirrors the halving pill with a cool blue shell plus slim right-edge stripe that turns green (price up) or red (price down).
- **Breathing Animation**: Reintroduced a subtle 6.5s breathing pulse applied to the entire price pill, keeping motion in sync with the halving countdown without the distracting stripe glow.

### Fixed
- **Indicator Logic + Specificity**: CSS and JS classes now stay aligned so the stripe color reflects 24h performance even after rapid data refreshes.
- **Code Cleanup**: Removed leftover German comments and unused keyframes to keep the stylesheet readable.

## v1.0.0-rc.16.9 (2025-12-01)
### Fixed
- **TaoStats Widget Conflict**: Fixed green border override on Volume signal card
- TaoStats CSS and JS now respect signal classes (blink-*) and don't override borders
- Removed duplicate CSS overrides and inline style workarounds (45 lines cleaned up)
- Signal cards now maintain gray border with colored glow as intended

## v1.0.0-rc.16.8 (2025-12-01)
### Improved
- **Signal Glow Intensity**: Increased glow opacity and radius for better visibility in dark mode
- Double-layer box-shadow effect (inner + outer glow) for premium "Apple-style" animation
- All signal colors (green, red, yellow, orange) now more vibrant and noticeable

## v1.0.0-rc.16.7 (2025-12-01)
### Fixed
- **CSS Isolation**: Properly exclude signal cards from default green hover styling
- Signal cards now maintain gray border like all other cards
- Green hover effect only applies to non-signal stat-cards via `:not()` selectors
- Works correctly in both dark and light mode

## v1.0.0-rc.16.6 (2025-12-01)
### Debug
- Added console.log output to track signal calculation during auto-refresh
- Logs volume change %, price change %, and resulting signal color

## v1.0.0-rc.16.5 (2025-12-01)
### Fixed
- **Signal Persistence**: Colored signals now persist until a DIFFERENT color is detected
- Neutral states are ignored when a color is already active
- Prevents signal loss during auto-refresh when market conditions temporarily fall within ±3% threshold

## v1.0.0-rc.16.4 (2025-12-01)
### Fixed
- **CSS Signal Persistence**: Added `!important` flag to all volume signal animations to prevent style override by generic `.stat-card:hover` rules
- Signal colors (red, green, yellow, orange) now persist correctly during hover and after auto-refresh cycles

## v1.0.0-rc.16.3 (2025-12-01)
### Fixed
- **Volume Signal**: Preserve last valid signal when API returns neutral/insufficient data
- **Animation Flash**: Add new class before removing old ones to prevent flash to default state

## v1.0.0-rc.16.2 (2025-12-01)
### Fixed
- **Hover Override**: Signal animation color no longer resets to green on hover
- Added explicit hover border-color rules for each signal state

## v1.0.0-rc.16.1 (2025-12-01)
### Fixed
- **Animation Visibility**: Changed signal animation from background to border-only
- Increased animation duration to 6s for smooth "breathing" effect

## v1.0.0-rc.16 (2025-12-01)
### Added
- **Volume Signal System (Ampelsystem)**: Traffic light indicator for Volume-Card
  - 🟢 Green: Volume ↑ + Price ↑ = Bullish (strong demand)
  - 🔴 Red: Volume ↑ + Price ↓ = Bearish (distribution/selling)
  - 🟡 Yellow: Volume ↓ = Consolidation/weak momentum
  - 🟠 Orange: Volume ↑ + Price stable = Potential breakout
  - Smooth 6s border animation ("breathing" effect)
  - Tooltip shows volume/price change percentages and interpretation

## v1.0.0-rc.14 (Release Candidate)
### Added
- **Block Time Kachel**: Real-time average block interval metric
  - Shows average seconds between blocks (target: 12.0s)
  - Status indicator: normal / slow / congested based on deviation
  - Tooltip with calculation formula and data source
- **Avg. Staking APR Kachel**: Stake-weighted average staking yield
  - Weighted formula: `Σ(APR × stake) / Σ(stake)` across top 50 validators
  - Tooltip shows simple avg, min/max range, validator count
  - More accurate than simple average for network-wide yield
- **Backend Infrastructure**:
  - `fetch_block_time.py`: Calculates avg block time from 200 blocks
  - `fetch_staking_apy.py`: Calculates stake-weighted APR from validators
  - `fetch-block-time.yml`: Hourly workflow at :49
  - `fetch-staking-apy.yml`: Hourly workflow at :19
  - `/api/block_time`: API endpoint serving block time data
  - `/api/staking_apy`: API endpoint serving APR data

### Changed
- **Renamed**: "Block" → "Block Height" for clarity
- **Workflow Schedule**: Optimized timing to avoid conflicts (all hourly workflows have 10-min spacing)

### Fixed
- **APR Calculation**: Fixed to use `nominator_return_per_day` field (dTao API doesn't expose direct APR)
- **Workflow Conflict**: Resolved `:59` collision between staking APY and top subnets workflows

## v1.0.0-rc.12 (Release Candidate)
### Added
- **Top 10 Wallets by Balance Card**: New dashboard section displaying the 10 addresses with highest total balance
  - Five-column layout: Rank, Identity/Address, Balance, Dominance %, Staked %
  - Identity resolution from two sources:
    - Taostats Exchanges API (`/api/exchange/v1`) for known exchanges (Binance, MEXC, Bitget, Kraken, etc.)
    - On-chain Identity API (`/api/identity/latest/v1`) for self-registered wallet names
  - Shows identity name + short address, or just address if no identity known
  - Real-time data from `/api/top_wallets` endpoint
  - Beautiful gradient headers, hover effects, full light/dark mode support
- **Backend Infrastructure**:
  - `fetch_top_wallets.py`: Python script fetching from Taostats Account API
  - `fetch-top-wallets.yml`: GitHub workflow running hourly at :39
  - `/api/top_wallets`: Cloudflare Pages function serving wallet data from KV

### Fixed
- **Light Mode Colors**: All wallet table text now properly black in light mode
  - Identity names, addresses, dominance %, and staked % all use #1a1a1a
  - Sub-addresses use #555 for visual hierarchy

## v1.0.0-rc.11.1 (Release Candidate)
### Fixed
- **Smart Chart Labels**: X-axis now shows appropriate time formats per timeframe
  - 1D: Hours only (e.g., "14:00", "15:00")
  - 3D: Day + time (e.g., "Nov 29 14:00")
  - 7D+: Date only (e.g., "11/29")

## v1.0.0-rc.11 (Release Candidate)
### Added
- **Enhanced Price Chart with 7 Timeframes**: 1D, 3D, 7D, 30D, 60D, 90D, 1Y
  - 1D/3D use hourly data for detailed intraday analysis
  - 7D-90D use daily OHLC candles
  - 1Y uses CoinGecko fallback for full historical coverage
- **Taostats as Primary Data Source**: All chart data now fetched from Taostats API first
- **CoinGecko Fallback**: Automatic fallback when Taostats data unavailable
- **Extended Price Tooltip**: Now shows 6 timeframes (1h, 24h, 7d, 30d, 60d, 90d)
- **New Backend Infrastructure**:
  - `fetch_price_history.py`: Dedicated script for chart data collection
  - `/api/price_history`: New API endpoint with `?range=` parameter
  - `fetch-price-history.yml`: Hourly workflow for fresh chart data

### Changed
- Price chart now prioritizes Taostats over CoinGecko for better data quality
- Intelligent data fetching: hourly granularity for short timeframes, daily for longer ones

## v1.0.0-rc.10 (Release Candidate)
### Added
- **Top 10 Validators Card**: New dashboard section displaying the 10 validators with highest stake
  - Five-column layout: Rank, Validator Name, Stake, Dominance %, Nominators
  - Real-time data from `/api/top_validators` endpoint (dTao API)
  - Smart fallback: Truncated hotkey shown for unnamed validators
  - Beautiful gradient headers, hover effects, full light mode support
- **Backend Infrastructure**:
  - `fetch_top_validators.py`: Python script fetching from Taostats dTao API
  - `fetch-top-validators.yml`: GitHub workflow running hourly at :29
  - `/api/top_validators`: Cloudflare Pages function serving validator data

## v1.0.0-rc.9 (Release Candidate)
### Added
- **Top 10 Subnets Card**: New dashboard section displaying the 10 subnets with highest emission share
  - Four-column layout: SN (netuid), Subnet Name, Emission %, Daily TAO
  - Real-time data from `/api/top_subnets` endpoint (taostats.io source)
  - Beautiful gradient headers, hover effects, full light mode support
- **Source Attribution**: Tooltip now shows "Source: taostats.io"

### Changed
- **Column Layout Optimization**: Symmetrical widths (10% | 25% | 32% | 33%) for balanced display
- **Simplified Tooltips**: Subnets info-badge now uses standard CSS text tooltip
- **Code Cleanup**: Removed ~135 lines of legacy tooltip handler code

### Fixed
- **Column Alignment**: Removed `::before` pseudo-elements that shifted table columns
- **Header Alignment**: All table headers now properly left-aligned
- **Width Consistency**: Fixed `table-layout: fixed` conflicts with nth-child selectors

## v1.0.0-rc.8.2 (Release Candidate)
### Changed
- **Workflow Optimization**: Staggered all scheduled workflows with 3-minute intervals to prevent simultaneous execution
  - `backup-taostats-r2.yml`: `:01 */3` (every 3 hours)
  - `backup-network-history-r2.yml`: `:04 */3` (every 3 hours)
  - `backup-issuance-history-r2.yml`: `:07 */3` (every 3 hours)
  - `publish-ath-athl.yml`: `:10 */3` (every 3 hours)
  - `publish-taostats.yml`: `:03, :13, :23, :33, :43, :53` (every 10 minutes)
  - `compute-taostats-aggregates.yml`: `:07, :17, :27, :37, :47, :57` (every 10 minutes)
  - `publish-network.yml`: `:11, :21, :31, :41, :51` (every 10 minutes, changed from 15-min)

### Benefits
- Eliminates worker queue collisions and simultaneous execution
- Reduces peak load on Cloudflare Workers and KV
- Predictable, distributed execution across the hour

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

