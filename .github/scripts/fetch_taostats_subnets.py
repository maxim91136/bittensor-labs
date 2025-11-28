import os
import sys
import json
import requests
from datetime import datetime, timezone

TAOSTATS_API_KEY = os.getenv("TAOSTATS_API_KEY")
NETWORK = os.getenv('NETWORK', 'finney')
LIMIT = int(os.getenv('TAOSTATS_SUBNET_LIMIT', '500'))

URL = f"https://api.taostats.io/api/v1/subnets?network={NETWORK}&limit={LIMIT}"


def fetch_subnets():
    if not TAOSTATS_API_KEY:
        print("❌ TAOSTATS_API_KEY not set", file=sys.stderr)
        sys.exit(1)
    headers = {
        "accept": "application/json",
        "Authorization": TAOSTATS_API_KEY
    }
    try:
        resp = requests.get(URL, headers=headers, timeout=15)
        resp.raise_for_status()
        data = resp.json()
        items = data.get('data') if isinstance(data, dict) and 'data' in data else data
        out = {}
        if isinstance(items, list):
            for item in items:
                try:
                    netuid = item.get('netuid') if isinstance(item, dict) else None
                    if netuid is None and isinstance(item, dict) and 'id' in item:
                        netuid = item.get('id')
                    if netuid is None:
                        continue
                    out[int(netuid)] = item
                except Exception:
                    continue
        elif isinstance(items, dict):
            # Possibly already netuid->item mapping
            try:
                out = {int(k): v for k, v in items.items()}
            except Exception:
                out = {}
        return out
    except Exception as e:
        print(f"❌ Taostats subnets fetch failed: {e}", file=sys.stderr)
        return None


if __name__ == '__main__':
    res = fetch_subnets()
    if res is None:
        sys.exit(1)
    # write file
    with open('taostats_subnets.json', 'w') as f:
        json.dump(res, f, indent=2)
    print('✅ Wrote taostats_subnets.json')
    print(json.dumps({'_source': 'taostats_subnets', 'count': len(res), '_timestamp': datetime.now(timezone.utc).isoformat()}))