#!/usr/bin/env python3
"""
Owner Dump Score Tracker

Tracks ALL subnet owner wallet activity to identify dump patterns.
Calculates a "Dump Score" based on:
- Owner's 18% emission take
- Actual outflows from owner wallet
- Transfer patterns (to exchanges, etc.)

Red Flags:
- Owner dumping 100% of emission take
- Transfers to known exchange wallets
- Consistent sell patterns
"""

import os
import sys
import json
import requests
from datetime import datetime, timezone, timedelta
from typing import Optional
import time

# API Configuration
TAOSTATS_API_KEY = os.getenv('TAOSTATS_API_KEY')
TRANSFER_URL = "https://api.taostats.io/api/transfer/v1"

# Cloudflare KV
CF_ACCOUNT_ID = os.getenv('CF_ACCOUNT_ID')
CF_API_TOKEN = os.getenv('CF_API_TOKEN')
CF_METRICS_NAMESPACE_ID = os.getenv('CF_METRICS_NAMESPACE_ID')

# Known exchange addresses (for detecting dumps to CEX)
KNOWN_EXCHANGES = {
    # Binance
    "5Hd2ze5ug8n1bo3UCAcQsf66VNjKqGos8u6apNfzcU86pg4N": "Binance",
    "5GZe8MrVxSqRMRfnMz5TnxNS3Q7M6g3gNfSCqvZQCxbKFZBJ": "Binance",
    # Kucoin
    "5FZiuxCBt8p6PFDisJ9ZEbBaKNVKy6TeemVJd1Z6jscsdjib": "Kucoin",
    # Kraken
    "5C5FQQSfuxgJc5sHjjAL9RKAzR98qqCV2YN5xAm2wVf1ctGR": "Kraken",
    # Bitget
    "5GjG97YKBxwFoWkhMNXP9CoqVKLqCHgq16xQCJPVmYLhGS8e": "Bitget",
    # MEXC
    "5DRrDe5RYmjNCKXQQWXLSGrWK4HN5d7qvhRPcBdNaUVz9sCB": "MEXC",
    # OKX
    "5GNJqTPyNqANBkUVMN1LPPrxXnFouWXoe2wNSmmEoLctxiZY": "OKX",
    # Gate.io
    "5HGjWAeFDfFCWPsjFQdVV2Msvz2XtMktvgocEZcCj68kUMaw": "Gate.io",
    # Bybit
    "5FHneW46xGXgs5mUiveU4sbTyGBzmstUspZC92UhjJM694ty": "Bybit",
}

OWNER_TAKE_PERCENT = 0.18  # 18% owner take
MAX_SUBNETS = 150  # Track all subnets (currently ~128 active)


def get_headers():
    """Get API headers with authentication."""
    return {
        "accept": "application/json",
        "Authorization": TAOSTATS_API_KEY
    }


def read_from_kv(key: str) -> Optional[dict]:
    """Read data from Cloudflare KV."""
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


def write_to_kv(key: str, value: str) -> bool:
    """Write data to Cloudflare KV."""
    if not all([CF_ACCOUNT_ID, CF_API_TOKEN, CF_METRICS_NAMESPACE_ID]):
        print("⚠️ KV credentials not set", file=sys.stderr)
        return False

    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/storage/kv/namespaces/{CF_METRICS_NAMESPACE_ID}/values/{key}"
    headers = {
        "Authorization": f"Bearer {CF_API_TOKEN}",
        "Content-Type": "application/json"
    }

    try:
        resp = requests.put(url, headers=headers, data=value, timeout=30)
        return resp.status_code == 200
    except Exception as e:
        print(f"❌ KV write error: {e}", file=sys.stderr)
        return False


def get_all_subnets() -> list:
    """Get all subnets from KV with owner addresses."""
    top_subnets = read_from_kv("top_subnets")
    if not top_subnets:
        print("❌ Could not read top_subnets from KV", file=sys.stderr)
        return []

    subnets = []
    for s in top_subnets.get("top_subnets", []):
        netuid = s.get("netuid")
        raw = s.get("taostats_raw", {})
        owner = raw.get("owner", {}).get("ss58")
        emission = s.get("estimated_emission_daily", 0)

        if netuid and owner and emission > 0:
            subnets.append({
                "netuid": netuid,
                "name": s.get("subnet_name", f"SN{netuid}"),
                "owner": owner,
                "emission_daily": emission,
                "net_flow_30d": int(raw.get("net_flow_30_days", 0)) / 1e9,
                "net_flow_7d": int(raw.get("net_flow_7_days", 0)) / 1e9,
            })

    # Sort by emission (highest first = most important)
    subnets.sort(key=lambda x: x["emission_daily"], reverse=True)
    return subnets[:MAX_SUBNETS]


