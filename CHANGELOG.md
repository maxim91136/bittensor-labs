# Changelog

All notable changes to this project will be documented in this file.

## Unreleased
-

## v1.0.0-rc.30.23 (2025-12-13)
### Fixes
- **Stable Countdown Width**: Zero-padded hours/minutes/seconds (e.g., 09h 04m 01s) for consistent pill width

## v1.0.0-rc.30.22 (2025-12-13)
### Features
- **Price Pill 7d Change**: Display 7-day price change in Price Pill (e.g., "7d +5.0%")
- **ISO Date Format**: Halving projections now use international ISO format (YYYY-MM-DD HH:MM UTC)

### Fixes
- **Price Pill Centering**: Fixed alignment of price value and [pill me] on mobile screens
- **Price Pill Layout**: Flexbox layout for proper element flow (Icon → Price → 7d → Toggle)

## v1.0.0-rc.30.21 (2025-12-13)
### Features
- **UTC Time in Halving Projections**: Tooltip now shows full date + time in UTC

### Fixes
- **Taostats Rate Limiting**: Added retry logic with exponential backoff for 429 errors

## v1.0.0-rc.30.20 (2025-12-13)
### Fixes
- **Mobile Halving Date**: Show halving date on mobile (smaller font) instead of hiding
- **Price Pill Compact**: Reduced padding, gap, and border-radius for cleaner look

## v1.0.0-rc.30.19 (2025-12-12)
### Changes
- **Halving Date Format**: Changed to numeric format (DD.MM.YY HH:MM) for compactness
- **Removed 24h Change from Price Pill**: Already shown in Market Conditions below

## v1.0.0-rc.30.18 (2025-12-12)
### Features
- **Halving Date Tracking**: Show last halving date (UTC) in the halving pill
  - New "Last:" row displays "-" before halving, date after (e.g., "Dec 27, 2025 14:35 UTC")
  - Backend detection in `fetch_network.py` - persists halving events to Cloudflare KV
  - New `/api/halving` endpoint to serve halving history
  - Frontend fetches from API with localStorage fallback
  - Mobile-optimized: label hidden on small screens (<400px)

## v1.0.0-rc.30.17 (2025-12-12)
### Code Quality
- **UI Helpers Module**: Extracted small utilities to `js/modules/uiHelpers.js` (~70 lines)
  - script.js reduced from 1373 → 1326 lines (-47 lines)
  - Sound toggle button initialization
  - Fear & Greed badge responsive positioning

### Summary
- **Total modularization progress**: script.js 4969 → 1326 lines (-73%)

## v1.0.0-rc.30.16 (2025-12-12)
### Code Quality
- **Theme Toggle Module**: Extracted light/dark mode to `js/modules/themeToggle.js` (~185 lines)
  - script.js reduced from 1536 → 1373 lines (-163 lines)
  - Safari/PWA fallback styles
  - Miner map and FNG spoon image swapping

### Summary
- **Total modularization progress**: script.js 4969 → 1373 lines (-72%)

## v1.0.0-rc.30.15 (2025-12-12)
### Code Quality
- **Top Displays Modules**: Extracted ranking display cards to 3 new modules (~460 lines total)
  - script.js reduced from 1954 → 1536 lines (-418 lines)
  - `js/modules/topSubnetsDisplay.js` - Top 10 subnets with ranking changes
  - `js/modules/topValidatorsDisplay.js` - Top 10 validators with ranking changes
  - `js/modules/topWalletsDisplay.js` - Top wallets, distribution, and decentralization

### Summary
- **Total modularization progress**: script.js 4969 → 1536 lines (-69%)

## v1.0.0-rc.30.14 (2025-12-12)
### Code Quality
- **Price Display Module**: Extracted price UI functions to `js/modules/priceDisplay.js` (~183 lines)
  - script.js reduced from 2092 → 1954 lines (-138 lines)
  - `buildApiStatusHtml()` - API status tooltip with chips
  - `animatePriceChange()` - Price flash animation
  - `updateTaoPrice()` - Price display with EUR/USD toggle
  - `updateMarketCapAndFDV()` - Market cap and FDV display

### Summary
- **Total modularization progress**: script.js 4969 → 1954 lines (-61%)

