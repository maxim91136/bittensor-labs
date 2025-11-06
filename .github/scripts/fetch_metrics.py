import bittensor as bt
import json
import os
import sys
from typing import Dict, Any, List
from datetime import datetime, timezone
from concurrent.futures import ThreadPoolExecutor, as_completed

NETWORK = os.getenv("NETWORK", "finney")
MAX_WORKERS = 10  # Parallel requests

def fetch_subnet_stats(subtensor, netuid: int) -> tuple:
    """Fetch stats for a single subnet"""
    try:
        metagraph = subtensor.metagraph(netuid)
        validators = 0
        if hasattr(metagraph, 'validator_permit'):
            validators = len([uid for uid in metagraph.uids if metagraph.validator_permit[uid]])
        neurons = len(metagraph.uids)
        return (validators, neurons)
    except Exception as e:
        print(f"Warning: Could not fetch metagraph for netuid {netuid}: {e}", file=sys.stderr)
        return (0, 0)

def fetch_metrics() -> Dict[str, Any]:
    """Fetch all Bittensor network metrics"""
    subtensor = bt.subtensor(network=NETWORK)
    
    print("Fetching current block...", file=sys.stderr)
    current_block = subtensor.get_current_block()
    
    print("Fetching subnets...", file=sys.stderr)
    all_subnets = subtensor.get_subnets()
    
    print(f"Fetching metagraphs for {len(all_subnets)} subnets in parallel...", file=sys.stderr)
    
    # ✅ PARALLEL FETCHING (viel schneller!)
    total_validators = 0
    total_neurons = 0
    
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(fetch_subnet_stats, subtensor, netuid): netuid 
                   for netuid in all_subnets}
        
        for future in as_completed(futures):
            validators, neurons = future.result()
            total_validators += validators
            total_neurons += neurons
    
    print(f"✅ Fetched all metagraphs: {total_validators} validators, {total_neurons} neurons", file=sys.stderr)
    
    daily_emission = 7200
    
    result = {
        "blockHeight": current_block,
        "validators": total_validators,
        "subnets": len(all_subnets),
        "emission": f"{daily_emission:,}",
        "totalNeurons": total_neurons,
        "_source": "bittensor-sdk",
        "_timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    return result

if __name__ == "__main__":
    try:
        print("🚀 Starting metrics fetch...", file=sys.stderr)
        metrics = fetch_metrics()
        
        output_path = os.path.join(os.getcwd(), "metrics.json")
        with open(output_path, "w") as f:
            json.dump(metrics, f, indent=2)
        
        print(f"✅ Metrics written to {output_path}", file=sys.stderr)
        print(json.dumps(metrics, indent=2))
        
    except Exception as e:
        print(f"❌ Error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)