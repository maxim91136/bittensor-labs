#!/usr/bin/env python3
"""Fetch top validators by stake and write JSON output.

This script fetches validator data from Taostats API and/or on-chain data.
It writes `.github/data/top_validators.json` and, if Cloudflare KV env vars
are present, uploads the JSON into the `top_validators` KV key.

Designed to be run from a GitHub Actions runner (mirrors fetch_top_subnets.py).
"""
import os
import json
import sys
from typing import List, Dict, Tuple
from datetime import datetime, timezone
import urllib.request
import urllib.error
import ssl

NETWORK = os.getenv('NETWORK', 'finney')
TAOSTATS_API_KEY = os.getenv('TAOSTATS_API_KEY')

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

TOP_N = _int_env('TOP_N', 10)


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


def fetch_from_taostats(network: str, limit: int = 100) -> Tuple[List[Dict], str]:
    """Fetch validators from Taostats API.
    
    Returns tuple of (validators_list, error_message).
    """
    validators = []
    last_error = ''
    
    # Taostats validator endpoints to try - dTao endpoint has names!
    endpoints = [
        f"https://api.taostats.io/api/dtao/validator/latest/v1?limit={limit}",  # dTao endpoint with names
        f"https://api.taostats.io/api/validator/latest/v1?network={network}&limit={limit}",
    ]
    
    ctx = ssl.create_default_context()
    
    for url in endpoints:
        attempt = 0
        while attempt < 3:
            try:
                hdrs = {
                    'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'application/json',
                }
                if TAOSTATS_API_KEY:
                    hdrs['Authorization'] = TAOSTATS_API_KEY
                
                req = urllib.request.Request(url, method='GET', headers=hdrs)
                with urllib.request.urlopen(req, timeout=15, context=ctx) as resp:
                    if resp.status and int(resp.status) >= 400:
                        raise Exception(f"HTTP {resp.status}")
                    
                    data = resp.read()
                    try:
                        j = json.loads(data)
                    except Exception as e:
                        last_error = f'Non-JSON response from {url}'
                        break
                    
                    # Taostats typically returns { "data": [...] }
                    items = j.get('data') if isinstance(j, dict) and 'data' in j else j
                    if not items or not isinstance(items, list):
                        last_error = f'No data array in response from {url}'
                        break
                    
                    validators = items
                    print(f"✅ Fetched {len(validators)} validators from {url}")
                    return validators, ''
                    
            except Exception as e:
                backoff = 0.5 * (2 ** attempt)
                last_error = str(e)
                try:
                    import time
                    time.sleep(backoff)
                except Exception:
                    pass
                attempt += 1
                continue
            break
    
    return validators, last_error