## v1.0.0-rc.30.13 (2025-12-12)
### Code Quality
- **Halving Countdown Module**: Extracted countdown logic to `js/modules/halvingCountdown.js` (~106 lines)
  - script.js reduced from 2161 → 2092 lines (-69 lines)
  - `startHalvingCountdown()` - Timer initialization
  - `generateHalvingThresholds()` - Calculate halving supply thresholds
  - `findNextThresholdIndex()` - Find active halving event
  - `rotateToThreshold()` - Calculate projected halving date
  - `updateHalvingCountdown()` - DOM update with countdown display

### Summary
- **Total modularization progress**: script.js 4969 → 2092 lines (-58%)

## v1.0.0-rc.30.12 (2025-12-12)
### Code Quality
- **Refresh Controls Module**: Extracted auto-refresh system to `js/modules/refreshControls.js` (~204 lines)
  - script.js reduced from 2312 → 2161 lines (-151 lines)
  - `startAutoRefresh()` - Timer management with countdown
  - `toggleRefreshPause()` - Triple-click pause/resume
  - `renderRefreshIndicator()` - Circular countdown UI
  - `ensureAutoRefreshStarted()` - Failsafe startup
  - System Failure Easter egg integration

### Summary
- **Total modularization progress**: script.js 4969 → 2161 lines (-56%)

## v1.0.0-rc.30.11 (2025-12-12)
### Code Quality
- **Tooltip Manager Module**: Extracted tooltip system to `js/modules/tooltipManager.js` (~302 lines)
  - script.js reduced from 2587 → 2312 lines (-275 lines)
  - `TooltipManager` class - positioning, show/hide, accessibility
  - `setupDynamicTooltips()` - event handlers for info-badges, halving-pills, price-pills
  - Touch/keyboard support with auto-hide and persistent modes

### Summary
- **Total modularization progress**: script.js 4969 → 2312 lines (-53%)

## v1.0.0-rc.30.10 (2025-12-12)
### Code Quality
- **Price Fetchers Module**: Extracted API functions to `js/modules/priceFetchers.js` (~347 lines)
  - script.js reduced from 2877 → 2587 lines (-290 lines)
  - `fetchTaoPrice()` - TAO price with Binance→Taostats→CoinGecko fallback
  - `fetchPriceHistory()` - Price/OHLCV history for charts
  - `fetchBtc/Eth/SolPriceHistory()` - Comparison data
  - `fetchEurUsdRate()` - Currency conversion
  - `fetchCirculatingSupply()` - Supply data

### Cleanup
- Removed unused `promo/` directory

### Summary
- **Total modularization progress**: script.js 4969 → 2587 lines (-48%)

## v1.0.0-rc.30.9 (2025-12-12)
### Code Quality
- **Price Chart Module**: Extracted chart logic to `js/modules/priceChart.js` (~420 lines)
  - script.js reduced from 3197 → 2877 lines (-320 lines)
  - `createPriceChart()` - Chart creation with line/candlestick modes
  - `refreshPriceChart()` - Async chart refresh with locking
  - `setChartConfig()/getChartConfig()` - Config state management
  - Supports BTC/ETH/SOL comparison overlays, EUR conversion, volume bars

### Summary
- **Total modularization progress**: script.js 4969 → 2877 lines (-42%)

## v1.0.0-rc.30.8 (2025-12-12)
### Code Quality
- **Volume Signal Module**: Extracted Ampelsystem to `js/modules/volumeSignal.js` (~601 lines)
  - script.js reduced from 3800 → 3197 lines (-603 lines)
  - `fetchVolumeHistory()` - History data fetching
  - `calculateVolumeChange()` - 24h volume comparison
  - `getVolumeSignal()` - Traffic light logic (green/red/yellow/orange/white)
  - `applyVolumeSignal()` - DOM updates with glow animation
  - `updateVolumeSignal()` - Main update function
  - `applyVolumeConfig()` - Runtime config
- **Dependency Fix**: Updated `market-conditions.js` to import from new module location

### Summary
- **Total modularization progress**: script.js 4969 → 3197 lines (-36%)

## v1.0.0-rc.30.7 (2025-12-12)
### Code Quality
- **Fear & Greed Module**: Extracted F&G UI logic to `js/modules/fearAndGreed.js` (~195 lines)
  - script.js reduced from 3995 → 3800 lines (-195 lines)
  - `mapFngToClass()` - CSS class mapping
  - `animateSpoonNeedle()` - Spoon gauge animation
  - `testSpoonGauge()` - Console test helper
  - `updateFearAndGreed()` - Main update function

