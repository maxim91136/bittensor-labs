#!/usr/bin/env python3
"""
Publish Top History - Collects Top 10 snapshots and appends to history KV.

This script fetches the current Top 10 Validators, Wallets, and Subnets from
the deployed Cloudflare Pages API and appends each snapshot to their respective
*_history KV collections.

KV Keys:
  - top_validators_history
  - top_wallets_history  
  - top_subnets_history

Data Structure per entry:
{
    "_timestamp": "2024-12-03T12:00:00Z",
    "entries": [
        {"rank": 1, "id": "...", "name": "...", "value": 123456.78},
        {"rank": 2, "id": "...", "name": "...", "value": 100000.00},
        ...
    ]
}

Environment Variables:
  CF_ACCOUNT_ID           Cloudflare Account ID
  CF_API_TOKEN            Cloudflare API Token
  CF_KV_NAMESPACE_ID      KV Namespace ID (or CF_METRICS_NAMESPACE_ID)
  API_BASE_URL            Base URL for API (default: https://bittensor-labs.pages.dev)
  MAX_HISTORY_ENTRIES     Max entries to keep per collection (default: 672 = 4 weeks @ 6h)

Usage:
  python .github/scripts/publish_top_history.py
"""

import os
import sys
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any

# Configuration
API_BASE_URL = os.getenv('API_BASE_URL', 'https://bittensor-labs.pages.dev')
MAX_HISTORY_ENTRIES = int(os.getenv('MAX_HISTORY_ENTRIES', '672'))  # 4 weeks @ 6h intervals

# Cloudflare credentials
CF_ACCOUNT_ID = os.getenv('CF_ACCOUNT_ID')
CF_API_TOKEN = os.getenv('CF_API_TOKEN')
CF_KV_NAMESPACE_ID = os.getenv('CF_KV_NAMESPACE_ID') or os.getenv('CF_METRICS_NAMESPACE_ID')


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
            return None  # Key doesn't exist yet
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
        with urllib.request.urlopen(req, timeout=20) as resp:
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


def fetch_api(endpoint: str) -> Optional[Dict]:
    """Fetch data from our API endpoint."""
    url = f"{API_BASE_URL}{endpoint}"
    req = urllib.request.Request(url, method='GET', headers={
        'User-Agent': 'TopHistoryCollector/1.0',
        'Accept': 'application/json'
    })
    
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if resp.status == 200:
                return json.loads(resp.read())
    except Exception as e:
        print(f"⚠️ API fetch failed for {endpoint}: {e}", file=sys.stderr)
    
    return None


def process_validators(data: Dict) -> List[Dict]:
    """Extract normalized entries from top_validators response."""
    entries = []
    validators = data.get('top_validators', [])
    
    for i, v in enumerate(validators[:10], 1):
        # Handle both nested and flat structures
        hotkey = v.get('hotkey', {})
        if isinstance(hotkey, dict):
            hotkey_ss58 = hotkey.get('ss58', '')
        else:
            hotkey_ss58 = str(hotkey) if hotkey else ''
        
        # Get name - try multiple fields
        name = v.get('name') or v.get('validator_name') or v.get('display_name', '')
        if not name and hotkey_ss58:
            name = f"{hotkey_ss58[:8]}..."
        
        # Get stake value (in TAO)
        stake = v.get('stake', 0) or v.get('total_stake', 0)
        try:
            stake = float(stake)
        except:
            stake = 0.0
        
        entries.append({
            'rank': i,
            'id': hotkey_ss58,
            'name': name,
            'value': round(stake, 2)
        })
    
    return entries


def process_wallets(data: Dict) -> List[Dict]:
    """Extract normalized entries from top_wallets response."""
    entries = []
    # API returns 'wallets' not 'top_wallets'
    wallets = data.get('wallets', []) or data.get('top_wallets', [])
    
    for i, w in enumerate(wallets[:10], 1):
        address = w.get('address', '')
        name = w.get('name') or w.get('identity_name') or w.get('exchange_name', '')
        if not name and address:
            name = f"{address[:8]}..."
        
        # Balance is already in TAO
        balance = w.get('balance_total', 0) or w.get('total_balance', 0)
        try:
            balance = float(balance)
        except:
            balance = 0.0
        
        entries.append({
            'rank': i,
            'id': address,
            'name': name,
            'value': round(balance, 2)
        })
    
    return entries


