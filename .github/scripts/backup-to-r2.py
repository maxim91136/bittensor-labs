#!/usr/bin/env python3
"""
Generic R2 backup script with date-based directory structure.

Uploads backup files to R2 with structured paths:
- network_history-*.json → network/YYYY/MM/DD/HHMMSS.json
- issuance_history-*.json → issuance/YYYY/MM/DD/HHMMSS.json
- taostats_entry-*.json → taostats/YYYY/MM/DD/HHMMSS.json

Environment variables (required when ENABLE_R2=true):
    R2_ENDPOINT            S3-compatible endpoint URL
    R2_BUCKET              Bucket name
    R2_ACCESS_KEY_ID       Access key (optional)
    R2_SECRET_ACCESS_KEY   Secret key (optional)
    R2_PREFIX              Optional object key prefix
    CF_API_TOKEN           Cloudflare API token (fallback)
    CF_ACCOUNT_ID          Cloudflare Account ID (fallback)

Usage:
  python .github/scripts/backup-to-r2.py <file.json>
"""
import os
import sys
from datetime import datetime, timezone

ENABLE_R2 = os.environ.get('ENABLE_R2', 'false').lower()
if ENABLE_R2 != 'true':
    print('R2 upload disabled (ENABLE_R2!=true). Skipping R2 upload.')
    sys.exit(0)

R2_ENDPOINT = os.environ.get('R2_ENDPOINT')
R2_BUCKET = os.environ.get('R2_BUCKET')
R2_ACCESS_KEY_ID = os.environ.get('R2_ACCESS_KEY_ID')
R2_SECRET_ACCESS_KEY = os.environ.get('R2_SECRET_ACCESS_KEY')
R2_PREFIX = os.environ.get('R2_PREFIX', '').strip().strip('/')

CF_API_TOKEN = os.environ.get('CF_API_TOKEN')
CF_ACCOUNT_ID = os.environ.get('CF_ACCOUNT_ID')

if not R2_BUCKET:
    print('Missing required R2 environment variable: R2_BUCKET')
    sys.exit(2)

have_s3_keys = bool(R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_ENDPOINT)
have_cf_api = bool(CF_API_TOKEN and CF_ACCOUNT_ID)

if not (have_s3_keys or have_cf_api):
    print('Missing credentials: provide either R2 access keys or CF API token')
    sys.exit(2)

if len(sys.argv) < 2:
    print('Usage: python backup-to-r2.py <file.json>')
    sys.exit(1)

filepath = sys.argv[1]

if not os.path.isfile(filepath):
    print('File not found:', filepath)
    sys.exit(1)

# Detect backup type and extract timestamp
basename = os.path.basename(filepath)
backup_type = None
ts_part = None

for prefix in ['network_history-', 'issuance_history-', 'taostats_entry-']:
    if prefix in basename:
        backup_type = prefix.replace('_', '-').replace('-', '').replace('history', '').replace('entry', '')
        if prefix == 'network_history-':
            backup_type = 'network'
        elif prefix == 'issuance_history-':
            backup_type = 'issuance'
        elif prefix == 'taostats_entry-':
            backup_type = 'taostats'

        ts_part = basename.replace(prefix, '').replace('.json', '')
        break

if not backup_type or not ts_part:
    print(f'⚠️  Could not detect backup type from filename: {basename}')
    print('   Expected: network_history-*.json, issuance_history-*.json, or taostats_entry-*.json')
    sys.exit(1)

try:
    # Parse: 20251216T095000Z → 2025/12/16/095000
    dt = datetime.strptime(ts_part.replace('Z', ''), '%Y%m%dT%H%M%S')
    year = dt.strftime('%Y')
    month = dt.strftime('%m')
    day = dt.strftime('%d')
    time = dt.strftime('%H%M%S')

    # Build structured path
    key_name = f"{backup_type}/{year}/{month}/{day}/{time}.json"
    if R2_PREFIX:
        key_name = f"{R2_PREFIX}/{key_name}"
except Exception as e:
    print(f'⚠️  Could not parse timestamp: {e}')
    sys.exit(1)

print(f'📦 Uploading to R2: {key_name}')

if have_s3_keys:
    try:
        import boto3
        from botocore.client import Config
    except Exception as e:
        print('boto3 required for S3 API. Install: pip install boto3')
        sys.exit(3)

    s3 = boto3.client(
        's3',
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=R2_ACCESS_KEY_ID,
        aws_secret_access_key=R2_SECRET_ACCESS_KEY,
        config=Config(signature_version='s3v4')
    )

    try:
        s3.upload_file(filepath, R2_BUCKET, key_name)
        print('✅ Upload completed (S3 API)')
        sys.exit(0)
    except Exception as e:
        print(f'❌ R2 upload failed: {e}')
        sys.exit(4)
else:
    try:
        import requests
    except Exception as e:
        print('requests required for CF API. Install: pip install requests')
        sys.exit(3)

    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/r2/buckets/{R2_BUCKET}/objects/{key_name}"
    headers = {
        'Authorization': f'Bearer {CF_API_TOKEN}',
        'Content-Type': 'application/octet-stream'
    }

    try:
        with open(filepath, 'rb') as fh:
            resp = requests.put(url, data=fh, headers=headers)

        if resp.status_code in (200, 201):
            try:
                j = resp.json()
                if j.get('success', False):
                    print('✅ Upload completed (CF API)')
                    sys.exit(0)
                else:
                    print('❌ CF API reported failure:', j)
                    sys.exit(4)
            except Exception:
                print('✅ Upload completed')
                sys.exit(0)
        else:
            print(f'❌ CF API upload failed: {resp.status_code} - {resp.text}')
            sys.exit(4)
    except Exception as e:
        print(f'❌ CF API exception: {e}')
        sys.exit(4)
