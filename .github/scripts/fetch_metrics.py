import json, os, gc
from typing import Dict, Any, List
from datetime import datetime, timezone
import bittensor as bt

NETWORK = os.getenv("NETWORK", "finney")

def as_bool(v) -> bool:
    if hasattr(v, "item"):
        try:
            return bool(v.item())
        except Exception:
            pass
    return bool(v)

def gather() -> Dict[str, Any]:
    st = bt.subtensor(network=NETWORK)
    now = datetime.now(timezone.utc)

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
            lite = st.neurons_lite(uid)
        except Exception:
            try:
                lite = st.get_neurons_lite(uid)
            except Exception:
                lite = None

        counted_from_lite = False
        if lite:
            total_neurons += len(lite)
            n0 = lite[0]
            cand_attrs = ("validator_permit", "is_validator", "validatorPermit", "validator", "is_val")
            attr = next((a for a in cand_attrs if hasattr(n0, a)), None)
            if attr:
                try:
                    total_validators += sum(1 for n in lite if hasattr(n, attr) and as_bool(getattr(n, attr)))
                    counted_from_lite = True
                except Exception:
                    counted_from_lite = False

        if not counted_from_lite:
            try:
                mg = st.metagraph(uid)
                vp = getattr(mg, "validator_permit", None) or getattr(mg, "validator_permits", None)
                if vp is not None:
                    arr = vp.tolist() if hasattr(vp, "tolist") else list(vp)
                    total_validators += sum(1 for x in arr if as_bool(x))
            except Exception:
                pass
            finally:
                try:
                    del mg
                except Exception:
                    pass
                gc.collect()

        if lite:
            del lite
            gc.collect()

    return {
        "blockHeight": block,
        "validators": total_validators,
        "subnets": total_subnets,
        "emission": "7,200",
        "totalNeurons": total_neurons,
        "_source": "gh-action+bittensor-sdk",
        "updatedAt": now.isoformat(),
        "updatedAtEpoch": int(now.timestamp()),
    }

if __name__ == "__main__":
    data = gather()
    with open("metrics.json", "w") as f:
        json.dump(data, f)
    print(json.dumps(data))