def process_subnets(data: Dict) -> List[Dict]:
    """Extract normalized entries from top_subnets response.

    Tracks ALL subnets for Talent Scouting (Katniss detection from rank 50+).
    """
    entries = []
    subnets = data.get('top_subnets', [])

    for i, s in enumerate(subnets, 1):  # ALL subnets
        netuid = s.get('netuid', 0)
        name = s.get('taostats_name') or s.get('subnet_name') or f"SN{netuid}"

        # Use estimated daily emission as the value
        emission = s.get('estimated_emission_daily', 0) or s.get('emission', 0)
        try:
            emission = float(emission)
        except:
            emission = 0.0

        entries.append({
            'rank': i,
            'id': str(netuid),
            'name': name,
            'value': round(emission, 2)
        })

    return entries


def process_mcap(data: Dict) -> List[Dict]:
    """Extract normalized entries from alpha_prices response (sorted by market cap).

    Extended to ALL subnets (100) for Talent Scouting (Katniss detection).
    """
    entries = []
    subnets = data.get('subnets', [])

    # Sort by market cap descending
    sorted_subnets = sorted(subnets, key=lambda x: x.get('market_cap_tao', 0), reverse=True)

    for i, s in enumerate(sorted_subnets, 1):  # ALL subnets
        netuid = s.get('netuid', 0)
        name = s.get('name') or f"SN{netuid}"

        # Use market cap in TAO as the value
        mcap = s.get('market_cap_tao', 0)
        try:
            mcap = float(mcap)
        except:
            mcap = 0.0

        entries.append({
            'rank': i,
            'id': str(netuid),
            'name': name,
            'value': round(mcap, 2)
        })

    return entries


def process_alpha_pressure(data: Dict) -> List[Dict]:
    """Extract normalized entries from alpha_pressure response.

    Tracks ALL subnets with their buying/selling pressure.
    Value = alpha_pressure_30d (positive = buying, negative = selling)
    """
    entries = []
    subnets = data.get('subnets', [])

    for s in subnets:
        netuid = s.get('netuid', 0)
        name = s.get('name') or f"SN{netuid}"
        pressure = s.get('alpha_pressure_30d', 0)
        status = s.get('status', 'unknown')
        flow_30d = s.get('net_flow_30d_tao', 0)

        try:
            pressure = float(pressure)
            flow_30d = float(flow_30d)
        except:
            pressure = 0.0
            flow_30d = 0.0

        entries.append({
            'id': str(netuid),
            'name': name,
            'pressure': round(pressure, 1),
            'flow_30d': round(flow_30d, 0),
            'status': status
        })

    # Sort by pressure (most negative first = worst dumpers)
    entries.sort(key=lambda x: x['pressure'])

    # Add rank after sorting
    for i, e in enumerate(entries, 1):
        e['rank'] = i

    return entries


def append_to_history(history_key: str, new_entry: Dict) -> bool:
    """Append a new entry to a history collection and store it."""
    # Get existing history
    history = get_from_kv(history_key)
    if history is None:
        history = []
    
    if not isinstance(history, list):
        print(f"⚠️ Invalid history format for {history_key}, resetting", file=sys.stderr)
        history = []
    
    # Append new entry
    history.append(new_entry)
    
    # Trim to max entries (keep newest)
    if len(history) > MAX_HISTORY_ENTRIES:
        history = history[-MAX_HISTORY_ENTRIES:]
    
    # Store back
    return put_to_kv(history_key, history)


def write_local_backup(filename: str, data: Any):
    """Write local backup file."""
    out_dir = os.path.join(os.getcwd(), '.github', 'data')
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, filename)
    
    with open(out_path, 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"📁 Wrote local backup: {out_path}")


