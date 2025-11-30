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
from typing import List, Dict, Tuple
from datetime import datetime, timezone
import urllib.request
import urllib.error
import ssl
import re

NETWORK = os.getenv('NETWORK', 'finney')
DAILY_EMISSION = float(os.getenv('DAILY_EMISSION', '7200'))
TAOSTATS_API_KEY = os.getenv('TAOSTATS_API_KEY')
USE_ONCHAIN_STAKE_FALLBACK = os.getenv('USE_ONCHAIN_STAKE_FALLBACK', '0') == '1'
# cap how many per-uid queries we'll perform per subnet to avoid heavy CI workloads.
# Default is a reasonable 50 UID-sample per subnet for the Free Plan
def _int_env(name, default):
    v = os.getenv(name)
    if v is None:
        return default
    v2 = v.strip()
    if v2 == '':
        return default
    try:
        return int(v2)
    except Exception:
        print(f"Warning: environment variable {name} is invalid ({v!r}), using default {default}")
        return default

MAX_UID_STAKE_QUERIES_PER_SUBNET = _int_env('MAX_UID_STAKE_QUERIES_PER_SUBNET', 50)


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
    def _fetch_taostats(network: str, limit: int = 500) -> Tuple[Dict[int, Dict], str]:
        """Fetch Taostats subnet records and return a mapping netuid->item.

        This tries a small set of plausible Taostats endpoints and performs a
        few retries with backoff. If Taostats cannot be reached or returns no
        usable data we return an empty dict.
        """
        out: Dict[int, Dict] = {}
        last_error = ''
        # Prefer the documented API path per https://docs.taostats.io/reference/get-subnets-1
        variants = [
            f"https://api.taostats.io/api/subnet/latest/v1?network={network}&limit={limit}",
        ]

        # Basic retry/backoff
        for url in variants:
            attempt = 0
            while attempt < 3:
                try:
                    ctx = ssl.create_default_context()
                    hdrs = {
                        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'application/json',
                    }
                    if TAOSTATS_API_KEY:
                        hdrs['Authorization'] = TAOSTATS_API_KEY
                    req = urllib.request.Request(url, method='GET', headers=hdrs)
                    with urllib.request.urlopen(req, timeout=10, context=ctx) as resp:
                        if resp.status and int(resp.status) >= 400:
                            raise Exception(f"HTTP {resp.status}")
                        data = resp.read()
                        try:
                            j = json.loads(data)
                        except Exception as e:
                            # not JSON — capture snippet & continue
                            try:
                                snippet = data[:240].decode('utf-8', errors='replace') if isinstance(data, (bytes, bytearray)) else str(data)
                            except Exception:
                                snippet = '<unreadable response>'
                            last_error = f'Non-JSON response from {url}: {snippet[:240]}'
                            # Try to parse JSON embedded in HTML pages (Next.js / __NEXT_DATA__ or other SSR payloads)
                            try:
                                html = data.decode('utf-8', errors='replace') if isinstance(data, (bytes, bytearray)) else str(data)
                                # look for <script id="__NEXT_DATA__" type="application/json"> ... </script>
                                m = re.search(r'<script[^>]*id=["\']__NEXT_DATA__["\'][^>]*>(.*?)</script>', html, re.S | re.I)
                                found = False
                                if m:
                                    try:
                                        nd = json.loads(m.group(1))
                                        # recursively search for dicts with 'netuid' or 'id'
                                        def find_items(obj):
                                            out_items = []
                                            if isinstance(obj, dict):
                                                if 'netuid' in obj or 'id' in obj:
                                                    out_items.append(obj)
                                                for v in obj.values():
                                                    out_items.extend(find_items(v))
                                            elif isinstance(obj, list):
                                                for v in obj:
                                                    out_items.extend(find_items(v))
                                            return out_items
                                        nd_items = find_items(nd)
                                        for item in nd_items:
                                            try:
                                                netuid = item.get('netuid') if isinstance(item, dict) else None
                                                if netuid is None and isinstance(item, dict) and 'id' in item:
                                                    netuid = item.get('id')
                                                if netuid is None:
                                                    continue
                                                out[int(netuid)] = item
                                                found = True
                                            except Exception:
                                                continue
                                    except Exception:
                                        pass
                                if found:
                                    return out, last_error
                            except Exception:
                                pass
                            # no embedded JSON found — continue to next variant
                            break
                        # taostats typically returns an object with a 'data' key
                        items = j.get('data') if isinstance(j, dict) and 'data' in j else j
                        if not items:
                            break
                        for item in items:
                            try:
                                # prefer explicit 'netuid' field, but numeric keys may exist
                                netuid = item.get('netuid') if isinstance(item, dict) else None
                                if netuid is None:
                                    # some APIs use 'id' or numeric-keyed dicts
                                    if isinstance(item, dict) and 'id' in item:
                                        netuid = item.get('id')
                                if netuid is None:
                                    continue
                                # Ensure emission or emission_share exists; if not, try documented per-subnet endpoint
                                if isinstance(item, dict) and ('emission_share' not in item and 'emission' not in item or item.get('emission_share') in (None, 0) and item.get('emission') in (None, 0)):
                                    # try per-subnet emission endpoint
                                    for per_endpoint in (
                                        f"https://api.taostats.io/api/v1/subnets/{int(netuid)}/emission",
                                        f"https://api.taostats.io/subnets/{int(netuid)}/emission",
                                        f"https://taostats.io/api/v1/subnets/{int(netuid)}/emission",
                                    ):
                                        try:
                                            hdrs2 = {
                                                'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                                                'Accept': 'application/json',
                                            }
                                            if TAOSTATS_API_KEY:
                                                hdrs2['Authorization'] = TAOSTATS_API_KEY
                                            preq = urllib.request.Request(per_endpoint, method='GET', headers=hdrs2)
                                            with urllib.request.urlopen(preq, timeout=6, context=ssl.create_default_context()) as presp:
                                                pdata = presp.read()
                                                try:
                                                    pj = json.loads(pdata)
                                                    # documented response may embed emission_share or emission directly
                                                    if isinstance(pj, dict):
                                                        if 'emission_share' in pj and pj.get('emission_share') is not None:
                                                            item['emission_share'] = pj.get('emission_share')
                                                            break
                                                        if 'emission' in pj and pj.get('emission') is not None:
                                                            item['emission'] = pj.get('emission')
                                                            break
                                                        # some endpoints wrap data
                                                        if 'data' in pj and isinstance(pj.get('data'), dict) and 'emission_share' in pj.get('data'):
                                                            item['emission_share'] = pj.get('data').get('emission_share')
                                                            break
                                                        if 'data' in pj and isinstance(pj.get('data'), dict) and 'emission' in pj.get('data'):
                                                            item['emission'] = pj.get('data').get('emission')
                                                            break
                                                except Exception:
                                                    pass
                                        except Exception:
                                            continue
                                out[int(netuid)] = item
                            except Exception:
                                continue
                        # Successfully parsed something — return it
                        if len(out) > 0:
                            return out, last_error
                except Exception as e:
                    # wait a bit and retry this variant
                    backoff = 0.5 * (2 ** attempt)
                    try:
                        # record the last error (HTTP status or exception repr)
                        last_error = getattr(e, 'reason', None) or getattr(e, 'code', None) or str(e)
                    except Exception:
                        last_error = str(e)
                    try:
                        import time

                        time.sleep(backoff)
                    except Exception:
                        pass
                    attempt += 1
                    continue
                # break out of attempts loop if we reached here without continue
                break
        return out, last_error

    # First, try to read Taostats data from Cloudflare KV if credentials
    # are provided in the environment (this helps CI jobs reuse an existing
    # `taostats_latest` KV entry instead of hitting protected Taostats APIs).
    taostats_map = {}
    taostats_error = None
    try:
        cf_acc = os.getenv('CF_ACCOUNT_ID')
        cf_token = os.getenv('CF_API_TOKEN')
        cf_ns = os.getenv('CF_KV_NAMESPACE_ID') or os.getenv('CF_METRICS_NAMESPACE_ID')
        if cf_acc and cf_token and cf_ns:
            try:
                url = f'https://api.cloudflare.com/client/v4/accounts/{cf_acc}/storage/kv/namespaces/{cf_ns}/values/taostats_subnets'
                req = urllib.request.Request(url, method='GET', headers={
                    'Authorization': f'Bearer {cf_token}',
                    'Accept': 'application/json'
                })
                with urllib.request.urlopen(req, timeout=8) as resp:
                    if resp.status == 200:
                        raw = resp.read()
                        try:
                            kj = json.loads(raw)
                            # Expecting either a mapping or an object with 'data'
                            if isinstance(kj, dict) and 'data' in kj and isinstance(kj.get('data'), list):
                                items = kj.get('data')
                            elif isinstance(kj, list):
                                items = kj
                            elif isinstance(kj, dict):
                                # if the KV stores a dict of netuid->item
                                try:
                                    taostats_map = {int(k): v for k, v in kj.items()}
                                except Exception:
                                    taostats_map = {}
                                items = None
                            else:
                                items = None
                            if items:
                                for item in items:
                                    try:
                                        netuid = item.get('netuid') if isinstance(item, dict) else None
                                        if netuid is None and isinstance(item, dict) and 'id' in item:
                                            netuid = item.get('id')
                                        if netuid is None:
                                            continue
                                        taostats_map[int(netuid)] = item
                                    except Exception:
                                        continue
                        except Exception:
                            taostats_map = {}
            except Exception:
                taostats_map = {}
    except Exception:
        taostats_map = {}
    # If KV didn't produce anything, fall back to direct HTTP fetches
    if not taostats_map:
        taostats_map, taostats_error = _fetch_taostats(NETWORK)
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
    if taostats_error:
        print(f'DEBUG: taostats_last_error={taostats_error}')

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

    def _get_uid_stake(subtensor, uid):
        """Attempt several API names to fetch stake for a uid; return float or None."""
        # Try common shapes: 'get_neuron', 'neuron_info', 'get_uid', 'get_neuron_info'
        candidates = [
            'get_neuron', 'neuron', 'neuron_for_uid', 'get_neuron_info', 'get_stake', 'get_balance', 'balance_of'
        ]
        for method in candidates:
            try:
                fn = getattr(subtensor, method, None)
                if not callable(fn):
                    continue
                res = fn(uid)
                # res might be an object with 'stake' attribute or a dict
                if res is None:
                    continue
                if hasattr(res, 'stake'):
                    try:
                        return float(res.stake)
                    except Exception:
                        pass
                if isinstance(res, dict):
                    for key in ('stake', 'bond', 'balance', 'stake_total'):
                        if key in res and isinstance(res[key], (int, float, str)):
                            try:
                                return float(res[key])
                            except Exception:
                                continue
            except Exception:
                continue
        return None
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

            # If requested, keep a list of uid ints for optional on-chain stake aggregation
            entry_obj = {
                'netuid': int(netuid_i) if isinstance(netuid_i, (int,)) or (isinstance(netuid_i, (str,)) and str(netuid_i).isdigit()) else int(netuid),
                'neurons': neurons,
                'validators': validators,
                'subnet_name': subnet_name,
                'subnet_price': subnet_price
            }
            if USE_ONCHAIN_STAKE_FALLBACK:
                try:
                    # store uids as native ints (limit may be applied later)
                    entry_obj['_uids'] = [int(u) for u in uids_list]
                except Exception:
                    entry_obj['_uids'] = uids_list
            results.append(entry_obj)
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

    # Compute estimated emission per subnet using Taostats ONLY.
    # Build a quick set of netuids present in Taostats to filter results.
    taostats_netuids = set()
    try:
        taostats_netuids = set(int(k) for k in taostats_map.keys()) if taostats_map else set()
    except Exception:
        taostats_netuids = set()

    if not taostats_netuids:
        # Taostats subnet data was not available. Fall back to neuron-proportional
        # emission estimates so we still produce a usable `top_subnets` payload
        # instead of an empty one. Log diagnostic details if present.
        log_msg = '⚠️ Taostats subnets not available — falling back to neuron-proportional estimates.'
        if TAOSTATS_API_KEY:
            log_msg += ' TAOSTATS_API_KEY present but no subnet data returned.'
        if taostats_error:
            log_msg += f' Last error: {taostats_error}'
        print(log_msg, file=sys.stderr)
        # Prefer to weight by `total_stake` (on-chain or metadata) when available;
        # otherwise fallback to neuron_share-based distribution.
        total_weight = 0.0
        for entry in results:
            try:
                # detect stake from possible fields
                stake = None
                # Taostats provides 'total_stake'; metagraph metadata may too.
                if isinstance(entry.get('taostats_total_stake', None), (int, float, str)):
                    try:
                        stake = float(entry.get('taostats_total_stake'))
                    except Exception:
                        stake = None
                if stake is None:
                    try:
                        meta_stake = entry.get('subnet_price') or entry.get('subnet_total_stake') or entry.get('subnet_price')
                        if isinstance(meta_stake, (int, float, str)):
                            stake = float(meta_stake)
                    except Exception:
                        stake = None
                # fallback to neurons if stake not available
                # If configured, or we lack Taostats data and are in Free Plan, use an on-chain stake scan.
                # Default to use it automatically when taostats_map is empty and no TAOSTATS API key is present.
                auto_onchain = (not taostats_map and not TAOSTATS_API_KEY)
                if stake is None and (USE_ONCHAIN_STAKE_FALLBACK or auto_onchain):
                    try:
                        subtensor = subtensor if 'subtensor' in locals() else bt.subtensor(network=NETWORK)
                        uids_to_check = entry.get('_uids') or []
                        # If we stored uids list, restrict it to avoid many queries
                        if isinstance(uids_to_check, list):
                            # sample randomly up to the cap to avoid bias
                            import random
                            if len(uids_to_check) > MAX_UID_STAKE_QUERIES_PER_SUBNET:
                                try:
                                    uids_to_check = random.sample(uids_to_check, MAX_UID_STAKE_QUERIES_PER_SUBNET)
                                except Exception:
                                    # fallback to truncation if sampling fails
                                    uids_to_check = uids_to_check[:MAX_UID_STAKE_QUERIES_PER_SUBNET]
                            total_onchain_stake = 0.0
                            for uid in uids_to_check:
                                try:
                                    s_val = _get_uid_stake(subtensor, uid)
                                    if s_val is not None:
                                        total_onchain_stake += float(s_val)
                                except Exception:
                                    continue
                            if total_onchain_stake > 0:
                                stake = total_onchain_stake
                                entry['onchain_total_stake'] = round(float(total_onchain_stake), 6)
                    except Exception:
                        stake = None
                weight = stake if (stake is not None and stake > 0) else float(entry.get('neurons', 0))
                # ensure minimal non-zero
                if not weight or weight <= 0:
                    weight = 1.0
                entry['_fallback_weight'] = weight
                # mark whether the weight came from stake or neurons so we can
                # derive `ema_source` robustly later without ambiguous truth checks
                # Prefer onchain if we computed it; otherwise use whatever stake/meta we managed to find
                entry['_fallback_source'] = 'onchain_stake' if (entry.get('onchain_total_stake') is not None and float(entry.get('onchain_total_stake', 0)) > 0) else ('stake' if (stake is not None and stake > 0) else 'neurons')
                total_weight += weight
            except Exception:
                entry['_fallback_weight'] = 1.0
                total_weight += 1.0
        # Now compute per-entry estimated emission using weights
        for entry in results:
            try:
                w = float(entry.get('_fallback_weight', 0) or 0)
                share = (w / total_weight) if total_weight > 0 else 0.0
                est = share * DAILY_EMISSION
                entry['estimated_emission_daily'] = round(float(est), 6)
            except Exception:
                entry['estimated_emission_daily'] = 0.0
            try:
                entry['emission_share_percent'] = round(float(entry.get('estimated_emission_daily', 0.0) / DAILY_EMISSION) * 100.0, 4)
            except Exception:
                entry['emission_share_percent'] = None
            # Use the `_fallback_source` set above to determine the EMA source
            entry['ema_source'] = entry.get('_fallback_source', 'neurons')
        # proceed with the neuron-proportional `results`

    # Now build final results, mixing taostats entries with weighted fallbacks
    filtered_results = []
    for entry in results:
        try:
            netuid_i = int(entry.get('netuid'))
        except Exception:
            continue
        taodata = taostats_map.get(netuid_i)
        if taodata:
            # Use Taostats share for these
            try:
                # The API returns 'emission' field which represents the subnet's emission value
                # We need to normalize it to a share (0.0-1.0) based on total emissions
                ts_emission = float(taodata.get('emission', 0.0))
                # If emission is a percentage-like value (0-100), convert to share
                # Otherwise treat as raw emission value that will be normalized
                ts_share = ts_emission / 100.0 if ts_emission > 1.0 else ts_emission
            except Exception:
                ts_share = 0.0
            est = ts_share * DAILY_EMISSION
            # Set both our estimate and taostats-based estimate fields so
            # downstream diagnostics can compare them easily.
            entry['taostats_emission_share'] = round(float(ts_share), 8)
            entry['taostats_estimated_emission_daily'] = round(float(est), 6)
            # Keep the 'estimated_emission_daily' consistent with taostats
            entry['estimated_emission_daily'] = round(float(est), 6)
            try:
                entry['emission_share_percent'] = round(float(ts_share) * 100.0, 4)
            except Exception:
                entry['emission_share_percent'] = None
            entry['ema_source'] = 'taostats'
            entry['taostats_name'] = taodata.get('name') if isinstance(taodata, dict) else None
            entry['taostats_tempo'] = taodata.get('tempo') if isinstance(taodata, dict) else None
            entry['taostats_total_stake'] = taodata.get('total_stake') if isinstance(taodata, dict) else None
            entry['taostats_raw'] = taodata
            # If we also have our fallback estimate, compute delta fields
            try:
                our_est = float(entry.get('estimated_emission_daily', 0.0))
                taostar_est = float(entry.get('taostats_estimated_emission_daily', our_est))
                entry['emission_delta_abs'] = round(our_est - taostar_est, 6)
                entry['emission_delta_pct'] = round(((our_est - taostar_est) / taostar_est * 100.0) if taostar_est != 0 else 0.0, 4)
            except Exception:
                entry['emission_delta_abs'] = None
                entry['emission_delta_pct'] = None
        else:
            # We did not have taostats data for this entry; keep the fallback estimate
            # (estimated_emission_daily already computed by the fallback logic above)
            if 'estimated_emission_daily' not in entry:
                try:
                    w = float(entry.get('_fallback_weight', 0) or 0)
                    share = (w / total_weight) if total_weight > 0 else 0.0
                    est = share * DAILY_EMISSION
                    entry['estimated_emission_daily'] = round(float(est), 6)
                except Exception:
                    entry['estimated_emission_daily'] = 0.0
            if 'emission_share_percent' not in entry:
                try:
                    entry['emission_share_percent'] = round(float(entry.get('estimated_emission_daily', 0.0) / DAILY_EMISSION) * 100.0, 4)
                except Exception:
                    entry['emission_share_percent'] = None
            entry['ema_source'] = entry.get('ema_source', 'stake')
            # If we don't have taostats for this entry, emit a taostats_emission_share: None
            entry.setdefault('taostats_emission_share', None)
            entry.setdefault('taostats_estimated_emission_daily', None)
            entry.setdefault('emission_delta_abs', None)
            entry.setdefault('emission_delta_pct', None)
        # If taodata exists, the above block already set the values for that
        # entry. Do not overwrite fallback values if we don't have taodata.
        filtered_results.append(entry)

    # Replace results with filtered_results for downstream sorting
    results = filtered_results
    # Remove heavy `_uids` list entries from final payload so the JSON stays compact
    for entry in results:
        if '_uids' in entry:
            try:
                del entry['_uids']
            except Exception:
                pass

    # Sort and take top N (default 10). Also keep a full-list of all subnets
    # so we can include the entire set of subnets in the JSON for debugging
    sorted_subnets = sorted(results, key=lambda x: x.get('estimated_emission_daily', 0.0), reverse=True)
    top_n = _int_env('TOP_N', 10)
    top_n = max(1, top_n)
    top_list = sorted_subnets[:top_n]

    # Build a taostats-based top-N list (if taostats data available) to allow
    # comparison with our local estimates. This helps diagnose differences
    # between on-chain estimates and Taostats authoritative data.
    taostats_top_list = []
    if taostats_map:
        # taostats entries are keyed by netuid in taostats_map
        taodata_items = []
        for k, v in taostats_map.items():
            try:
                uid = int(k)
                # emission_share is expected to be fractional (0..1)
                share = float(v.get('emission_share', 0.0)) if isinstance(v, dict) and v.get('emission_share') is not None else 0.0
                taodata_items.append((uid, share, v))
            except Exception:
                continue
        taodata_items = sorted(taodata_items, key=lambda x: x[1], reverse=True)
        for uid, share, v in taodata_items[:top_n]:
            try:
                taostats_top_list.append({
                    'netuid': uid,
                    'emission_share': round(share, 8),
                    'estimated_emission_daily': round(share * DAILY_EMISSION, 6),
                    'taostats_raw': v
                })
            except Exception:
                continue

    # Create a simple comparison between our top_list and taostats_top_list
    def _uid_set(l):
        try:
            return set([int(x.get('netuid')) for x in l if x and 'netuid' in x])
        except Exception:
            return set()

    our_top_uids = _uid_set(top_list)
    tao_top_uids = _uid_set(taostats_top_list)
    added_by_us = sorted(list(our_top_uids - tao_top_uids))
    missing_from_us = sorted(list(tao_top_uids - our_top_uids))

    # Build the final output and include 'all_subnets' as requested
    # Compute discrepancy stats for entries where both our estimate and taostats exist
    discrepancies = []
    for e in results:
        try:
            our = float(e.get('estimated_emission_daily', 0.0))
            tao = e.get('taostats_estimated_emission_daily')
            if tao is not None:
                tao = float(tao)
                absd = abs(our - tao)
                pct = (absd / tao * 100.0) if tao != 0 else 0.0
                discrepancies.append({'netuid': int(e.get('netuid')), 'our': our, 'tao': tao, 'abs_delta': round(absd,6), 'pct_delta': round(pct,4)})
        except Exception:
            continue

    def _mean(xs):
        return float(sum(xs)/len(xs)) if xs else 0.0

    if discrepancies:
        abs_vals = [d['abs_delta'] for d in discrepancies]
        pct_vals = [d['pct_delta'] for d in discrepancies]
        discrepancy_stats = {
            'count': len(discrepancies),
            'avg_abs_delta': round(_mean(abs_vals),6),
            'max_abs_delta': round(max(abs_vals),6) if abs_vals else None,
            'avg_pct_delta': round(_mean(pct_vals),4),
            'max_pct_delta': round(max(pct_vals),4) if pct_vals else None
        }
    else:
        discrepancy_stats = {'count': 0, 'avg_abs_delta': 0.0, 'max_abs_delta': None, 'avg_pct_delta': 0.0, 'max_pct_delta': None}

    out = {
        'generated_at': datetime.now(timezone.utc).isoformat(),
        'network': NETWORK,
        'daily_emission_assumed': DAILY_EMISSION,
        'total_neurons': total_neurons,
        'top_n': top_n,
        'top_subnets': top_list,
        'all_subnets': sorted_subnets,
        'taostats_top_subnets': taostats_top_list,
        'top_subnets_discrepancies': {
            'our_top_not_in_taostats_top': added_by_us,
            'taostats_top_not_in_our_top': missing_from_us
        },
        'top_subnets_discrepancy_stats': discrepancy_stats
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
        # Avoid overwriting KV with an empty `top_subnets` payload.
        if not out.get('top_subnets'):
            print('⚠️ top_subnets is empty — skipping KV PUT to avoid clearing existing data', file=sys.stderr)
        else:
            print('Attempting KV PUT for top_subnets...')
            data = json.dumps(out).encode('utf-8')
            ok = put_to_kv(cf_acc, cf_token, cf_ns, 'top_subnets', data)
            if not ok:
                print('KV PUT failed; leaving local file only', file=sys.stderr)
    else:
        print('CF credentials missing; skipped KV PUT')


if __name__ == '__main__':
    main()
