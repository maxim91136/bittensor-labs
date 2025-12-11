#!/usr/bin/env python3
"""
Fetch TAO Distribution Statistics from Taostats API.
Calculates holder percentiles and wallet size brackets.

Rate limits: 5 requests/min, 10k requests/month
Strategy: Fetch top 10k wallets (10 pages), run daily
"""

import os
import sys
import json
import time
import requests
from datetime import datetime, timezone

TAOSTATS_API_KEY = os.getenv('TAOSTATS_API_KEY')
ACCOUNT_URL = "https://api.taostats.io/api/account/latest/v1"

# Brackets matching @RBS_HODL format
BRACKETS = [100000, 50000, 10000, 1000, 500, 250, 100, 50, 25, 10, 5, 1, 0.1]
PERCENTILES = [10, 5, 3, 1]  # Top X%

# Global to store total wallet count from API
total_wallet_count = 0


def fetch_wallets(max_pages=10, page_size=1000):
    """
    Fetch wallets from Taostats API with pagination.
    Returns sorted list of balances (TAO, descending).

    Uses 10 pages × 1000 = 10k wallets, enough for percentiles.
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

            # Get total from pagination
            pagination = data.get("pagination", {})
            total_wallet_count = pagination.get("total_count", len(all_balances))

            if page >= pagination.get("total_pages", 1):
                print(f"✅ Reached last page", file=sys.stderr)
                break

            page += 1

            # Rate limit: 5 requests/min = 12s between, use 13s to be safe
            if page <= max_pages:
                print(f"   ⏳ Rate limit pause (13s)...", file=sys.stderr)
                time.sleep(13)

        print(f"✅ Fetched {len(all_balances)} wallets (total in network: {total_wallet_count:,})", file=sys.stderr)
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
    print("🚀 TAO Distribution Calculator", file=sys.stderr)
    print("=" * 40, file=sys.stderr)
    print("Rate limit aware: 10 pages, 13s between requests", file=sys.stderr)
    print("=" * 40, file=sys.stderr)

    # Fetch wallets (10 pages = 10k wallets max)
    balances = fetch_wallets(max_pages=10)

    if not balances:
        print("❌ No wallet data fetched", file=sys.stderr)
        sys.exit(1)

    # Use global total from API for accurate percentages
    total_wallets = total_wallet_count if total_wallet_count > 0 else len(balances)

    # Calculate brackets
    brackets = calculate_brackets(balances, total_wallets)

    # Calculate percentiles
    percentiles = calculate_percentiles(balances, total_wallets)

    # Build result
    now_iso = datetime.now(timezone.utc).isoformat()
    result = {
        "total_wallets": total_wallets,
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
