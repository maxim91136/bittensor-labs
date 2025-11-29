import bittensor as bt
import json
import os
import sys
from typing import Dict, Any, List
from datetime import datetime, timezone, timedelta
import urllib.request
import urllib.error

NETWORK = os.getenv("NETWORK", "finney")

def fetch_metrics() -> Dict[str, Any]:
    """Fetch Bittensor network metrics: block, subnets, validators, neurons, emission"""
    subtensor = bt.subtensor(network=NETWORK)
    try:
        block = subtensor.get_current_block()
    except Exception as e:
        print(f"Block fetch failed: {e}", file=sys.stderr)
        block = None

    try:
        subnets = subtensor.get_subnets()
        total_subnets = len(subnets)
    except Exception as e:
        print(f"Subnet fetch failed: {e}", file=sys.stderr)
        subnets = []
        total_subnets = 0

    total_validators = 0
    total_neurons = 0
    for netuid in subnets:
        try:
            metagraph = subtensor.metagraph(netuid)
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
        "_timestamp": datetime.now(timezone.utc).isoformat()
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

    # Add new 15-minute snapshot
    try:
        now = datetime.now(timezone.utc)
        ts = int(now.timestamp())
        if total_issuance_human is not None:
            # Append snapshot; no date-based deduplication - but drop duplicates if same second
            if history and history[-1].get('ts') == ts:
                history[-1]['issuance'] = float(total_issuance_human)
            else:
                history.append({'ts': ts, 'issuance': float(total_issuance_human)})
            # Keep at most N entries: 15min sampling -> 96 entries/day -> 30d ~ 2880
            max_entries = 2880
            if len(history) > max_entries:
                history = history[-max_entries:]
    except Exception:
        history = history

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
    # emission_daily = mean per_day for last 24h
    deltas_last_24h = [d['per_day'] for d in per_interval_deltas if d['ts'] >= (int(datetime.now(timezone.utc).timestamp()) - 86400)]
    # require at least 3 interval samples in the last 24h to compute a reliable daily estimate
    if len(deltas_last_24h) >= 3:
        # use winsorized mean for last 24h to smooth out spikes
        emission_daily = winsorized_mean(deltas_last_24h, 0.1)
    # build daily means from per-interval deltas grouped by UTC date
    daily_groups: Dict[str, List[float]] = {}
    for d in per_interval_deltas:
        day = datetime.fromtimestamp(d['ts'], timezone.utc).strftime('%Y-%m-%d')
        daily_groups.setdefault(day, []).append(d['per_day'])
    # sort by day
    days_sorted = sorted(daily_groups.keys())
    daily_means = [sum(daily_groups[day]) / len(daily_groups[day]) for day in days_sorted]
    emission_7d = None
    emission_30d = None
    emission_sd_7d = None
    # compute 7d and 30d only when we have enough daily means
    if len(daily_means) >= 7:
        last7 = daily_means[-7:]
        emission_7d = winsorized_mean(last7, 0.1)
        # compute sd
        import math
        mean7 = emission_7d
        sd7 = math.sqrt(sum((v - mean7) ** 2 for v in last7) / len(last7)) if len(last7) > 0 else 0
        emission_sd_7d = sd7
    # 30-day projection intentionally disabled (not used)

    # Attach emission values to result (history is saved separately)
    result['emission_daily'] = round(emission_daily, 2) if emission_daily is not None else None
    result['emission_7d'] = round(emission_7d, 2) if emission_7d is not None else None
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
    # Select projection average based on data-availability thresholds (use confidence rules)
    # - if we have >=7 days of history: use emission_7d
    # - elif we have >=3 days and a daily estimate: use emission_daily
    # - elif we have a daily estimate (but <3 days): use daily with low confidence
    # - else fallback to simple mean of interval deltas if available
    if days_of_history is not None and days_of_history >= 7 and emission_7d is not None:
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
        vals = [d['per_day'] for d in per_interval_deltas if isinstance(d.get('per_day'), (int, float))]
        if vals:
            avg_for_projection = sum(vals) / len(vals)
            projection_method = 'mean_from_intervals'

    def compute_halving_estimates(current_issuance: float, thresholds: List[int], avg_emission_per_day: float, method: str):
        """
        Compute ETAs for a series of halving thresholds by simulating progression.

        Instead of using the same average emission for all thresholds, this simulation:
        - progresses thresholds in order,
        - uses the current avg emission until the next threshold is reached,
        - then advances time to that threshold, sets current issuance to the threshold,
          and halves the emission for subsequent thresholds.

        This produces realistic ETAs for the next and subsequent halvings.
        """
        estimates = []
        now_dt = datetime.now(timezone.utc)

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

            # If we've already passed this threshold, mark zero and halve emission for next
            if cur >= th_val:
                # emission_used is the emission that was in effect for reaching this threshold
                estimates.append({'threshold': th_val, 'remaining': 0.0, 'days': 0.0, 'eta': now_dt.isoformat(), 'method': method, 'emission_used': round(emission, 6) if emission is not None else None, 'step': step})
                if emission > 0:
                    emission = emission / 2.0
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
            days = remaining / emission
            eta = now_dt + timedelta(days=days)
            estimates.append({'threshold': th_val, 'remaining': round(remaining, 6), 'days': round(days, 3), 'eta': eta.isoformat(), 'method': method, 'emission_used': round(emission, 6), 'step': step})

            # advance simulation: jump to threshold time and issuance, then halve emission
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
        if projection_method == 'emission_7d':
            projection_days_used = 7
        elif projection_method in ('emission_daily', 'emission_daily_low_confidence'):
            # use available days_of_history, at least 1 if present
            projection_days_used = int(days_of_history) if days_of_history is not None and days_of_history >= 1 else 1 if result.get('emission_daily') is not None else None
        elif projection_method == 'mean_from_intervals':
            projection_days_used = int(days_of_history) if days_of_history is not None else None
    except Exception:
        projection_days_used = None
    result['projection_days_used'] = projection_days_used
    result['halving_estimates'] = compute_halving_estimates(cur_iss, result.get('halvingThresholds', []), avg_for_projection, projection_method)

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