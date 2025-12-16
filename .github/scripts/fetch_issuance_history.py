#!/usr/bin/env python3
"""
Fetch the `issuance_history` value from Cloudflare Workers KV and write a
timestamped file locally. Optionally upload it to R2 by invoking
`backup-issuance-history-r2.py` (the upload script is opt-in and controlled by
`ENABLE_R2`).

Environment variables used (all optional; script will skip if required CF vars missing):
  CF_ACCOUNT_ID            Cloudflare account id
  CF_API_TOKEN             Cloudflare API token (with KV read scope)
  CF_KV_NAMESPACE_ID       KV namespace id that stores `issuance_history`
    ENABLE_R2                If 'true', upload to R2 using backup-issuance-history-r2.py

Usage:
  python .github/scripts/fetch_issuance_history.py

The script is safe to run even if the CF secrets are not present; it will
print a message and exit with code 0.
"""
import os
import sys
import requests
from datetime import datetime

CF_ACCOUNT_ID = os.environ.get('CF_ACCOUNT_ID')
CF_API_TOKEN = os.environ.get('CF_API_TOKEN')
CF_KV_NAMESPACE_ID = os.environ.get('CF_KV_NAMESPACE_ID') or os.environ.get('CF_METRICS_NAMESPACE_ID')

if not CF_ACCOUNT_ID or not CF_API_TOKEN or not CF_KV_NAMESPACE_ID:
    print('Cloudflare KV credentials not fully provided; skipping issuance_history fetch.')
    sys.exit(0)

URL = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/storage/kv/namespaces/{CF_KV_NAMESPACE_ID}/values/issuance_history"
headers = { 'Authorization': f'Bearer {CF_API_TOKEN}' }

try:
    r = requests.get(URL, headers=headers, timeout=15)
except Exception as e:
    print('Error fetching issuance_history:', e)
    sys.exit(1)

if r.status_code == 404 or r.text == '':
    print('No issuance_history value found in KV (404 or empty).')
    sys.exit(0)

if not r.ok:
    print('Failed to fetch issuance_history:', r.status_code, r.text)
    sys.exit(1)

try:
    # assume the KV value is JSON or text; write raw
    content = r.text
    timestamp = datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
    filename = f'issuance_history-{timestamp}.json'
    with open(filename, 'w') as f:
        f.write(content)
    print('Wrote', filename)
except Exception as e:
    print('Error writing issuance history file:', e)
    sys.exit(1)

# Optionally upload to R2 using the generic upload script (it will check ENABLE_R2 itself)
try:
    import subprocess
    subprocess.run(['python', '.github/scripts/backup-to-r2.py', filename], check=False)
except Exception as e:
    print('Error invoking upload script:', e)

sys.exit(0)