def fetch_wallet_transfers(address: str, days: int = 30) -> list:
    """Fetch transfer history for a wallet."""
    if not TAOSTATS_API_KEY:
        return []

    try:
        url = f"{TRANSFER_URL}?from={address}&limit=100"
        resp = requests.get(url, headers=get_headers(), timeout=30)

        if resp.status_code == 429:
            print(f"⚠️ Rate limited", file=sys.stderr)
            time.sleep(2)
            return []

        if not resp.ok:
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
        print(f"❌ Transfer fetch error: {e}", file=sys.stderr)
        return []


def analyze_owner(subnet: dict) -> dict:
    """Analyze a single owner's dump behavior."""
    owner = subnet["owner"]
    emission_daily = subnet["emission_daily"]
    owner_take_30d = emission_daily * OWNER_TAKE_PERCENT * 30

    # Fetch transfers
    transfers = fetch_wallet_transfers(owner, days=30)

    # Analyze transfers
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

    # Calculate dump score
    if owner_take_30d > 0:
        dump_score = (total_out / owner_take_30d) * 100
    else:
        dump_score = 0

    # Determine status
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
        "owner": owner,
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
        "net_flow_30d_tao": round(subnet["net_flow_30d"], 0),
        "net_flow_7d_tao": round(subnet["net_flow_7d"], 0),
    }


def main():
    print("=" * 60, file=sys.stderr)
    print("🗑️  OWNER DUMP SCORE TRACKER", file=sys.stderr)
    print("   Tracking ALL subnet owners...", file=sys.stderr)
    print("=" * 60, file=sys.stderr)

    if not TAOSTATS_API_KEY:
        print("❌ TAOSTATS_API_KEY not set", file=sys.stderr)
        sys.exit(1)

    # Get all subnets
    subnets = get_all_subnets()
    print(f"\n📊 Analyzing {len(subnets)} subnets...", file=sys.stderr)

    results = []
    for i, subnet in enumerate(subnets):
        print(f"\n[{i+1}/{len(subnets)}] {subnet['name']} (SN{subnet['netuid']})...", file=sys.stderr)

        result = analyze_owner(subnet)
        results.append(result)

        print(f"  {result['dump_emoji']} Score: {result['dump_score']:.1f}% | "
              f"Out: {result['owner_outflow_30d_tao']:.0f}τ | "
              f"CEX: {result['exchange_percent']:.0f}%", file=sys.stderr)

        # Rate limit protection (Free tier = 5 req/min = 12s between calls)
        time.sleep(12.0)

    # Sort by dump score (worst first)
    results.sort(key=lambda x: x["dump_score"], reverse=True)

    # Build output
    output = {
        "_timestamp": datetime.now(timezone.utc).isoformat(),
        "_source": "owner-dump-tracker",
        "subnets_analyzed": len(results),
        "owner_take_percent": OWNER_TAKE_PERCENT * 100,
        "analysis_period_days": 30,
        "subnets": results,
        "summary": {
            "healthy": len([r for r in results if r["dump_status"] == "healthy"]),
            "moderate": len([r for r in results if r["dump_status"] == "moderate"]),
            "high": len([r for r in results if r["dump_status"] == "high"]),
            "aggressive": len([r for r in results if r["dump_status"] == "aggressive"]),
        }
    }

    # Print summary
    print("\n" + "=" * 60, file=sys.stderr)
    print("📊 DUMP SCORE SUMMARY", file=sys.stderr)
    print("=" * 60, file=sys.stderr)

    # Top 5 worst
    print("\n🔴 TOP 5 DUMPERS:", file=sys.stderr)
    for r in results[:5]:
        print(f"  {r['dump_emoji']} {r['name']:20} Score: {r['dump_score']:6.1f}%  "
              f"CEX: {r['exchange_percent']:.0f}%", file=sys.stderr)

    # Top 5 best
    print("\n✅ TOP 5 HOLDERS:", file=sys.stderr)
    for r in results[-5:][::-1]:
        print(f"  {r['dump_emoji']} {r['name']:20} Score: {r['dump_score']:6.1f}%", file=sys.stderr)

    s = output["summary"]
    print(f"\n✅ Healthy: {s['healthy']}  🟡 Moderate: {s['moderate']}  "
          f"🟠 High: {s['high']}  🔴 Aggressive: {s['aggressive']}", file=sys.stderr)

    # Write to KV
    json_data = json.dumps(output, indent=2)
    if write_to_kv("owner_dump_scores", json_data):
        print("\n✅ Results written to KV: owner_dump_scores", file=sys.stderr)

    print(json_data)


if __name__ == "__main__":
    main()
