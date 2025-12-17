#!/usr/bin/env python3
"""
Fetch Alpha Token prices and pool data directly from Bittensor blockchain.
Uses the official Bittensor SDK async methods to get real-time subnet alpha data.

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
    # SDK v10 uses PascalCase imports from bittensor directly
    from bittensor import AsyncSubtensor
except ImportError:
    try:
        # Fallback for older SDK versions
        from bittensor.core.async_subtensor import AsyncSubtensor
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


def read_from_kv(key: str) -> dict | None:
    """Read data from Cloudflare KV"""
    if not all([CF_ACCOUNT_ID, CF_API_TOKEN, CF_METRICS_NAMESPACE_ID]):
        return None

    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/storage/kv/namespaces/{CF_METRICS_NAMESPACE_ID}/values/{key}"
    headers = {"Authorization": f"Bearer {CF_API_TOKEN}"}

    try:
        resp = requests.get(url, headers=headers, timeout=30)
        if resp.status_code == 200:
            return resp.json()
    except Exception as e:
        print(f"⚠️ KV read error for {key}: {e}", file=sys.stderr)
    return None


def get_emission_map() -> dict:
    """Build emission map from top_subnets KV data"""
    emission_map = {}

    # Try top_subnets first (has taostats_emission_share)
    top_subnets = read_from_kv("top_subnets")
    if top_subnets and "top_subnets" in top_subnets:
        for s in top_subnets["top_subnets"]:
            netuid = s.get("netuid")
            if netuid:
                emission_map[netuid] = {
                    "emission_share": s.get("taostats_emission_share", 0),
                    "emission_daily": s.get("estimated_emission_daily", 0)
                }
        print(f"✅ Loaded emission data for {len(emission_map)} subnets from top_subnets")

    return emission_map


async def fetch_alpha_data():
    """Fetch all subnet alpha data from chain using async methods"""
    print(f"🔗 Connecting to {NETWORK}...")

    try:
        # Initialize async subtensor connection using context manager
        async with AsyncSubtensor(network=NETWORK) as sub:
            print(f"✅ Connected to {NETWORK}")

            # Get all subnets using async method (this returns DynamicInfo with price data!)
            print("📊 Fetching all subnets with alpha data...")
            all_subnets = await sub.all_subnets()

            if not all_subnets:
                print("❌ No subnet data returned", file=sys.stderr)
                return None

            print(f"✅ Found {len(all_subnets)} subnets")

            # Process subnet data
            alpha_data = {
                "_timestamp": datetime.now(timezone.utc).isoformat(),
                "_source": "bittensor-sdk-async",
                "_network": NETWORK,
                "subnets": []
            }

            # Debug: Print first subnet structure
            if all_subnets:
                first = all_subnets[0]
                print(f"📋 Subnet object type: {type(first)}")
                attrs = [a for a in dir(first) if not a.startswith('_')]
                print(f"📋 Subnet attributes: {attrs[:25]}")

            for subnet in all_subnets:
                try:
                    # Extract netuid
                    netuid = getattr(subnet, 'netuid', None)
                    if netuid is None:
                        continue

                    # Skip root subnet (netuid 0)
                    if netuid == 0:
                        continue

                    # Extract alpha token data
                    subnet_info = {
                        "netuid": netuid,
                        "name": getattr(subnet, 'subnet_name', None) or f'Subnet {netuid}',
                    }

                    # Get price (alpha token price in TAO)
                    if hasattr(subnet, 'price'):
                        try:
                            price = float(subnet.price) if subnet.price else 0
                            subnet_info["alpha_price"] = price
                        except (ValueError, TypeError):
                            subnet_info["alpha_price"] = 0

                    # Get TAO in pool
                    if hasattr(subnet, 'tao_in'):
                        try:
                            tao_in = subnet.tao_in
                            # Handle Balance object
                            if hasattr(tao_in, 'tao'):
                                tao_in = float(tao_in.tao)
                            else:
                                tao_in = float(tao_in) / 1e9 if tao_in > 1e6 else float(tao_in)
                            subnet_info["tao_in_pool"] = tao_in
                        except (ValueError, TypeError):
                            pass

                    # Get Alpha in pool
                    if hasattr(subnet, 'alpha_in'):
                        try:
                            alpha_in = subnet.alpha_in
                            # Handle Balance object
                            if hasattr(alpha_in, 'tao'):
                                alpha_in = float(alpha_in.tao)
                            else:
                                alpha_in = float(alpha_in) / 1e9 if alpha_in > 1e6 else float(alpha_in)
                            subnet_info["alpha_in_pool"] = alpha_in
                        except (ValueError, TypeError):
                            pass

                    # Get Alpha out (total supply)
                    if hasattr(subnet, 'alpha_out'):
                        try:
                            alpha_out = subnet.alpha_out
                            if hasattr(alpha_out, 'tao'):
                                alpha_out = float(alpha_out.tao)
                            else:
                                alpha_out = float(alpha_out) / 1e9 if alpha_out > 1e6 else float(alpha_out)
                            subnet_info["alpha_out"] = alpha_out
                        except (ValueError, TypeError):
                            pass

                    # Calculate liquidity if we have both
                    if "tao_in_pool" in subnet_info and "alpha_in_pool" in subnet_info:
                        subnet_info["pool_liquidity_tao"] = subnet_info["tao_in_pool"] * 2

                    # Calculate market cap (total supply × price, matching industry standard)
                    if subnet_info.get("alpha_price", 0) > 0:
                        total_alpha = subnet_info.get("alpha_in_pool", 0) + subnet_info.get("alpha_out", 0)
                        subnet_info["market_cap_tao"] = subnet_info["alpha_price"] * total_alpha

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
    print("🚀 Bittensor Alpha Prices Fetcher (Async)")
    print("=" * 50)

    # Fetch data from chain using async
    alpha_data = asyncio.run(fetch_alpha_data())

    if not alpha_data:
        print("❌ Failed to fetch alpha data", file=sys.stderr)
        sys.exit(1)

    # Merge emission data from top_subnets KV
    print("\n📊 Merging emission data from KV...")
    emission_map = get_emission_map()

    emission_count = 0
    for subnet in alpha_data.get("subnets", []):
        netuid = subnet.get("netuid")
        if netuid and netuid in emission_map:
            subnet["emission_share"] = emission_map[netuid]["emission_share"]
            subnet["emission_daily"] = emission_map[netuid]["emission_daily"]
            emission_count += 1

    print(f"✅ Merged emission data for {emission_count}/{len(alpha_data.get('subnets', []))} subnets")

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
            emission = s.get('emission_daily', 0)
            print(f"      #{s['netuid']} {name}: τ{price:.6f} (emission: {emission:.2f}τ/day)")

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
