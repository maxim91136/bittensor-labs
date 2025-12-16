#!/usr/bin/env python3
"""
Hybrid block time fetcher:
1. PRIMARY: On-chain (fast, reliable, no external deps)
2. FALLBACK: Taostats API (if on-chain fails)
"""

import os
import sys
import json
import time
import random
import requests
from datetime import datetime, timezone

NETWORK = os.getenv('NETWORK', 'finney')
TARGET_BLOCK_TIME = 12.0
NUM_BLOCKS = 25
TAOSTATS_API_KEY = os.getenv('TAOSTATS_API_KEY')
BLOCK_URL = "https://api.taostats.io/api/block/v1"


def fetch_block_time_onchain():
    """PRIMARY: Calculate block time using direct on-chain queries"""
    try:
        import bittensor as bt
    except Exception as e:
        print(f'❌ bittensor import failed: {e}', file=sys.stderr)
        return None

    try:
        print(f"🔗 PRIMARY: Fetching block data from chain ({NETWORK})...", file=sys.stderr)
        subtensor = bt.Subtensor(network=NETWORK)

        current_block = subtensor.get_current_block()
        if not current_block:
            print("❌ Could not fetch current block", file=sys.stderr)
            return None

        print(f"📊 Current block: {current_block}", file=sys.stderr)

        # Collect block data with timestamps
        block_data = []
        failed_reasons = {'no_hash': 0, 'no_block': 0, 'no_extrinsics': 0, 'no_timestamp': 0, 'exception': 0}

        for i in range(NUM_BLOCKS):
            block_num = current_block - i
            if block_num < 0:
                break

            try:
                block_hash = subtensor.substrate.get_block_hash(block_num)
                if not block_hash:
                    failed_reasons['no_hash'] += 1
                    if i < 3:  # Log first 3 failures
                        print(f"  Block {block_num}: no block_hash", file=sys.stderr)
                    continue

                block = subtensor.substrate.get_block(block_hash=block_hash)
                if not block:
                    failed_reasons['no_block'] += 1
                    if i < 3:
                        print(f"  Block {block_num}: get_block returned None", file=sys.stderr)
                    continue

                if 'extrinsics' not in block:
                    failed_reasons['no_extrinsics'] += 1
                    if i < 3:
                        print(f"  Block {block_num}: no extrinsics key (keys: {list(block.keys())})", file=sys.stderr)
                    continue

                # Find timestamp extrinsic
                timestamp = None
                for idx, ext in enumerate(block['extrinsics']):
                    # GenericExtrinsic has .value dict attribute
                    try:
                        # Access extrinsic data - works with GenericExtrinsic
                        ext_data = ext.value if hasattr(ext, 'value') else ext

                        # Look for Timestamp.set call
                        call_data = ext_data.get('call', {})
                        if isinstance(call_data, dict):
                            call_module = call_data.get('call_module')
                            call_function = call_data.get('call_function')

                            if call_module == 'Timestamp' and call_function == 'set':
                                call_args = call_data.get('call_args', [])
                                if call_args and len(call_args) > 0:
                                    arg = call_args[0]
                                    timestamp_ms = arg.get('value') if isinstance(arg, dict) else arg
                                    if timestamp_ms:
                                        timestamp = int(timestamp_ms) / 1000
                                        break
                    except Exception as e:
                        # Debug first extrinsic structure on first block
                        if i == 0 and idx == 0:
                            print(f"  Debug: ext type={type(ext)}, hasattr value={hasattr(ext, 'value')}", file=sys.stderr)
                        continue

                if timestamp:
                    block_data.append({
                        'block': block_num,
                        'timestamp': timestamp
                    })
                else:
                    failed_reasons['no_timestamp'] += 1
                    if i < 3:
                        print(f"  Block {block_num}: no timestamp extrinsic found", file=sys.stderr)

            except Exception as e:
                failed_reasons['exception'] += 1
                if i < 3:
                    print(f"  Block {block_num}: exception {e}", file=sys.stderr)
                continue

        if len(block_data) < 2:
            print(f"❌ Not enough blocks (got {len(block_data)})", file=sys.stderr)
            print(f"   Failure breakdown: {failed_reasons}", file=sys.stderr)
            return None

        block_data.sort(key=lambda x: x['block'])
        print(f"✅ On-chain: Got {len(block_data)} blocks", file=sys.stderr)

        # Calculate deltas
        deltas = []
        for i in range(len(block_data) - 1):
            delta = block_data[i + 1]['timestamp'] - block_data[i]['timestamp']
            if delta > 0:
                deltas.append(delta)

        if not deltas:
            return None

        return build_result(deltas, block_data, 'on-chain')

    except Exception as e:
        print(f"❌ On-chain fetch failed: {e}", file=sys.stderr)
        return None


