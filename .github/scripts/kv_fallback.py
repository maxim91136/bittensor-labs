#!/usr/bin/env python3
"""
Fallback helper: Read cached data from Cloudflare KV when primary source fails.
Better to show stale but accurate data than fresh but wrong data.
"""
import os
import sys
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone


def get_from_kv(account: str, token: str, namespace: str, key: str) -> dict:
    """Fetch cached data from Cloudflare KV"""
    url = f'https://api.cloudflare.com/client/v4/accounts/{account}/storage/kv/namespaces/{namespace}/values/{key}'

    try:
        req = urllib.request.Request(url, method='GET', headers={
            'Authorization': f'Bearer {token}'
        })

        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode('utf-8'))

                # Mark as cached
                data['_cached'] = True
                data['_cached_at'] = data.get('last_updated') or data.get('generated_at') or 'unknown'
                data['_fallback_used'] = True
                data['_fallback_reason'] = 'Primary source (Taostats) unavailable'
                data['_retrieved_at'] = datetime.now(timezone.utc).isoformat()

                print(f"✅ Retrieved cached data from KV ({key})", file=sys.stderr)
                print(f"   Cached timestamp: {data['_cached_at']}", file=sys.stderr)

                return data
            else:
                print(f"⚠️ KV GET returned status {resp.status}", file=sys.stderr)
                return None

    except urllib.error.HTTPError as e:
        if e.code == 404:
            print(f"⚠️ No cached data in KV ({key})", file=sys.stderr)
        else:
            print(f"⚠️ KV GET failed: HTTP {e.code}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"⚠️ KV GET failed: {e}", file=sys.stderr)
        return None


def main():
    """CLI interface for testing"""
    if len(sys.argv) < 2:
        print("Usage: python kv_fallback.py <key>", file=sys.stderr)
        print("Example: python kv_fallback.py top_subnets", file=sys.stderr)
        sys.exit(1)

    key = sys.argv[1]

    cf_acc = os.getenv('CF_ACCOUNT_ID')
    cf_token = os.getenv('CF_API_TOKEN')
    cf_ns = os.getenv('CF_KV_NAMESPACE_ID') or os.getenv('CF_METRICS_NAMESPACE_ID')

    if not (cf_acc and cf_token and cf_ns):
        print("❌ Missing CF credentials", file=sys.stderr)
        sys.exit(1)

    data = get_from_kv(cf_acc, cf_token, cf_ns, key)

    if data:
        print(json.dumps(data, indent=2))
        sys.exit(0)
    else:
        print("❌ No cached data available", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
