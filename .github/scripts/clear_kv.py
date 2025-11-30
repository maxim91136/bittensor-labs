#!/usr/bin/env python3
"""Clear old KV data before fresh upload."""
import os
import sys
import urllib.request
import urllib.error

CF_ACCOUNT_ID = os.getenv('CF_ACCOUNT_ID')
CF_API_TOKEN = os.getenv('CF_API_TOKEN')
CF_KV_NAMESPACE_ID = os.getenv('CF_KV_NAMESPACE_ID')

KV_KEY = 'top_subnets'

if not all([CF_ACCOUNT_ID, CF_API_TOKEN, CF_KV_NAMESPACE_ID]):
    print("❌ Missing Cloudflare credentials")
    sys.exit(1)

url = f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/storage/kv/namespaces/{CF_KV_NAMESPACE_ID}/keys/{KV_KEY}'

req = urllib.request.Request(url, method='DELETE', headers={
    'Authorization': f'Bearer {CF_API_TOKEN}',
    'Content-Type': 'application/json',
})

try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        print(f"✅ Cleared KV key '{KV_KEY}': {resp.status}")
except urllib.error.HTTPError as e:
    if e.code == 404:
        print(f"⚠️  KV key '{KV_KEY}' not found (already deleted or never existed)")
        sys.exit(0)
    else:
        print(f"❌ Failed to delete KV key: {e.code} {e.reason}")
        sys.exit(1)
except Exception as e:
    print(f"❌ Error: {e}")
    sys.exit(1)
