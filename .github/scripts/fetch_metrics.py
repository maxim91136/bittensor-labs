from typing import Dict, Any, List
from datetime import datetime, timezone
import bittensor as bt
import json
import os

NETWORK = os.getenv("NETWORK", "finney")

def fetch_metrics() -> Dict[str, Any]:
    """Fetch all Bittensor network metrics"""
    subtensor = bt.subtensor(network=NETWORK)
    
    # Get current block
    current_block = subtensor.get_current_block()
    
    # Get all subnets
    all_subnets = subtensor.get_all_subnet_netuids()
    
    # Count validators and neurons
    total_validators = 0
    total_neurons = 0
    
    for netuid in all_subnets:
        metagraph = subtensor.metagraph(netuid)
        total_validators += len([uid for uid in metagraph.uids if metagraph.validator_permit[uid]])
        total_neurons += len(metagraph.uids)
    
    # Calculate daily emission (7200 TAO/day currently)
    daily_emission = 7200  # This is hardcoded for now, can be calculated from chain
    
    # ✅ NEU: Get circulating supply from chain
    total_issuance = subtensor.total_issuance()  # Returns Balance object
    circulating_supply = float(total_issuance)    # Convert to float
    
    return {
        "blockHeight": current_block,
        "validators": total_validators,
        "subnets": len(all_subnets),
        "emission": f"{daily_emission:,}",
        "totalNeurons": total_neurons,
        "circulatingSupply": circulating_supply,  # ✅ NEU
        "_source": "bittensor-sdk",
        "_timestamp": datetime.now(timezone.utc).isoformat()
    }

if __name__ == "__main__":
    try:
        metrics = fetch_metrics()
        print(json.dumps(metrics, indent=2))
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)