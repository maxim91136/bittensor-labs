#!/usr/bin/env python3
"""
Temporary script: Fetch Owner Dump Score for specific subnets only.
Target: SN85 (Vidaio) and SN76 (Safe Scan)
"""

import os
import sys
import json
import requests
from datetime import datetime, timezone, timedelta
import time

TAOSTATS_API_KEY = os.getenv('TAOSTATS_API_KEY')
TRANSFER_URL = "https://api.taostats.io/api/transfer/v1"

CF_ACCOUNT_ID = os.getenv('CF_ACCOUNT_ID')
CF_API_TOKEN = os.getenv('CF_API_TOKEN')
CF_METRICS_NAMESPACE_ID = os.getenv('CF_METRICS_NAMESPACE_ID')

# Target subnets
TARGET_NETUIDS = [85, 76]

OWNER_TAKE_PERCENT = 0.18
MAX_RETRIES = 3
RETRY_DELAY = 15

KNOWN_EXCHANGES = {
    "5Hd2ze5ug8n1bo3UCAcQsf66VNjKqGos8u6apNfzcU86pg4N": "Binance",
    "5GZe8MrVxSqRMRfnMz5TnxNS3Q7M6g3gNfSCqvZQCxbKFZBJ": "Binance",
    "5FZiuxCBt8p6PFDisJ9ZEbBaKNVKy6TeemVJd1Z6jscsdjib": "Kucoin",
    "5C5FQQSfuxgJc5sHjjAL9RKAzR98qqCV2YN5xAm2wVf1ctGR": "Kraken",
    "5GjG97YKBxwFoWkhMNXP9CoqVKLqCHgq16xQCJPVmYLhGS8e": "Bitget",
    "5DRrDe5RYmjNCKXQQWXLSGrWK4HN5d7qvhRPcBdNaUVz9sCB": "MEXC",
    "5GNJqTPyNqANBkUVMN1LPPrxXnFouWXoe2wNSmmEoLctxiZY": "OKX",
    "5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw": "Gate.io",
    "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty": "Bybit",
}


def get_headers():
    return {
        "accept": "application/json",
        "Authorization": TAOSTATS_API_KEY
    }


def read_from_kv(key: str):
    if not all([CF_ACCOUNT_ID, CF_API_TOKEN, CF_METRICS_NAMESPACE_ID]):
        return None
    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/storage/kv/namespaces/{CF_METRICS_NAMESPACE_ID}/values/{key}"
    headers = {"Authorization": f"Bearer {CF_API_TOKEN}"}
    try:
        resp = requests.get(url, headers=headers, timeout=30)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        print(f"⚠️ KV read error: {e}", file=sys.stderr)
    return None


def fetch_wallet_transfers_with_retry(address: str, days: int = 30) -> list:
    """Fetch transfers with retry logic."""
    if not TAOSTATS_API_KEY:
        return []

    url = f"{TRANSFER_URL}?from={address}&limit=100"

    for attempt in range(MAX_RETRIES):
        try:
            resp = requests.get(url, headers=get_headers(), timeout=30)

            if resp.status_code == 429:
                if attempt < MAX_RETRIES - 1:
                    wait_time = RETRY_DELAY * (attempt + 1)
                    print(f"⚠️ Rate limited, waiting {wait_time}s ({attempt+2}/{MAX_RETRIES})...", file=sys.stderr)
                    time.sleep(wait_time)
                    continue
                else:
                    print(f"❌ Still rate limited after {MAX_RETRIES} attempts", file=sys.stderr)
                    return []

            if not resp.ok:
                print(f"❌ HTTP {resp.status_code}", file=sys.stderr)
                return []

            data = resp.json()
            transfers = data.get("data", [])

            # Filter to last N days
            cutoff = datetime.now(timezone.utc) - timedelta(days=days)
            recent = []
            for t in transfers:
                ts = t.get("timestamp", "")
                try:
                    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    if dt >= cutoff:
                        recent.append(t)
                except:
                    pass

            return recent

        except Exception as e:
            if attempt < MAX_RETRIES - 1:
                wait_time = RETRY_DELAY * (attempt + 1)
                print(f"⚠️ Error: {e}, retrying in {wait_time}s...", file=sys.stderr)
                time.sleep(wait_time)
            else:
                print(f"❌ Failed after {MAX_RETRIES} attempts: {e}", file=sys.stderr)
                return []

    return []


