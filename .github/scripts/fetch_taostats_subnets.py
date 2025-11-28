import os
import sys
import json
import requests
from datetime import datetime, timezone

TAOSTATS_API_KEY = os.getenv("TAOSTATS_API_KEY")
NETWORK = os.getenv('NETWORK', 'finney')
LIMIT = int(os.getenv('TAOSTATS_SUBNET_LIMIT', '500'))

VARIANTS = [
    f"https://api.taostats.io/api/v1/subnets?network={NETWORK}&limit={LIMIT}",
    f"https://api.taostats.io/subnets?network={NETWORK}&limit={LIMIT}",
    f"https://api.taostats.io/api/subnets?network={NETWORK}&limit={LIMIT}",
    f"https://taostats.io/api/v1/subnets?network={NETWORK}&limit={LIMIT}",
    f"https://taostats.io/subnets?network={NETWORK}&limit={LIMIT}",
]


def fetch_subnets():
    if not TAOSTATS_API_KEY:
        print("❌ TAOSTATS_API_KEY not set", file=sys.stderr)
        sys.exit(1)
    headers = {
        "accept": "application/json",
        "Authorization": TAOSTATS_API_KEY
    }

    out = {}
    for url in VARIANTS:
        attempt = 0
        while attempt < 3:
            try:
                resp = requests.get(url, headers=headers, timeout=12)
                # If HTML or non-JSON returned, this will raise on .json()
                resp.raise_for_status()
                data = resp.json()
                items = data.get('data') if isinstance(data, dict) and 'data' in data else data
                if not items:
                    break
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
                    try:
                        out.update({int(k): v for k, v in items.items()})
                    except Exception:
                        pass
                if out:
                    return out
            except Exception as e:
                # backoff
                try:
                    import time

                    time.sleep(0.5 * (2 ** attempt))
                except Exception:
                    pass
                attempt += 1
                continue
            break

    print("❌ Taostats subnets fetch failed: no usable endpoint returned JSON", file=sys.stderr)
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