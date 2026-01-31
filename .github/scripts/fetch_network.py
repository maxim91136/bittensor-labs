import bittensor as bt
import json
import os
import sys
from typing import Dict, Any, List
from datetime import datetime, timezone, timedelta
import urllib.request
import urllib.error

NETWORK = os.getenv("NETWORK", "finney")

# =====================================================================
# KNOWN HISTORICAL HALVINGS - These are blockchain facts, not estimates
# Do NOT modify these timestamps - they are verified block times
# =====================================================================
KNOWN_HALVINGS = [
    {
        'threshold': 10500000,
        'at': 1734270660000,  # 2025-12-15 13:31:00 UTC - Block 7103976
        'block': 7103976,
        'verified': True
    }
]

def fetch_metrics() -> Dict[str, Any]:
    """Fetch Bittensor network metrics: block, subnets, validators, neurons, emission"""
    subtensor = bt.Subtensor(network=NETWORK)
    try:
        block = subtensor.get_current_block()
    except Exception as e:
        print(f"Block fetch failed: {e}", file=sys.stderr)
        block = None

    try:
        # SDK v10.0: get_subnets() → get_all_subnets_netuid()
        subnets = subtensor.get_all_subnets_netuid()
        total_subnets = len(subnets)
    except Exception as e:
        print(f"Subnet fetch failed: {e}", file=sys.stderr)
        subnets = []
        total_subnets = 0

    total_validators = 0
    total_neurons = 0
    for netuid in subnets:
        try:
            # SDK v10.0: use subtensor.metagraph() method
            metagraph = subtensor.metagraph(netuid=netuid, mechid=0)
            # Count validators
            if hasattr(metagraph, 'validator_permit'):
                total_validators += sum(1 for uid in metagraph.uids if metagraph.validator_permit[uid])
            # Count neurons
            total_neurons += len(metagraph.uids)
        except Exception as e:
            print(f"Metagraph fetch failed for netuid {netuid}: {e}", file=sys.stderr)
            continue

    daily_emission = 7200
    
    def generate_halving_thresholds(max_supply: int = 21000000, max_events: int = 6):
        arr = []
        for n in range(1, max_events + 1):
            threshold = round(max_supply * (1 - 1 / (2 ** n)))
            arr.append(int(threshold))
        return arr
    # Total issuance from on-chain storage
    total_issuance_raw = None
    total_issuance_human = None
    try:
        if hasattr(subtensor, 'substrate') and subtensor.substrate is not None:
            try:
                issuance = subtensor.substrate.query('SubtensorModule', 'TotalIssuance')
                total_issuance_raw = int(issuance.value) if issuance and issuance.value is not None else None
            except Exception as e:
                print(f"TotalIssuance fetch failed: {e}", file=sys.stderr)
                total_issuance_raw = None
            try:
                props = subtensor.substrate.rpc_request('system_properties', [])
                dec = props.get('result', {}).get('tokenDecimals')
                if isinstance(dec, list):
                    decimals = int(dec[0])
                else:
                    decimals = int(dec) if dec is not None else 9
            except Exception:
                decimals = 9
            if total_issuance_raw is not None:
                total_issuance_human = float(total_issuance_raw) / (10 ** decimals)
    except Exception:
        total_issuance_raw = None
        total_issuance_human = None

    now_iso = datetime.now(timezone.utc).isoformat()
    result = {
        "blockHeight": block,
        "subnets": total_subnets,
        "validators": total_validators,
        "totalNeurons": total_neurons,
        "emission": daily_emission,
        "totalIssuance": total_issuance_raw,
        "totalIssuanceHuman": total_issuance_human,
        "halvingThresholds": generate_halving_thresholds(),
        "_source": "bittensor-sdk",
        "_timestamp": now_iso,
        "last_updated": now_iso
    }
    # Attempt to read existing metrics from Cloudflare KV (if env provided)
    # existing will be the current issuance_history (as list) from CF KV if present
    existing = None
    kv_read_ok = False
    try:
        cf_account = os.getenv('CF_ACCOUNT_ID')
        cf_token = os.getenv('CF_API_TOKEN')
        # Accept either `CF_KV_NAMESPACE_ID` (used by workflow) or legacy `CF_METRICS_NAMESPACE_ID`.
        cf_kv_ns = os.getenv('CF_KV_NAMESPACE_ID') or os.getenv('CF_METRICS_NAMESPACE_ID')
        # Debug visibility for CI logs
        print(f"DEBUG: CF_ACCOUNT_ID={'set' if cf_account else 'missing'}, CF_API_TOKEN={'set' if cf_token else 'missing'}, CF_KV_NAMESPACE_ID={'set' if cf_kv_ns else 'missing'}", file=sys.stderr)
        if cf_account and cf_token and cf_kv_ns:
            # Read the issuance_history key directly to preserve history across runs
            kv_url = f"https://api.cloudflare.com/client/v4/accounts/{cf_account}/storage/kv/namespaces/{cf_kv_ns}/values/issuance_history"
            req = urllib.request.Request(kv_url, method='GET', headers={
                'Authorization': f'Bearer {cf_token}'
            })
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    if resp.status == 200:
                        # issuance_history is stored as a JSON array of snapshots
                        try:
                            body = resp.read()
                            existing = json.loads(body)
                            # Helpful CI debug: show type and length without printing full body
                            if isinstance(existing, list):
                                print(f"✅ KV read OK — {len(existing)} snapshots found", file=sys.stderr)
                            else:
                                print(f"✅ KV read OK — payload type={type(existing).__name__}", file=sys.stderr)
                        except Exception as e:
                            existing = None
                            print(f"⚠️  Failed to parse KV JSON: {e}", file=sys.stderr)
                        kv_read_ok = True
            except urllib.error.HTTPError as e:
                # 404: the key is not present; that's OK - we can create it
                if getattr(e, 'code', None) == 404:
                    # never seen before; start a new history
                    existing = []
                    print("ℹ️  KV read returned 404 — issuance_history key not found; starting a new history")
                    kv_read_ok = True
                else:
                    # 403 or others: we cannot read KV - do not attempt to overwrite
                    kv_read_ok = False
                    print(f"⚠️  KV GET failed with HTTP Error {getattr(e,'code', None)}; skipping issuance_history update", file=sys.stderr)
                    print(f"⚠️  KV GET failed with HTTP Error {getattr(e,'code', None)}; skipping issuance_history update", file=sys.stderr)
            except Exception as e:
                # network or other error when reading kv; do not try to overwrite
                kv_read_ok = False
                print(f"⚠️  KV GET failed: {str(e)}; skipping issuance_history update", file=sys.stderr)
            except Exception:
                pass
    except Exception:
        existing = None

    # Build / update high-frequency issuance history (15min snapshots) based on existing KV if present
    try:
        # existing is expected to be a list (issuance_history). If it's a dict or malformed, fallback to []
        if isinstance(existing, list):
            history: List[Dict[str, Any]] = existing
        else:
            history: List[Dict[str, Any]] = []
    except Exception:
        history = []

    # Realistic bounds: current issuance should be between 10M and 15M TAO (adjustable as network grows)
    MIN_REALISTIC_ISSUANCE = 10_000_000  # 10M TAO - we're past this
    MAX_REALISTIC_ISSUANCE = 15_000_000  # 15M TAO - well before halving

    # =====================================================================
    # SANITIZE HISTORY FIRST: Remove corrupt samples before validating new sample
    # Strategy:
    # 1. Remove samples outside absolute bounds (10M-15M)
    # 2. Remove samples ABOVE current chain issuance (impossible - issuance only goes up)
    # 3. Remove samples that cause drops (the sample before a drop is corrupt)
    # =====================================================================
    def sanitize_history(hist: List[Dict[str, Any]], current_chain_issuance: float = None) -> List[Dict[str, Any]]:
        if len(hist) < 2:
            return hist

        # First pass: remove samples outside absolute bounds
        cleaned = []
        removed_bounds = 0
        for h in hist:
            iss = h.get('issuance', 0)
            if MIN_REALISTIC_ISSUANCE <= iss <= MAX_REALISTIC_ISSUANCE:
                cleaned.append(dict(h))
            else:
                removed_bounds += 1
                print(f"⚠️  Removed out-of-bounds sample: {iss:.2f} TAO", file=sys.stderr)

        if len(cleaned) < 2:
            if removed_bounds > 0:
                print(f"✅ Sanitized history: removed {removed_bounds} out-of-bounds samples", file=sys.stderr)
            return cleaned

        # Second pass: remove samples ABOVE current chain issuance
        # This is impossible since issuance can only increase - any sample higher
        # than current chain value is definitely corrupt
        removed_future = 0
        if current_chain_issuance is not None and current_chain_issuance > 0:
            # Allow small tolerance for timing differences
            max_valid = current_chain_issuance + 50  # 50 TAO tolerance
            before_count = len(cleaned)
            cleaned = [h for h in cleaned if h.get('issuance', 0) <= max_valid]
            removed_future = before_count - len(cleaned)
            if removed_future > 0:
                print(f"⚠️  Removed {removed_future} samples above current chain issuance ({current_chain_issuance:.2f} TAO)", file=sys.stderr)

        if len(cleaned) < 2:
            total = removed_bounds + removed_future
            if total > 0:
                print(f"✅ Sanitized history: removed {total} corrupt samples", file=sys.stderr)
            return cleaned

        # Third pass: identify and remove samples that cause drops
        # When issuance drops, the sample BEFORE the drop is likely corrupt
        # (since issuance can never decrease)
        removed_drops = 0
        i = 1
        while i < len(cleaned):
            prev_iss = cleaned[i-1]['issuance']
            curr_iss = cleaned[i]['issuance']
            delta = curr_iss - prev_iss

            if delta < -10:  # Drop detected (allowing tiny float variance)
                # The previous sample is likely corrupt (too high)
                # Remove it and re-check from the new position
                print(f"⚠️  Removed corrupt sample: {prev_iss:.2f} TAO (caused drop of {abs(delta):.2f})", file=sys.stderr)
                del cleaned[i-1]
                removed_drops += 1
                # Stay at same index to re-check with new previous
                if i > 1:
                    i -= 1
            else:
                i += 1

        total_removed = removed_bounds + removed_future + removed_drops
        if total_removed > 0:
            print(f"✅ Sanitized history: removed {total_removed} corrupt samples ({removed_bounds} out-of-bounds, {removed_future} above-chain, {removed_drops} drops)", file=sys.stderr)
            print(f"   History size: {len(hist)} → {len(cleaned)} samples", file=sys.stderr)

        return cleaned

    # Pass current chain issuance to sanitize samples that are impossibly high
    history = sanitize_history(history, total_issuance_human)

    # Add new 15-minute snapshot with validation (AFTER sanitization so we compare against clean history)
    try:
        now = datetime.now(timezone.utc)
        ts = int(now.timestamp())
        if total_issuance_human is not None:
            new_issuance = float(total_issuance_human)

            # Validate new sample before adding
            is_valid = True
            reject_reason = None

            # Check absolute bounds
            if not (MIN_REALISTIC_ISSUANCE <= new_issuance <= MAX_REALISTIC_ISSUANCE):
                is_valid = False
                reject_reason = f"outside bounds [{MIN_REALISTIC_ISSUANCE/1e6:.1f}M, {MAX_REALISTIC_ISSUANCE/1e6:.1f}M]"

            # Check against last sample in sanitized history
            if is_valid and history:
                last_sample = history[-1]
                last_issuance = last_sample.get('issuance', 0)
                last_ts = last_sample.get('ts', 0)
                delta = new_issuance - last_issuance
                time_elapsed = ts - last_ts if last_ts > 0 else 900  # seconds since last sample

                # Max delta should be proportional to time elapsed
                # Expected: ~7200 TAO/day = ~5 TAO/minute = ~75 TAO per 15min
                # Allow 2x expected emission as max (to handle variance)
                expected_emission_per_second = 7200.0 / 86400.0  # ~0.083 TAO/sec
                max_delta = max(1000, expected_emission_per_second * time_elapsed * 2)  # At least 1000, or 2x expected

                if delta < -10:  # Allow tiny floating point variance
                    is_valid = False
                    reject_reason = f"issuance decreased by {abs(delta):.2f} TAO"
                elif delta > max_delta:
                    is_valid = False
                    reject_reason = f"issuance jumped by {delta:.2f} TAO (max {max_delta:.2f} for {time_elapsed/3600:.1f}h gap)"

            if is_valid:
                # Append snapshot; drop duplicates if same second
                if history and history[-1].get('ts') == ts:
                    history[-1]['issuance'] = new_issuance
                else:
                    history.append({'ts': ts, 'issuance': new_issuance})
                print(f"✅ Added sample: {new_issuance:.2f} TAO", file=sys.stderr)
            else:
                print(f"⚠️  Rejected invalid sample: {new_issuance:.2f} TAO - {reject_reason}", file=sys.stderr)

            # Keep at most N entries: 15min sampling -> 96 entries/day -> 30d ~ 2880
            max_entries = 2880
            if len(history) > max_entries:
                history = history[-max_entries:]
    except Exception as e:
        print(f"⚠️  Error adding snapshot: {e}", file=sys.stderr)

    # Compute per-interval normalized (TAO/day) deltas from the 15m-ish history
    def compute_per_interval_deltas(hist: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        out: List[float] = []
        for i in range(1, len(hist)):
            a = hist[i - 1]
            b = hist[i]
            dt = b['ts'] - a['ts']
            if dt <= 0:
                continue
            delta = b['issuance'] - a['issuance']
            # Skip negative deltas (should not happen after sanitization, but be safe)
            if delta < 0:
                continue
            per_day = delta * (86400.0 / dt)
            out.append({'ts': b['ts'], 'per_day': per_day})
        return out

    def winsorized_mean(arr: List[float], trim=0.1) -> float:
        n = len(arr)
        if n == 0:
            return None
        s = sorted(arr)
        k = int(n * trim)
        if k >= n // 2:
            # fallback to mean
            return sum(s) / len(s)
        trimmed = s[k:n - k]
        if not trimmed:
            return sum(s) / len(s)
        return sum(trimmed) / len(trimmed)

    per_interval_deltas = compute_per_interval_deltas(history)
    emission_daily = None
    emission_7d = None
    emission_sd_7d = None
    emission_30d = None

    import math
    now_ts = int(datetime.now(timezone.utc).timestamp())

    # =====================================================================
    # DYNAMIC EMISSION BOUNDS: Adjust filter based on halving level
    # Base emission is 7200 TAO/day, halves at each threshold
    # =====================================================================
    def get_emission_bounds(current_issuance: float, thresholds: List[int]) -> tuple:
        """
        Calculate reasonable emission bounds based on current halving level.
        Returns (min_emission, max_emission) in TAO/day.
        """
        base_emission = 7200.0  # TAO/day before first halving

        # Count how many halvings have occurred
        halvings_passed = 0
        if current_issuance is not None:
            for th in thresholds:
                if current_issuance >= th:
                    halvings_passed += 1
                else:
                    break

        # Expected emission after halvings
        expected_emission = base_emission / (2 ** halvings_passed)

        # Set bounds with generous margins (±40% of expected)
        # This allows for normal variance while filtering obvious anomalies
        min_emission = expected_emission * 0.6
        max_emission = expected_emission * 1.4

        return min_emission, max_emission

    # Get current issuance for determining halving level
    current_iss = total_issuance_human
    halving_thresholds = result.get('halvingThresholds', [])
    EMISSION_MIN, EMISSION_MAX = get_emission_bounds(current_iss, halving_thresholds)

    # emission_daily = time-weighted mean per_day for last 24h
    # Filter anomalies: only use values in reasonable range (dynamic based on halving)
    deltas_last_24h = [d for d in per_interval_deltas if d['ts'] >= (now_ts - 86400) and EMISSION_MIN <= d['per_day'] <= EMISSION_MAX]
    # require at least 3 interval samples in the last 24h to compute a reliable daily estimate
    if len(deltas_last_24h) >= 3:
        # use winsorized mean for last 24h to smooth out spikes
        emission_daily = winsorized_mean([d['per_day'] for d in deltas_last_24h], 0.1)
    
    # =====================================================================
    # FIXED: Emission calculation using winsorized mean of interval rates
    #
    # Problem with first/last method: Data anomalies (drops, gaps) cause
    # incorrect averages even after sanitization.
    #
    # New method: Use winsorized mean of per-interval rates, filtering out
    # anomalous values using dynamic bounds based on current halving level.
    # =====================================================================
    
    def compute_emission_for_period(hist: List[Dict[str, Any]], days: int) -> tuple:
        """
        Compute emission rate for a period using winsorized mean of interval rates.
        Returns (emission_per_day, std_dev, samples, actual_days).
        
        Filters out anomalous intervals and uses robust statistics.
        """
        if len(hist) < 2:
            return None, None, 0, 0
        
        cutoff_ts = now_ts - (days * 86400)
        
        # Get per-interval rates for this period, filtering anomalies (dynamic bounds)
        period_rates = [d['per_day'] for d in per_interval_deltas
                       if d['ts'] >= cutoff_ts and EMISSION_MIN <= d['per_day'] <= EMISSION_MAX]
        
        if len(period_rates) < 3:
            return None, None, 0, 0
        
        # Calculate actual time span from samples in period
        period_samples = [s for s in hist if s['ts'] >= cutoff_ts]
        if len(period_samples) < 2:
            return None, None, 0, 0
        
        time_span_seconds = period_samples[-1]['ts'] - period_samples[0]['ts']
        actual_days = time_span_seconds / 86400.0 if time_span_seconds > 0 else 0
        
        # Use winsorized mean for robust average (trim 10% from each end)
        emission_per_day = winsorized_mean(period_rates, 0.1)
        
        # Calculate std dev
        std_dev = None
        if len(period_rates) >= 5:
            mean_rate = sum(period_rates) / len(period_rates)
            variance = sum((r - mean_rate) ** 2 for r in period_rates) / len(period_rates)
            std_dev = math.sqrt(variance)
        
        return emission_per_day, std_dev, len(period_rates), actual_days
    
    # Try different periods and use the best available
    # Start with longer periods but fall back to shorter if data quality is poor
    emission_7d_result = None
    emission_7d_actual_days = 0
    
    # Try 7 days first
    rate_7d, sd_7d, samples_7d, days_7d = compute_emission_for_period(history, 7)
    
    # Check data quality: we need at least 4 days of actual data for 7d average
    # AND the emission rate should be reasonable (within dynamic halving-aware bounds)
    # AND standard deviation should be low (< 500 indicates consistent data)
    # High SD (> 1000) indicates data gaps or problems in the early days
    sd_threshold = 500  # TAO/day - normal variance is ~50-100
    data_is_reliable = (sd_7d is not None and sd_7d < sd_threshold) or samples_7d < 10

    if rate_7d is not None and days_7d >= 4 and EMISSION_MIN <= rate_7d <= EMISSION_MAX and data_is_reliable:
        emission_7d = rate_7d
        emission_sd_7d = sd_7d
        emission_7d_actual_days = days_7d
    else:
        # Fallback: Use last 3-4 days where data is more reliable
        # These periods are after the initial data gaps were resolved
        for fallback_days in [4, 3, 2]:
            rate_fb, sd_fb, samples_fb, days_fb = compute_emission_for_period(history, fallback_days)
            # Lower SD threshold for shorter periods since they're more recent/reliable
            if rate_fb is not None and days_fb >= (fallback_days * 0.7) and EMISSION_MIN <= rate_fb <= EMISSION_MAX:
                emission_7d = rate_fb
                emission_sd_7d = sd_fb
                emission_7d_actual_days = days_fb
                break

    # 30-day emission (will work better once we have more history)
    # For now, with only ~7 days of data, we should use emission_7d as fallback
    # Only use 30d calculation when we have >= 14 days of clean data
    rate_30d, sd_30d, samples_30d, days_30d = compute_emission_for_period(history, 30)
    # Require at least 14 days AND low variance (same SD threshold as 7d)
    if rate_30d is not None and days_30d >= 14 and EMISSION_MIN <= rate_30d <= EMISSION_MAX and (sd_30d is None or sd_30d < sd_threshold):
        emission_30d = rate_30d
    else:
        # Use 7d as fallback for 30d until we have enough clean history
        emission_30d = emission_7d

    # Attach emission values to result (history is saved separately)
    # 86-day emission (EMA window used by protocol - ~86.8 days)
    # Only calculate when we have sufficient data (>=60 days minimum for reliability)
    emission_86d = None
    rate_86d, sd_86d, samples_86d, days_86d = compute_emission_for_period(history, 86)
    if rate_86d is not None and days_86d >= 60 and EMISSION_MIN <= rate_86d <= EMISSION_MAX and (sd_86d is None or sd_86d < sd_threshold):
        emission_86d = rate_86d

    result['emission_daily'] = round(emission_daily, 2) if emission_daily is not None else None
    result['emission_7d'] = round(emission_7d, 2) if emission_7d is not None else None
    result['emission_30d'] = round(emission_30d, 2) if emission_30d is not None else None
    result['emission_86d'] = round(emission_86d, 2) if emission_86d is not None else None
    result['emission_sd_7d'] = round(emission_sd_7d, 2) if emission_sd_7d is not None else None
    result['emission_samples'] = len(per_interval_deltas)
    result['last_issuance_ts'] = history[-1]['ts'] if history else None

    # Diagnostic fields for projection confidence
    history_samples = len(history)
    per_interval_samples = len(per_interval_deltas)
    days_of_history = None
    if history_samples >= 2:
        try:
            days_of_history = round((history[-1]['ts'] - history[0]['ts']) / 86400.0, 3)
        except Exception:
            days_of_history = None
    result['history_samples'] = history_samples
    result['per_interval_samples'] = per_interval_samples
    result['days_of_history'] = days_of_history

    # --- Halving projection: compute average net emission from history and ETA to thresholds ---
    projection_method = None
    avg_for_projection = None
    # Select projection average based on data-availability thresholds
    # Priority: 30d > 86d > 7d > daily
    # Use 30d for stable long-term projections, adaptive per-threshold logic will use 7d when <30d away
    if days_of_history is not None and days_of_history >= 14 and emission_30d is not None:
        avg_for_projection = emission_30d
        projection_method = 'emission_30d'
    elif emission_86d is not None:
        # ~86 day EMA matches protocol's emission smoothing window
        avg_for_projection = emission_86d
        projection_method = 'emission_86d'
    elif days_of_history is not None and days_of_history >= 7 and emission_7d is not None:
        # Fallback to 7d if we don't have 30d yet
        avg_for_projection = emission_7d
        projection_method = 'emission_7d'
    elif days_of_history is not None and days_of_history >= 3 and emission_daily is not None:
        avg_for_projection = emission_daily
        projection_method = 'emission_daily'
    elif emission_daily is not None:
        # daily exists but less than 3 days of history — use it but mark as low-confidence method
        avg_for_projection = emission_daily
        projection_method = 'emission_daily_low_confidence'
    else:
        # Filter anomalies: only use values in reasonable range (dynamic based on halving)
        vals = [d['per_day'] for d in per_interval_deltas if isinstance(d.get('per_day'), (int, float)) and EMISSION_MIN <= d['per_day'] <= EMISSION_MAX]
        if vals:
            avg_for_projection = sum(vals) / len(vals)
            projection_method = 'mean_from_intervals'

    def compute_halving_estimates(current_issuance: float, thresholds: List[int], avg_emission_per_day: float, method: str, emission_7d_val: float = None, emission_30d_val: float = None, last_halving_ts: int = None, pre_halving_emission: float = None):
        """
        Compute ETAs for a series of halving thresholds using Triple-Precision GPS methodology:

        1. Post-Halving (0-7d): Doug's Cheat - Use actual pre-halving emission / 2^n
           - Zero contamination during data stabilization period
           - Real emission data instead of theoretical approximation

        2. Long-Range (>30d away): 30d average emission
           - Stable, noise-resistant for distant horizons

        3. Terminal Approach (<30d away): 7d average emission
           - Real-time calibration for final precision

        This distance-adaptive precision system ensures:
        - Clean projections immediately post-halving (Doug's Cheat)
        - Stable long-term forecasts (30d smoothing)
        - Accurate near-term countdowns (7d responsiveness)
        """
        estimates = []
        now_dt = datetime.now(timezone.utc)
        real_now = datetime.now(timezone.utc)  # Keep real time for post-halving checks

        # Base emission: Use Doug's Cheat (actual pre-halving emission) or fallback to protocol default
        PROTOCOL_BASE_EMISSION = 7200.0  # τ/day (fallback)
        base_emission = pre_halving_emission if pre_halving_emission is not None else PROTOCOL_BASE_EMISSION

        # validate inputs
        try:
            cur = float(current_issuance) if current_issuance is not None else None
        except Exception:
            cur = None

        if cur is None or avg_emission_per_day is None:
            # cannot project: return placeholder entries
            for th in thresholds:
                try:
                    th_val = float(th)
                except Exception:
                    th_val = th
                estimates.append({'threshold': th_val, 'remaining': None, 'days': None, 'eta': None, 'method': method})
            return estimates

        emission = float(avg_emission_per_day)
        # 1-based step counter for each halving event
        step = 1
        # iterate thresholds sequentially and simulate
        for th in thresholds:
            try:
                th_val = float(th)
            except Exception:
                th_val = None
            if th_val is None:
                estimates.append({'threshold': th, 'remaining': None, 'days': None, 'eta': None, 'method': method, 'emission_used': None, 'step': None})
                continue

            # If we've already passed this threshold, mark zero but DON'T halve emission
            # (avg_emission_per_day is already the current post-halving rate)
            if cur >= th_val:
                # emission_used is the emission that was in effect for reaching this threshold
                estimates.append({'threshold': th_val, 'remaining': 0.0, 'days': 0.0, 'eta': now_dt.isoformat(), 'method': method, 'emission_used': round(emission, 6) if emission is not None else None, 'step': step})
                # Don't halve - we're using current emission rate which is already post-halving
                # keep current time and issuance at least at threshold
                cur = th_val
                step += 1
                continue

            # If emission is not positive, we cannot reach the threshold
            if emission is None or emission <= 0:
                estimates.append({'threshold': th_val, 'remaining': round(th_val - cur, 6), 'days': None, 'eta': None, 'method': method, 'emission_used': emission, 'step': step})
                step += 1
                continue

            remaining = th_val - cur

            # ===== Triple-Precision GPS Emission Selection =====
            # Use theoretical emission until we have clean (non-contaminated) empirical data
            # Clean thresholds: 7d average needs 7 days post-halving, 30d needs 30 days post-halving

            emission_to_use = emission
            method_used = method
            gps_stage = None
            confidence = 'medium'
            data_clean_in_days = None

            # Calculate how many halvings have occurred (for emission calculation)
            halvings_completed = step - 1  # step 1 = no halvings yet, step 2 = 1 halving, etc.
            halved_emission = base_emission / (2 ** halvings_completed)  # Doug's Cheat: use actual pre-halving emission

            # Check days since last halving (use REAL time, not simulated time)
            days_since_halving = None
            if last_halving_ts is not None:
                seconds_since_halving = (real_now.timestamp() - last_halving_ts / 1000.0)
                days_since_halving = seconds_since_halving / 86400.0

            # Determine emission source based on data cleanliness
            # Method name: Use 'empirical_halved' if we have real pre-halving data, otherwise 'theoretical'
            halved_method_name = 'empirical_halved' if pre_halving_emission is not None else 'theoretical'

            if days_since_halving is not None and days_since_halving < 7.0:
                # Stage 1: Post-halving (0-7d) - ALL emissions contaminated
                # Use Doug's Cheat: actual pre-halving emission halved
                emission_to_use = halved_emission
                method_used = halved_method_name
                gps_stage = 'post_halving_stabilization'
                confidence = 'empirical_halved' if pre_halving_emission is not None else 'protocol_defined'
                data_clean_in_days = 7.0 - days_since_halving

            elif days_since_halving is not None and days_since_halving < 30.0:
                # Transition period (7-30d): 7d clean, but 30d still contaminated
                days_estimate = remaining / emission if emission > 0 else float('inf')

                if days_estimate < 7 and emission_7d_val is not None and emission_7d_val > 0:
                    # Terminal approach: 7d is clean, use it with halved-emission-based ratio
                    ratio = halved_emission / base_emission
                    emission_to_use = emission_7d_val * ratio
                    method_used = 'emission_7d'
                    gps_stage = 'terminal_approach_transition'
                    confidence = 'high'
                    data_clean_in_days = None  # 7d data already clean
                else:
                    # Long-range: 30d still contaminated, use Doug's Cheat
                    emission_to_use = halved_emission
                    method_used = halved_method_name
                    gps_stage = 'long_range_transition'
                    confidence = 'empirical_halved' if pre_halving_emission is not None else 'protocol_defined'
                    data_clean_in_days = 30.0 - days_since_halving

            else:
                # Normal GPS operation (>30d since halving): both 7d and 30d are clean
                days_estimate = remaining / emission if emission > 0 else float('inf')

                if days_estimate < 7 and emission_7d_val is not None and emission_7d_val > 0:
                    # Stage 3: Terminal approach (<30d away) - use 7d for precision
                    ratio = halved_emission / base_emission
                    emission_to_use = emission_7d_val * ratio
                    method_used = 'emission_7d'
                    gps_stage = 'terminal_approach'
                    confidence = 'high'
                else:
                    # Stage 2: Long-range (>30d away) - use 30d for stability
                    emission_to_use = emission
                    method_used = method
                    gps_stage = 'long_range'
                    confidence = 'high'

            days = remaining / emission_to_use
            eta = now_dt + timedelta(days=days)

            # Build estimate entry with GPS metadata
            estimate_entry = {
                'threshold': th_val,
                'remaining': round(remaining, 6),
                'days': round(days, 3),
                'eta': eta.isoformat(),
                'method': method_used,
                'emission_used': round(emission_to_use, 6),
                'step': step,
                'gps_stage': gps_stage,
                'confidence': confidence
            }

            # Add days_since_halving if available
            if days_since_halving is not None:
                estimate_entry['days_since_halving'] = round(days_since_halving, 2)

            # Add data_clean_in_days if applicable
            if data_clean_in_days is not None:
                estimate_entry['data_clean_in_days'] = round(data_clean_in_days, 2)

            estimates.append(estimate_entry)

            # advance simulation: jump to threshold time and issuance, then halve emission (base emission, not the adaptive one)
            now_dt = eta
            cur = th_val
            emission = emission / 2.0 if emission > 0 else emission
            step += 1

        return estimates

    try:
        cur_iss = result.get('totalIssuanceHuman')
    except Exception:
        cur_iss = None

    result['avg_emission_for_projection'] = round(avg_for_projection, 3) if avg_for_projection is not None else None
    result['projection_method'] = projection_method
    # projection confidence: 'low' (<3 days), 'medium' (>=3 days), 'high' (>=7 days)
    projection_confidence = 'low'
    if days_of_history is not None:
        if days_of_history >= 7:
            projection_confidence = 'high'
        elif days_of_history >= 3:
            projection_confidence = 'medium'
    result['projection_confidence'] = projection_confidence
    # how many days were effectively used for the projection method
    projection_days_used = None
    try:
        if projection_method == 'emission_86d':
            projection_days_used = 86
        elif projection_method == 'emission_30d':
            projection_days_used = 30
        elif projection_method == 'emission_7d':
            projection_days_used = 7
        elif projection_method in ('emission_daily', 'emission_daily_low_confidence'):
            # use available days_of_history, at least 1 if present
            projection_days_used = int(days_of_history) if days_of_history is not None and days_of_history >= 1 else 1 if result.get('emission_daily') is not None else None
        elif projection_method == 'mean_from_intervals':
            projection_days_used = int(days_of_history) if days_of_history is not None else None
    except Exception:
        projection_days_used = None
    result['projection_days_used'] = projection_days_used

    # =====================================================================
    # DOUG'S CHEAT: Calculate pre-halving emission from historical data
    # Instead of theoretical 7200, use ACTUAL emission before halving
    # =====================================================================
    def calculate_pre_halving_emission(hist: List[Dict[str, Any]], halving_ts_ms: int) -> float:
        """
        Doug's Cheat: Calculate actual pre-halving emission from issuance history.
        Takes samples BEFORE the halving event and computes real emission rate.

        Returns emission in TAO/day, or None if insufficient data.
        """
        if not hist or halving_ts_ms is None:
            return None

        halving_ts_sec = halving_ts_ms / 1000.0

        # Get samples before halving (with 1-hour buffer to avoid edge effects)
        buffer_sec = 3600  # 1 hour
        pre_halving_samples = [s for s in hist if s.get('ts', 0) < (halving_ts_sec - buffer_sec)]

        if len(pre_halving_samples) < 2:
            return None

        # Take last 7 days of pre-halving data (or all if less)
        lookback_sec = 7 * 86400  # 7 days
        cutoff_ts = halving_ts_sec - buffer_sec - lookback_sec
        recent_samples = [s for s in pre_halving_samples if s.get('ts', 0) >= cutoff_ts]

        if len(recent_samples) < 2:
            recent_samples = pre_halving_samples[-min(len(pre_halving_samples), 100):]  # Last 100 samples

        # Calculate per-interval deltas
        deltas = []
        for i in range(1, len(recent_samples)):
            prev = recent_samples[i-1]
            curr = recent_samples[i]
            dt = curr['ts'] - prev['ts']
            if dt <= 0:
                continue
            delta_iss = curr['issuance'] - prev['issuance']
            if delta_iss < 0:
                continue
            per_day = delta_iss * (86400.0 / dt)
            deltas.append(per_day)

        if not deltas:
            return None

        # Use winsorized mean to remove outliers
        deltas_sorted = sorted(deltas)
        trim = int(len(deltas_sorted) * 0.1)
        if trim >= len(deltas_sorted) // 2:
            trim = 0
        trimmed = deltas_sorted[trim:len(deltas_sorted)-trim] if trim > 0 else deltas_sorted

        return sum(trimmed) / len(trimmed) if trimmed else None

    # Load halving history to get last_halving timestamp and calculate pre-halving emission
    # IMPORTANT: Use KNOWN_HALVINGS timestamps first (verified blockchain data),
    # only fall back to KV for unknown/future halvings
    last_halving_ts = None
    pre_halving_emission = None

    # Determine which halving we're currently past based on issuance
    current_halving_threshold = None
    for known in sorted(KNOWN_HALVINGS, key=lambda x: x['threshold'], reverse=True):
        if cur_iss is not None and cur_iss >= known['threshold']:
            current_halving_threshold = known['threshold']
            last_halving_ts = known['at']  # Use VERIFIED timestamp
            print(f"📍 Using known halving timestamp for {known['threshold']:,} TAO: {datetime.fromtimestamp(known['at'] / 1000, timezone.utc).isoformat()}", file=sys.stderr)
            break

    # Only try KV if we're past a threshold not in KNOWN_HALVINGS
    if last_halving_ts is None:
        try:
            cf_account = os.getenv('CF_ACCOUNT_ID')
            cf_token = os.getenv('CF_API_TOKEN')
            cf_kv_ns = os.getenv('CF_KV_NAMESPACE_ID') or os.getenv('CF_METRICS_NAMESPACE_ID')
            if cf_account and cf_token and cf_kv_ns:
                kv_url = f"https://api.cloudflare.com/client/v4/accounts/{cf_account}/storage/kv/namespaces/{cf_kv_ns}/values/halving_history"
                req = urllib.request.Request(kv_url, method='GET', headers={'Authorization': f'Bearer {cf_token}'})
                with urllib.request.urlopen(req, timeout=15) as resp:
                    if resp.status == 200:
                        halving_hist = json.loads(resp.read())
                        if isinstance(halving_hist, list) and len(halving_hist) > 0:
                            # Find the most recent halving that's not in KNOWN_HALVINGS
                            known_thresholds = {h['threshold'] for h in KNOWN_HALVINGS}
                            for h in reversed(halving_hist):
                                if h.get('threshold') not in known_thresholds:
                                    last_halving_ts = h.get('at')
                                    print(f"📍 Using KV halving timestamp for {h.get('threshold'):,} TAO", file=sys.stderr)
                                    break
        except Exception as e:
            print(f"⚠️  Error loading halving history from KV: {e}", file=sys.stderr)

    # Doug's Cheat: Calculate actual pre-halving emission from history
    if last_halving_ts is not None:
        pre_halving_emission = calculate_pre_halving_emission(history, last_halving_ts)
        if pre_halving_emission:
            print(f"🎯 Doug's Cheat: Pre-halving emission = {pre_halving_emission:.2f} τ/day (from historical data)", file=sys.stderr)
        else:
            print(f"⚠️  Could not calculate pre-halving emission from history, falling back to protocol base", file=sys.stderr)

    result['halving_estimates'] = compute_halving_estimates(
        cur_iss,
        result.get('halvingThresholds', []),
        avg_for_projection,
        projection_method,
        emission_7d_val=emission_7d,
        emission_30d_val=emission_30d,
        last_halving_ts=last_halving_ts,
        pre_halving_emission=pre_halving_emission
    )

    # Expose pre-halving emission to frontend for accurate display
    result['pre_halving_emission'] = round(pre_halving_emission, 2) if pre_halving_emission is not None else None

    # Save the full history to a separate file: normally we only write local `issuance_history.json`
    # if KV read succeeded (so we can safely append). However, CI can set the environment var
    # `FORCE_ISSUANCE_ON_KV_FAIL=1` to force local writing even when the KV read failed (useful when
    # the public API is protected but the CI runner should still push a new snapshot).
    force_local_write = os.getenv('FORCE_ISSUANCE_ON_KV_FAIL', '0') == '1'
    if force_local_write and not kv_read_ok:
        print(f"⚠️  FORCE_ISSUANCE_ON_KV_FAIL set — will write local issuance_history.json even if KV read_failed (kv_read_ok={kv_read_ok})", file=sys.stderr)
    try:
        if kv_read_ok or force_local_write:
            history_path = os.path.join(os.getcwd(), 'issuance_history.json')
            with open(history_path, 'w') as hf:
                json.dump(history, hf, indent=2)
        else:
            # Do not save history file locally; ensure CI doesn't accidentally overwrite KV
            if os.path.exists(os.path.join(os.getcwd(), 'issuance_history.json')):
                try:
                    os.remove(os.path.join(os.getcwd(), 'issuance_history.json'))
                except Exception:
                    pass
    except Exception as e:
        print(f"⚠️  Failed while trying to save issuance_history: {str(e)}", file=sys.stderr)

    # =====================================================================
    # HALVING DETECTION: Check if any threshold was crossed and persist to KV
    # =====================================================================
    try:
        cf_account = os.getenv('CF_ACCOUNT_ID')
        cf_token = os.getenv('CF_API_TOKEN')
        cf_kv_ns = os.getenv('CF_KV_NAMESPACE_ID') or os.getenv('CF_METRICS_NAMESPACE_ID')

        if cf_account and cf_token and cf_kv_ns and total_issuance_human is not None:
            thresholds = result.get('halvingThresholds', [])

            # Load existing halving history from KV
            halving_history = []
            try:
                kv_url = f"https://api.cloudflare.com/client/v4/accounts/{cf_account}/storage/kv/namespaces/{cf_kv_ns}/values/halving_history"
                req = urllib.request.Request(kv_url, method='GET', headers={'Authorization': f'Bearer {cf_token}'})
                with urllib.request.urlopen(req, timeout=15) as resp:
                    if resp.status == 200:
                        halving_history = json.loads(resp.read())
                        if not isinstance(halving_history, list):
                            halving_history = []
            except urllib.error.HTTPError as e:
                if getattr(e, 'code', None) == 404:
                    halving_history = []  # No history yet
                else:
                    print(f"⚠️  Failed to read halving_history from KV: HTTP {getattr(e, 'code', None)}", file=sys.stderr)
            except Exception as e:
                print(f"⚠️  Failed to read halving_history from KV: {e}", file=sys.stderr)

            # Check which thresholds are already recorded
            recorded_thresholds = {h.get('threshold') for h in halving_history}
            known_thresholds = {h['threshold'] for h in KNOWN_HALVINGS}

            # First: Ensure all KNOWN_HALVINGS are in the history with correct timestamps
            # This prevents accidental overwrites and ensures historical accuracy
            history_modified = False
            for known in KNOWN_HALVINGS:
                th = known['threshold']
                existing = next((h for h in halving_history if h.get('threshold') == th), None)

                if existing is None:
                    # Known halving missing - add it with verified timestamp
                    halving_history.append({
                        'threshold': th,
                        'at': known['at'],
                        'block': known.get('block'),
                        'verified': True,
                        'detected_at': datetime.fromtimestamp(known['at'] / 1000, timezone.utc).isoformat()
                    })
                    history_modified = True
                    print(f"✅ Added known halving: {th:,} TAO at {datetime.fromtimestamp(known['at'] / 1000, timezone.utc).isoformat()}", file=sys.stderr)
                elif existing.get('at') != known['at']:
                    # Known halving exists but with wrong timestamp - fix it
                    old_ts = existing.get('at')
                    existing['at'] = known['at']
                    existing['block'] = known.get('block')
                    existing['verified'] = True
                    history_modified = True
                    print(f"🔧 Fixed halving timestamp for {th:,} TAO: {old_ts} → {known['at']}", file=sys.stderr)

            # Detect newly crossed thresholds (only for UNKNOWN halvings)
            new_halvings = []
            for th in thresholds:
                if total_issuance_human >= th and th not in recorded_thresholds and th not in known_thresholds:
                    # Use last issuance snapshot timestamp (more accurate than detection time)
                    # This represents when the on-chain data was captured, closer to actual halving block time
                    halving_timestamp_ms = result.get('last_issuance_ts', int(datetime.now(timezone.utc).timestamp())) * 1000

                    halving_event = {
                        'threshold': th,
                        'at': int(halving_timestamp_ms),  # Unix timestamp in ms from last snapshot
                        'issuance_at_detection': round(total_issuance_human, 2),
                        'detected_at': datetime.now(timezone.utc).isoformat()
                    }
                    new_halvings.append(halving_event)
                    print(f"🎉 HALVING DETECTED! Threshold {th:,} TAO crossed at {total_issuance_human:,.2f} TAO", file=sys.stderr)

            # Save updated halving history to KV if new halvings detected or history was modified
            if new_halvings or history_modified:
                halving_history.extend(new_halvings)
                # Sort by threshold to maintain order
                halving_history.sort(key=lambda x: x.get('threshold', 0))

                try:
                    kv_write_url = f"https://api.cloudflare.com/client/v4/accounts/{cf_account}/storage/kv/namespaces/{cf_kv_ns}/values/halving_history"
                    data = json.dumps(halving_history).encode('utf-8')
                    req = urllib.request.Request(kv_write_url, data=data, method='PUT', headers={
                        'Authorization': f'Bearer {cf_token}',
                        'Content-Type': 'application/json'
                    })
                    with urllib.request.urlopen(req, timeout=15) as resp:
                        if resp.status in (200, 201):
                            print(f"✅ Halving history saved to KV ({len(halving_history)} events)", file=sys.stderr)
                except Exception as e:
                    print(f"❌ Failed to save halving_history to KV: {e}", file=sys.stderr)

            # Add last halving info to result for frontend
            if halving_history:
                result['last_halving'] = halving_history[-1]
            else:
                result['last_halving'] = None
    except Exception as e:
        print(f"⚠️  Halving detection error: {e}", file=sys.stderr)

    return result

if __name__ == "__main__":
    try:
        network_data = fetch_metrics()
        
        # Write network.json (current format)
        output_path = os.path.join(os.getcwd(), "network.json")
        with open(output_path, "w") as f:
            json.dump(network_data, f, indent=2)
        print(f"✅ Network data written to {output_path}", file=sys.stderr)
        
        # Write network_latest.json (for history tracking, like taostats_latest.json)
        latest_path = os.path.join(os.getcwd(), "network_latest.json")
        with open(latest_path, "w") as f:
            json.dump(network_data, f, indent=2)
        print(f"✅ Network latest written to {latest_path}", file=sys.stderr)
        
        print(json.dumps(network_data, indent=2))
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)