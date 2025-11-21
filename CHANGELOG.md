# Changelog

All notable changes to this project will be documented in this file.

## Unreleased
- 

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
