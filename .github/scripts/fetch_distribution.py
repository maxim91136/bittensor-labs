#!/usr/bin/env python3
"""
Fetch TAO Distribution Statistics - Hybrid SDK/Taostats approach.
- Uses Bittensor SDK for total wallet count (NumStakingColdkeys)
- Uses Taostats API for top wallet balances (sample)
- Calculates holder percentiles and wallet size brackets

Rate limits (Taostats): 5 requests/min, 10k requests/month
Strategy: Dynamic pages (25-100) based on SDK wallet count, run weekly
"""

import os
import sys
import json
import time
import requests
from datetime import datetime, timezone

# Try to import bittensor SDK
try:
    import bittensor as bt
    HAS_BITTENSOR = True
except ImportError:
    HAS_BITTENSOR = False
    print("⚠️ Bittensor SDK not available, using Taostats-only mode", file=sys.stderr)

TAOSTATS_API_KEY = os.getenv('TAOSTATS_API_KEY')
ACCOUNT_URL = "https://api.taostats.io/api/account/latest/v1"
NETWORK = os.getenv("NETWORK", "finney")

# Brackets matching @RBS_HODL format
BRACKETS = [100000, 50000, 10000, 1000, 500, 250, 100, 50, 25, 10, 5, 1, 0.1]
PERCENTILES = [10, 5, 3, 1]  # Top X%

# Global to store total wallet count
total_wallet_count = 0
sdk_wallet_count = None  # From SDK if available


def fetch_wallet_count_from_sdk():
    """
    Fetch total staking coldkeys count directly from blockchain via SDK.
    This gives us accurate count without relying on Taostats.
    """
    global sdk_wallet_count

    if not HAS_BITTENSOR:
        print("⚠️ SDK not available for wallet count", file=sys.stderr)
        return None

    try:
        print(f"🔗 Connecting to {NETWORK} via SDK...", file=sys.stderr)
        subtensor = bt.Subtensor(network=NETWORK)

        if hasattr(subtensor, 'substrate') and subtensor.substrate is not None:
            # Query NumStakingColdkeys - total count of active staking wallets
            try:
                result = subtensor.substrate.query('SubtensorModule', 'NumStakingColdkeys')
                if result and result.value is not None:
                    sdk_wallet_count = int(result.value)
                    print(f"✅ SDK: NumStakingColdkeys = {sdk_wallet_count:,}", file=sys.stderr)
                    return sdk_wallet_count
            except Exception as e:
                print(f"⚠️ NumStakingColdkeys query failed: {e}", file=sys.stderr)

            # Fallback: Try to get account count from System storage
            try:
                # This counts all accounts with any data (slower)
                result = subtensor.substrate.query('System', 'AccountCount')
                if result and result.value is not None:
                    sdk_wallet_count = int(result.value)
                    print(f"✅ SDK: System.AccountCount = {sdk_wallet_count:,}", file=sys.stderr)
                    return sdk_wallet_count
            except Exception as e:
                print(f"⚠️ AccountCount query failed: {e}", file=sys.stderr)

        print("⚠️ SDK connected but no wallet count available", file=sys.stderr)
        return None

    except Exception as e:
        print(f"❌ SDK connection failed: {e}", file=sys.stderr)
        return None


