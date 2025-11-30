#!/usr/bin/env python3
"""
Fetch average block time from Taostats Block API.
Calculates average time between the last N blocks.
"""

import os
import sys
import json
import requests
from datetime import datetime, timezone

TAOSTATS_API_KEY = os.getenv('TAOSTATS_API_KEY')
BLOCK_URL = "https://api.taostats.io/api/block/v1"

# Target block time in seconds
TARGET_BLOCK_TIME = 12.0

def fetch_block_time(num_blocks=100):
    """Fetch last N blocks and calculate average block time."""
    if not TAOSTATS_API_KEY:
        print("❌ TAOSTATS_API_KEY not set", file=sys.stderr)
        return None
    
    headers = {
        "accept": "application/json",
        "Authorization": TAOSTATS_API_KEY
    }
    
    try:
        # Fetch last N blocks
        url = f"{BLOCK_URL}?limit={num_blocks}"
        print(f"⏱️ Fetching last {num_blocks} blocks...", file=sys.stderr)
        
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        
        blocks = data.get("data", [])
        if len(blocks) < 2:
            print("❌ Not enough blocks returned", file=sys.stderr)
            return None
        
        print(f"✅ Fetched {len(blocks)} blocks", file=sys.stderr)
        
        # Parse timestamps and calculate deltas
        deltas = []
        for i in range(len(blocks) - 1):
            # Blocks are in descending order (newest first)
            newer_block = blocks[i]
            older_block = blocks[i + 1]
            
            newer_ts = parse_timestamp(newer_block.get("timestamp"))
            older_ts = parse_timestamp(older_block.get("timestamp"))
            
            if newer_ts and older_ts:
                delta = (newer_ts - older_ts).total_seconds()
                if delta > 0:  # Sanity check
                    deltas.append(delta)
        
        if not deltas:
            print("❌ Could not calculate block time deltas", file=sys.stderr)
            return None
        
        # Calculate statistics
        avg_block_time = sum(deltas) / len(deltas)
        min_block_time = min(deltas)
        max_block_time = max(deltas)
        
        # Get block range info
        newest_block = blocks[0]
        oldest_block = blocks[-1]
        
        # Determine status
        deviation = abs(avg_block_time - TARGET_BLOCK_TIME)
        if deviation < 0.5:
            status = "normal"
        elif deviation < 2.0:
            status = "slow" if avg_block_time > TARGET_BLOCK_TIME else "fast"
        else:
            status = "congested" if avg_block_time > TARGET_BLOCK_TIME else "very_fast"
        
        result = {
            "avg_block_time": round(avg_block_time, 2),
            "target_block_time": TARGET_BLOCK_TIME,
            "deviation": round(avg_block_time - TARGET_BLOCK_TIME, 2),
            "deviation_percent": round((avg_block_time - TARGET_BLOCK_TIME) / TARGET_BLOCK_TIME * 100, 1),
            "min_block_time": round(min_block_time, 2),
            "max_block_time": round(max_block_time, 2),
            "blocks_analyzed": len(deltas) + 1,
            "block_range": {
                "newest": newest_block.get("block_number"),
                "oldest": oldest_block.get("block_number"),
                "newest_timestamp": newest_block.get("timestamp"),
                "oldest_timestamp": oldest_block.get("timestamp")
            },
            "status": status,
            "_source": "taostats",
            "_timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        return result
        
    except Exception as e:
        print(f"❌ Failed to fetch blocks: {e}", file=sys.stderr)
        return None


def parse_timestamp(ts_str):
    """Parse ISO timestamp string to datetime."""
    if not ts_str:
        return None
    try:
        # Handle various ISO formats
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
        # Fallback: try fromisoformat
        return datetime.fromisoformat(ts_str.replace('Z', '+00:00'))
    except Exception:
        return None


def main():
    # Fetch block time data
    result = fetch_block_time(100)
    
    if not result:
        print("❌ Failed to fetch block time data", file=sys.stderr)
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
