Halving Estimates and Projection Metadata
=========================================

This document describes the additional fields the `fetch_network.py` producer writes into the `metrics` Cloudflare KV entry (and thus into `network.json`). These fields are intended for frontends and API consumers that display or analyze supply-halving projections.

halving_estimates
------------------
An array of objects, one per configured halving threshold. Each object contains:

### Core Fields
- `threshold` (number): target total issuance for the halving event.
- `remaining` (number): tokens remaining until the threshold (threshold - current issuance).
- `days` (number|null): projected days until the threshold at the `emission_used` rate (rounded to 3 decimals), or `null` if projection not possible.
- `eta` (ISO timestamp|null): estimated date/time when the threshold will be reached, or `null`.
- `method` (string|null): projection method used. GPS-based methods: `emission_7d`, `emission_30d`, `empirical_halved`, `theoretical`.
- `emission_used` (number|null): the TAO/day emission rate used to calculate the ETA for this specific threshold.
- `step` (int|null): 1-based index of the halving event (1 = next halving, 2 = following, ...). `null` if the threshold was malformed.

### Triple-Precision GPS Metadata
These fields provide transparency about the GPS (Global Positioning System) methodology used for projection:

- `gps_stage` (string|null): Current GPS stage for this projection:
  - `'post_halving_stabilization'`: 0-7 days post-halving, all data contaminated
  - `'terminal_approach_transition'`: 7-30d post-halving, terminal approach (<7d away), using clean 7d data
  - `'long_range_transition'`: 7-30d post-halving, long-range (>7d away), using theoretical (30d contaminated)
  - `'terminal_approach'`: >30d post-halving, terminal approach (<7d away), using clean 7d data
  - `'long_range'`: >30d post-halving, long-range (>7d away), using clean 30d data

- `confidence` (string): Confidence level of the projection:
  - `'empirical_halved'`: Doug's Cheat - using actual pre-halving emission data, highest confidence
  - `'protocol_defined'`: Using theoretical emission (7200/2^n), high confidence
  - `'high'`: Using empirical data from clean, sufficient history
  - `'medium'`: Limited history but usable
  - `'low'`: Very limited history, projection unreliable

- `days_since_halving` (number|null): Days elapsed since the last halving event (rounded to 2 decimals). Only present during post-halving phases (0-30 days).

- `data_clean_in_days` (number|null): Days remaining until empirical data becomes clean (rounded to 2 decimals). Only present when using theoretical emission due to contamination. `null` when data is already clean.

Projection metadata (top-level fields)
--------------------------------------
- `avg_emission_for_projection` (number|null): the emission rate selected for projection (rounded); may be `emission_7d`, `emission_daily`, or a mean from intervals depending on data availability.
- `projection_method` (string|null): which method was used to choose the projection rate.
- `projection_confidence` (string): `'low'|'medium'|'high'` depending on days of history used (signals reliability).
- `projection_days_used` (int|null): how many days of data were effectively used to build the projection.

History diagnostics
-------------------
- `history_samples` (int): number of snapshots in the local `issuance_history` used to compute deltas.
- `per_interval_samples` (int): number of per-interval delta samples computed from the history.
- `days_of_history` (float|null): approximate days covered by the stored history (e.g. 0.8).

Example `halving_estimates` entries
------------------------------------

### Example 1: Doug's Cheat - Post-Halving Stabilization (0-7 days)
Using actual pre-halving emission data (halved) during data contamination:
```json
{
  "step": 2,
  "threshold": 15750000.0,
  "remaining": 5250000.0,
  "days": 1458.333,
  "eta": "2029-12-13T01:23:23+00:00",
  "method": "empirical_halved",
  "emission_used": 3623.47,
  "gps_stage": "post_halving_stabilization",
  "confidence": "empirical_halved",
  "days_since_halving": 0.6,
  "data_clean_in_days": 6.4
}
```
Note: `emission_used` is actual pre-halving emission (7246.94 τ/day) halved = 3623.47 τ/day, NOT theoretical 3600.

### Example 2: Normal GPS Operation (>30 days post-halving)
Using empirical 7d data for terminal approach:
```json
{
  "step": 3,
  "threshold": 18375000.0,
  "remaining": 2625000.0,
  "days": 729.167,
  "eta": "2027-12-10T09:23:23+00:00",
  "method": "emission_7d",
  "emission_used": 3600.0,
  "gps_stage": "terminal_approach",
  "confidence": "high"
}
```

### Example 3: Normal GPS Operation - Long Range
Using empirical 30d data for long-range projection:
```json
{
  "step": 4,
  "threshold": 19687500.0,
  "remaining": 1312500.0,
  "days": 1458.333,
  "eta": "2031-12-07T17:23:23+00:00",
  "method": "emission_30d",
  "emission_used": 900.0,
  "gps_stage": "long_range",
  "confidence": "high"
}
```

Triple-Precision GPS Methodology
---------------------------------

The **Triple-Precision GPS (Global Positioning System)** is a distance-adaptive emission selection methodology that ensures accurate halving projections across all time horizons and data quality states.

### Core Principle
**Doug's Cheat: "Use ACTUAL pre-halving emission (halved) instead of theoretical values"**

