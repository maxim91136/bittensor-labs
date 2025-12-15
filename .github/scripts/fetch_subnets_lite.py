#!/usr/bin/env python3
"""
Lightweight subnet fetcher using direct Substrate RPC calls.
No external APIs, no heavy dependencies - just pure on-chain data.

Fallback when Taostats is down or unavailable.
"""
import os
import json
import sys
from datetime import datetime, timezone
import urllib.request
import urllib.error

# Finney RPC endpoint (public)
RPC_URL = os.getenv('RPC_URL', 'wss://entrypoint-finney.opentensor.ai:443')
NETWORK = os.getenv('NETWORK', 'finney')
DAILY_EMISSION = float(os.getenv('DAILY_EMISSION', '7200'))


def rpc_call(method: str, params: list = None) -> dict:
    """Make a JSON-RPC call to Substrate node"""
    if params is None:
        params = []

    # Convert WSS to HTTPS for HTTP RPC (most Substrate nodes support both)
    http_url = RPC_URL.replace('wss://', 'https://').replace(':443', '')
    if not http_url.startswith('http'):
        http_url = f'https://{http_url}'

    payload = {
        'jsonrpc': '2.0',
        'method': method,
        'params': params,
        'id': 1
    }

    try:
        req = urllib.request.Request(
            http_url,
            data=json.dumps(payload).encode('utf-8'),
            headers={'Content-Type': 'application/json'}
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            if 'error' in data:
                raise Exception(f"RPC error: {data['error']}")
            return data.get('result')
    except Exception as e:
        print(f"⚠️ RPC call failed ({method}): {e}", file=sys.stderr)
        return None


def query_storage(module: str, storage: str, params: list = None):
    """Query chain storage via state_getStorage RPC"""
    # Build storage key (simplified - real implementation needs proper SCALE encoding)
    # For now, we'll use state_call which is easier
    return rpc_call('state_call', [f'{module}_{storage}', params or []])


def get_all_subnet_netuids():
    """Get all active subnet IDs from chain"""
    # Try to query SubnetNetworks or similar storage
    # This is a simplified version - may need adjustment based on actual chain metadata
    try:
        result = rpc_call('state_call', ['SubtensorModule_get_all_subnet_netuids', '0x'])
        if result:
            # Parse result (hex encoded SCALE)
            # For now, return hardcoded range as fallback
            # Real implementation would decode SCALE properly
            pass
    except Exception:
        pass

    # Fallback: Try known subnet range (0-255)
    # Filter out inactive ones by trying to query their metagraph
    active_subnets = []
    for netuid in range(256):
        try:
            # Try to get subnet info
            exists = query_subnet_exists(netuid)
            if exists:
                active_subnets.append(netuid)
        except Exception:
            continue

        # Stop if we found some subnets and then hit 10 consecutive misses
        if len(active_subnets) > 0 and (netuid - max(active_subnets)) > 10:
            break

    return active_subnets


def query_subnet_exists(netuid: int) -> bool:
    """Check if subnet exists by querying its tempo or other metadata"""
    try:
        # Try to get subnet tempo (if exists, subnet is active)
        result = rpc_call('state_call', [
            'SubtensorModule_get_tempo',
            f'0x{netuid:02x}'  # Hex encode netuid
        ])
        return result is not None
    except Exception:
        return False


def get_subnet_neurons(netuid: int) -> int:
    """Get neuron count for a subnet"""
    try:
        result = rpc_call('state_call', [
            'SubtensorModule_get_subnetwork_n',
            f'0x{netuid:02x}'
        ])
        if result:
            # Decode hex result (SCALE encoded u16/u32)
            # Simplified: just try to parse as int
            if isinstance(result, str) and result.startswith('0x'):
                return int(result, 16)
            return int(result) if result else 0
    except Exception as e:
        print(f"⚠️ Failed to get neurons for subnet {netuid}: {e}", file=sys.stderr)
    return 0


def fetch_subnets_lite():
    """Fetch subnet data using only on-chain data - no external APIs"""
    print("🔍 Fetching subnets via on-chain queries...", file=sys.stderr)

    try:
        import bittensor as bt
        subtensor = bt.Subtensor(network=NETWORK)

        # Get all subnet IDs
        subnets = list(subtensor.get_all_subnets_netuid())
        print(f"✅ Found {len(subnets)} subnets", file=sys.stderr)

        # Fetch on-chain emissions for all subnets
        print("📊 Querying on-chain SubnetEmission data...", file=sys.stderr)
        subnet_emissions = {}
        total_emission_raw = 0

        try:
            # Query all subnet emissions at once via query_map
            emissions_map = subtensor.substrate.query_map('SubtensorModule', 'SubnetEmission')
            for netuid_obj, emission_obj in emissions_map:
                try:
                    netuid = int(netuid_obj.value if hasattr(netuid_obj, 'value') else netuid_obj)
                    emission_raw = int(emission_obj.value if hasattr(emission_obj, 'value') else emission_obj)
                    subnet_emissions[netuid] = emission_raw
                    total_emission_raw += emission_raw
                except Exception as e:
                    print(f"⚠️ Failed to parse emission for subnet: {e}", file=sys.stderr)
                    continue

            print(f"✅ Got emission data for {len(subnet_emissions)} subnets (total_raw: {total_emission_raw})", file=sys.stderr)
        except Exception as e:
            print(f"⚠️ Failed to query SubnetEmission map: {e}", file=sys.stderr)
            # Fall back to individual queries
            for netuid in subnets:
                try:
                    emission = subtensor.substrate.query('SubtensorModule', 'SubnetEmission', [netuid])
                    emission_raw = int(emission.value if hasattr(emission, 'value') else emission)
                    subnet_emissions[int(netuid)] = emission_raw
                    total_emission_raw += emission_raw
                except Exception as e:
                    print(f"⚠️ Failed to query emission for SN{netuid}: {e}", file=sys.stderr)
                    continue

        results = []
        total_neurons = 0

        for netuid in subnets:
            try:
                # Get metagraph for this subnet
                metagraph = subtensor.metagraph(netuid=netuid, mechid=0)
                neurons = len(metagraph.uids) if hasattr(metagraph, 'uids') else 0

                # Count validators
                validators = 0
                if hasattr(metagraph, 'validator_permit') and hasattr(metagraph, 'uids'):
                    try:
                        for uid in metagraph.uids:
                            if metagraph.validator_permit[uid]:
                                validators += 1
                    except Exception:
                        validators = 0

                total_neurons += neurons

                # Get on-chain emission for this subnet
                emission_raw = subnet_emissions.get(int(netuid), 0)

                results.append({
                    'netuid': int(netuid),
                    'neurons': neurons,
                    'validators': validators,
                    '_emission_raw': emission_raw
                })

            except Exception as e:
                print(f"⚠️ Failed to fetch subnet {netuid}: {e}", file=sys.stderr)
                continue

        # Calculate emission shares based on on-chain emission data
        # SubnetEmission values are u64 proportions that sum to u64::MAX
        # We convert to actual TAO/day based on the share
        for entry in results:
            emission_raw = entry.get('_emission_raw', 0)

            if total_emission_raw > 0:
                # Calculate share as proportion of total emissions
                emission_share = emission_raw / total_emission_raw
                estimated_emission = emission_share * DAILY_EMISSION
            else:
                # Fallback to neuron-based if no emission data
                emission_share = entry['neurons'] / total_neurons if total_neurons > 0 else 0
                estimated_emission = emission_share * DAILY_EMISSION

            entry['emission_share'] = round(emission_share, 6)
            entry['estimated_emission_daily'] = round(estimated_emission, 6)
            entry['emission_share_percent'] = round(emission_share * 100, 4)
            entry['ema_source'] = 'onchain_emission' if total_emission_raw > 0 else 'neurons_onchain'

            # Remove internal field
            del entry['_emission_raw']

        # Sort by emission
        results.sort(key=lambda x: x['estimated_emission_daily'], reverse=True)

        now = datetime.now(timezone.utc).isoformat()
        output = {
            'generated_at': now,
            'last_updated': now,
            'network': NETWORK,
            'daily_emission_assumed': DAILY_EMISSION,
            'total_neurons': total_neurons,
            'top_n': 10,
            'top_subnets': results[:10],
            'all_subnets': results,
            'source': 'bittensor_sdk_onchain',
            'note': 'Fallback method - neuron-proportional estimates without Taostats'
        }

        return output

    except Exception as e:
        print(f"❌ Subnet fetch failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return {
            'generated_at': datetime.now(timezone.utc).isoformat(),
            'error': str(e),
            'top_subnets': [],
            'all_subnets': []
        }


def put_to_kv(account: str, token: str, namespace: str, key: str, data: bytes) -> bool:
    """Upload data to Cloudflare KV"""
    url = f'https://api.cloudflare.com/client/v4/accounts/{account}/storage/kv/namespaces/{namespace}/values/{key}'
    req = urllib.request.Request(url, data=data, method='PUT', headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            if resp.status in (200, 201):
                print(f"✅ KV PUT OK ({key})")
                return True
            else:
                print(f"⚠️ KV PUT returned status {resp.status}", file=sys.stderr)
                return False
    except urllib.error.HTTPError as e:
        print(f"⚠️ KV PUT failed: HTTP {getattr(e, 'code', None)}", file=sys.stderr)
    except Exception as e:
        print(f"⚠️ KV PUT failed: {e}", file=sys.stderr)
    return False


def main():
    """Main entry point"""
    output = fetch_subnets_lite()

    # Write to local file
    out_path = os.path.join(os.getcwd(), '.github', 'data', 'subnets_lite.json')
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w') as f:
        json.dump(output, f, indent=2)
    print(f"✅ Wrote {out_path}")

    # Upload to Cloudflare KV if credentials available
    cf_acc = os.getenv('CF_ACCOUNT_ID')
    cf_token = os.getenv('CF_API_TOKEN')
    cf_ns = os.getenv('CF_KV_NAMESPACE_ID') or os.getenv('CF_METRICS_NAMESPACE_ID')

    if cf_acc and cf_token and cf_ns and output.get('top_subnets'):
        print('📤 Uploading to Cloudflare KV...', file=sys.stderr)
        data = json.dumps(output).encode('utf-8')
        ok = put_to_kv(cf_acc, cf_token, cf_ns, 'top_subnets', data)
        if not ok:
            print('⚠️ KV upload failed; local file only', file=sys.stderr)
    elif not output.get('top_subnets'):
        print('⚠️ No subnet data to upload', file=sys.stderr)
    else:
        print('⚠️ CF credentials missing; skipping KV upload', file=sys.stderr)

    # Print summary
    print(f"\n📊 Summary:", file=sys.stderr)
    print(f"  Total subnets: {len(output.get('all_subnets', []))}", file=sys.stderr)
    print(f"  Total neurons: {output.get('total_neurons', 0)}", file=sys.stderr)
    print(f"  Top subnet: netuid={output['top_subnets'][0]['netuid']} ({output['top_subnets'][0]['neurons']} neurons)" if output.get('top_subnets') else "  No subnets found", file=sys.stderr)


if __name__ == '__main__':
    main()