## v1.0.0-rc.30.6 (2025-12-12)
### Code Quality
- **Major Module Extraction**: script.js reduced from 4969 → 3995 lines (-974 lines, -20%)
  - Created `js/modules/seasonalEffects.js` (~310 lines)
    - Holiday Snowfall, NYE Sparkles, Spring Birds/Bees, Autumn Leaves
    - `initAllSeasonalEffects()` consolidates all seasonal initializers
  - Created `js/modules/easterEggs.js` (~410 lines)
    - `showSystemFailureEasterEgg()` - Matrix SYSTEM FAILURE overlay
    - `triggerNeoEasterEgg()` - "Wake up, Neo" + Morpheus quotes typewriter

### Fixed
- **Footer Date**: Abbreviated "November" to "Nov." for mobile layout
- **VERSION File**: Now correctly reflects current RC version

## v1.0.0-rc.30.5 (2025-12-12)
### Added
- **Favicon**: Proper SVG favicon file
  - Created `assets/favicon.svg` from header brand-mark icon
  - Network node design: green center, orange corners, connection lines
  - Replaced inline data URI with external file

### Changed
- **Learn Card Redesign**: "Wanna learn more about Bittensor?"
  - Added LearnBittensor.org button with purple gradient and book icon
  - Handwritten intro: "Your journey begins here..."
  - Documentary intro: "...and dive deep with the documentary"
  - Removed second video (kept only "The Incentive Layer" documentary)
  - Added subtle divider between sections

## v1.0.0-rc.30.4 (2025-12-12)
### Changed
- **Rebranding**: Dashboard → Terminal
  - Tagline updated: "the incentive layer terminal"
  - README and meta descriptions updated
  - "Real-time pricing" → "Live pricing" (more accurate)

### Added
- **Footer Bittensor Branding**: Official Bittensor logotype in footer
  - "Built on Bittensor" with white SVG logo
  - Footer date: November 3, 2025 (exact launch date)
  - Added bittensor-brand/ assets directory

### Fixed
- **MA Formatters Missing**: Market Conditions card not displaying MA values
  - Added `formatMADollar()` and `formatMAPct()` to market-conditions.js
  - Values now display correctly (e.g., "$5.2B", "+2.3%")

### Code Quality
- **Module Extraction**: Created `js/modules/uiUpdates.js`
  - Extracted `updateAthAtlPills()`, `updateBlockTime()`, `updateStakingApr()`
  - script.js reduced: 5069 → 4969 lines (-100 lines)

## v1.0.0-rc.30.3.2 (2025-12-12)
### Fixed
- **Market Conditions Signal Metric**: Redesigned for cleaner layout
  - Removed icon (was causing spacing issues)
  - Changed to standard vertical layout: Label (SIGNAL) on top, Value (Caution/Bullish/etc) below
  - Matches the visual structure of other metrics (Volume, Price, Trend)
  - Font sizes: Label 0.85em, Value 2em (desktop); Label 0.7em, Value 1.5em (mobile)

## v1.0.0-rc.30.3.1 (2025-12-12)
### Documentation
- **README Update**: Comprehensive documentation for RC30 features
  - Added TAO Distribution Analysis section with percentile rankings
  - Added Network Decentralization Score section with all metrics explained
  - Updated RC30 highlights to reflect current feature set
  - Updated latest release version

## v1.0.0-rc.30.3 (2025-12-11)
### Fixed
- **Nakamoto Coefficient Calculation**: Critical fix for validator Nakamoto
  - Was calculating 51% threshold against top 100 validators' stake only (~1.8M TAO)
  - Now uses total network stake (~2.44M TAO) from API
  - Result: Nakamoto=7 (correct) instead of Nakamoto=3 (wrong)
  - `calculate_nakamoto()` now accepts optional `total` parameter

## v1.0.0-rc.30.1 (2025-12-11)
### Fixed
- **API Status Tooltip**: Added missing Binance to data sources list
  - Binance provides real-time price, candlesticks, volume data

