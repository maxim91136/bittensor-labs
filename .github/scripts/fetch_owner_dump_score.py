#!/usr/bin/env python3
"""
Owner Dump Score Tracker

Tracks subnet owner wallet activity to identify potential dump patterns.
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

# API Configuration
TAOSTATS_API_KEY = os.getenv('TAOSTATS_API_KEY')
TRANSFER_URL = "https://api.taostats.io/api/transfer/v1"
STAKE_URL = "https://api.taostats.io/api/dtao/stake_balance/latest/v1"

# Cloudflare KV
CF_ACCOUNT_ID = os.getenv('CF_ACCOUNT_ID')
CF_API_TOKEN = os.getenv('CF_API_TOKEN')
CF_METRICS_NAMESPACE_ID = os.getenv('CF_METRICS_NAMESPACE_ID')

# Known exchange addresses (for detecting dumps to CEX)
KNOWN_EXCHANGES = {
    "5Hd2ze5ug8n1bo3UCAcQsf66VNjKqGos8u6apNfzcU86pg4N": "Binance",
    "5FZiuxCBt8p6PFDisJ9ZEbBaKNVKy6TeemVJd1Z6jscsdjib": "Kucoin",
    "5C5FQQSfuxgJc5sHjjAL9RKAzR98qqCV2YN5xAm2wVf1ctGR": "Kraken",
    "5GjG97YKBxwFoWkhMNXP9CoqVKLqCHgq16xQCJPVmYLhGS8e": "Bitget",
    "5DRrDe5RYmjNCKXQQWXLSGrWK4HN5d7qvhRPcBdNaUVz9sCB": "MEXC",
    "5GNJqTPyNqANBkUVMN1LPPrxXnFouWXoe2wNSmmEoLctxiZY": "OKX",
}

# User's holdings - netuids to track
USER_HOLDINGS = [
    {"netuid": 8, "name": "Vanta"},
    {"netuid": 64, "name": "Chutes"},
    {"netuid": 120, "name": "Affine"},
    {"netuid": 62, "name": "Ridges"},
    {"netuid": 29, "name": "Coldint"},
    {"netuid": 68, "name": "NOVA"},
    {"netuid": 60, "name": "Bitsec.ai"},
    {"netuid": 85, "name": "Vidaio"},
    {"netuid": 76, "name": "Safe Scan"},
    {"netuid": 67, "name": "τenex"},
]

OWNER_TAKE_PERCENT = 0.18  # 18% owner take


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


def get_subnet_data() -> dict:
    """Get subnet data from KV including owner addresses."""
    top_subnets = read_from_kv("top_subnets")
    if not top_subnets:
        print("❌ Could not read top_subnets from KV", file=sys.stderr)
        return {}

    subnet_map = {}
    for s in top_subnets.get("top_subnets", []):
        netuid = s.get("netuid")
        if netuid:
            raw = s.get("taostats_raw", {})
            subnet_map[netuid] = {
                "name": s.get("subnet_name"),
                "emission_daily": s.get("estimated_emission_daily", 0),
                "owner": raw.get("owner", {}).get("ss58"),
                "owner_hotkey": raw.get("owner_hotkey", {}).get("ss58"),
                "net_flow_30d": int(raw.get("net_flow_30_days", 0)) / 1e9,  # Convert to TAO
                "net_flow_7d": int(raw.get("net_flow_7_days", 0)) / 1e9,
                "net_flow_1d": int(raw.get("net_flow_1_day", 0)) / 1e9,
            }

    return subnet_map


def fetch_wallet_transfers(address: str, days: int = 30) -> list:
    """Fetch transfer history for a wallet."""
    if not TAOSTATS_API_KEY:
        print("⚠️ TAOSTATS_API_KEY not set", file=sys.stderr)
        return []

    try:
        # Fetch transfers FROM this address (outflows)
        url = f"{TRANSFER_URL}?from={address}&limit=100"
        resp = requests.get(url, headers=get_headers(), timeout=30)

        if resp.status_code == 429:
            print(f"⚠️ Rate limited for {address[:10]}...", file=sys.stderr)
            return []

        if not resp.ok:
            print(f"⚠️ Transfer fetch failed: {resp.status_code}", file=sys.stderr)
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


def analyze_transfers(transfers: list) -> dict:
    """Analyze transfer patterns."""
    total_out = 0
    to_exchange = 0
    exchange_names = []
    transfer_count = 0

    for t in transfers:
        amount = float(t.get("amount", 0)) / 1e9  # Convert to TAO
        to_addr = t.get("to", {}).get("ss58", "")

        total_out += amount
        transfer_count += 1

        # Check if destination is known exchange
        if to_addr in KNOWN_EXCHANGES:
            to_exchange += amount
            exchange_names.append(KNOWN_EXCHANGES[to_addr])

    return {
        "total_outflow_tao": round(total_out, 2),
        "to_exchange_tao": round(to_exchange, 2),
        "exchange_percent": round(to_exchange / total_out * 100, 1) if total_out > 0 else 0,
        "transfer_count": transfer_count,
        "exchanges_used": list(set(exchange_names)),
    }


def calculate_dump_score(owner_data: dict, emission_daily: float, days: int = 30) -> dict:
    """
    Calculate Owner Dump Score.

    Score interpretation:
    - 0-30: ✅ Healthy (owner retaining/staking most)
    - 30-70: 🟡 Moderate (partial selling, normal for business)
    - 70-100: 🟠 High (selling most of take)
    - 100+: 🔴 Aggressive (selling more than take = unstaking too)
    """
    owner_take_30d = emission_daily * OWNER_TAKE_PERCENT * days
    total_outflow = owner_data.get("total_outflow_tao", 0)

    if owner_take_30d > 0:
        dump_ratio = (total_outflow / owner_take_30d) * 100
    else:
        dump_ratio = 0

    # Classify
    if dump_ratio <= 30:
        status = "healthy"
        emoji = "✅"
        description = "Owner retaining most of emission take"
    elif dump_ratio <= 70:
        status = "moderate"
        emoji = "🟡"
        description = "Partial selling - normal for business operations"
    elif dump_ratio <= 100:
        status = "high"
        emoji = "🟠"
        description = "Selling most of owner take"
    else:
        status = "aggressive"
        emoji = "🔴"
        description = "Selling more than 18% take - unstaking or additional sources"

    return {
        "score": round(dump_ratio, 1),
        "status": status,
        "emoji": emoji,
        "description": description,
        "owner_take_30d_tao": round(owner_take_30d, 2),
        "actual_outflow_tao": round(total_outflow, 2),
        "to_exchange_tao": owner_data.get("to_exchange_tao", 0),
        "exchange_percent": owner_data.get("exchange_percent", 0),
    }


def analyze_holdings(holdings: list, subnet_map: dict) -> list:
    """Analyze all holdings for dump patterns."""
    results = []

    for holding in holdings:
        netuid = holding["netuid"]
        name = holding["name"]

        print(f"\n📊 Analyzing {name} (SN{netuid})...", file=sys.stderr)

        subnet = subnet_map.get(netuid, {})
        if not subnet:
            print(f"  ⚠️ No subnet data found", file=sys.stderr)
            continue

        owner = subnet.get("owner")
        if not owner:
            print(f"  ⚠️ No owner address found", file=sys.stderr)
            continue

        emission_daily = subnet.get("emission_daily", 0)
        net_flow_30d = subnet.get("net_flow_30d", 0)

        print(f"  Owner: {owner[:12]}...", file=sys.stderr)
        print(f"  Emission: {emission_daily:.2f}τ/day", file=sys.stderr)
        print(f"  Net Flow 30d: {net_flow_30d:+,.0f}τ", file=sys.stderr)

        # Fetch owner transfers
        transfers = fetch_wallet_transfers(owner, days=30)
        print(f"  Transfers found: {len(transfers)}", file=sys.stderr)

        # Analyze transfers
        transfer_analysis = analyze_transfers(transfers)

        # Calculate dump score
        dump_score = calculate_dump_score(transfer_analysis, emission_daily)

        result = {
            "netuid": netuid,
            "name": name,
            "owner": owner,
            "owner_short": f"{owner[:6]}...{owner[-4:]}",
            "emission_daily_tao": round(emission_daily, 2),
            "owner_take_daily_tao": round(emission_daily * OWNER_TAKE_PERCENT, 2),
            "net_flow_30d_tao": round(net_flow_30d, 0),
            "net_flow_7d_tao": round(subnet.get("net_flow_7d", 0), 0),
            "net_flow_1d_tao": round(subnet.get("net_flow_1d", 0), 0),
            "transfers_30d": transfer_analysis,
            "dump_score": dump_score,
        }

        print(f"  {dump_score['emoji']} Dump Score: {dump_score['score']:.1f}% ({dump_score['status']})", file=sys.stderr)

        results.append(result)

    return results


def main():
    print("=" * 60, file=sys.stderr)
    print("🗑️  OWNER DUMP SCORE TRACKER", file=sys.stderr)
    print("   Looking in the trash can...", file=sys.stderr)
    print("=" * 60, file=sys.stderr)

    # Get subnet data from KV
    print("\n📥 Loading subnet data...", file=sys.stderr)
    subnet_map = get_subnet_data()

    if not subnet_map:
        print("❌ No subnet data available", file=sys.stderr)
        sys.exit(1)

    print(f"✅ Loaded {len(subnet_map)} subnets", file=sys.stderr)

    # Analyze user holdings
    results = analyze_holdings(USER_HOLDINGS, subnet_map)

    # Sort by dump score (highest first = most suspicious)
    results.sort(key=lambda x: x.get("dump_score", {}).get("score", 0), reverse=True)

    # Build output
    output = {
        "_timestamp": datetime.now(timezone.utc).isoformat(),
        "_source": "owner-dump-tracker",
        "holdings_analyzed": len(results),
        "owner_take_percent": OWNER_TAKE_PERCENT * 100,
        "analysis_period_days": 30,
        "holdings": results,
        "summary": {
            "healthy": len([r for r in results if r["dump_score"]["status"] == "healthy"]),
            "moderate": len([r for r in results if r["dump_score"]["status"] == "moderate"]),
            "high": len([r for r in results if r["dump_score"]["status"] == "high"]),
            "aggressive": len([r for r in results if r["dump_score"]["status"] == "aggressive"]),
        }
    }

    # Print summary
    print("\n" + "=" * 60, file=sys.stderr)
    print("📊 DUMP SCORE SUMMARY", file=sys.stderr)
    print("=" * 60, file=sys.stderr)

    for r in results:
        ds = r["dump_score"]
        print(f"{ds['emoji']} {r['name']:15} Score: {ds['score']:6.1f}%  ({ds['status']})", file=sys.stderr)

    print("\n" + "-" * 60, file=sys.stderr)
    s = output["summary"]
    print(f"✅ Healthy: {s['healthy']}  🟡 Moderate: {s['moderate']}  🟠 High: {s['high']}  🔴 Aggressive: {s['aggressive']}", file=sys.stderr)

    # Write to KV
    json_data = json.dumps(output, indent=2)
    if write_to_kv("owner_dump_scores", json_data):
        print("\n✅ Results written to KV: owner_dump_scores", file=sys.stderr)

    # Output JSON
    print(json_data)


if __name__ == "__main__":
    main()
