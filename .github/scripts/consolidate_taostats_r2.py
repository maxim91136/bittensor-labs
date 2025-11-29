#!/usr/bin/env python3
"""
Aggregate per-run `taostats_entry-*.json` objects in R2 for the previous UTC day
into one daily aggregate `taostats_history-daily-YYYY-MM-DD.json` object in R2.

This script is intentionally minimal and uses the Cloudflare API to read and
write R2 objects. It requires `CF_API_TOKEN` + `CF_ACCOUNT_ID` and `R2_BUCKET`.

Optional behavior: delete per-run entry objects older than `RETENTION_DAYS`.
"""
import os
import sys
import json
import time
from datetime import datetime, timedelta, timezone
from urllib.parse import quote
import requests

CF_API_TOKEN = os.environ.get('CF_API_TOKEN')
CF_ACCOUNT_ID = os.environ.get('CF_ACCOUNT_ID')
R2_BUCKET = os.environ.get('R2_BUCKET')
R2_PREFIX = os.environ.get('R2_PREFIX', '').strip().strip('/')

def _int_env(name, default):
    v = os.environ.get(name)
    if v is None:
        return default
    v2 = v.strip()
    if v2 == '':
        return default
    try:
        return int(v2)
    except Exception:
        print(f"Warning: environment variable {name} is invalid ({v!r}), using default {default}")
        return default

RETENTION_DAYS = _int_env('RETENTION_DAYS', 90)
print(f"Using RETENTION_DAYS={RETENTION_DAYS}")

if not (CF_API_TOKEN and CF_ACCOUNT_ID and R2_BUCKET):
    print('CF_API_TOKEN, CF_ACCOUNT_ID and R2_BUCKET are required to run this script.', file=sys.stderr)
    sys.exit(2)

API_BASE = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}"

def _list_objects(prefix=None, cursor=None):
    url = f"{API_BASE}/r2/buckets/{R2_BUCKET}/keys"
    params = {}
    if prefix:
        params['prefix'] = prefix
    if cursor:
        params['cursor'] = cursor
    headers = {'Authorization': f'Bearer {CF_API_TOKEN}'}
    resp = requests.get(url, headers=headers, params=params, timeout=60)
    resp.raise_for_status()
    return resp.json()

def _download_object(key):
    # GET /r2/buckets/{bucket}/objects/{key}
    enc = quote(key, safe='')
    url = f"{API_BASE}/r2/buckets/{R2_BUCKET}/objects/{enc}"
    headers = {'Authorization': f'Bearer {CF_API_TOKEN}'}
    r = requests.get(url, headers=headers, timeout=60)
    r.raise_for_status()
    return r.content

def _upload_object(key, data_bytes, content_type='application/json'):
    enc = quote(key, safe='')
    url = f"{API_BASE}/r2/buckets/{R2_BUCKET}/objects/{enc}"
    headers = {'Authorization': f'Bearer {CF_API_TOKEN}', 'Content-Type': content_type}
    r = requests.put(url, data=data_bytes, headers=headers, timeout=60)
    r.raise_for_status()
    return r.json()

def _delete_object(key):
    enc = quote(key, safe='')
    url = f"{API_BASE}/r2/buckets/{R2_BUCKET}/objects/{enc}"
    headers = {'Authorization': f'Bearer {CF_API_TOKEN}'}
    r = requests.delete(url, headers=headers, timeout=60)
    r.raise_for_status()
    return r.json()

def iso_ts_from_key(key):
    # Expect key: taostats_entry-YYYYMMDDTHHMMSSZ.json
    try:
        name = os.path.basename(key)
        if not name.startswith('taostats_entry-'):
            return None
        ts = name[len('taostats_entry-'):]
        ts = ts.rsplit('.', 1)[0]
        # Example: 20251129T071500Z -> parse
        return datetime.strptime(ts, '%Y%m%dT%H%M%SZ').replace(tzinfo=timezone.utc)
    except Exception:
        return None

def aggregate_previous_day():
    # UTC-previous day
    today = datetime.now(timezone.utc).date()
    prev_day = today - timedelta(days=1)
    prefix = f"taostats_entry-{prev_day.strftime('%Y%m%d')}"
    print('Listing objects with prefix', prefix)
    entries = []
    cursor = None
    while True:
        j = _list_objects(prefix=prefix, cursor=cursor)
        for obj in j.get('objects', []):
            key = obj.get('name')
            try:
                raw = _download_object(key)
                jdata = json.loads(raw)
                entries.append({
                    '_timestamp': jdata.get('_timestamp') or jdata.get('last_updated') or jdata.get('created_at'),
                    'price': jdata.get('price'),
                    'volume_24h': jdata.get('volume_24h')
                })
            except Exception as e:
                print('Warning: failed to fetch or parse', key, e)
        if j.get('cursor'):
            cursor = j.get('cursor')
        else:
            break

    # Sort entries by _timestamp
    def _ts_val(x):
        try:
            return datetime.fromisoformat(x['_timestamp'])
        except Exception:
            return datetime.min
    entries.sort(key=_ts_val)

    if not entries:
        print('No entries found for previous day', prev_day.isoformat())
        return 0

    agg_name = f"taostats_history-daily-{prev_day.isoformat()}.json"
    if R2_PREFIX:
        agg_key = f"{R2_PREFIX}/{agg_name}"
    else:
        agg_key = agg_name
    content = json.dumps(entries, separators=(',', ':'), ensure_ascii=False).encode('utf-8')
    print('Uploading aggregated file', agg_key, 'with', len(entries), 'entries')
    _upload_object(agg_key, content, content_type='application/json')
    return len(entries)

def cleanup_old_entries():
    cutoff = datetime.now(timezone.utc) - timedelta(days=RETENTION_DAYS)
    prefix = 'taostats_entry-'
    print('Cleaning objects older than', cutoff.isoformat())
    cursor = None
    removed = 0
    while True:
        j = _list_objects(prefix=prefix, cursor=cursor)
        for obj in j.get('objects', []):
            key = obj.get('name')
            ts = iso_ts_from_key(key)
            if ts and ts < cutoff:
                try:
                    print('Deleting object', key)
                    _delete_object(key)
                    removed += 1
                except Exception as e:
                    print('Warning: failed to delete', key, e)
        if j.get('cursor'):
            cursor = j.get('cursor')
        else:
            break
    return removed

if __name__ == '__main__':
    try:
        n = aggregate_previous_day()
        print('Aggregated', n, 'entries')
        removed = cleanup_old_entries()
        print('Removed', removed, 'old entries')
    except Exception as e:
        print('Error during consolidation:', e)
        sys.exit(1)
    sys.exit(0)
