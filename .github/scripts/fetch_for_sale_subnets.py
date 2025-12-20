#!/usr/bin/env python3
"""
Fetch subnets that are "For Sale" by detecting scheduled coldkey swaps.

A subnet is considered "For Sale" if the owner has scheduled a coldkey swap,
which means they're transferring ownership to a buyer.

Uses Bittensor SDK to query on-chain data directly - no API costs.
"""
import os
import sys
import json
import asyncio
from datetime import datetime, timezone

# Try to import bittensor SDK
try:
    import bittensor as bt
    from bittensor import AsyncSubtensor
except ImportError:
    try:
        from bittensor.core.async_subtensor import AsyncSubtensor
    except ImportError:
        print("Bittensor SDK not installed. Run: pip install bittensor", file=sys.stderr)
        sys.exit(1)

try:
    import requests
except ImportError:
    print("requests not installed. Run: pip install requests", file=sys.stderr)
    sys.exit(1)

# Configuration
NETWORK = os.getenv('NETWORK', 'finney')
CF_ACCOUNT_ID = os.getenv('CF_ACCOUNT_ID')
CF_API_TOKEN = os.getenv('CF_API_TOKEN')
CF_METRICS_NAMESPACE_ID = os.getenv('CF_METRICS_NAMESPACE_ID')


def write_to_kv(key: str, value: str) -> bool:
    """Write data to Cloudflare KV"""
    if not all([CF_ACCOUNT_ID, CF_API_TOKEN, CF_METRICS_NAMESPACE_ID]):
        print("KV credentials not set, skipping KV write", file=sys.stderr)
        return False

    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/storage/kv/namespaces/{CF_METRICS_NAMESPACE_ID}/values/{key}"
    headers = {
        "Authorization": f"Bearer {CF_API_TOKEN}",
        "Content-Type": "application/json"
    }

    try:
        resp = requests.put(url, headers=headers, data=value, timeout=30)
        if resp.status_code == 200:
            print(f"Wrote {key} to KV", file=sys.stderr)
            return True
        else:
            print(f"KV write failed: {resp.status_code} - {resp.text}", file=sys.stderr)
            return False
    except Exception as e:
        print(f"KV write error: {e}", file=sys.stderr)
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
        print(f"KV read error: {e}", file=sys.stderr)
    return None


async def get_all_subnet_owners(subtensor: AsyncSubtensor) -> dict:
    """Get all subnet netuids and their owner coldkeys."""
    print("Fetching all subnet owners...", file=sys.stderr)

    subnet_owners = {}

    try:
        # Get all netuids
        netuids = await subtensor.get_all_subnet_netuids()
        print(f"Found {len(netuids)} subnets", file=sys.stderr)

        for netuid in netuids:
            if netuid == 0:  # Skip root network
                continue
            try:
                owner = await subtensor.get_subnet_owner(netuid)
                if owner:
                    subnet_owners[netuid] = owner
            except Exception as e:
                print(f"Error getting owner for SN{netuid}: {e}", file=sys.stderr)

    except Exception as e:
        print(f"Error fetching subnets: {e}", file=sys.stderr)

    return subnet_owners


async def check_coldkey_swap_scheduled(subtensor: AsyncSubtensor, coldkey: str) -> dict | None:
    """Check if a coldkey has a scheduled swap."""
    try:
        # Query the chain directly for ColdkeySwapScheduled storage
        result = await subtensor.substrate.query(
            module='SubtensorModule',
            storage_function='ColdkeySwapScheduled',
            params=[coldkey]
        )

        if result and result.value:
            return {
                "scheduled": True,
                "data": result.value
            }
    except Exception as e:
        # Not all SDK versions support this query
        print(f"Could not check swap for {coldkey[:8]}...: {e}", file=sys.stderr)

    return None


async def main():
    print("=" * 50, file=sys.stderr)
    print("FOR SALE SUBNET DETECTOR", file=sys.stderr)
    print("Checking for scheduled coldkey swaps...", file=sys.stderr)
    print("=" * 50, file=sys.stderr)

    # Connect to Bittensor
    print(f"\nConnecting to {NETWORK}...", file=sys.stderr)
    subtensor = AsyncSubtensor(network=NETWORK)

    async with subtensor:
        # Get all subnet owners
        subnet_owners = await get_all_subnet_owners(subtensor)
        print(f"\nGot {len(subnet_owners)} subnet owners", file=sys.stderr)

        # Check each owner for scheduled swaps
        for_sale_subnets = []

        for netuid, owner in subnet_owners.items():
            swap_info = await check_coldkey_swap_scheduled(subtensor, owner)

            if swap_info and swap_info.get("scheduled"):
                print(f"FOR SALE: SN{netuid} (owner: {owner[:8]}...)", file=sys.stderr)
                for_sale_subnets.append({
                    "netuid": netuid,
                    "owner": owner,
                    "swap_data": swap_info.get("data")
                })

    # Get subnet names from KV
    top_subnets = read_from_kv("top_subnets")
    subnet_names = {}
    if top_subnets:
        for s in top_subnets.get("top_subnets", []):
            subnet_names[s.get("netuid")] = s.get("subnet_name", f"SN{s.get('netuid')}")

    # Enrich with names
    for subnet in for_sale_subnets:
        subnet["name"] = subnet_names.get(subnet["netuid"], f"SN{subnet['netuid']}")

    # Build output
    output = {
        "_timestamp": datetime.now(timezone.utc).isoformat(),
        "_source": "for-sale-detector",
        "count": len(for_sale_subnets),
        "subnets": for_sale_subnets,
        "netuids": [s["netuid"] for s in for_sale_subnets]
    }

    # Print summary
    print("\n" + "=" * 50, file=sys.stderr)
    print(f"RESULTS: {len(for_sale_subnets)} subnets FOR SALE", file=sys.stderr)
    print("=" * 50, file=sys.stderr)

    for s in for_sale_subnets:
        print(f"  - {s['name']} (SN{s['netuid']})", file=sys.stderr)

    # Write to KV
    json_data = json.dumps(output, indent=2)
    if write_to_kv("for_sale_subnets", json_data):
        print("\nResults written to KV: for_sale_subnets", file=sys.stderr)

    print(json_data)


if __name__ == "__main__":
    asyncio.run(main())
