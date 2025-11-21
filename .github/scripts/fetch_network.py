import bittensor as bt
import json
import os
import sys
from typing import Dict, Any
from datetime import datetime, timezone

NETWORK = os.getenv("NETWORK", "finney")

def fetch_metrics() -> Dict[str, Any]:
    """Fetch Bittensor network metrics: block, subnets, validators, neurons, emission"""
    subtensor = bt.subtensor(network=NETWORK)
    try:
        block = subtensor.get_current_block()
    except Exception as e:
        print(f"Block fetch failed: {e}", file=sys.stderr)
        block = None

    try:
        subnets = subtensor.get_subnets()
        total_subnets = len(subnets)
    except Exception as e:
        print(f"Subnet fetch failed: {e}", file=sys.stderr)
        subnets = []
        total_subnets = 0

    total_validators = 0
    total_neurons = 0
    for netuid in subnets:
        try:
            metagraph = subtensor.metagraph(netuid)
            # Count validators
            if hasattr(metagraph, 'validator_permit'):
                total_validators += sum(1 for uid in metagraph.uids if metagraph.validator_permit[uid])
            # Count neurons
            total_neurons += len(metagraph.uids)
        except Exception as e:
            print(f"Metagraph fetch failed for netuid {netuid}: {e}", file=sys.stderr)
            continue

    daily_emission = 7200
    
    def generate_halving_thresholds(max_supply: int = 21000000, max_events: int = 6):
        arr = []
        for n in range(1, max_events + 1):
            threshold = round(max_supply * (1 - 1 / (2 ** n)))
            arr.append(int(threshold))
        return arr
    # Total issuance from on-chain storage
    total_issuance_raw = None
    total_issuance_human = None
    try:
        if hasattr(subtensor, 'substrate') and subtensor.substrate is not None:
            try:
                issuance = subtensor.substrate.query('SubtensorModule', 'TotalIssuance')
                total_issuance_raw = int(issuance.value) if issuance and issuance.value is not None else None
            except Exception as e:
                print(f"TotalIssuance fetch failed: {e}", file=sys.stderr)
                total_issuance_raw = None
            try:
                props = subtensor.substrate.rpc_request('system_properties', [])
                dec = props.get('result', {}).get('tokenDecimals')
                if isinstance(dec, list):
                    decimals = int(dec[0])
                else:
                    decimals = int(dec) if dec is not None else 9
            except Exception:
                decimals = 9
            if total_issuance_raw is not None:
                total_issuance_human = float(total_issuance_raw) / (10 ** decimals)
    except Exception:
        total_issuance_raw = None
        total_issuance_human = None

    result = {
        "blockHeight": block,
        "subnets": total_subnets,
        "validators": total_validators,
        "totalNeurons": total_neurons,
        "emission": daily_emission,
        "totalIssuance": total_issuance_raw,
        "totalIssuanceHuman": total_issuance_human,
        "halvingThresholds": generate_halving_thresholds(),
        "_source": "bittensor-sdk",
        "_timestamp": datetime.now(timezone.utc).isoformat()
    }
    return result

if __name__ == "__main__":
    try:
        network_data = fetch_metrics()
        output_path = os.path.join(os.getcwd(), "network.json")
        with open(output_path, "w") as f:
            json.dump(network_data, f, indent=2)
        print(f"✅ Network data written to {output_path}", file=sys.stderr)
        print(json.dumps(network_data, indent=2))
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)