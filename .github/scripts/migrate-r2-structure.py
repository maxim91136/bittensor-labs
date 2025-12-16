#!/usr/bin/env python3
"""
Migrate existing R2 backups from flat structure to date-based directories.

OLD: network_history-20251216T095000Z.json
NEW: network/2025/12/16/095000.json

Environment variables:
    CF_ACCOUNT_ID          Cloudflare Account ID
    CF_API_TOKEN           Cloudflare API token
    R2_BUCKET              R2 bucket name
    DRY_RUN                Set to 'false' to actually perform migration (default: true)
    DELETE_OLD             Set to 'true' to delete old files after migration (default: false)

Usage:
    # Dry run (default - no changes made)
    python .github/scripts/migrate-r2-structure.py

    # Actually migrate
    DRY_RUN=false python .github/scripts/migrate-r2-structure.py

    # Migrate and delete old files
    DRY_RUN=false DELETE_OLD=true python .github/scripts/migrate-r2-structure.py
"""
import os
import sys
from datetime import datetime

CF_ACCOUNT_ID = os.environ.get('CF_ACCOUNT_ID')
CF_API_TOKEN = os.environ.get('CF_API_TOKEN')
R2_BUCKET = os.environ.get('R2_BUCKET', 'kv-backup')
DRY_RUN = os.environ.get('DRY_RUN', 'true').lower() == 'true'
DELETE_OLD = os.environ.get('DELETE_OLD', 'false').lower() == 'true'

if not all([CF_ACCOUNT_ID, CF_API_TOKEN]):
    print('❌ Missing CF_ACCOUNT_ID or CF_API_TOKEN')
    sys.exit(1)

try:
    import requests
except ImportError:
    print('❌ requests library required. Install: pip install requests')
    sys.exit(1)

headers = {'Authorization': f'Bearer {CF_API_TOKEN}'}

def list_objects(prefix='', max_keys=1000):
    """List objects in R2 bucket"""
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/r2/buckets/{R2_BUCKET}/objects"
    params = {'prefix': prefix, 'per_page': max_keys}

    try:
        resp = requests.get(url, headers=headers, params=params, timeout=30)
        if resp.status_code == 200:
            data = resp.json()
            if data.get('success'):
                result = data.get('result', [])
                # Handle both formats: direct list or nested dict
                if isinstance(result, list):
                    return result
                elif isinstance(result, dict):
                    return result.get('objects', [])
    except Exception as e:
        print(f'⚠️  Error listing objects: {e}')

    return []

def copy_object(source_key, dest_key):
    """Copy object to new location in R2"""
    # Download source
    get_url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/r2/buckets/{R2_BUCKET}/objects/{source_key}"
    try:
        resp = requests.get(get_url, headers=headers, timeout=60)
        if resp.status_code != 200:
            print(f'   ⚠️  Failed to download {source_key}: HTTP {resp.status_code}')
            return False

        content = resp.content

        # Upload to destination
        put_url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/r2/buckets/{R2_BUCKET}/objects/{dest_key}"
        put_headers = {**headers, 'Content-Type': 'application/json'}
        resp = requests.put(put_url, data=content, headers=put_headers, timeout=60)

        if resp.status_code in (200, 201):
            return True
        else:
            print(f'   ⚠️  Failed to upload {dest_key}: HTTP {resp.status_code}')
            return False

    except Exception as e:
        print(f'   ⚠️  Error copying object: {e}')
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
        print(f'   ⚠️  Error deleting object: {e}')
        return False

def parse_filename(filename):
    """Parse backup filename and return (backup_type, timestamp)"""
    # network_history-20251216T095000Z.json
    for prefix in ['network_history-', 'issuance_history-', 'taostats_entry-']:
        if prefix in filename:
            backup_type = None
            if prefix == 'network_history-':
                backup_type = 'network'
            elif prefix == 'issuance_history-':
                backup_type = 'issuance'
            elif prefix == 'taostats_entry-':
                backup_type = 'taostats'

            ts_part = filename.replace(prefix, '').replace('.json', '')
            try:
                dt = datetime.strptime(ts_part.replace('Z', ''), '%Y%m%dT%H%M%S')
                return backup_type, dt
            except:
                return None, None

    return None, None

def migrate_file(obj):
    """Migrate a single file from flat to structured path"""
    old_key = obj['key']
    filename = os.path.basename(old_key)

    backup_type, dt = parse_filename(filename)
    if not backup_type or not dt:
        return False, 'skipped (unknown format)'

    # Build new structured path
    year = dt.strftime('%Y')
    month = dt.strftime('%m')
    day = dt.strftime('%d')
    time = dt.strftime('%H%M%S')
    new_key = f"{backup_type}/{year}/{month}/{day}/{time}.json"

    # Check if already in new format
    if backup_type in old_key and '/' in old_key:
        return False, 'skipped (already migrated)'

    print(f'   {old_key} → {new_key}')

    if DRY_RUN:
        return True, 'dry-run'

    # Copy to new location
    if not copy_object(old_key, new_key):
        return False, 'copy failed'

    # Delete old file if requested
    if DELETE_OLD:
        if not delete_object(old_key):
            return False, 'delete failed (but copy succeeded)'
        return True, 'migrated + deleted'

    return True, 'migrated (old file kept)'

def main():
    print('=' * 60)
    print('R2 Backup Structure Migration')
    print('=' * 60)
    print(f'Bucket: {R2_BUCKET}')
    print(f'Mode: {"DRY RUN" if DRY_RUN else "LIVE"}')
    print(f'Delete old: {"YES" if DELETE_OLD else "NO"}')
    print()

    if DRY_RUN:
        print('⚠️  DRY RUN MODE - no changes will be made')
        print('   Set DRY_RUN=false to actually perform migration')
        print()

    # Get all objects with old naming pattern
    stats = {'total': 0, 'migrated': 0, 'failed': 0, 'skipped': 0}

    for prefix in ['network_history-', 'issuance_history-', 'taostats_entry-']:
        print(f'📁 Processing {prefix}*')
        objects = list_objects(prefix=prefix)

        if not objects:
            print(f'   No objects found with prefix {prefix}')
            continue

        print(f'   Found {len(objects)} files')

        for obj in objects:
            stats['total'] += 1
            success, reason = migrate_file(obj)

            if success:
                if reason == 'dry-run':
                    stats['migrated'] += 1
                elif 'migrated' in reason:
                    stats['migrated'] += 1
                    print(f'   ✅ {reason}')
            elif 'skipped' in reason:
                stats['skipped'] += 1
            else:
                stats['failed'] += 1
                print(f'   ❌ {reason}')

        print()

    print('=' * 60)
    print('Migration Summary')
    print('=' * 60)
    print(f'Total files: {stats["total"]}')
    print(f'Migrated: {stats["migrated"]}')
    print(f'Skipped: {stats["skipped"]}')
    print(f'Failed: {stats["failed"]}')
    print()

    if DRY_RUN:
        print('This was a DRY RUN - no changes were made')
        print('Run with DRY_RUN=false to perform actual migration')
    elif stats['migrated'] > 0:
        print('✅ Migration completed successfully')
        if not DELETE_OLD:
            print('   Old files kept (run with DELETE_OLD=true to remove)')
    else:
        print('⚠️  No files were migrated')

if __name__ == '__main__':
    main()
