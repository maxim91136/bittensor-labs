#!/usr/bin/env python3
"""
Backfill Subnet History - Fetches last 7 days of subnet data from Taostats.

This script fetches historical subnet emission data from the Taostats API
and backfills our top_subnets_history KV store to enable Talent Scouting
(detecting rising vs fallen subnets).

Environment Variables:
  TAOSTATS_API_KEY        Taostats API Key (required)
  CF_ACCOUNT_ID           Cloudflare Account ID
  CF_API_TOKEN            Cloudflare API Token
  CF_KV_NAMESPACE_ID      KV Namespace ID (or CF_METRICS_NAMESPACE_ID)
  BACKFILL_DAYS           Days to backfill (default: 7)
  BACKFILL_INTERVAL_HOURS Interval between snapshots (default: 6)

Usage:
  python .github/scripts/backfill_subnet_history.py
"""

import os
import sys
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any

# Configuration
TAOSTATS_API_KEY = os.getenv('TAOSTATS_API_KEY')
BACKFILL_DAYS = int(os.getenv('BACKFILL_DAYS', '7'))
BACKFILL_INTERVAL_HOURS = int(os.getenv('BACKFILL_INTERVAL_HOURS', '6'))

# Cloudflare credentials
CF_ACCOUNT_ID = os.getenv('CF_ACCOUNT_ID')
CF_API_TOKEN = os.getenv('CF_API_TOKEN')
CF_KV_NAMESPACE_ID = os.getenv('CF_KV_NAMESPACE_ID') or os.getenv('CF_METRICS_NAMESPACE_ID')

# Taostats API base
TAOSTATS_API_BASE = 'https://api.taostats.io/api'


def get_from_kv(key: str) -> Optional[Any]:
    """Fetch a value from Cloudflare KV."""
    if not all([CF_ACCOUNT_ID, CF_API_TOKEN, CF_KV_NAMESPACE_ID]):
        return None

    url = f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/storage/kv/namespaces/{CF_KV_NAMESPACE_ID}/values/{key}'
    req = urllib.request.Request(url, method='GET', headers={
        'Authorization': f'Bearer {CF_API_TOKEN}',
        'Accept': 'application/json'
    })

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status == 200:
                return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        print(f"⚠️ KV GET failed for {key}: HTTP {e.code}", file=sys.stderr)
    except Exception as e:
        print(f"⚠️ KV GET failed for {key}: {e}", file=sys.stderr)

    return None


def put_to_kv(key: str, data: Any) -> bool:
    """Store a value in Cloudflare KV."""
    if not all([CF_ACCOUNT_ID, CF_API_TOKEN, CF_KV_NAMESPACE_ID]):
        print("⚠️ Missing CF credentials for KV PUT", file=sys.stderr)
        return False

    url = f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/storage/kv/namespaces/{CF_KV_NAMESPACE_ID}/values/{key}'
    payload = json.dumps(data).encode('utf-8')

    req = urllib.request.Request(url, data=payload, method='PUT', headers={
        'Authorization': f'Bearer {CF_API_TOKEN}',
        'Content-Type': 'application/json'
    })

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status in (200, 201):
                print(f"✅ KV PUT OK ({key})")
                return True
            else:
                print(f"⚠️ KV PUT returned status {resp.status}", file=sys.stderr)
                return False
    except urllib.error.HTTPError as e:
        print(f"⚠️ KV PUT failed for {key}: HTTP {e.code} - {e.read()}", file=sys.stderr)
    except Exception as e:
        print(f"⚠️ KV PUT failed for {key}: {e}", file=sys.stderr)

    return False


def fetch_taostats_subnet_history(limit: int = 500) -> List[Dict]:
    """Fetch historical subnet data from Taostats API.

    The /subnet/history/v1 endpoint returns historical snapshots of all subnets
    with their emission values at different points in time.
    """
    if not TAOSTATS_API_KEY:
        print("❌ TAOSTATS_API_KEY not set", file=sys.stderr)
        return []

    # Try fetching all subnets history
    url = f'{TAOSTATS_API_BASE}/subnet/history/v1?limit={limit}'
    req = urllib.request.Request(url, method='GET', headers={
        'Authorization': TAOSTATS_API_KEY,
        'Accept': 'application/json',
        'User-Agent': 'BittensorLabsBackfill/1.0'
    })

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            if resp.status == 200:
                data = json.loads(resp.read())
                items = data.get('data', []) if isinstance(data, dict) else data
                print(f"📊 Fetched {len(items)} historical records from Taostats")
                return items if isinstance(items, list) else []
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8', errors='replace')
        print(f"❌ Taostats API error: HTTP {e.code} - {error_body[:200]}", file=sys.stderr)
    except Exception as e:
        print(f"❌ Taostats fetch failed: {e}", file=sys.stderr)

    return []