def analyze_owner(subnet: dict) -> dict:
    owner = subnet["owner"]
    emission_daily = subnet["emission_daily"]
    owner_take_30d = emission_daily * OWNER_TAKE_PERCENT * 30

    transfers = fetch_wallet_transfers_with_retry(owner, days=30)

    total_out = 0
    to_exchange = 0
    exchanges_used = set()

    for t in transfers:
        amount = float(t.get("amount", 0)) / 1e9
        to_addr = t.get("to", {}).get("ss58", "")
        total_out += amount
        if to_addr in KNOWN_EXCHANGES:
            to_exchange += amount
            exchanges_used.add(KNOWN_EXCHANGES[to_addr])

    if owner_take_30d > 0:
        dump_score = (total_out / owner_take_30d) * 100
    else:
        dump_score = 0

    if dump_score <= 30:
        status = "healthy"
        emoji = "✅"
    elif dump_score <= 70:
        status = "moderate"
        emoji = "🟡"
    elif dump_score <= 100:
        status = "high"
        emoji = "🟠"
    else:
        status = "aggressive"
        emoji = "🔴"

    return {
        "netuid": subnet["netuid"],
        "name": subnet["name"],
        "owner_short": f"{owner[:6]}...{owner[-4:]}",
        "emission_daily_tao": round(emission_daily, 2),
        "owner_take_30d_tao": round(owner_take_30d, 2),
        "owner_outflow_30d_tao": round(total_out, 2),
        "to_exchange_tao": round(to_exchange, 2),
        "exchange_percent": round(to_exchange / total_out * 100, 1) if total_out > 0 else 0,
        "exchanges_used": list(exchanges_used),
        "transfer_count": len(transfers),
        "dump_score": round(dump_score, 1),
        "dump_status": status,
        "dump_emoji": emoji,
    }


def main():
    print("=" * 50, file=sys.stderr)
    print("🎯 TARGETED DUMP SCORE CHECK", file=sys.stderr)
    print(f"   Subnets: {TARGET_NETUIDS}", file=sys.stderr)
    print("=" * 50, file=sys.stderr)

    if not TAOSTATS_API_KEY:
        print("❌ TAOSTATS_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    # Get subnet data from KV
    top_subnets = read_from_kv("top_subnets")
    if not top_subnets:
        print("❌ Could not read top_subnets from KV", file=sys.stderr)
        sys.exit(1)

    # Find target subnets
    targets = []
    for s in top_subnets.get("top_subnets", []):
        netuid = s.get("netuid")
        if netuid in TARGET_NETUIDS:
            raw = s.get("taostats_raw", {})
            owner = raw.get("owner", {}).get("ss58")
            emission = s.get("estimated_emission_daily", 0)
            if owner:
                targets.append({
                    "netuid": netuid,
                    "name": s.get("subnet_name", f"SN{netuid}"),
                    "owner": owner,
                    "emission_daily": emission,
                })

    print(f"\n📊 Found {len(targets)} target subnets", file=sys.stderr)

    results = []
    for subnet in targets:
        print(f"\n🔍 {subnet['name']} (SN{subnet['netuid']})...", file=sys.stderr)
        result = analyze_owner(subnet)
        results.append(result)
        print(f"   {result['dump_emoji']} Score: {result['dump_score']:.1f}% | "
              f"Out: {result['owner_outflow_30d_tao']:.0f}τ | "
              f"CEX: {result['exchange_percent']:.0f}%", file=sys.stderr)
        time.sleep(5)  # Extra delay between requests

    # Output
    output = {
        "_timestamp": datetime.now(timezone.utc).isoformat(),
        "results": results
    }

    print("\n" + "=" * 50, file=sys.stderr)
    print("📊 RESULTS", file=sys.stderr)
    print("=" * 50, file=sys.stderr)
    for r in results:
        print(f"{r['dump_emoji']} {r['name']:20} | Score: {r['dump_score']:6.1f}% | Out: {r['owner_outflow_30d_tao']:6.0f}τ", file=sys.stderr)

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
