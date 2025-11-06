import bittensor as bt
import json
import os
import sys
from typing import Dict, Any, List
from datetime import datetime, timezone

NETWORK = os.getenv("NETWORK", "finney")

def fetch_metrics() -> Dict[str, Any]:
    """Fetch all Bittensor network metrics"""
    subtensor = bt.subtensor(network=NETWORK)
    
    # Get current block
    current_block = subtensor.get_current_block()
    
    # Get all subnets
    all_subnets = subtensor.get_subnets()
    
    # Count validators and neurons
    total_validators = 0
    total_neurons = 0
    
    for netuid in all_subnets:
        try:
            metagraph = subtensor.metagraph(netuid)
            if hasattr(metagraph, 'validator_permit'):
                total_validators += len([uid for uid in metagraph.uids if metagraph.validator_permit[uid]])
            total_neurons += len(metagraph.uids)
        except Exception as e:
            print(f"Warning: Could not fetch metagraph for netuid {netuid}: {e}", file=sys.stderr)
            continue
    
    # Calculate daily emission
    daily_emission = 7200
    
    # Get circulating supply
    try:
        total_issuance = subtensor.total_issuance()
        if hasattr(total_issuance, 'tao'):
            circulating_supply = float(total_issuance.tao)
        else:
            circulating_supply = float(total_issuance)
    except Exception as e:
        print(f"Warning: Could not fetch total_issuance: {e}", file=sys.stderr)
        circulating_supply = None
    
    result = {
        "blockHeight": current_block,
        "validators": total_validators,
        "subnets": len(all_subnets),
        "emission": f"{daily_emission:,}",
        "totalNeurons": total_neurons,
        "_source": "bittensor-sdk",
        "_timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    if circulating_supply is not None:
        result["circulatingSupply"] = circulating_supply
    
    return result

if __name__ == "__main__":
    try:
        metrics = fetch_metrics()
        
        # ✅ NEU: Schreibe metrics.json in das Root-Verzeichnis
        output_path = os.path.join(os.getcwd(), "metrics.json")
        with open(output_path, "w") as f:
            json.dump(metrics, f, indent=2)
        
        print(f"✅ Metrics written to {output_path}")
        print(json.dumps(metrics, indent=2))
        
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        sys.exit(1)