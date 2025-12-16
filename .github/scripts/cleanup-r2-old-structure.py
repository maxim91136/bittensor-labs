#!/usr/bin/env python3
"""
Clean up old flat-structure R2 files after migration to date-based directories.

Deletes old files matching patterns like:
- network_history-20251216T095000Z.json
- decentralization-YYYYMMDD.json
- top_subnets-YYYYMMDD.json
- etc.

New structure (kept):
- network/2025/12/16/095000.json
- decentralization/2025/12/16.json
- etc.

Environment variables:
    CF_ACCOUNT_ID          Cloudflare Account ID
    CF_API_TOKEN           Cloudflare API token
    R2_BUCKET              R2 bucket name
    DRY_RUN                Set to 'false' to actually delete (default: true)

Usage:
    # Dry run (default - just show what would be deleted)
    python .github/scripts/cleanup-r2-old-structure.py

    # Actually delete old files
    DRY_RUN=false python .github/scripts/cleanup-r2-old-structure.py
"""
import os
import sys
import re

CF_ACCOUNT_ID = os.environ.get('CF_ACCOUNT_ID')
CF_API_TOKEN = os.environ.get('CF_API_TOKEN')
R2_BUCKET = os.environ.get('R2_BUCKET', 'kv-backup')
DRY_RUN = os.environ.get('DRY_RUN', 'true').lower() == 'true'

if not all([CF_ACCOUNT_ID, CF_API_TOKEN]):
    print('❌ Missing CF_ACCOUNT_ID or CF_API_TOKEN')
    sys.exit(1)

try:
    import requests
except ImportError:
    print('❌ requests library required. Install: pip install requests')
    sys.exit(1)

headers = {'Authorization': f'Bearer {CF_API_TOKEN}'}

# Patterns for old flat structure files (to be deleted)
OLD_PATTERNS = [
    r'^network_history-\d{8}T\d{6}Z\.json$',           # network_history-20251216T095000Z.json
    r'^decentralization-\d{8}\.json$',                 # decentralization-20251216.json
    r'^top_subnets-\d{8}\.json$',                      # top_subnets-20251216.json
    r'^top_validators-\d{8}\.json$',                   # top_validators-20251216.json
    r'^top_wallets-\d{8}\.json$',                      # top_wallets-20251216.json
    r'^issuance_history-\d{8}\.json$',                 # issuance_history-20251216.json
    r'^taostats_history-\d{8}\.json$',                 # taostats_history-20251216.json
    r'^taostats_entry-\d{8}T\d{6}Z\.json$',            # taostats_entry-20251216T095000Z.json
    r'^taostats_entry-.*\.json$',                      # taostats_entry-anything.json
    r'^taostats_aggregates-\d{8}\.json$',              # taostats_aggregates-20251216.json
    r'^distribution-\d{8}\.json$',                     # distribution-20251216.json
    r'^halving-\d{8}\.json$',                          # halving-20251216.json
]

def list_all_objects():
    """List all objects in R2 bucket"""
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/r2/buckets/{R2_BUCKET}/objects"
    all_objects = []
    cursor = None

    while True:
        params = {'per_page': 1000}
        if cursor:
            params['cursor'] = cursor

        try:
            resp = requests.get(url, headers=headers, params=params, timeout=30)
            if resp.status_code != 200:
                print(f'⚠️  Failed to list objects: HTTP {resp.status_code}')
                break

            data = resp.json()
            if not data.get('success'):
                print(f'⚠️  API returned error: {data}')
                break

            result = data.get('result', [])
            if isinstance(result, list):
                objects = result
            elif isinstance(result, dict):
                objects = result.get('objects', [])
            else:
                break

            all_objects.extend(objects)

            # Check for pagination
            result_info = data.get('result_info', {})
            cursor = result_info.get('cursor')
            if not cursor:
                break

        except Exception as e:
            print(f'⚠️  Error listing objects: {e}')
            break

    return all_objects

def is_old_structure(key):
    """Check if key matches old flat structure pattern"""
    # Get just the filename (no directory path)
    filename = key.split('/')[-1]

    for pattern in OLD_PATTERNS:
        if re.match(pattern, filename):
            # Make sure it's actually at root level (no directory prefix)
            if '/' not in key or key.count('/') == 0:
                return True
    return False

def delete_object(key):
    """Delete object from R2"""
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/r2/buckets/{R2_BUCKET}/objects/{key}"
    try:
        resp = requests.delete(url, headers=headers, timeout=30)
        if resp.status_code in (200, 204):
            return True
        else:
            print(f'   ⚠️  Failed to delete {key}: HTTP {resp.status_code}')
            return False
    except Exception as e:
        print(f'   ⚠️  Error deleting {key}: {e}')
        return False

def main():
    print('🧹 R2 Old Structure Cleanup')
    print('=' * 60)

    if DRY_RUN:
        print('🔍 DRY RUN MODE - No changes will be made')
        print('   Set DRY_RUN=false to actually delete files')
    else:
        print('⚠️  LIVE MODE - Files will be deleted!')

    print()
    print('📦 Listing all objects in R2 bucket...')
    objects = list_all_objects()
    print(f'   Found {len(objects)} total objects')

    # Filter to old structure files
    old_files = []
    for obj in objects:
        key = obj.get('key', '')
        if is_old_structure(key):
            old_files.append(key)

    print(f'\n📊 Found {len(old_files)} old structure files to clean up:')
    if old_files:
        # Group by type
        by_type = {}
        for key in old_files:
            # Extract type from pattern
            if 'network_history-' in key:
                type_name = 'network_history'
            elif 'decentralization-' in key:
                type_name = 'decentralization'
            elif 'top_subnets-' in key:
                type_name = 'top_subnets'
            elif 'top_validators-' in key:
                type_name = 'top_validators'
            elif 'top_wallets-' in key:
                type_name = 'top_wallets'
            elif 'issuance_history-' in key:
                type_name = 'issuance_history'
            elif 'taostats_history-' in key:
                type_name = 'taostats_history'
            elif 'taostats_entry-' in key:
                type_name = 'taostats_entry'
            elif 'taostats_aggregates-' in key:
                type_name = 'taostats_aggregates'
            elif 'distribution-' in key:
                type_name = 'distribution'
            elif 'halving-' in key:
                type_name = 'halving'
            else:
                type_name = 'other'

            if type_name not in by_type:
                by_type[type_name] = []
            by_type[type_name].append(key)

        for type_name, keys in sorted(by_type.items()):
            print(f'   {type_name}: {len(keys)} files')

    if not old_files:
        print('   ✅ No old structure files found - cleanup already complete!')
        return

    # Delete files
    if DRY_RUN:
        print(f'\n🔍 Would delete {len(old_files)} files:')
        for key in sorted(old_files)[:10]:  # Show first 10 as sample
            print(f'   - {key}')
        if len(old_files) > 10:
            print(f'   ... and {len(old_files) - 10} more')
    else:
        print(f'\n🗑️  Deleting {len(old_files)} old structure files...')
        deleted = 0
        failed = 0

        for i, key in enumerate(old_files, 1):
            if i % 10 == 0:
                print(f'   Progress: {i}/{len(old_files)} files processed...')

            if delete_object(key):
                deleted += 1
            else:
                failed += 1

        print(f'\n✅ Cleanup complete:')
        print(f'   Deleted: {deleted} files')
        if failed > 0:
            print(f'   Failed: {failed} files')

if __name__ == '__main__':
    main()
