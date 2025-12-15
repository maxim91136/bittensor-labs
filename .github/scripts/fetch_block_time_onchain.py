#!/usr/bin/env python3
"""
Fetch average block time directly from chain.
No external APIs - pure on-chain data.
"""

import os
import sys
import json
from datetime import datetime, timezone

NETWORK = os.getenv('NETWORK', 'finney')
TARGET_BLOCK_TIME = 12.0  # Expected block time in seconds
NUM_BLOCKS = 25  # Analyze last 25 blocks (~5 min)


def fetch_block_time_onchain():
    """Calculate block time using direct on-chain queries"""
    try:
        import bittensor as bt
    except Exception as e:
        print(f'❌ bittensor import failed: {e}', file=sys.stderr)
        return None

    try:
        print(f"🔗 Fetching block data from chain ({NETWORK})...", file=sys.stderr)
        subtensor = bt.Subtensor(network=NETWORK)

        # Get current block
        current_block = subtensor.get_current_block()
        if not current_block:
            print("❌ Could not fetch current block", file=sys.stderr)
            return None

        print(f"📊 Current block: {current_block}", file=sys.stderr)

        # We need timestamps, but substrate doesn't store timestamps per-block in easily queryable way
        # Alternative approach: Query recent blocks and their timestamps via RPC

        # Get block hashes for last N blocks
        block_data = []
        for i in range(NUM_BLOCKS):
            block_num = current_block - i
            if block_num < 0:
                break

            try:
                # Query block hash
                block_hash = subtensor.substrate.get_block_hash(block_num)
                if not block_hash:
                    continue

                # Get block header to extract timestamp
                header = subtensor.substrate.get_block_header(block_hash=block_hash)
                if not header:
                    continue

                # Extract timestamp from extrinsics (timestamp is set by Timestamp pallet)
                block = subtensor.substrate.get_block(block_hash=block_hash)
                if not block or 'extrinsics' not in block:
                    continue

                # Find timestamp extrinsic (usually the first one)
                timestamp = None
                for ext in block['extrinsics']:
                    if ext.get('call', {}).get('call_module') == 'Timestamp' and \
                       ext.get('call', {}).get('call_function') == 'set':
                        # Timestamp is in milliseconds
                        timestamp_ms = ext.get('call', {}).get('call_args', [{}])[0].get('value')
                        if timestamp_ms:
                            timestamp = int(timestamp_ms) / 1000  # Convert to seconds
                            break

                if timestamp:
                    block_data.append({
                        'block': block_num,
                        'timestamp': timestamp,
                        'hash': str(block_hash)
                    })

            except Exception as e:
                print(f"⚠️ Failed to query block {block_num}: {e}", file=sys.stderr)
                continue

        if len(block_data) < 2:
            print(f"❌ Not enough blocks with timestamps (got {len(block_data)}, need 2+)", file=sys.stderr)
            return None

        # Sort by block number (should already be, but be safe)
        block_data.sort(key=lambda x: x['block'])

        print(f"✅ Got {len(block_data)} blocks with timestamps", file=sys.stderr)

        # Calculate time deltas between consecutive blocks
        deltas = []
        for i in range(len(block_data) - 1):
            older = block_data[i]
            newer = block_data[i + 1]

            delta = newer['timestamp'] - older['timestamp']
            if delta > 0:  # Sanity check
                deltas.append(delta)

        if not deltas:
            print("❌ Could not calculate block time deltas", file=sys.stderr)
            return None

        # Calculate statistics
        avg_block_time = sum(deltas) / len(deltas)
        min_block_time = min(deltas)
        max_block_time = max(deltas)

        # Determine status
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

        result = {
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
                "newest_timestamp": datetime.fromtimestamp(newest['timestamp'], tz=timezone.utc).isoformat(),
                "oldest_timestamp": datetime.fromtimestamp(oldest['timestamp'], tz=timezone.utc).isoformat()
            },
            "status": status,
            "_source": "on-chain",
            "_timestamp": now_iso,
            "last_updated": now_iso
        }

        return result

    except Exception as e:
        print(f"❌ Failed to calculate block time: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return None


def fetch_block_time_taostats_fallback():
    """Fallback to Taostats API if on-chain fails"""
    print("⚠️ Falling back to Taostats API...", file=sys.stderr)

    # Import the old taostats fetcher
    import importlib.util
    import sys
    spec = importlib.util.spec_from_file_location("fetch_block_time",
                                                   os.path.join(os.path.dirname(__file__), "fetch_block_time.py"))
    old_module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(old_module)

    result, rate_limited = old_module.fetch_block_time(25)
    if result:
        result['_source'] = 'taostats_fallback'
        return result
    return None


def main():
    # Try on-chain first (PRIMARY)
    result = fetch_block_time_onchain()

    if not result:
        print("⚠️ On-chain fetch failed, trying Taostats fallback...", file=sys.stderr)
        # Fallback to Taostats
        result = fetch_block_time_taostats_fallback()

    if not result:
        print("❌ Both on-chain and Taostats failed", file=sys.stderr)
        sys.exit(1)

    # Save to file
    output_file = "block_time.json"
    with open(output_file, "w") as f:
        json.dump(result, indent=2, fp=f)

    print(f"✅ Block time data written to {output_file}", file=sys.stderr)

    # Print summary
    print(f"\n⏱️ Block Time Summary:", file=sys.stderr)
    print(f"  Average: {result['avg_block_time']}s (target: {result['target_block_time']}s)", file=sys.stderr)
    print(f"  Deviation: {result['deviation']:+.2f}s ({result['deviation_percent']:+.1f}%)", file=sys.stderr)
    print(f"  Range: {result['min_block_time']}s - {result['max_block_time']}s", file=sys.stderr)
    print(f"  Status: {result['status']}", file=sys.stderr)
    print(f"  Blocks: {result['block_range']['oldest']} → {result['block_range']['newest']}", file=sys.stderr)

    # Output JSON to stdout
    print(json.dumps(result))


if __name__ == "__main__":
    main()