def fetch_top_validators() -> Dict[str, object]:
    """Main function to fetch and process top validators."""
    
    validators = []
    error_msg = ''
    
    # Try Taostats API first
    validators, error_msg = fetch_from_taostats(NETWORK, limit=100)
    
    if not validators:
        print(f"⚠️ Could not fetch validators from Taostats: {error_msg}", file=sys.stderr)
        # Could add on-chain fallback here if needed
        now_iso = datetime.now(timezone.utc).isoformat()
        return {
            'generated_at': now_iso,
            'last_updated': now_iso,
            'network': NETWORK,
            'top_n': TOP_N,
            'top_validators': [],
            'error': error_msg or 'No validator data available'
        }
    
    # Process and normalize validator data
    processed = []
    for v in validators:
        try:
            # Handle hotkey - can be string or object with ss58
            hotkey_raw = v.get('hotkey') or v.get('address') or v.get('validator_hotkey')
            if isinstance(hotkey_raw, dict):
                hotkey = hotkey_raw.get('ss58') or hotkey_raw.get('hex')
            else:
                hotkey = hotkey_raw
            
            # Handle coldkey similarly
            coldkey_raw = v.get('coldkey') or v.get('owner')
            if isinstance(coldkey_raw, dict):
                coldkey = coldkey_raw.get('ss58') or coldkey_raw.get('hex')
            else:
                coldkey = coldkey_raw
            
            # Get stake - dTao uses global_weighted_stake (in rao), old API uses stake
            stake_raw = v.get('global_weighted_stake') or v.get('stake') or v.get('total_stake') or v.get('root_stake') or 0
            # Convert from rao to TAO if it's a large number (rao = 10^9 TAO)
            stake = float(stake_raw) if stake_raw else 0
            if stake > 1_000_000_000_000:  # Likely in rao
                stake = stake / 1_000_000_000  # Convert to TAO
            
            # Get nominators - dTao uses global_nominators
            nominators = int(v.get('global_nominators') or v.get('nominators') or v.get('nominator_count') or 0)
            
            # Get take - may be string in dTao API
            take_raw = v.get('take') or v.get('delegate_take') or 0
            take = float(take_raw) if take_raw else 0
            
            # Get active subnets count
            active_subnets = int(v.get('active_subnets') or v.get('vpermit_count') or 0)
            
            # Get dominance
            dominance = v.get('dominance')
            if isinstance(dominance, str):
                try:
                    dominance = float(dominance)
                except:
                    dominance = None
            
            # Get name, fallback to truncated hotkey if no name
            name = v.get('name') or v.get('validator_name') or v.get('display_name')
            if not name and hotkey:
                # Show truncated hotkey: "5Dd8...rWv"
                name = f"{hotkey[:4]}...{hotkey[-3:]}"
            
            entry = {
                'hotkey': hotkey,
                'coldkey': coldkey,
                'name': name,
                'stake': stake,
                'stake_formatted': None,
                'nominators': nominators,
                'active_subnets': active_subnets,
                'take': take,
                'dominance': dominance,
                'nominator_return_per_day': v.get('nominator_return_per_day'),
                'validator_return_per_day': v.get('validator_return_per_day'),
                'rank': v.get('rank'),
            }
            
            # Format stake for display (e.g., "1.23M τ")
            if stake >= 1_000_000:
                entry['stake_formatted'] = f"{stake/1_000_000:.2f}M τ"
            elif stake >= 1_000:
                entry['stake_formatted'] = f"{stake/1_000:.1f}K τ"
            else:
                entry['stake_formatted'] = f"{stake:.2f} τ"
            
            # Format take as percentage
            if take > 0 and take < 1:
                entry['take_percent'] = f"{take * 100:.1f}%"
            elif take >= 1:
                entry['take_percent'] = f"{take:.1f}%"
            else:
                entry['take_percent'] = "0%"
            
            processed.append(entry)
            
        except Exception as e:
            print(f"⚠️ Error processing validator: {e}", file=sys.stderr)
            continue
    
    # Sort by stake (descending)
    sorted_validators = sorted(processed, key=lambda x: x.get('stake', 0), reverse=True)
    
    # Calculate total stake for share percentages
    total_stake = sum(v.get('stake', 0) for v in sorted_validators)
    
    # Add stake share to each validator
    for v in sorted_validators:
        if total_stake > 0:
            v['stake_share'] = round(v.get('stake', 0) / total_stake, 6)
            v['stake_share_percent'] = f"{v['stake_share'] * 100:.2f}%"
        else:
            v['stake_share'] = 0
            v['stake_share_percent'] = "0%"
    
    # Take top N
    top_list = sorted_validators[:TOP_N]
    
    # Remove 'raw' from top_list to keep payload small
    for v in top_list:
        if 'raw' in v:
            del v['raw']
    
    now_iso = datetime.now(timezone.utc).isoformat()
    out = {
        'generated_at': now_iso,
        'last_updated': now_iso,
        'network': NETWORK,
        'top_n': TOP_N,
        'total_validators': len(sorted_validators),
        'total_stake': round(total_stake, 2),
        'top_validators': top_list,
        'source': 'taostats'
    }
    
    return out


def main():
    out = fetch_top_validators()
    out_path = os.path.join(os.getcwd(), '.github', 'data', 'top_validators.json')
    write_local(out_path, out)
    print(f'Wrote {out_path}')
    
    # Debug output
    print(f"DEBUG: top_validators count = {len(out.get('top_validators', []))}")
    if out.get('top_validators'):
        print(f"DEBUG: #1 validator = {out['top_validators'][0].get('name')} with {out['top_validators'][0].get('stake_formatted')}")

    # Attempt to push to Cloudflare KV if env present
    cf_acc = os.getenv('CF_ACCOUNT_ID')
    cf_token = os.getenv('CF_API_TOKEN')
    cf_ns = os.getenv('CF_KV_NAMESPACE_ID') or os.getenv('CF_METRICS_NAMESPACE_ID')
    
    if cf_acc and cf_token and cf_ns:
        if not out.get('top_validators'):
            print('⚠️ top_validators is empty — skipping KV PUT to avoid clearing existing data', file=sys.stderr)
        else:
            print('Attempting KV PUT for top_validators...')
            data = json.dumps(out).encode('utf-8')
            ok = put_to_kv(cf_acc, cf_token, cf_ns, 'top_validators', data)
            if not ok:
                print('KV PUT failed; leaving local file only', file=sys.stderr)
    else:
        print('CF credentials missing; skipped KV PUT')


if __name__ == '__main__':
    main()