def fetch_current_subnets() -> List[Dict]:
    """Fetch current subnet data from Taostats /subnet/latest/v1 endpoint."""
    if not TAOSTATS_API_KEY:
        return []

    url = f'{TAOSTATS_API_BASE}/subnet/latest/v1?limit=500'
    req = urllib.request.Request(url, method='GET', headers={
        'Authorization': TAOSTATS_API_KEY,
        'Accept': 'application/json',
        'User-Agent': 'BittensorLabsBackfill/1.0'
    })

    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status == 200:
                data = json.loads(resp.read())
                items = data.get('data', []) if isinstance(data, dict) else data
                return items if isinstance(items, list) else []
    except Exception as e:
        print(f"⚠️ Failed to fetch current subnets: {e}", file=sys.stderr)

    return []


def group_by_timestamp(records: List[Dict]) -> Dict[str, List[Dict]]:
    """Group historical records by timestamp (rounded to nearest hour)."""
    grouped = {}

    for record in records:
        ts = record.get('timestamp') or record.get('created_at')
        if not ts:
            continue

        # Parse and round to hour
        try:
            if isinstance(ts, str):
                # Handle various ISO formats
                ts = ts.replace('Z', '+00:00')
                if '.' in ts:
                    ts = ts.split('.')[0] + '+00:00'
                dt = datetime.fromisoformat(ts)
            else:
                dt = datetime.fromtimestamp(ts, tz=timezone.utc)

            # Round to nearest hour
            dt = dt.replace(minute=0, second=0, microsecond=0)
            hour_key = dt.isoformat()

            if hour_key not in grouped:
                grouped[hour_key] = []
            grouped[hour_key].append(record)
        except Exception as e:
            continue

    return grouped


def create_snapshot_from_records(records: List[Dict], timestamp: str) -> Dict:
    """Create a history snapshot entry from subnet records.

    Ranks subnets by emission and formats for our history structure.
    """
    # Calculate emission share for each subnet
    subnets_with_emission = []

    for r in records:
        netuid = r.get('netuid')
        if netuid is None:
            continue

        # Emission is stored as raw value (needs conversion)
        emission_raw = r.get('emission', 0) or 0
        try:
            # Taostats emission is in 10^9 format
            emission_share = float(emission_raw) / 1_000_000_000.0
        except:
            emission_share = 0.0

        # Daily emission estimate (7200 TAO/day total)
        daily_emission = emission_share * 7200.0

        name = r.get('name') or f"SN{netuid}"

        subnets_with_emission.append({
            'netuid': int(netuid),
            'name': name,
            'emission_share': emission_share,
            'daily_emission': daily_emission
        })

    # Sort by emission descending
    subnets_with_emission.sort(key=lambda x: x['daily_emission'], reverse=True)

    # Create entries with ranks
    entries = []
    for i, s in enumerate(subnets_with_emission, 1):
        entries.append({
            'rank': i,
            'id': str(s['netuid']),
            'name': s['name'],
            'value': round(s['daily_emission'], 2)
        })

    return {
        '_timestamp': timestamp,
        'entries': entries
    }


def generate_synthetic_history(current_subnets: List[Dict], days: int = 7, interval_hours: int = 6) -> List[Dict]:
    """Generate synthetic historical snapshots based on current data.

    This is a fallback when Taostats history endpoint doesn't provide enough data.
    Uses current emission values to create placeholder history entries.
    """
    snapshots = []
    now = datetime.now(timezone.utc)

    # Calculate number of snapshots needed
    total_hours = days * 24
    num_snapshots = total_hours // interval_hours

    print(f"📝 Generating {num_snapshots} synthetic snapshots for {days} days...")

    # Process current subnets
    subnets_data = []
    for s in current_subnets:
        netuid = s.get('netuid')
        if netuid is None:
            continue

        emission_raw = s.get('emission', 0) or 0
        try:
            emission_share = float(emission_raw) / 1_000_000_000.0
        except:
            emission_share = 0.0

        daily_emission = emission_share * 7200.0
        name = s.get('name') or f"SN{netuid}"

        subnets_data.append({
            'netuid': int(netuid),
            'name': name,
            'daily_emission': daily_emission
        })

    # Sort by emission
    subnets_data.sort(key=lambda x: x['daily_emission'], reverse=True)

    # Create snapshots going back in time
    for i in range(num_snapshots):
        hours_ago = i * interval_hours
        snapshot_time = now - timedelta(hours=hours_ago)
        timestamp = snapshot_time.isoformat()

        entries = []
        for rank, s in enumerate(subnets_data, 1):
            entries.append({
                'rank': rank,
                'id': str(s['netuid']),
                'name': s['name'],
                'value': round(s['daily_emission'], 2)
            })

        snapshots.append({
            '_timestamp': timestamp,
            'entries': entries
        })

    # Reverse to chronological order (oldest first)
    snapshots.reverse()

    return snapshots


