import json, os, gc
from typing import Dict, Any, List
import bittensor as bt

NETWORK = os.getenv("NETWORK", "finney")

def is_validator(n: dict) -> bool:
    for k in ("validator_permit", "is_validator", "validator"):
        v = n.get(k)
        if isinstance(v, (bool, int)): return bool(v)
    return False

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
        lite = None
        try:
            try: lite = st.get_neurons_lite(uid)
            except Exception: lite = st.neurons_lite(uid)
        except Exception:
            lite = None

        if lite is not None:
            total_neurons += len(lite)
            total_validators += sum(1 for n in lite if isinstance(n, dict) and is_validator(n))
            del lite; gc.collect(); continue

        try:
            mg = st.metagraph(uid)
            total_neurons += int(getattr(mg, "n", 0)) or 0
            vp = getattr(mg, "validator_permit", None) or getattr(mg, "validator_permits", None)
            if vp is not None:
                arr = vp.tolist() if hasattr(vp, "tolist") else vp
                total_validators += sum(1 for v in arr if bool(v))
        except Exception:
            pass
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