def main():
    print("=" * 60)
    print("Top History Publisher")
    print("=" * 60)
    
    # Validate credentials
    if not all([CF_ACCOUNT_ID, CF_API_TOKEN, CF_KV_NAMESPACE_ID]):
        print("❌ Missing Cloudflare credentials (CF_ACCOUNT_ID, CF_API_TOKEN, CF_KV_NAMESPACE_ID)")
        sys.exit(1)
    
    timestamp = datetime.now(timezone.utc).isoformat()
    print(f"📅 Timestamp: {timestamp}")
    print(f"🌐 API Base: {API_BASE_URL}")
    print()
    
    success_count = 0
    error_count = 0
    
    # Collect all snapshots for local backup
    all_snapshots = {
        '_generated_at': timestamp,
        'validators': None,
        'wallets': None,
        'subnets': None,
        'mcap': None,
        'alpha_pressure': None
    }
    
    # === Top Validators ===
    print("📊 Fetching Top Validators...")
    validators_data = fetch_api('/api/top_validators')
    if validators_data:
        entries = process_validators(validators_data)
        if entries:
            snapshot = {
                '_timestamp': timestamp,
                'entries': entries
            }
            all_snapshots['validators'] = snapshot
            
            print(f"   Found {len(entries)} validators")
            for e in entries[:3]:
                print(f"   #{e['rank']} {e['name']}: {e['value']:,.0f} τ")
            
            if append_to_history('top_validators_history', snapshot):
                success_count += 1
            else:
                error_count += 1
        else:
            print("   ⚠️ No validator entries extracted")
            error_count += 1
    else:
        print("   ❌ Failed to fetch validators")
        error_count += 1
    
    print()
    
    # === Top Wallets ===
    print("💰 Fetching Top Wallets...")
    wallets_data = fetch_api('/api/top_wallets')
    if wallets_data:
        entries = process_wallets(wallets_data)
        if entries:
            snapshot = {
                '_timestamp': timestamp,
                'entries': entries
            }
            all_snapshots['wallets'] = snapshot
            
            print(f"   Found {len(entries)} wallets")
            for e in entries[:3]:
                print(f"   #{e['rank']} {e['name']}: {e['value']:,.0f} τ")
            
            if append_to_history('top_wallets_history', snapshot):
                success_count += 1
            else:
                error_count += 1
        else:
            print("   ⚠️ No wallet entries extracted")
            error_count += 1
    else:
        print("   ❌ Failed to fetch wallets")
        error_count += 1
    
    print()
    
    # === Top Subnets ===
    print("🔗 Fetching Top Subnets...")
    subnets_data = fetch_api('/api/top_subnets')
    if subnets_data:
        entries = process_subnets(subnets_data)
        if entries:
            snapshot = {
                '_timestamp': timestamp,
                'entries': entries
            }
            all_snapshots['subnets'] = snapshot
            
            print(f"   Found {len(entries)} subnets")
            for e in entries[:3]:
                print(f"   #{e['rank']} {e['name']}: {e['value']:,.2f} τ/day")
            
            if append_to_history('top_subnets_history', snapshot):
                success_count += 1
            else:
                error_count += 1
        else:
            print("   ⚠️ No subnet entries extracted")
            error_count += 1
    else:
        print("   ❌ Failed to fetch subnets")
        error_count += 1

    print()

    # === Market Cap Rankings ===
    print("💎 Fetching Market Cap Rankings...")
    mcap_data = fetch_api('/api/alpha_prices')
    if mcap_data:
        entries = process_mcap(mcap_data)
        if entries:
            snapshot = {
                '_timestamp': timestamp,
                'entries': entries
            }
            all_snapshots['mcap'] = snapshot

            print(f"   Found {len(entries)} subnets by MCap")
            for e in entries[:3]:
                print(f"   #{e['rank']} {e['name']}: {e['value']:,.0f} τ MCap")

            if append_to_history('mcap_history', snapshot):
                success_count += 1
            else:
                error_count += 1
        else:
            print("   ⚠️ No mcap entries extracted")
            error_count += 1
    else:
        print("   ❌ Failed to fetch alpha_prices")
        error_count += 1

    print()

    # === Alpha Pressure ===
    print("📈 Fetching Alpha Pressure...")
    pressure_data = fetch_api('/api/alpha_pressure')
    if pressure_data:
        entries = process_alpha_pressure(pressure_data)
        if entries:
            snapshot = {
                '_timestamp': timestamp,
                'entries': entries,
                'summary': pressure_data.get('summary', {})
            }
            all_snapshots['alpha_pressure'] = snapshot

            print(f"   Found {len(entries)} subnets with pressure data")
            # Show worst dumpers
            worst = [e for e in entries if e['pressure'] < 0][:3]
            for e in worst:
                print(f"   🔴 {e['name']}: {e['pressure']:+.1f}% ({e['flow_30d']:+,.0f}τ)")

            if append_to_history('alpha_pressure_history', snapshot):
                success_count += 1
            else:
                error_count += 1
        else:
            print("   ⚠️ No pressure entries extracted")
            error_count += 1
    else:
        print("   ❌ Failed to fetch alpha_pressure")
        error_count += 1

    print()

    # Write local backup
    write_local_backup('top_history_latest.json', all_snapshots)

    # Summary
    print("=" * 60)
    print(f"✅ Success: {success_count}/5")
    print(f"❌ Errors: {error_count}/5")
    print("=" * 60)
    
    if error_count > 0:
        sys.exit(1)
    
    sys.exit(0)


if __name__ == '__main__':
    main()
