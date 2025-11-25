#!/usr/bin/env python3
"""
Upload a specified backup file to an S3-compatible R2 bucket.

This script is intentionally opt-in: it only runs when `ENABLE_R2` is set to
"true" (case-insensitive). It uses boto3 with a configurable endpoint so it
works with Cloudflare R2 (S3-compatible) or other S3 endpoints.

Environment variables (required when ENABLE_R2=true):
    R2_ENDPOINT            S3-compatible endpoint URL (e.g. https://<account>.r2.cloudflarestorage.com)
    R2_BUCKET              Bucket name
    R2_ACCESS_KEY_ID       Access key (optional; if not provided, CF_API_TOKEN+CF_ACCOUNT_ID will be used)
    R2_SECRET_ACCESS_KEY   Secret key (optional; if not provided, CF_API_TOKEN+CF_ACCOUNT_ID will be used)
    R2_PREFIX              Optional object key prefix

Alternatively, instead of S3 keys you can supply:
    CF_API_TOKEN           Cloudflare API token with permissions to write R2 objects
    CF_ACCOUNT_ID          Cloudflare Account ID

Usage:
  python .github/scripts/upload_backup_r2.py [backup-file.json]

If no file argument is provided, the script will look for the latest
`issuance_history-*.json` file in the current directory.
"""
import os
import sys
from glob import glob
from datetime import datetime

ENABLE_R2 = os.environ.get('ENABLE_R2', 'false').lower()
if ENABLE_R2 != 'true':
    print('R2 upload disabled (ENABLE_R2!=true). Skipping R2 upload.')
    sys.exit(0)

R2_ENDPOINT = os.environ.get('R2_ENDPOINT')
R2_BUCKET = os.environ.get('R2_BUCKET')
R2_ACCESS_KEY_ID = os.environ.get('R2_ACCESS_KEY_ID')
R2_SECRET_ACCESS_KEY = os.environ.get('R2_SECRET_ACCESS_KEY')
R2_PREFIX = os.environ.get('R2_PREFIX', '').strip().strip('/')

# Cloudflare API fallback
CF_API_TOKEN = os.environ.get('CF_API_TOKEN')
CF_ACCOUNT_ID = os.environ.get('CF_ACCOUNT_ID')

# Validate minimal config: we need a bucket + either S3 keys or CF API token+account
if not R2_BUCKET:
    print('Missing required R2 environment variable: R2_BUCKET')
    sys.exit(2)

have_s3_keys = bool(R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY and R2_ENDPOINT)
have_cf_api = bool(CF_API_TOKEN and CF_ACCOUNT_ID)

if not (have_s3_keys or have_cf_api):
    print('Missing credentials: provide either R2 access keys (R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_ENDPOINT)')
    print('or a Cloudflare API token + account id (CF_API_TOKEN/CF_ACCOUNT_ID).')
    sys.exit(2)

if len(sys.argv) > 1:
    filepath = sys.argv[1]
else:
    # find latest issuance_history-*.json
    files = glob('issuance_history-*.json')
    if not files:
        print('No issuance_history-*.json files found to upload.')
        sys.exit(0)
    files.sort(reverse=True)
    filepath = files[0]

if not os.path.isfile(filepath):
    print('File not found:', filepath)
    sys.exit(1)

key_name = os.path.basename(filepath)
if R2_PREFIX:
    key_name = f"{R2_PREFIX}/{key_name}"

print(f'Uploading {filepath} to R2 bucket {R2_BUCKET} as {key_name}...')

if have_s3_keys:
    try:
        import boto3
        from botocore.client import Config
    except Exception as e:
        print('boto3 is required to upload to R2 via S3 API. Install with `pip install boto3`.')
        print('Error:', e)
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
        print('Upload completed successfully (via S3 API).')
        sys.exit(0)
    except Exception as e:
        print('R2 upload (S3) failed:', e)
        sys.exit(4)
else:
    # Fallback: use Cloudflare R2 HTTP API with CF_API_TOKEN
    try:
        import requests
    except Exception as e:
        print('requests is required to upload via Cloudflare API. Install with `pip install requests`.')
        print('Error:', e)
        sys.exit(3)

    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/r2/buckets/{R2_BUCKET}/objects/{key_name}"
    headers = {
        'Authorization': f'Bearer {CF_API_TOKEN}',
        'Content-Type': 'application/octet-stream'
    }

    try:
        with open(filepath, 'rb') as fh:
            resp = requests.put(url, data=fh, headers=headers)

        if resp.status_code in (200,201):
            # Cloudflare's API wraps responses in JSON with 'success'
            try:
                j = resp.json()
                if j.get('success', False):
                    print('Upload completed successfully (via Cloudflare API).')
                    sys.exit(0)
                else:
                    print('Cloudflare API reported failure:', j)
                    sys.exit(4)
            except Exception:
                # Non-JSON success response
                print('Upload completed; response code:', resp.status_code)
                sys.exit(0)
        else:
            print('Cloudflare API upload failed: status', resp.status_code, 'body:', resp.text)
            sys.exit(4)
    except Exception as e:
        print('Cloudflare API upload exception:', e)
        sys.exit(4)
