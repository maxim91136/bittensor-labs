# Fear & Greed Index API fetcher for Bittensor-Labs
# Fetches the current and historical Fear & Greed Index from alternative.me (primary) or CMC (fallback)
# and writes to Cloudflare KV

import os
import sys
import json
import requests
from datetime import datetime, timezone

def fetch_fng_alternative():
    """Primary source: Alternative.me"""
    url = "https://api.alternative.me/fng/?limit=30&format=json"
    resp = requests.get(url, timeout=15)
    if resp.status_code != 200:
        raise Exception(f"Alternative.me API error: {resp.status_code}")
    data = resp.json()
    if not data or 'data' not in data:
        raise Exception("No data in Alternative.me response")
    return data['data'], 'alternative.me'

def fetch_fng_cmc(api_key):
    """Fallback source: CoinMarketCap Fear & Greed Index"""
    url = "https://pro-api.coinmarketcap.com/v3/fear-and-greed/latest"
    headers = {
        "X-CMC_PRO_API_KEY": api_key,
        "Accept": "application/json"
    }
    resp = requests.get(url, headers=headers, timeout=15)
    if resp.status_code != 200:
        raise Exception(f"CMC API error: {resp.status_code}")
    data = resp.json()
    if not data or 'data' not in data:
        raise Exception("No data in CMC response")
    # Convert CMC format to Alternative.me format
    cmc_data = data['data']
    converted = [{
        'value': str(cmc_data.get('value', 50)),
        'value_classification': cmc_data.get('value_classification', 'Neutral'),
        'timestamp': str(int(datetime.now(timezone.utc).timestamp()))
    }]
    return converted, 'coinmarketcap'

def fetch_fng():
    """Fetch F&G with fallback: Alternative.me -> CMC"""
    # Try Alternative.me first
    try:
        return fetch_fng_alternative()
    except Exception as e:
        print(f"Alternative.me failed: {e}", file=sys.stderr)

    # Fallback to CMC
    cmc_key = os.getenv('CMC_API_TOKEN')
    if cmc_key:
        try:
            return fetch_fng_cmc(cmc_key)
        except Exception as e:
            print(f"CMC fallback failed: {e}", file=sys.stderr)
    else:
        print("CMC_API_TOKEN not set, skipping CMC fallback", file=sys.stderr)

    raise Exception("All F&G sources failed")

def parse_fng(data):
    # data: list of dicts, each with value, value_classification, timestamp
    # We want: current, yesterday, last week, last month
    if not data or len(data) == 0:
        return None
    # Sort by timestamp descending
    data_sorted = sorted(data, key=lambda x: int(x['timestamp']), reverse=True)
    current = data_sorted[0]
    # Find closest to 1d, 7d, 30d ago
    now = int(datetime.now(timezone.utc).timestamp())
    def find_closest(days):
        target = now - days*86400
        closest = min(data_sorted, key=lambda x: abs(int(x['timestamp']) - target))
        return closest
    now_iso = datetime.now(timezone.utc).isoformat()
    return {
        'current': current,
        'yesterday': find_closest(1),
        'last_week': find_closest(7),
        'last_month': find_closest(30),
        'last_updated': now_iso,
        '_timestamp': now_iso
    }

def put_kv_json(account_id, api_token, namespace_id, key, obj):
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/values/{key}"
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json",
    }
    data = json.dumps(obj)
    resp = requests.put(url, headers=headers, data=data.encode('utf-8'), timeout=30)
    return resp.status_code in (200, 204)

def main():
    account_id = os.getenv('CF_ACCOUNT_ID')
    api_token = os.getenv('CF_API_TOKEN')
    namespace_id = os.getenv('CF_METRICS_NAMESPACE_ID')
    if not (account_id and api_token and namespace_id):
        print("Missing Cloudflare KV credentials", file=sys.stderr)
        sys.exit(1)
    try:
        fng_data, source = fetch_fng()
        parsed = parse_fng(fng_data)
        if not parsed:
            print("No FNG data parsed", file=sys.stderr)
            sys.exit(1)
        # Add source tracking
        parsed['_source'] = source
        # Write to KV
        key = "fear_and_greed_index"
        ok = put_kv_json(account_id, api_token, namespace_id, key, parsed)
        if not ok:
            print("Failed to write to KV", file=sys.stderr)
            sys.exit(1)
        print(f"Fear & Greed Index updated in KV (source: {source}).")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
