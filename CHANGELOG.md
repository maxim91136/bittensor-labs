# Changelog

All notable changes to this project will be documented in this file.

## Unreleased
- 

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