def fetch_block_time_taostats():
    """FALLBACK: Use Taostats API"""
    if not TAOSTATS_API_KEY:
        print("❌ TAOSTATS_API_KEY not set", file=sys.stderr)
        return None

    print(f"⚠️ FALLBACK: Using Taostats API...", file=sys.stderr)

    headers = {
        "accept": "application/json",
        "Authorization": TAOSTATS_API_KEY
    }

    try:
        all_blocks = []
        url = f"{BLOCK_URL}?limit=100&page=1"

        resp = requests.get(url, headers=headers, timeout=10)
        resp.raise_for_status()

        data = resp.json()
        blocks = data.get("data", [])

        if len(blocks) < 2:
            print("❌ Not enough blocks from Taostats", file=sys.stderr)
            return None

        blocks = blocks[:NUM_BLOCKS]
        print(f"✅ Taostats: Got {len(blocks)} blocks", file=sys.stderr)

        # Calculate deltas
        deltas = []
        for i in range(len(blocks) - 1):
            newer_ts = parse_timestamp(blocks[i].get("timestamp"))
            older_ts = parse_timestamp(blocks[i + 1].get("timestamp"))

            if newer_ts and older_ts:
                delta = (newer_ts - older_ts).total_seconds()
                if delta > 0:
                    deltas.append(delta)

        if not deltas:
            return None

        # Build block_data for result
        block_data = [{'block': b.get('block_number'), 'timestamp': parse_timestamp(b.get('timestamp')).timestamp()} for b in [blocks[-1], blocks[0]]]

        return build_result(deltas, block_data, 'taostats_fallback')

    except Exception as e:
        print(f"❌ Taostats fetch failed: {e}", file=sys.stderr)
        return None


def build_result(deltas, block_data, source):
    """Build standardized result dict"""
    avg_block_time = sum(deltas) / len(deltas)
    min_block_time = min(deltas)
    max_block_time = max(deltas)

    deviation = abs(avg_block_time - TARGET_BLOCK_TIME)
    if deviation < 0.5:
        status = "normal"
    elif deviation < 2.0:
        status = "slow" if avg_block_time > TARGET_BLOCK_TIME else "fast"
    else:
        status = "congested" if avg_block_time > TARGET_BLOCK_TIME else "very_fast"

    now_iso = datetime.now(timezone.utc).isoformat()
    oldest = block_data[0]
    newest = block_data[-1]

    return {
        "avg_block_time": round(avg_block_time, 2),
        "target_block_time": TARGET_BLOCK_TIME,
        "deviation": round(avg_block_time - TARGET_BLOCK_TIME, 2),
        "deviation_percent": round((avg_block_time - TARGET_BLOCK_TIME) / TARGET_BLOCK_TIME * 100, 1),
        "min_block_time": round(min_block_time, 2),
        "max_block_time": round(max_block_time, 2),
        "blocks_analyzed": len(deltas) + 1,
        "block_range": {
            "newest": newest['block'],
            "oldest": oldest['block'],
            "newest_timestamp": datetime.fromtimestamp(newest['timestamp'], tz=timezone.utc).isoformat() if isinstance(newest['timestamp'], (int, float)) else newest['timestamp'],
            "oldest_timestamp": datetime.fromtimestamp(oldest['timestamp'], tz=timezone.utc).isoformat() if isinstance(oldest['timestamp'], (int, float)) else oldest['timestamp']
        },
        "status": status,
        "_source": source,
        "_timestamp": now_iso,
        "last_updated": now_iso
    }


def parse_timestamp(ts_str):
    """Parse ISO timestamp"""
    if not ts_str:
        return None
    try:
        formats = [
            "%Y-%m-%dT%H:%M:%SZ",
            "%Y-%m-%dT%H:%M:%S.%fZ",
            "%Y-%m-%dT%H:%M:%S%z"
        ]
        for fmt in formats:
            try:
                return datetime.strptime(ts_str, fmt)
            except ValueError:
                continue
        return datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
    except Exception:
        return None


def main():
    # Try on-chain first (PRIMARY)
    result = fetch_block_time_onchain()

    # Fallback to Taostats if on-chain failed
    if not result:
        result = fetch_block_time_taostats()

    if not result:
        print("❌ Both on-chain and Taostats failed", file=sys.stderr)
        sys.exit(1)

    # Save to file
    output_file = "block_time.json"
    with open(output_file, "w") as f:
        json.dump(result, indent=2, fp=f)

    print(f"✅ Block time written to {output_file}", file=sys.stderr)

    # Print summary
    print(f"\n⏱️ Block Time Summary (source: {result['_source']}):", file=sys.stderr)
    print(f"  Average: {result['avg_block_time']}s (target: {result['target_block_time']}s)", file=sys.stderr)
    print(f"  Deviation: {result['deviation']:+.2f}s ({result['deviation_percent']:+.1f}%)", file=sys.stderr)
    print(f"  Range: {result['min_block_time']}s - {result['max_block_time']}s", file=sys.stderr)
    print(f"  Status: {result['status']}", file=sys.stderr)

    print(json.dumps(result))


if __name__ == "__main__":
    main()