Instead of using protocol-defined theoretical emission (7200/2^n), we calculate the **actual emission rate** from historical data BEFORE the halving, then halve it. This accounts for real-world protocol variations and provides higher accuracy than theoretical approximations.

Post-halving, empirical emission averages are contaminated with pre-halving data:
- **7d average**: Contaminated for 7 days post-halving
- **30d average**: Contaminated for 30 days post-halving

**Solution**: Use real pre-halving emission (halved) during contamination windows.

### GPS Stages

#### Stage 1: Post-Halving Stabilization (0-7 days)
- **All projections use Doug's Cheat** - actual pre-halving emission halved
- Both 7d and 30d averages are contaminated with pre-halving data
- Confidence: `empirical_halved` (highest - real data!)
- Ensures zero contamination during data stabilization
- Fallback to `theoretical` (7200/2^n) if historical data unavailable

#### Stage 2: Transition Period (7-30 days)
- **Terminal approach (<7d away)**: Uses clean 7d empirical data
- **Long-range (>7d away)**: Uses theoretical (30d still contaminated)
- Confidence: `high` for 7d, `protocol_defined` for theoretical

#### Stage 3: Normal GPS Operation (>30 days)
- **Terminal approach (<7d away)**: Uses 7d for real-time precision
- **Long-range (>7d away)**: Uses 30d for stable noise-resistant forecasts
- Both data sources are clean
- Confidence: `high` for both

### Visual Timeline
```
Day 0 ━━━━━━━━━━━━ Day 7 ━━━━━━━━━━━━━━━ Day 30 ━━━━━━━━━━▶
 │                  │                       │
 │◄── Stage 1 ─────►│◄──── Stage 2 ───────►│◄─── Stage 3 ──▶
 │                  │                       │
 │ ALL: Theoretical │ Terminal: 7d ✓       │ Terminal: 7d ✓
 │                  │ Long-Range: Theoret. │ Long-Range: 30d ✓
 │                  │                       │
🎯 Halving!       7d clean            30d clean
```

### Doug's Cheat Emission Calculation (Preferred)
```
1. Calculate pre-halving emission from issuance_history:
   - Take samples BEFORE last halving timestamp (with 1h buffer)
   - Use last 7 days of pre-halving data
   - Calculate per-interval deltas (TAO/day)
   - Use winsorized mean to remove outliers

   Example: pre_halving_emission = 7246.94 τ/day (actual measured)

2. Halve it for post-halving projections:
   empirical_halved = pre_halving_emission / (2 ^ halvings_since_last)

   where halvings_since_last = (current_step - last_known_halving_step)
```

**Why Doug's Cheat is Better:**
- **Real data** from the actual chain (not theoretical approximation)
- Accounts for protocol variations, epoch timing, validator behavior
- Measured emission was **7246.94 τ/day**, not theoretical 7200
- Halving it gives **3623.47 τ/day** (vs theoretical 3600) - **0.65% more accurate!**

Examples:
- Pre-halving #1: **7246.94 τ/day** (measured from history)
- Post-halving #1 (step=2): 7246.94 / 2 = **3623.47 τ/day** 🎯
- Post-halving #2 (step=3): 7246.94 / 4 = **1811.74 τ/day**
- Post-halving #3 (step=4): 7246.94 / 8 = **905.87 τ/day**

### Theoretical Emission Calculation (Fallback)
Used only when historical data is unavailable:
```
theoretical_emission = PROTOCOL_BASE_EMISSION / (2 ^ halvings_completed)

where:
  PROTOCOL_BASE_EMISSION = 7200 τ/day
  halvings_completed = step - 1
```

Examples:
- Pre-halving #1 (step=1): 7200 / 2^0 = **7200 τ/day**
- Post-halving #1 (step=2): 7200 / 2^1 = **3600 τ/day**
- Post-halving #2 (step=3): 7200 / 2^2 = **1800 τ/day**
- Post-halving #3 (step=4): 7200 / 2^3 = **900 τ/day**

### Ratio Optimization
During GPS operation, when using empirical data (7d or 30d), the ratio is calculated based on Doug's Cheat (halved actual emission) to avoid contamination artifacts:

```javascript
// Doug's Cheat: Use actual pre-halving emission (halved)
halved_emission = base_emission / (2 ^ halvings_completed)

// Calculate ratio based on real data
ratio = halved_emission / base_emission

// Apply to empirical data
emission_to_use = emission_empirical * ratio
```

This ensures that even when using empirical data (7d/30d), the scaling is based on **real measured emission** from Doug's Cheat, not theoretical approximations.

Notes
-----
- `emission_used` is included per-entry so consumers can display or debug the exact rate used for that ETA. The simulation halves the emission after each threshold is reached; therefore the `emission_used` for step N is expected to be approximately half of step N-1.
- If projection confidence is `low`, consumers may choose to hide ETA values or annotate them as low-confidence.
- The GPS methodology automatically adapts as time passes post-halving, transitioning from theoretical to empirical data as contamination windows expire.
- Frontend consumers should display GPS metadata (`gps_stage`, `confidence`, `data_clean_in_days`) to provide transparency about projection methodology.


Maintainers: update this doc if the producer script changes the projection fields or their semantics.
