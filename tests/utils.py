from typing import List, Dict, Any
from datetime import datetime, timezone
import math

def compute_per_interval_deltas(hist: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out = []
    for i in range(1, len(hist)):
        a = hist[i - 1]
        b = hist[i]
        dt = b['ts'] - a['ts']
        if dt <= 0:
            continue
        delta = b['issuance'] - a['issuance']
        per_day = delta * (86400.0 / dt)
        out.append({'ts': b['ts'], 'per_day': per_day})
    return out

def winsorized_mean(arr: List[float], trim=0.1):
    n = len(arr)
    if n == 0:
        return None
    s = sorted(arr)
    k = int(n * trim)
    if k >= n // 2:
        return sum(s) / len(s)
    trimmed = s[k:n - k]
    if not trimmed:
        return sum(s) / len(s)
    return sum(trimmed) / len(trimmed)