def main():
    print("=" * 60)
    print("Subnet History Backfill")
    print("=" * 60)

    # Validate API key
    if not TAOSTATS_API_KEY:
        print("❌ TAOSTATS_API_KEY not set")
        sys.exit(1)

    print(f"📅 Backfilling {BACKFILL_DAYS} days at {BACKFILL_INTERVAL_HOURS}h intervals")
    print()

    # Try to fetch real historical data first
    print("🔍 Fetching historical data from Taostats...")
    history_records = fetch_taostats_subnet_history(limit=1000)

    snapshots = []

    if history_records:
        # Group by timestamp
        grouped = group_by_timestamp(history_records)
        print(f"   Found {len(grouped)} distinct time points")

        # Filter to last N days
        cutoff = datetime.now(timezone.utc) - timedelta(days=BACKFILL_DAYS)

        for ts_key in sorted(grouped.keys()):
            try:
                ts_dt = datetime.fromisoformat(ts_key.replace('Z', '+00:00'))
                if ts_dt >= cutoff:
                    snapshot = create_snapshot_from_records(grouped[ts_key], ts_key)
                    if snapshot['entries']:
                        snapshots.append(snapshot)
            except:
                continue

        print(f"   Created {len(snapshots)} snapshots from real data")

    # Fallback to synthetic if not enough data
    if len(snapshots) < 10:
        print("⚠️ Insufficient historical data, using synthetic backfill...")
        current = fetch_current_subnets()
        if current:
            snapshots = generate_synthetic_history(
                current,
                days=BACKFILL_DAYS,
                interval_hours=BACKFILL_INTERVAL_HOURS
            )
            print(f"   Generated {len(snapshots)} synthetic snapshots")
        else:
            print("❌ Could not fetch current subnet data")
            sys.exit(1)

    if not snapshots:
        print("❌ No snapshots to write")
        sys.exit(1)

    # Get existing history and merge
    print()
    print("📥 Fetching existing history from KV...")
    existing = get_from_kv('top_subnets_history')
    if existing is None:
        existing = []
    print(f"   Found {len(existing)} existing entries")

    # Merge: prepend backfill data, avoiding duplicates
    existing_timestamps = set()
    for e in existing:
        ts = e.get('_timestamp')
        if ts:
            existing_timestamps.add(ts)

    new_entries = []
    for s in snapshots:
        if s.get('_timestamp') not in existing_timestamps:
            new_entries.append(s)

    print(f"   Adding {len(new_entries)} new entries")

    # Combine: new entries (oldest first) + existing
    combined = new_entries + existing

    # Sort by timestamp
    combined.sort(key=lambda x: x.get('_timestamp', ''))

    # Trim to max (672 = 4 weeks @ hourly)
    MAX_ENTRIES = 672
    if len(combined) > MAX_ENTRIES:
        combined = combined[-MAX_ENTRIES:]

    print(f"   Total entries after merge: {len(combined)}")

    # Write to KV
    print()
    print("📤 Writing to KV...")
    if put_to_kv('top_subnets_history', combined):
        print("✅ Backfill complete!")
    else:
        print("❌ Failed to write to KV")
        sys.exit(1)

    # Write local backup
    out_dir = os.path.join(os.getcwd(), '.github', 'data')
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, 'backfill_subnet_history.json')
    with open(out_path, 'w') as f:
        json.dump(combined, f, indent=2)
    print(f"📁 Wrote local backup: {out_path}")

    # Summary
    print()
    print("=" * 60)
    print(f"✅ Backfill Summary:")
    print(f"   • Time range: {combined[0]['_timestamp']} to {combined[-1]['_timestamp']}")
    print(f"   • Total snapshots: {len(combined)}")
    print(f"   • Subnets per snapshot: {len(combined[0]['entries']) if combined else 0}")
    print("=" * 60)


if __name__ == '__main__':
    main()
