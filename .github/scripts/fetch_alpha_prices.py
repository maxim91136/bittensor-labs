#!/usr/bin/env python3
"""
Fetch Alpha Token prices and pool data directly from Bittensor blockchain.
Uses the official Bittensor SDK to get real-time subnet alpha data.

Data includes:
- Alpha token price (in TAO)
- TAO in pool
- Alpha in pool
- Subnet name
"""
import os
import sys
import json
import asyncio
from datetime import datetime, timezone

# Try to import bittensor SDK
try:
    import bittensor as bt
    from bittensor.core.subtensor import Subtensor
except ImportError:
    print("❌ Bittensor SDK not installed. Run: pip install bittensor", file=sys.stderr)
    sys.exit(1)

# Try requests for KV upload
try:
    import requests
except ImportError:
    print("❌ requests not installed. Run: pip install requests", file=sys.stderr)
    sys.exit(1)


# Configuration
NETWORK = os.getenv('NETWORK', 'finney')
CF_ACCOUNT_ID = os.getenv('CF_ACCOUNT_ID')
CF_API_TOKEN = os.getenv('CF_API_TOKEN')
CF_METRICS_NAMESPACE_ID = os.getenv('CF_METRICS_NAMESPACE_ID')


def write_to_kv(key: str, value: str) -> bool:
    """Write data to Cloudflare KV"""
    if not all([CF_ACCOUNT_ID, CF_API_TOKEN, CF_METRICS_NAMESPACE_ID]):
        print("⚠️ KV credentials not set, skipping KV write", file=sys.stderr)
        return False

    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/storage/kv/namespaces/{CF_METRICS_NAMESPACE_ID}/values/{key}"
    headers = {
        "Authorization": f"Bearer {CF_API_TOKEN}",
        "Content-Type": "application/json"
    }

    try:
        resp = requests.put(url, headers=headers, data=value, timeout=30)
        if resp.status_code == 200:
            print(f"✅ Wrote {key} to KV")
            return True
        else:
            print(f"❌ KV write failed: {resp.status_code} - {resp.text}", file=sys.stderr)
            return False
    except Exception as e:
        print(f"❌ KV write error: {e}", file=sys.stderr)
        return False


def fetch_alpha_data():
    """Fetch all subnet alpha data from chain"""
    print(f"🔗 Connecting to {NETWORK}...")

    try:
        # Initialize subtensor connection
        sub = Subtensor(network=NETWORK)
        print(f"✅ Connected to {NETWORK}")

        # Get all subnets
        print("📊 Fetching all subnets...")
        all_subnets = sub.get_all_subnets_info()

        if not all_subnets:
            print("❌ No subnet data returned", file=sys.stderr)
            return None

        print(f"✅ Found {len(all_subnets)} subnets")

        # Process subnet data
        alpha_data = {
            "_timestamp": datetime.now(timezone.utc).isoformat(),
            "_source": "bittensor-sdk",
            "_network": NETWORK,
            "subnets": []
        }

        for netuid, subnet in all_subnets.items():
            try:
                # Extract alpha token data
                # The structure may vary based on SDK version
                subnet_info = {
                    "netuid": netuid,
                    "name": getattr(subnet, 'subnet_name', f'Subnet {netuid}') or f'Subnet {netuid}',
                }

                # Try to get price (alpha token price in TAO)
                if hasattr(subnet, 'price'):
                    price = float(subnet.price) if subnet.price else 0
                    subnet_info["alpha_price"] = price
                    subnet_info["alpha_price_usd"] = None  # Would need TAO price to calculate

                # Try to get pool data
                if hasattr(subnet, 'tao_in'):
                    tao_in = subnet.tao_in.tao if hasattr(subnet.tao_in, 'tao') else float(subnet.tao_in) / 1e9
                    subnet_info["tao_in_pool"] = tao_in

                if hasattr(subnet, 'alpha_in'):
                    alpha_in = subnet.alpha_in.tao if hasattr(subnet.alpha_in, 'tao') else float(subnet.alpha_in) / 1e9
                    subnet_info["alpha_in_pool"] = alpha_in

                # Calculate liquidity if we have both
                if "tao_in_pool" in subnet_info and "alpha_in_pool" in subnet_info:
                    subnet_info["pool_liquidity_tao"] = subnet_info["tao_in_pool"] * 2  # Approximate

                # Only include subnets with valid price data
                if subnet_info.get("alpha_price", 0) > 0:
                    alpha_data["subnets"].append(subnet_info)

            except Exception as e:
                print(f"⚠️ Error processing subnet {netuid}: {e}", file=sys.stderr)
                continue

        # Sort by alpha price descending
        alpha_data["subnets"].sort(key=lambda x: x.get("alpha_price", 0), reverse=True)
        alpha_data["total_subnets"] = len(alpha_data["subnets"])

        print(f"✅ Processed {alpha_data['total_subnets']} subnets with alpha price data")

        return alpha_data

    except Exception as e:
        print(f"❌ Failed to fetch alpha data: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return None


def main():
    """Main entry point"""
    print("=" * 50)
    print("🚀 Bittensor Alpha Prices Fetcher")
    print("=" * 50)

    # Fetch data from chain
    alpha_data = fetch_alpha_data()

    if not alpha_data:
        print("❌ Failed to fetch alpha data", file=sys.stderr)
        sys.exit(1)

    # Convert to JSON
    json_data = json.dumps(alpha_data, indent=2)

    # Print summary
    print("\n📊 Summary:")
    print(f"   Total subnets: {alpha_data['total_subnets']}")

    if alpha_data['subnets']:
        top_5 = alpha_data['subnets'][:5]
        print("\n   Top 5 by Alpha Price:")
        for s in top_5:
            price = s.get('alpha_price', 0)
            name = s.get('name', f"SN{s['netuid']}")
            print(f"      #{s['netuid']} {name}: τ{price:.6f}")

    # Write to KV
    write_to_kv("alpha_prices", json_data)

    # Also output JSON for debugging
    print("\n✅ Alpha prices fetch complete")

    # Write to local file for debugging (optional)
    if os.getenv('DEBUG'):
        with open('/tmp/alpha_prices.json', 'w') as f:
            f.write(json_data)
        print("📁 Debug output written to /tmp/alpha_prices.json")


if __name__ == "__main__":
    main()
