#!/usr/bin/env python3
"""
Simple on-chain block time calculator.
Uses current block + previous blocks to calculate average time.
"""

import os
import sys
import json
import time
from datetime import datetime, timezone

NETWORK = os.getenv('NETWORK', 'finney')
TARGET_BLOCK_TIME = 12.0
NUM_BLOCKS = 25


def fetch_block_time_simple():
    """Calculate block time using simple block count + time difference"""
    try:
        import bittensor as bt
    except Exception as e:
        print(f'❌ bittensor import failed: {e}', file=sys.stderr)
        return None

    try:
        print(f"🔗 Fetching from chain ({NETWORK})...", file=sys.stderr)
        subtensor = bt.Subtensor(network=NETWORK)

        # Get current block
        current_block = subtensor.get_current_block()
        if not current_block:
            print("❌ Could not fetch current block", file=sys.stderr)
            return None

        # Calculate which block to check (NUM_BLOCKS ago)
        older_block_num = max(1, current_block - NUM_BLOCKS)

        print(f"📊 Current block: {current_block}", file=sys.stderr)
        print(f"📊 Older block: {older_block_num}", file=sys.stderr)

        # Record start time and wait for a few blocks to calculate actual time
        # Alternative: Use substrate's current timestamp vs historical
        start_time = time.time()
        start_block = current_block

        # Wait for 3 new blocks (~36s if 12s blocks)
        print("⏱️ Waiting for new blocks to measure actual time...", file=sys.stderr)
        max_wait = 60  # seconds
        wait_blocks = 3
        elapsed = 0

        while elapsed < max_wait:
            time.sleep(6)  # Check every 6s
            elapsed = time.time() - start_time

            try:
                new_block = subtensor.get_current_block()
                blocks_passed = new_block - start_block

                if blocks_passed >= wait_blocks:
                    avg_time = elapsed / blocks_passed
                    print(f"✅ Measured: {blocks_passed} blocks in {elapsed:.1f}s = {avg_time:.2f}s/block", file=sys.stderr)

                    # Build result
                    now_iso = datetime.now(timezone.utc).isoformat()
                    deviation = avg_time - TARGET_BLOCK_TIME

                    if abs(deviation) < 0.5:
                        status = "normal"
                    elif abs(deviation) < 2.0:
                        status = "slow" if avg_time > TARGET_BLOCK_TIME else "fast"
                    else:
                        status = "congested" if avg_time > TARGET_BLOCK_TIME else "very_fast"

                    result = {
                        "avg_block_time": round(avg_time, 2),
                        "target_block_time": TARGET_BLOCK_TIME,
                        "deviation": round(deviation, 2),
                        "deviation_percent": round(deviation / TARGET_BLOCK_TIME * 100, 1),
                        "min_block_time": round(avg_time * 0.9, 2),  # Estimate
                        "max_block_time": round(avg_time * 1.1, 2),  # Estimate
                        "blocks_analyzed": blocks_passed,
                        "measurement_time_seconds": round(elapsed, 1),
                        "block_range": {
                            "newest": new_block,
                            "oldest": start_block
                        },
                        "status": status,
                        "_source": "on-chain_measured",
                        "_timestamp": now_iso,
                        "last_updated": now_iso
                    }

                    return result
            except Exception as e:
                print(f"⚠️ Error checking blocks: {e}", file=sys.stderr)
                continue

        print("❌ Timeout waiting for blocks", file=sys.stderr)
        return None

    except Exception as e:
        print(f"❌ Failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return None


def main():
    result = fetch_block_time_simple()

    if not result:
        print("❌ Failed to measure block time", file=sys.stderr)
        sys.exit(1)

    # Save to file
    output_file = "block_time.json"
    with open(output_file, "w") as f:
        json.dump(result, indent=2, fp=f)

    print(f"✅ Written to {output_file}", file=sys.stderr)
    print(f"\n⏱️ Block Time: {result['avg_block_time']}s (deviation: {result['deviation']:+.2f}s)", file=sys.stderr)

    print(json.dumps(result))


if __name__ == "__main__":
    main()
