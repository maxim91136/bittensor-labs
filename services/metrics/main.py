import os, gc
from fastapi import FastAPI
import uvicorn
import time
import threading
from typing import Dict, Any, List
import bittensor as bt

app = FastAPI()
CACHE_TTL = int(os.getenv("CACHE_TTL", "300"))  # longer cache saves RAM/calls
_cache: Dict[str, Any] = {"data": None, "ts": 0.0}
_lock = threading.Lock()

def _is_validator_flag(x) -> bool:
  # robust against dict/obj/different field names
  try:
    if isinstance(x, dict):
      for k in ("validator_permit", "is_validator", "validator", "validatorPermit"):
        if k in x and isinstance(x[k], (bool, int)): return bool(x[k])
      return False
    for k in ("validator_permit", "is_validator", "validator", "validatorPermit"):
      if hasattr(x, k):
        v = getattr(x, k)
        if isinstance(v, (bool, int)): return bool(v)
    return False
  except:
    return False

def _count_validators_from_mg(mg) -> int:
  try:
    for attr in ("validator_permit", "validator_permits", "is_validator", "validators"):
      if hasattr(mg, attr):
        vp = getattr(mg, attr)
        arr = vp.tolist() if hasattr(vp, "tolist") else (vp if isinstance(vp, (list, tuple)) else [])
        return int(sum(1 for v in arr if bool(v)))
    return 0
  except:
    return 0


def generate_halving_thresholds(max_supply: int = 21_000_000, max_events: int = 6) -> List[int]:
  """Generate halving thresholds list similar to frontend JS generator.
  For max_events n, thresholds = round(max_supply * (1 - 1/2^n)) for n=1..max_events
  """
  arr: List[int] = []
  for n in range(1, max_events + 1):
    threshold = round(max_supply * (1 - 1 / (2 ** n)))
    arr.append(int(threshold))
  return arr

def gather_metrics(network: str = "finney") -> Dict[str, Any]:
  st = bt.subtensor(network=network)

  try:
    block = st.get_current_block()
  except:
    block = None

  try:
    netuids: List[int] = st.get_subnets()
  except:
    netuids = []

  total_subnets = len(netuids)
  total_validators = 0
  total_neurons = 0

  for uid in netuids:
    # 1) easy path: neurons_lite
    lite = None
    try:
      try:
        lite = st.get_neurons_lite(uid)
      except:
        lite = st.neurons_lite(uid)
    except:
      lite = None

    if lite is not None:
      try:
        total_neurons += len(lite)
        total_validators += sum(1 for n in lite if _is_validator_flag(n))
      finally:
        del lite
        gc.collect()
      continue

    # 2) Fallback: full Metagraph (release immediately)
    try:
      mg = st.metagraph(uid)
      total_neurons += int(getattr(mg, "n", 0)) or 0
      total_validators += _count_validators_from_mg(mg)
    except:
      pass
    finally:
      try: del mg
      except: pass
      gc.collect()

  # Total issuance: try to query SubtensorModule::TotalIssuance via substrate
  total_issuance_raw = None
  total_issuance_human = None
  try:
    if hasattr(st, 'substrate') and st.substrate is not None:
      try:
        issuance = st.substrate.query('SubtensorModule', 'TotalIssuance')
        total_issuance_raw = int(issuance.value) if issuance and issuance.value is not None else None
      except Exception:
        total_issuance_raw = None
      try:
        props = st.substrate.rpc_request('system_properties', [])
        dec = props.get('result', {}).get('tokenDecimals')
        if isinstance(dec, list):
          decimals = int(dec[0])
        else:
          decimals = int(dec) if dec is not None else 9
      except Exception:
        decimals = 9
      if total_issuance_raw is not None:
        try:
          total_issuance_human = float(total_issuance_raw) / (10 ** decimals)
        except Exception:
          total_issuance_human = None
  except Exception:
    total_issuance_raw = None
    total_issuance_human = None

  return {
    "blockHeight": block,
    "validators": total_validators,
    "subnets": total_subnets,
    "emission": 7200,
    "totalNeurons": total_neurons,
    "totalIssuance": total_issuance_raw,
    "totalIssuanceHuman": total_issuance_human,
    "halvingThresholds": generate_halving_thresholds(),
    "_source": "bittensor-sdk"
  }

@app.get("/")
def root():
  return {"status": "ok", "service": "bittensor-metrics"}

@app.get("/metrics")
def metrics():
  now = time.time()
  with _lock:
    if _cache["data"] and now - _cache["ts"] < CACHE_TTL:
      return _cache["data"]
    data = gather_metrics(os.getenv("NETWORK", "finney"))
    _cache["data"] = data
    _cache["ts"] = now
    return data

if __name__ == "__main__":
  port = int(os.getenv("PORT", 8000))
  uvicorn.run(app, host="0.0.0.0", port=port)