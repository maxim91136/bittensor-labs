#!/usr/bin/env python3
"""
Upload a specified backup file to an S3-compatible R2 bucket.

This script is intentionally opt-in: it only runs when `ENABLE_R2` is set to
"true" (case-insensitive). It uses boto3 with a configurable endpoint so it
works with Cloudflare R2 (S3-compatible) or other S3 endpoints.

Environment variables (required when ENABLE_R2=true):
  R2_ENDPOINT            S3-compatible endpoint URL (e.g. https://<account>.r2.cloudflarestorage.com)
  R2_BUCKET              Bucket name
  R2_ACCESS_KEY_ID       Access key
  R2_SECRET_ACCESS_KEY   Secret key
  R2_PREFIX              Optional object key prefix

Usage:
  python .github/scripts/upload_backup_r2.py [backup-file.json]

If no file argument is provided, the script will look for the latest
`tao_ath_atl-*.json` file in the current directory.
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

missing = [k for k,v in [('R2_ENDPOINT',R2_ENDPOINT),('R2_BUCKET',R2_BUCKET),('R2_ACCESS_KEY_ID',R2_ACCESS_KEY_ID),('R2_SECRET_ACCESS_KEY',R2_SECRET_ACCESS_KEY)] if not v]
if missing:
    print('Missing required R2 environment variables:', missing)
    sys.exit(2)

if len(sys.argv) > 1:
    filepath = sys.argv[1]
else:
    # find latest tao_ath_atl-*.json
    files = glob('tao_ath_atl-*.json')
    if not files:
        print('No tao_ath_atl-*.json files found to upload.')
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

try:
    import boto3
    from botocore.client import Config
except Exception as e:
    print('boto3 is required to upload to R2. Install with `pip install boto3`.')
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
    print('Upload completed successfully.')
    sys.exit(0)
except Exception as e:
    print('R2 upload failed:', e)
    sys.exit(4)
