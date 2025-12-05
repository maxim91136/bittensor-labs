# Fear & Greed Index API fetcher for Bittensor-Labs
# Fetches the current and historical Fear & Greed Index from alternative.me and writes to Cloudflare KV

import os
import sys
import json
import requests
from datetime import datetime, timezone

def fetch_fng():
    url = "https://api.alternative.me/fng/?limit=30&format=json"
    resp = requests.get(url, timeout=15)
    if resp.status_code != 200:
        raise Exception(f"API error: {resp.status_code}")
    data = resp.json()
    if not data or 'data' not in data:
        raise Exception("No data in response")
    return data['data']

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
    return {
        'current': current,
        'yesterday': find_closest(1),
        'last_week': find_closest(7),
        'last_month': find_closest(30)
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
        fng_data = fetch_fng()
        parsed = parse_fng(fng_data)
        if not parsed:
            print("No FNG data parsed", file=sys.stderr)
            sys.exit(1)
        # Write to KV
        key = "fear_and_greed_index"
        ok = put_kv_json(account_id, api_token, namespace_id, key, parsed)
        if not ok:
            print("Failed to write to KV", file=sys.stderr)
            sys.exit(1)
        print("Fear & Greed Index updated in KV.")
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
