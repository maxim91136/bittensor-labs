### Summary

Prefer on-chain `totalIssuance` (`totalIssuanceHuman`) for halving calculations in the frontend, with a fallback to Taostats `circulating_supply`. Update tooltip to indicate the source used.

### What changed
- Frontend (`script.js`): Now uses `data.totalIssuanceHuman` if present, otherwise falls back to `circulating_supply` for halving logic. Stores previous halving supply snapshot for stable delta-based emission estimate.
- Tooltip text updated to include the source (On-chain / Taostats).

### Why
- `TotalIssuance` is the authoritative on-chain supply figure; prefer it for halving calculation accuracy. Keep Taostats as a reliable fallback.

### Tests / How to validate
1. Make sure the /api/network returns `totalIssuanceHuman` (backend already implemented).
2. Open the dashboard and verify the halving pill shows the data-tooltip with `Source: On-chain (TotalIssuance)` when on-chain data is provided.
3. Verify fallback to `Source: Taostats (circulating_supply)` if the on-chain field is missing.

### Notes
- No UI layout changes — only logic change (halving computations and tooltip).  
- If you want `halvingThresholds` in backend to be configurable, we can add this as a follow-up PR.
