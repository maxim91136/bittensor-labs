#!/usr/bin/env python3
"""
Merge network_latest.json with existing network_history from KV.
Handles API response parsing and deduplication.
"""
import json
import sys
import os
import subprocess
from datetime import datetime

def main():
    # Config
    cf_account_id = os.getenv('CF_ACCOUNT_ID', '')
    cf_api_token = os.getenv('CF_API_TOKEN', '')
    cf_kv_namespace_id = os.getenv('CF_KV_NAMESPACE_ID', '')
    
    if not all([cf_account_id, cf_api_token, cf_kv_namespace_id]):
        print("❌ Missing Cloudflare credentials", file=sys.stderr)
        sys.exit(1)
    
    # Check if network_latest.json exists
    if not os.path.exists('network_latest.json'):
        print("❌ network_latest.json not found", file=sys.stderr)
        sys.exit(1)
    
    # Load latest snapshot
    try:
        with open('network_latest.json', 'r') as f:
            latest = json.load(f)
    except Exception as e:
        print(f"❌ Failed to read network_latest.json: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Fetch existing history from KV
    kv_url = f"https://api.cloudflare.com/client/v4/accounts/{cf_account_id}/storage/kv/namespaces/{cf_kv_namespace_id}/values/network_history"
    try:
        result = subprocess.run(
            ['curl', '-s', '-H', f'Authorization: Bearer {cf_api_token}', kv_url],
            capture_output=True,
            text=True,
            timeout=15
        )
        response_text = result.stdout.strip()
    except Exception as e:
        print(f"⚠️  Failed to fetch existing history: {e}", file=sys.stderr)
        existing_history = []
    else:
        if not response_text:
            print("ℹ️  No existing history in KV (first run)", file=sys.stderr)
            existing_history = []
        else:
            try:
                # Try parsing as raw JSON (direct KV value)
                existing_history = json.loads(response_text)
                if not isinstance(existing_history, list):
                    existing_history = [existing_history]
                print(f"ℹ️  Loaded {len(existing_history)} existing entries", file=sys.stderr)
            except json.JSONDecodeError as e:
                print(f"⚠️  Failed to parse existing history: {e}", file=sys.stderr)
                print(f"    Response preview: {response_text[:200]}", file=sys.stderr)
                existing_history = []
    
    # Merge: append latest, deduplicate by _timestamp, sort
    # Convert latest to list if it's a single object
    if isinstance(latest, dict):
        new_entries = [latest]
    elif isinstance(latest, list):
        new_entries = latest
    else:
        new_entries = []
    
    # Combine and deduplicate by _timestamp
    all_entries = existing_history + new_entries
    
    # Deduplicate: keep last occurrence of each timestamp
    seen = {}
    for entry in all_entries:
        ts = entry.get('_timestamp')
        if ts:
            seen[ts] = entry
    
    # Sort by timestamp
    merged = sorted(seen.values(), key=lambda x: x.get('_timestamp', ''))
    
    print(f"✅ Merged history: {len(existing_history)} existing + {len(new_entries)} new = {len(merged)} total", file=sys.stderr)
    
    # Write merged history to file
    try:
        with open('/tmp/network_history_merged.json', 'w') as f:
            json.dump(merged, f, indent=2)
        print("✅ Merged history written to /tmp/network_history_merged.json", file=sys.stderr)
    except Exception as e:
        print(f"❌ Failed to write merged history: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