## v1.0.0-rc.30 (2025-12-11)
### Added
- **TAO Distribution Card**: New dashboard card showing wealth distribution metrics
  - Percentile Thresholds: How much TAO needed for Top 1%, 3%, 5%, 10%
  - Wallet Brackets: Count of wallets with >10k, >1k, >100, >10 TAO
  - Sample size and last updated timestamp in footer
  - Credit to @RBS_HODL who pioneered monthly distribution posts
  - Tooltip explains weekly update schedule due to API rate limits

### Changed
- **Distribution Fetch Robustness**: Graceful degradation for API failures
  - Retry logic: Up to 3 attempts per failed request with progressive backoff (30s/60s/90s)
  - Graceful degradation: If 5,000+ wallets already fetched, continue with partial data
  - Prevents losing all data on single timeout (previously lost 19k wallets)

### Infrastructure
- **Weekly Distribution Workflow**: Runs every Sunday 03:00 UTC
  - Fetches 20,000 top wallets from Taostats API
  - Calculates percentile thresholds and bracket distributions
  - Stores results in Cloudflare KV for dashboard consumption

## v1.0.0-rc.29.2 (2025-12-11)
### Fixed
- **Mobile Pill Spacing**: Tighter gap between halving and price pills on mobile
  - Gap: 14px → 8px (480px), 6px → 5px (400px)
  - Compact price pill padding and currency toggle
- **Toggle Mutual Exclusion**: Bidirectional exclusion now complete
  - Compare → disables Candle + Volume (existing)
  - Candle → disables Compare (new)
  - Volume → disables Compare (new)
- **Time Range Toggle Preservation**: Switching timeframes no longer resets Candle/Volume/Compare toggle states
- **Easter Egg Frequency**: Reduced visual noise
  - Matrix glitch: every refresh → every 3rd refresh
  - "Wake up, Neo": on page load → after 5th refresh, positioned bottom-left

## v1.0.0-rc.29.1 (2025-12-11)
### Added
- **Info Badge for Price Chart**: Detailed tooltip explaining all chart features
  - Time ranges, EUR toggle, Compare mode, Candle/Vol toggles
  - Note about Candle/Vol limitations in Compare mode

### Fixed
- **Toggle Stability**: Shared `refreshPriceChart()` with locking prevents double-click issues
- **Candle/Vol for All Timeframes**: Skip Taostats when OHLCV needed, go direct to Binance
- **Auto-Disable Candle/Vol**: When Compare mode (BTC/ETH/SOL) activated, Candle/Vol auto-disable
- **Price Pill Currency Toggle**: Moved closer to price change (margin 6px → 2px)
- **Info Badge Position**: Added padding to chart controls for proper badge placement

## v1.0.0-rc.29 (2025-12-11)
### Added
- **Candlestick Chart**: Professional OHLC candlestick visualization
  - Toggle between Line and Candle chart modes
  - Green candles for up, red for down
  - Full OHLC tooltip (Open, High, Low, Close)
  - Uses Binance kline data (TAO only, not in Compare mode)
- **Volume Bars**: Trading volume visualization below price chart
  - Scaled to 25% of chart height for clean display
  - Gray bars with subtle transparency
  - Separate y-axis for volume data
- **Chart.js Financial Plugin**: Added professional charting dependencies
  - Luxon date library for time axis
  - chartjs-adapter-luxon for Chart.js integration
  - chartjs-chart-financial for candlestick rendering

### Changed
- **fetchPriceHistory**: Now returns `{ prices, ohlcv, volume, source }` object
  - Full OHLCV data from Binance API
  - Backwards compatible with legacy array format
- **Chart Type Toggles**: New cyan accent color for Candle/Vol buttons
  - Visual separator between comparison and chart type toggles

## v1.0.0-rc.28.3 (2025-12-11)
### Added
- **ETH & SOL Comparison**: Compare TAO performance against ETH and SOL (in addition to BTC)
  - New toggle buttons: BTC (orange), ETH (gray), SOL (purple)
  - All comparisons use normalized percentage view
  - States persisted to localStorage

### Changed
- **Price Chart Position**: Moved to #2 (after Market Conditions, before Stat Cards)
  - More prominent placement for the most-used feature
