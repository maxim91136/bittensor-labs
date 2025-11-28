#!/usr/bin/env python3
"""Fetch top subnets by estimated emission and write JSON output.

This script estimates per-subnet daily emission proportional to neuron count.
It writes `.github/data/top_subnets.json` and, if Cloudflare KV env vars
are present, uploads the JSON into the `top_subnets` KV key.

Designed to be run from a GitHub Actions runner (mirrors other fetch_*.py).
"""
import os
import json
import sys
from typing import List, Dict
from datetime import datetime, timezone
import urllib.request
import urllib.error
import ssl

NETWORK = os.getenv('NETWORK', 'finney')
DAILY_EMISSION = float(os.getenv('DAILY_EMISSION', '7200'))


def write_local(path: str, data: Dict[str, object]):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w') as f:
        json.dump(data, f, indent=2)


def put_to_kv(account: str, token: str, namespace: str, key: str, data: bytes) -> bool:
    url = f'https://api.cloudflare.com/client/v4/accounts/{account}/storage/kv/namespaces/{namespace}/values/{key}'
    req = urllib.request.Request(url, data=data, method='PUT', headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            if resp.status in (200, 201):
                print(f"✅ KV PUT OK ({key})")
                return True
            else:
                print(f"⚠️ KV PUT returned status {resp.status}", file=sys.stderr)
                return False
    except urllib.error.HTTPError as e:
        print(f"⚠️ KV PUT failed: HTTP {getattr(e, 'code', None)} - {e.read()}", file=sys.stderr)
    except Exception as e:
        print(f"⚠️ KV PUT failed: {e}", file=sys.stderr)
    return False


def fetch_top_subnets() -> Dict[str, object]:
    try:
        import bittensor as bt
    except Exception as e:
        print('❌ bittensor import failed:', e, file=sys.stderr)
        raise
    # Try to fetch Taostats data (preferred source for emission_share if available)
    def _fetch_taostats(network: str, limit: int = 500) -> Dict[int, Dict]:
        out = {}
        url = f"https://api.taostats.io/subnets/?network={network}&limit={limit}"
        try:
            # taostats uses HTTPS; ignore cert issues in CI if they appear
            ctx = ssl.create_default_context()
            req = urllib.request.Request(url, method='GET')
            with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
                data = resp.read()
                try:
                    j = json.loads(data)
                except Exception:
                    return out
                # taostats returns an object with "data" key or a list
                items = j.get('data') if isinstance(j, dict) and 'data' in j else j
                if not items:
                    return out
                for item in items:
                    try:
                        netuid = item.get('netuid')
                        if netuid is None:
                            # some items may use numeric keys
                            continue
                        out[int(netuid)] = item
                    except Exception:
                        continue
        except Exception:
            # silent fail — we'll fall back to on-chain calculations
            return {}
        return out

    taostats_map = _fetch_taostats(NETWORK)
    # Debug: report Taostats map size and a tiny sample so CI logs show whether Taostats responded
    try:
        if taostats_map is None:
            print('DEBUG: taostats_map is None')
        else:
            try:
                size = len(taostats_map)
            except Exception:
                size = 0
            sample_keys = list(taostats_map.keys())[:5]
            print(f"DEBUG: taostats_map_size={size}, sample_keys={sample_keys}")
    except Exception:
        pass

    subtensor = bt.subtensor(network=NETWORK)
    try:
        subnets = subtensor.get_subnets()
        # Normalize subnets into a Python list to avoid numpy/scalar issues
        try:
            subnets = list(subnets)
        except Exception:
            pass
    except Exception as e:
        print('❌ Failed to fetch subnets:', e, file=sys.stderr)
        subnets = []

    results: List[Dict[str, object]] = []
    total_neurons = 0
    
    # Helpers to robustly read permit values and evaluate truthiness
    def _permit_get(permit, uid):
        # Try mapping .get variants first
        try:
            if hasattr(permit, 'get'):
                val = permit.get(uid)
                if val is not None:
                    return val
        except Exception:
            pass
        # Try integer key
        try:
            ival = int(uid)
            if hasattr(permit, 'get'):
                val = permit.get(ival)
                if val is not None:
                    return val
        except Exception:
            pass
        # Try string key
        try:
            sval = str(uid)
            if hasattr(permit, 'get'):
                val = permit.get(sval)
                if val is not None:
                    return val
        except Exception:
            pass
        # Fallback to indexing
        try:
            return permit[uid]
        except Exception:
            try:
                return permit[int(uid)]
            except Exception:
                try:
                    return permit[str(uid)]
                except Exception:
                    return None

    def _is_truthy(v):
        if v is None:
            return False
        # strings/bytes: use bool()
        if isinstance(v, (str, bytes)):
            return bool(v)
        # iterables (including numpy arrays): use any()
        try:
            if hasattr(v, '__iter__'):
                return any(v)
        except Exception:
            pass
        try:
            return bool(v)
        except Exception:
            return False
    # First pass: collect neuron counts and validator counts
    for netuid in subnets:
        try:
            # Coerce netuid into a plain int to avoid passing numpy/int-like
            # types into `subtensor.metagraph` which may perform boolean
            # checks on inputs and trigger ambiguous-truth errors.
            try:
                netuid_i = int(netuid)
            except Exception:
                netuid_i = netuid

            metagraph = subtensor.metagraph(netuid_i)

            # Normalize `uids` into a plain Python list. Some metagraphs
            # return numpy arrays or other sequences which are ambiguous
            # in boolean contexts (e.g. `uids or []`), causing errors like
            # "The truth value of an array with more than one element is ambiguous".
            uids_raw = getattr(metagraph, 'uids', [])
            if uids_raw is None:
                uids_list = []
            elif isinstance(uids_raw, (list, tuple)):
                uids_list = list(uids_raw)
            else:
                try:
                    uids_list = list(uids_raw)
                except Exception:
                    uids_list = []

            neurons = len(uids_list)
            total_neurons += neurons

            # Try to collect optional subnet metadata if present on metagraph
            subnet_name = None
            subnet_price = None
            try:
                # common possible attributes
                for attr in ('subnet_name', 'name', 'display_name', 'title'):
                    val = getattr(metagraph, attr, None)
                    if val:
                        subnet_name = str(val)
                        break
                # metadata/dict-like places
                meta = getattr(metagraph, 'metadata', None) or getattr(metagraph, 'meta', None)
                if meta and isinstance(meta, dict):
                    if subnet_name is None and 'name' in meta:
                        subnet_name = str(meta.get('name'))
                    # price may be stored under common keys
                    for pkey in ('price', 'token_price', 'price_usd'):
                        if pkey in meta and meta.get(pkey) is not None:
                            subnet_price = meta.get(pkey)
                            break
                # direct price attribute
                if subnet_price is None:
                    p = getattr(metagraph, 'price', None)
                    if p is not None:
                        subnet_price = p
            except Exception:
                subnet_name = subnet_name or None
                subnet_price = subnet_price or None

            # Safely read validator_permit mapping (may be missing, array-like, or not a dict)
            # Avoid using `or {}` which triggers a truth-value check on array-like objects.
            permit = getattr(metagraph, 'validator_permit', None)
            if permit is None:
                permit = {}
            try:
                validators = 0
                for uid in uids_list:
                    val = _permit_get(permit, uid)
                    if _is_truthy(val):
                        validators += 1
            except Exception:
                validators = 0

            results.append({
                'netuid': int(netuid_i) if isinstance(netuid_i, (int,)) or (isinstance(netuid_i, (str,)) and str(netuid_i).isdigit()) else int(netuid),
                'neurons': neurons,
                'validators': validators,
                'subnet_name': subnet_name,
                'subnet_price': subnet_price
            })
        except Exception as e:
            print(f'⚠️ metagraph fetch failed for netuid {netuid}: {e}', file=sys.stderr)
            continue

    # Debug: report how many subnets were iterated and how many results collected
    try:
        print(f"DEBUG: subnets_fetched={len(subnets)}, results_collected={len(results)}, total_neurons={total_neurons}")
        if len(results) > 0:
            print(f"DEBUG: sample_result={results[:5]}")
    except Exception:
        pass

    # If no neurons found, return empty
    if total_neurons <= 0:
        print('⚠️ No neuron data available to compute emissions', file=sys.stderr)
        return {'generated_at': datetime.now(timezone.utc).isoformat(), 'top_subnets': []}

    # Now that we have the full total_neurons, compute a correct neuron_share for each entry
    try:
        for entry in results:
            try:
                entry['neuron_share'] = round((entry.get('neurons', 0) / total_neurons) if total_neurons > 0 else 0.0, 6)
            except Exception:
                entry['neuron_share'] = 0.0
    except Exception:
        pass

    # Compute estimated emission per subnet. Prefer Taostats if available.
    for entry in results:
        netuid_i = entry.get('netuid')
        taodata = None
        try:
            taodata = taostats_map.get(int(netuid_i)) if taostats_map else None
        except Exception:
            taodata = None

        if taodata:
            # Taostats provides emission_share as a fractional value (e.g. 0.0318 -> 3.18%)
            try:
                ts_share = float(taodata.get('emission_share', 0.0))
            except Exception:
                ts_share = 0.0
            est = ts_share * DAILY_EMISSION
            entry['estimated_emission_daily'] = round(float(est), 6)
            try:
                entry['emission_share_percent'] = round(float(ts_share) * 100.0, 4)
            except Exception:
                entry['emission_share_percent'] = 0.0
            # keep source metadata so consumers know where the value came from
            entry['ema_source'] = 'taostats'
            # copy some helpful fields from Taostats if present
            entry['taostats_name'] = taodata.get('name') if isinstance(taodata, dict) else None
            entry['taostats_tempo'] = taodata.get('tempo') if isinstance(taodata, dict) else None
            entry['taostats_total_stake'] = taodata.get('total_stake') if isinstance(taodata, dict) else None
            entry['taostats_raw'] = taodata
        else:
            # fallback: proportional to neuron counts
            share = (entry['neurons'] / total_neurons) if total_neurons > 0 else 0.0
            est = share * DAILY_EMISSION
            entry['estimated_emission_daily'] = round(float(est), 6)
            try:
                entry['emission_share_percent'] = round((entry['estimated_emission_daily'] / DAILY_EMISSION) * 100.0, 4)
            except Exception:
                entry['emission_share_percent'] = 0.0
            entry['ema_source'] = 'neurons'

    # Sort and take top N (default 10)
    sorted_subnets = sorted(results, key=lambda x: x.get('estimated_emission_daily', 0.0), reverse=True)
    try:
        top_n = int(os.getenv('TOP_N', '10'))
    except Exception:
        top_n = 10
    top_n = max(1, top_n)
    top_list = sorted_subnets[:top_n]

    out = {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'network': NETWORK,
        'daily_emission_assumed': DAILY_EMISSION,
        'total_neurons': total_neurons,
        'top_n': top_n,
        'top_subnets': top_list
    }
    return out


def main():
    out = fetch_top_subnets()
    out_path = os.path.join(os.getcwd(), '.github', 'data', 'top_subnets.json')
    write_local(out_path, out)
    print(f'Wrote {out_path}')

    # Attempt to push to Cloudflare KV if env present
    cf_acc = os.getenv('CF_ACCOUNT_ID')
    cf_token = os.getenv('CF_API_TOKEN')
    cf_ns = os.getenv('CF_KV_NAMESPACE_ID') or os.getenv('CF_METRICS_NAMESPACE_ID')
    if cf_acc and cf_token and cf_ns:
        print('Attempting KV PUT for top_subnets...')
        data = json.dumps(out).encode('utf-8')
        ok = put_to_kv(cf_acc, cf_token, cf_ns, 'top_subnets', data)
        if not ok:
            print('KV PUT failed; leaving local file only', file=sys.stderr)
    else:
        print('CF credentials missing; skipped KV PUT')


if __name__ == '__main__':
    main()
