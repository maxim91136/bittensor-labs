import json, os, gc
from typing import Dict, Any, List
import bittensor as bt

NETWORK = os.getenv("NETWORK", "finney")

def gather() -> Dict[str, Any]:
    st = bt.subtensor(network=NETWORK)
    try:
        block = st.get_current_block()
    except Exception:
        block = None
    try:
        netuids: List[int] = st.get_subnets()
    except Exception:
        netuids = []

    total_subnets = len(netuids)
    total_validators = 0
    total_neurons = 0

    for uid in netuids:
        try:
            mg = st.metagraph(uid)
            total_neurons += int(getattr(mg, "n", 0))
            
            # Validator-Zählung: validator_permit Array
            vp = getattr(mg, "validator_permit", None)
            if vp is not None:
                arr = vp.tolist() if hasattr(vp, "tolist") else list(vp)
                total_validators += sum(1 for x in arr if x)
        except Exception as e:
            print(f"Subnet {uid} error: {e}")
        finally:
            try: del mg
            except: pass
            gc.collect()

    return {
        "blockHeight": block,
        "validators": total_validators,
        "subnets": total_subnets,
        "emission": "7,200",
        "totalNeurons": total_neurons,
        "_source": "gh-action+bittensor-sdk"
    }

if __name__ == "__main__":
    data = gather()
    with open("metrics.json", "w") as f:
        json.dump(data, f)
    print(json.dumps(data))