- **Chart Toggle Colors**: Distinct colors with borders for better visibility
  - BTC: Orange (#f7931a)
  - ETH: Gray (#b0b0b0, darker #555 in Light Mode)
  - SOL: Purple (#9945ff)
  - EUR: Gold (#fbbf24)

### Fixed
- **ETH Light Mode**: Darker gray (#555) for better contrast in Light Mode

## v1.0.0-rc.28.2 (2025-12-10)
### Infrastructure
- **Cloudflare Workers Paid Plan**: Upgraded from free tier due to KV storage and request limits
  - Enables larger history datasets and more frequent updates
  - Supports chunked daily storage for issuance, network, and taostats history

### Fixed
- **Currency Toggle Visibility**: Larger button with better contrast
  - Increased size: `padding: 3px 8px`, `font-size: 0.85em`
  - Light Mode support with proper dark-on-light colors
- **Mobile Price Pill**: More compact layout for narrow screens
  - Tighter gap and padding
  - Smaller but visible currency toggle

## v1.0.0-rc.28.1 (2025-12-10)
### Documentation
- **README.md**: Updated for RC28 features
  - Added Price Chart section with new features
  - Updated Network Metrics with real-time pricing info
  - Updated Data Sources with Binance API details

## v1.0.0-rc.28 (2025-12-10)
### Added
- **Binance API Integration**: Real-time price data (<1s delay vs 20+ min from Taostats)
  - Primary source for TAO price, 24h change, and volume
  - Fallback chain: Binance → Taostats → CoinGecko
- **TAO vs BTC Comparison**: Toggle to compare TAO and BTC performance over time
- **EUR Currency Support**: Toggle to display prices in Euros
  - Synced toggle on both price pill and chart
  - Live EUR/USD conversion rate from Binance
- **Max Price Range**: View full price history (~600 days since Binance listing)
- **Daily Chunking for History Data**: Improved storage efficiency
  - Network history, issuance history, taostats history
  - Automatic fallback to legacy keys for backwards compatibility

### Performance
- **Faster Data Updates**: Workflow intervals reduced from 15min to 5min
- **Reduced API Calls**: Fear & Greed fetch reduced to 2x daily

### Fixed
- **Max Chart Labels**: Proper "Apr '24" format for long time ranges, 12 evenly spaced labels
- **Mobile Responsive**: Chart toggles (EUR/BTC) wrap properly on narrow screens
- **Leaderboard Tables**: Improved mobile display for Subnets, Validators, Wallets
- **Price Consistency**: Market Conditions now uses Binance 24h change (same as pill)

### Changed
- **Price Source**: Binance is now primary (real-time), Taostats is fallback
- **Disclaimer**: Updated to reflect Binance as "Price Data" source

## v1.0.0-rc.27.4.1 (2025-12-10)
### Fixed
- **Leaderboard Ranking Changes**: ▲ ▼ NEW indicators now display correctly
  - Fixed history data parsing (uses `entries` array with `id` field)
  - Changed comparison from last 30 min to last 24h for meaningful changes
  - Applies to: Subnets, Validators, Wallets leaderboards

## v1.0.0-rc.27.4 (2025-12-10)
### Fixed
- **Bittensor SDK v10.0 Compatibility**: Full migration to SDK v10.0 breaking changes
  - `bt.subtensor()` → `bt.Subtensor()` (PascalCase)
  - `get_subnets()` → `get_all_subnets_netuid()`
  - `bt.Metagraph()` class → `subtensor.metagraph(netuid, mechid=0)` method

### Technical
- Updated `fetch_network.py` and `fetch_top_subnets.py` for SDK v10.0
- Fixes "Subnets: 0, Validators: 0, Neurons: 0" display issue

## v1.0.0-rc.27.3.1 (2025-12-09)
### Added
- **New Easter Egg**: Hidden Matrix-themed surprise - can you find it?
- **Enhanced Refresh Indicator**: Clickable with hover effects and glow
  - Single-click refreshes dashboard instantly
  - Responsive sizing for all screen sizes

### Improved
- **Mobile Optimization**: Smaller refresh indicator on narrow screens (22px @ <420px)

## v1.0.0-rc.27 (2025-12-09)
### Fixed
- **Emission Calculation Bug**: Fixed 752k TAO/day display caused by missing anomaly filter
- **History Sanitization**: Improved to only remove corrupt samples, not cascading deletions
- **Sample Validation**: New samples are now validated before being added to history

### Added
- **Dynamic Emission Bounds**: Filter automatically adjusts based on halving level
- **Halving-Ready**: System will continue working correctly after each halving event

### Technical
- Emission filter now uses dynamic bounds (±40% of expected rate per halving level)
- Pre-halving: 4320-10080 TAO/day, Post-halving 1: 2160-5040 TAO/day, etc.
- Corrupt samples detected by drops are removed (the high value before the drop)
- New samples validated: bounds check, no decreases, max 1000 TAO/interval jump

## v1.0.0-rc.26.5 (2025-12-08)
### Fixed
- **Block Time Fetch**: Reduced from 100 to 25 blocks for faster response

## v1.0.0-rc.26.4 (2025-12-08)
### Fixed
- **Correct Timestamp Sources**: Each tooltip uses its proper API timestamp
- **Block Height/Halving**: Now use `last_issuance_ts` from Network API
- **No False Timestamps**: Removed misleading Taostats timestamps from Network API data

## v1.0.0-rc.26.3 (2025-12-08)
### Added
- **Last Updated Timestamps**: All key tooltips now show data freshness
- **Tooltips Enhanced**: Block Height, Block Time, Staking APY, Price Change, Halving, TAO Price

### Fixed
- **Immediate Display**: Timestamps appear on page load, not just after refresh
- **Price Badge**: Fixed undefined variable issue in tooltip

## v1.0.0-rc.26.2 (2025-12-08)
### Added
- **Wallets Ranking System**: Position change indicators (▲ ▼ NEW)
- **History Comparison**: Uses address as unique identifier

### Improved
- **Unified Fonts**: Monospace across entire wallets table
- **Header Consistency**: 0.9em font-size, matching Subnets/Validators
- **Color-Matched Headers**: DOM % and Staked headers gray/white like data

### Complete
- **All 3 Top 10 Cards**: Subnets, Validators, Wallets now have ranking system

## v1.0.0-rc.26.1 (2025-12-08)
### Added
- **Validators Ranking System**: Position change indicators (▲ ▼ NEW)
- **History Comparison**: Uses hotkey as unique identifier

### Improved
- **Unified Fonts**: Monospace across entire validators table
- **Header Consistency**: 0.9em font-size, matching Subnets
- **Color-Matched Headers**: DOM % and NOMS headers gray/white like data

## v1.0.0-rc.26 (2025-12-08)
### Added
- **Subnet Ranking System**: Position change indicators (▲ ▼ NEW)
- **History Comparison**: Fetches previous snapshot for ranking changes

### Improved
- **Unified Fonts**: Monospace across entire subnet table
- **4-Column Layout**: Streamlined Rank | Subnet | Share | Daily
- **Market Conditions Title**: Smaller desktop, larger mobile

## v1.0.0-rc.25.6 (2025-12-08)
### Improved
- **Volume Moving Averages**: Renamed section title for clarity
- **Mobile Readability (480px)**: Optimized font sizes for MA section
  - `.ma-title`: 0.9em
  - `.ma-item`: 0.9em
  - `.ma-label`: 0.88em
  - `.ma-value`: 1.0em
  - `.ma-change`: 0.88em

## v1.0.0-rc.25.5 (2025-12-08)
### Improved
- **Mobile Readability**: Larger font sizes for MA values and phase section
  - Moving Averages: 25-30% larger across all breakpoints
  - Phase section: 0.8em → 1em (desktop), 0.9em (mobile)
- **Dual Market Labels**: Emotional + technical interpretation for each condition
  - Emotional labels with `?` (questions, not statements)
  - Technical labels (pure descriptions)
  - Example: `💀 capitulation?` + `📊 max selling pressure`
- **Shorter Market Text**: `Market: Bearish (-22.5% 3d/7d)` (~50% shorter)
- **Clean Line Breaks**: Each label on separate line, no mid-text wrapping

### Fixed
- **Legal Safety**: Removed all investment advice language
  - No "buy opportunity", "sell signal", etc.
  - All interpretations are questions or descriptions

## v1.0.0-rc.25.4 (2025-12-08)
### Fixed
- **Market Phase Colors**: Corrected color mapping for market conditions
  - Bearish (negative values): Now displays red text + red border
  - Bullish (positive values): Now displays green text + green border
  - Neutral: Yellow text + yellow border
  - Applies to both dark and light mode
  - Previously bearish text was incorrectly showing in green

### Improved
- **Visual Clarity**: Market phase sentiment now instantly recognizable by color
- **Consistency**: Color scheme now matches market sentiment across all elements

## v1.0.0-rc.25.3.2 (2025-12-08)
### Changed
- **Documentation Overhaul**: Complete README update to RC25.3.2
  - Updated version from RC23.7 to current release
  - Added comprehensive Market Conditions Intelligence section
  - Documented all RC25+ features (4 key metrics, phase analysis, MAs)
  - Updated highlights to showcase current dashboard state

### Removed
- **Legacy Ampelsystem Code**: Cleaned up deprecated Volume Signal Card
  - Removed standalone Ampelsystem section from README (~33 lines)
  - Removed taostats-card asset links from index.html
  - Deleted `assets/taostats/` folder (CSS, HTML, JS - 3 files, 10KB)
  - Result: -313 lines of redundant code

### Added
- **Fear & Greed Index Section**: New dedicated documentation
- **Git Tags**: Created retroactive tags for RC25.2, RC25.3, RC25.3.1

### Improved
- **Documentation Accuracy**: README now matches actual implementation
- **Codebase Cleanliness**: No dead code, no broken links
- **Professional Presentation**: Complete, accurate, current docs

### Notes
- Pure documentation and cleanup release
- No functional changes to dashboard
- Foundation for v1.0.0 with complete documentation
- See `RELEASE_NOTES/v1.0.0-rc.25.3.2.md` for details

## v1.0.0-rc.25.3.1 (2025-12-08)
### Changed
- **Market Phase Section Mobile Optimization**: Improved text readability on small screens
  - Base: Added word-wrap and overflow-wrap for better text breaking
  - Tablet (≤768px): Font reduced to 0.75em, line-height 1.45
  - Mobile (≤480px): Font reduced to 0.72em, line-height 1.4, added hyphens
  - Long descriptive text now wraps cleanly without overflow

### Impact
- Better readability on mobile devices
- No text overflow on narrow screens
- Professional appearance across all screen sizes

### Notes
- Pure mobile UX refinement
- Desktop experience unchanged
- See `RELEASE_NOTES/v1.0.0-rc.25.3.1.md` for details

## v1.0.0-rc.25.3 (2025-12-08)
### Changed
- **Metric Label Clarity**: Fourth metric renamed for maximum understanding
  - "Phase" → "MA Trend" → "Price Trend" → "Trend (3d/7d)"
  - Final label: **"Trend (3d/7d)"** - clear, compact, mobile-friendly
  - Shows medium-term price trend (3-day vs 7-day MA comparison)
  - Eliminates confusion with "Signal" metric

### Improved
- **Centered Values**: All metric values now centered in their cards
  - Better visual balance and polish
  - Signal card maintains horizontal layout
- **Label Clarity**: Four metrics now crystal clear at a glance:
  - Signal: Multi-factor short-term signal
  - Volume 24h: Trading volume + change
  - Price 24h: Short-term price change
  - Trend (3d/7d): Medium-term price trend
- **Mobile Optimization**: Compact labels fit perfectly on small screens

### Notes
- Pure UX/UI refinement pass
- No functional changes to data or logic
- Focus on clarity and mobile experience
- See `RELEASE_NOTES/v1.0.0-rc.25.3.md` for details

## v1.0.0-rc.25.2 (2025-12-08)
### Added
- **Dollar Volume Display**: Volume 24h now shows actual dollar amount ($171.6M) plus percentage change (+144.3%)
  - New `formatCompactVolume()` function for clean dollar formatting
  - Dual-value metric display with main value (white) and sub value (conditional color)

### Changed
- **Strategic Color Usage**: Reduced green overload for better visual hierarchy
  - **Neutral/white**: All dollar values, metric labels (VOLUME 24H, PRICE 24H, MA-2h, etc.)
  - **Conditional green/red**: Only percentage changes (+5.9% = green, -5.3% = red)
  - **Signal badges**: Market status indicators remain colored (Bullish/Bearish)
  - Result: Color now indicates signals and trends, not decoration

### Improved
- **Visual Hierarchy**: Clear distinction between signals (colored) and values (neutral)
- **Reduced Visual Fatigue**: Less overwhelming when all metrics are bullish
- **Faster Scanning**: Eye drawn to important signals, not distracted by uniform color
- **Professional Polish**: Intentional design with semantic color usage

### Notes
- Pure UX/UI refinement pass
- No functional changes to data or logic
- Full responsive and light/dark mode support
- See `RELEASE_NOTES/v1.0.0-rc.25.2.md` for details

## v1.0.0-rc.25.1 (2025-12-07)
### Changed
- **Market Conditions Title**: Renamed to "Market Conditions (short term)" for clarity
- **Card Layout**: Swapped Neurons (position 8) and API (position 12) - API now last badge
- **Mobile Optimization**: Compact design for small screens (30-40% less space)
  - Tablet: Reduced padding, smaller fonts (metric-value: 1.5em)
  - Mobile: Minimal padding, compact fonts (metric-value: 1.3em)
  - 2x2 grid maintained on all mobile screens for consistency

### Notes
- Pure UX/UI polish pass
- No functional changes
- See `RELEASE_NOTES/v1.0.0-rc.25.1.md` for details

## v1.0.0-rc.25 (2025-12-07)
### Added
- **Dynamic Phase Coloring**: Market phase status now color-coded (Bearish=red, Bullish=green, Watch=orange, Caution=yellow)
- **Complete Tooltip System**: Added missing CSS for modern tooltips (backdrop blur, animations, arrows, status chips)
- **Market Monitoring Magic**: Market Conditions card fully functional with real-time intelligence

### Fixed
- **Tooltip Visibility**: Added missing `.modern-tooltip` CSS (167 lines) - tooltips were invisible before
- **Tooltip Behavior**: Added missing `mouseleave` event listener - tooltips now properly hide
- **Light Mode Support**: Market Conditions card now properly switches with theme toggle
- **Initial Data Load**: Token Economics and Market Conditions cards now update on page load (not just refresh)

### Changed
- **Token Economics Card**: Simplified to "Issued Tokens" only (% of max supply)
  - Removed duplicate Avg. Emission data (we have dedicated card)
  - Cleaner stat-card format
- **API Card**: Renamed from "API Status" to "API" for brevity

### Improved
- **Market Intelligence**: Complete monitoring system with multi-factor analysis
  - Volume trends + Price action + Moving Averages + Sentiment
  - Confidence scoring and data quality metrics
  - Weekend context indicators
- **Visual Feedback**: Dynamic coloring provides instant market sentiment recognition

### Technical
- Tooltip CSS: backdrop blur, scale animations, arrows, chips, light mode
- Event listeners: proper cleanup with `mouseleave` handlers
- Light mode: `.market-conditions-card` added to toggle selector
- Integration: Cards update in both `initDashboard()` and `refreshDashboard()`

### Notes
- **The monitoring centerpiece** - Market Conditions card is fully operational
- Multi-source data aggregation (volume history, Taostats, F&G Index)
- See `RELEASE_NOTES/v1.0.0-rc.25.md` for complete technical details

## v1.0.0-rc.24 (2025-12-07)
### Added
- **Market Conditions Card**: New comprehensive card with market signal, volume/price metrics, moving averages, and phase analysis
- **Fear & Greed Index Integration**: Market sentiment data integrated into signal calculation
- **Last Updated Timestamps**: All tooltips and cards show data freshness

### Changed
- **Card Layout**: Swapped API Status (position 7) with Neurons (position 11) for better hierarchy
- **API Status Card**: Centered badge within card with responsive positioning
- **Typography**: Market Conditions title reduced to 1.3em on desktop
- **F&G Card**: Spoon gauge moved lower for better visual balance

### Improved
- **Tooltips**: English translations, improved descriptions, pills stay open on hover
- **Market Intelligence**: Multi-factor analysis with volume, price, MAs, and sentiment

### Technical
- New files: `market-conditions.css`, `market-conditions.js`
- CSS Grid for metrics (4 cols desktop, responsive)
- Absolute positioning with transform for pixel-perfect centering

### Notes
- Pure frontend enhancement with external API integration
- See `RELEASE_NOTES/v1.0.0-rc.24.md` for full technical details

## v1.0.0-rc.23.4 (2025-12-06)
### Added
- **Easter Egg Variety**: 5 randomized Matrix messages (3x Morpheus, 1x Trinity, 1x The Oracle)

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