def fetch_wallets(max_pages=100, page_size=200):
    """
    Fetch wallets from Taostats API with pagination.
    Returns sorted list of balances (TAO, descending).

    Taostats API returns max 200 per page.
    100 pages = 20k wallets = enough for Top 10% of ~200k total.
    Respects rate limits: 13s between requests (5/min safe)
    """
    global total_wallet_count

    if not TAOSTATS_API_KEY:
        print("❌ TAOSTATS_API_KEY not set", file=sys.stderr)
        return None

    headers = {
        "accept": "application/json",
        "Authorization": TAOSTATS_API_KEY
    }

    all_balances = []
    page = 1
    last_rank = 0

    try:
        while page <= max_pages:
            url = f"{ACCOUNT_URL}?limit={page_size}&page={page}&order=balance_total_desc"
            print(f"📊 Fetching page {page}/{max_pages}... ({len(all_balances)} wallets so far)", file=sys.stderr)

            resp = requests.get(url, headers=headers, timeout=60)

            # Handle rate limiting
            if resp.status_code == 429:
                retry_after = int(resp.headers.get('Retry-After', 60))
                print(f"⚠️ Rate limited, waiting {retry_after}s...", file=sys.stderr)
                time.sleep(retry_after)
                continue

            resp.raise_for_status()
            data = resp.json()

            accounts = data.get("data", [])
            if not accounts:
                print(f"✅ No more accounts on page {page}", file=sys.stderr)
                break

            for acc in accounts:
                # Convert from rao to TAO (1 TAO = 1e9 rao)
                balance = float(acc.get("balance_total", 0)) / 1e9
                if balance > 0:  # Only count non-zero balances
                    all_balances.append(balance)
                # Track last rank to estimate total
                rank = acc.get("rank", 0)
                if rank > last_rank:
                    last_rank = rank

            # Get total from pagination (if available)
            pagination = data.get("pagination", {})
            api_total = pagination.get("total_count", 0)

            # Use API total if available and reasonable, otherwise estimate
            # @RBS_HODL shows ~195k wallets as of Nov 2025
            if api_total > len(all_balances):
                total_wallet_count = api_total
            elif last_rank > len(all_balances):
                total_wallet_count = last_rank
            else:
                # Fallback estimate based on known data
                total_wallet_count = 200000

            if page >= pagination.get("total_pages", max_pages):
                print(f"✅ Reached last page", file=sys.stderr)
                break

            page += 1

            # Rate limit: 5 requests/min = 12s between, use 13s to be safe
            if page <= max_pages:
                print(f"   ⏳ Rate limit pause (13s)...", file=sys.stderr)
                time.sleep(13)

        print(f"✅ Fetched {len(all_balances)} wallets (estimated total: {total_wallet_count:,})", file=sys.stderr)
        return sorted(all_balances, reverse=True)

    except Exception as e:
        print(f"❌ Failed to fetch accounts: {e}", file=sys.stderr)
        return None


def calculate_brackets(balances, total_network_wallets):
    """Calculate wallet counts per bracket using fetched sample."""
    brackets = {}
    sample_size = len(balances)

    for threshold in BRACKETS:
        count = sum(1 for b in balances if b > threshold)
        # Percentage is of total network wallets, not just sample
        brackets[str(threshold)] = {
            "threshold": threshold,
            "count": count,
            "percentage": round(count / total_network_wallets * 100, 2) if total_network_wallets > 0 else 0
        }

    return brackets


def calculate_percentiles(balances, total_network_wallets):
    """
    Calculate TAO required for each percentile.
    Uses total network wallet count for accurate percentile calculation.
    """
    percentiles = {}
    sample_size = len(balances)

    for p in PERCENTILES:
        # Calculate index based on total network wallets
        target_rank = int(total_network_wallets * (p / 100))

        # If target rank is within our sample, we have exact data
        if target_rank < sample_size:
            threshold = balances[target_rank]
        else:
            # Beyond our sample - use last known value or 0
            threshold = balances[-1] if balances else 0

        percentiles[str(p)] = {
            "percentile": p,
            "threshold": round(threshold, 2),
            "wallet_count": target_rank
        }

    return percentiles


