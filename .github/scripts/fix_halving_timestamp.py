#!/usr/bin/env python3
"""Fix the halving_history timestamp to use actual block time (13:31 UTC) instead of detection time (13:35 UTC)"""

import json
import os
import sys
import urllib.request
from datetime import datetime, timezone

# Correct halving time: Block 7103976 at 13:31:00 UTC
CORRECT_TIMESTAMP_MS = 1765805460000  # 2025-12-15 13:31:00 UTC
CORRECT_ISO = "2025-12-15T13:31:00+00:00"

def main():
    cf_account = os.getenv('CF_ACCOUNT_ID')
    cf_token = os.getenv('CF_API_TOKEN')
    cf_kv_ns = os.getenv('CF_KV_NAMESPACE_ID') or os.getenv('CF_METRICS_NAMESPACE_ID')

    if not all([cf_account, cf_token, cf_kv_ns]):
        print("❌ Missing CF env vars", file=sys.stderr)
        sys.exit(1)

    # Read current halving_history
    kv_url = f"https://api.cloudflare.com/client/v4/accounts/{cf_account}/storage/kv/namespaces/{cf_kv_ns}/values/halving_history"

    try:
        req = urllib.request.Request(kv_url, method='GET', headers={
            'Authorization': f'Bearer {cf_token}'
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status == 200:
                halving_history = json.loads(resp.read())
            else:
                print(f"❌ Failed to read halving_history: HTTP {resp.status}", file=sys.stderr)
                sys.exit(1)
    except Exception as e:
        print(f"❌ Failed to read halving_history: {e}", file=sys.stderr)
        sys.exit(1)

    # Fix the timestamp for threshold 10500000
    updated = False
    for h in halving_history:
        if h.get('threshold') == 10500000:
            old_ts = h.get('at')
            h['at'] = CORRECT_TIMESTAMP_MS
            h['detected_at'] = CORRECT_ISO
            updated = True
            print(f"✅ Fixed halving timestamp:", file=sys.stderr)
            print(f"   Old: {old_ts} ({datetime.fromtimestamp(old_ts/1000, timezone.utc).isoformat()})", file=sys.stderr)
            print(f"   New: {CORRECT_TIMESTAMP_MS} ({CORRECT_ISO})", file=sys.stderr)

    if not updated:
        print("⚠️  No halving event found with threshold 10500000", file=sys.stderr)
        sys.exit(1)

    # Write back to KV
    try:
        data = json.dumps(halving_history).encode('utf-8')
        req = urllib.request.Request(kv_url, data=data, method='PUT', headers={
            'Authorization': f'Bearer {cf_token}',
            'Content-Type': 'application/json'
        })
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status in (200, 201):
                print(f"✅ Updated halving_history in KV", file=sys.stderr)
            else:
                print(f"❌ Failed to write to KV: HTTP {resp.status}", file=sys.stderr)
                sys.exit(1)
    except Exception as e:
        print(f"❌ Failed to write to KV: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
