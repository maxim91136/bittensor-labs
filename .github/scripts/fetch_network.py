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
    existing = None
    try:
        cf_account = os.getenv('CF_ACCOUNT_ID')
        cf_token = os.getenv('CF_API_TOKEN')
        cf_kv_ns = os.getenv('CF_METRICS_NAMESPACE_ID')
        if cf_account and cf_token and cf_kv_ns:
            kv_url = f"https://api.cloudflare.com/client/v4/accounts/{cf_account}/storage/kv/namespaces/{cf_kv_ns}/values/metrics"
            req = urllib.request.Request(kv_url, method='GET', headers={
                'Authorization': f'Bearer {cf_token}'
            })
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    if resp.status == 200:
                        existing = json.loads(resp.read())
            except urllib.error.HTTPError as e:
                # no existing KV or insufficient permissions, ignore
                pass
            except Exception:
                pass
    except Exception:
        existing = None

    # Build / update daily issuance history based on existing KV if present
    try:
        history: List[Dict[str, Any]] = existing.get('issuance_history', []) if isinstance(existing, dict) else []
    except Exception:
        history = []

    # Add/Update daily aggregate for today (UTC)
    try:
        now = datetime.now(timezone.utc)
        date_key = now.strftime('%Y-%m-%d')
        # Convert to seconds epoch
        ts = int(now.timestamp())
        if total_issuance_human is not None:
            # If today's entry exists, update; otherwise append
            if history and history[-1].get('date') == date_key:
                history[-1]['issuance'] = float(total_issuance_human)
                history[-1]['ts'] = ts
            else:
                history.append({'date': date_key, 'ts': ts, 'issuance': float(total_issuance_human)})
            # Keep at most 90 daily entries (approx 3 months)
            max_daily = 90
            if len(history) > max_daily:
                history = history[-max_daily:]
    except Exception:
        history = history

    # Compute daily per-day deltas and emission aggregates
    def compute_daily_deltas(hist: List[Dict[str, Any]]) -> List[float]:
        out: List[float] = []
        for i in range(1, len(hist)):
            a = hist[i - 1]
            b = hist[i]
            dt = b['ts'] - a['ts']
            if dt <= 0:
                continue
            delta = b['issuance'] - a['issuance']
            per_day = delta * (86400.0 / dt)
            out.append(per_day)
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

    daily_deltas = compute_daily_deltas(history)
    emission_daily = None
    emission_7d = None
    emission_30d = None
    emission_sd_7d = None
    if daily_deltas:
        emission_daily = daily_deltas[-1] if daily_deltas else None
        if len(daily_deltas) >= 1:
            # 7d
            last7 = [d for d_ts, d in zip(history[1:], daily_deltas) if d is not None][-7:]
            if last7 and len(last7) > 0:
                emission_7d = winsorized_mean(last7, 0.1)
                # compute sd
                import math
                mean7 = emission_7d
                sd7 = math.sqrt(sum((v - mean7) ** 2 for v in last7) / len(last7)) if len(last7) > 0 else 0
                emission_sd_7d = sd7
        # 30d
        if len(daily_deltas) >= 1:
            last30 = [d for d_ts, d in zip(history[1:], daily_deltas) if d is not None][-30:]
            if last30 and len(last30) > 0:
                emission_30d = winsorized_mean(last30, 0.1)

    # Attach history and emission values to result
    result['issuance_history'] = history
    result['emission_daily'] = round(emission_daily, 2) if emission_daily is not None else None
    result['emission_7d'] = round(emission_7d, 2) if emission_7d is not None else None
    result['emission_30d'] = round(emission_30d, 2) if emission_30d is not None else None
    result['emission_sd_7d'] = round(emission_sd_7d, 2) if emission_sd_7d is not None else None
    result['emission_samples'] = len(daily_deltas)
    result['last_issuance_ts'] = history[-1]['ts'] if history else None
    return result

if __name__ == "__main__":
    try:
        network_data = fetch_metrics()
        output_path = os.path.join(os.getcwd(), "network.json")
        with open(output_path, "w") as f:
            json.dump(network_data, f, indent=2)
        print(f"✅ Network data written to {output_path}", file=sys.stderr)
        print(json.dumps(network_data, indent=2))
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)