def main():
    print("🚀 TAO Distribution Calculator (Hybrid SDK/Taostats)", file=sys.stderr)
    print("=" * 50, file=sys.stderr)

    # Step 1: Try to get total wallet count from SDK (blockchain)
    print("\n📊 Step 1: Fetching wallet count from blockchain...", file=sys.stderr)
    sdk_count = fetch_wallet_count_from_sdk()

    # Step 2: Fetch top wallets from Taostats (for balance data)
    # Dynamically calculate pages needed for Top 10% coverage
    # Based on estimated TOTAL wallets (~195k+), not just staking wallets
    # Formula: ceil(total_wallets * 0.12 / 200) with 12% safety margin
    # Target: Top 10% of ~200k wallets = 20k wallets = 100 pages
    # Runtime: 100 pages × 13s = ~22 min (within 30min timeout)
    estimated_total = 200000
    wallets_needed = int(estimated_total * 0.10)  # 20k for Top 10%
    pages_needed = 100  # Fixed at 100 pages for predictable runtime

    estimated_time = pages_needed * 13 // 60
    print(f"\n📊 Step 2: Fetching top wallets from Taostats...", file=sys.stderr)
    print(f"Dynamic pages: {pages_needed} (~{wallets_needed:,} wallets for Top 10%+)", file=sys.stderr)
    print(f"Rate limit aware: ~{estimated_time} min", file=sys.stderr)
    balances = fetch_wallets(max_pages=pages_needed)

    if not balances:
        print("❌ No wallet data fetched", file=sys.stderr)
        sys.exit(1)

    # Determine total wallets for percentile calculation
    # IMPORTANT: Use Taostats total_count (ALL wallets with balance)
    # NOT SDK NumStakingColdkeys (only staking wallets)
    # @RBS_HODL uses ~195k total wallets, not ~43k staking wallets
    if total_wallet_count > 0:
        total_wallets = total_wallet_count
        total_source = "taostats"
        print(f"✅ Using Taostats total wallet count: {total_wallets:,}", file=sys.stderr)
    else:
        # Fallback estimate based on @RBS_HODL data (~195k as of Nov 2025)
        total_wallets = 195000
        total_source = "estimate"
        print(f"⚠️ Using estimated wallet count: {total_wallets:,}", file=sys.stderr)

    # SDK staking count is additional info, not for percentile calculation
    if sdk_count and sdk_count > 0:
        print(f"ℹ️  SDK staking wallets: {sdk_count:,} (subset of total)", file=sys.stderr)

    # Calculate brackets
    brackets = calculate_brackets(balances, total_wallets)

    # Calculate percentiles
    percentiles = calculate_percentiles(balances, total_wallets)

    # Build result
    now_iso = datetime.now(timezone.utc).isoformat()
    result = {
        "total_wallets": total_wallets,
        "total_wallets_source": total_source,  # "taostats" or "estimate"
        "staking_wallets": sdk_count if sdk_count else None,  # SDK NumStakingColdkeys
        "sample_size": len(balances),
        "percentiles": percentiles,
        "brackets": brackets,
        "_source": "taostats",
        "_timestamp": now_iso,
        "last_updated": now_iso
    }

    # Save to file
    output_file = "distribution.json"
    with open(output_file, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\n✅ Distribution written to {output_file}", file=sys.stderr)

    # Print summary
    print(f"\n📊 TAO Distribution Summary:", file=sys.stderr)
    print(f"   Total network wallets: {total_wallets:,}", file=sys.stderr)
    print(f"   Sample fetched: {len(balances):,}", file=sys.stderr)
    print("-" * 40, file=sys.stderr)

    print("\n🎯 Percentile Thresholds:", file=sys.stderr)
    for p in PERCENTILES:
        data = percentiles[str(p)]
        print(f"  Top {p:>2}%: ≥ {data['threshold']:>10,.2f} TAO ({data['wallet_count']:,} wallets)", file=sys.stderr)

    print("\n📈 Wallet Size Brackets:", file=sys.stderr)
    for threshold in BRACKETS[:8]:  # Show top brackets
        data = brackets[str(threshold)]
        print(f"  > {threshold:>6,}: {data['count']:>6,} wallets ({data['percentage']:>5.2f}%)", file=sys.stderr)

    # Output JSON to stdout
    print(json.dumps(result))


if __name__ == "__main__":
    main()
