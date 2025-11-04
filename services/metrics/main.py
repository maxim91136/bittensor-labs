import os, gc
from fastapi import FastAPI
import uvicorn
import time
import threading
from typing import Dict, Any, List
import bittensor as bt

app = FastAPI()
CACHE_TTL = int(os.getenv("CACHE_TTL", "300"))  # längerer Cache spart RAM/Calls
_cache: Dict[str, Any] = {"data": None, "ts": 0.0}
_lock = threading.Lock()

def _is_validator_flag(x) -> bool:
  # robust gegen dict/obj/verschiedene Feldnamen
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
    # 1) leichter Pfad: neurons_lite
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

    # 2) Fallback: voller Metagraph (direkt wieder freigeben)
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

  return {
    "blockHeight": block,
    "validators": total_validators,
    "subnets": total_subnets,
    "emission": 7200,
    "totalNeurons": total_neurons,
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