import time
from typing import Dict, Any, List


def compute_per_day_deltas_from_history(hist: List[Dict[str, Any]]) -> List[float]:
    out: List[float] = []
    if not hist or len(hist) < 2:
        return out
    for a, b in zip(hist, hist[1:]):
        dt = float(b['ts']) - float(a['ts'])
        if dt <= 0:
            continue
        delta = float(b['issuance']) - float(a['issuance'])
        per_day = delta * (86400.0 / dt)
        out.append(per_day)
    return out


def robust_average(values: List[float]) -> float:
    if not values:
        return None
    arr = sorted(values)
    n = len(arr)
    if n == 0:
        return None
    trim = max(1, int(n * 0.1)) if n > 3 else 0
    if trim > 0 and n > 2 * trim:
        trimmed = arr[trim:n - trim]
    else:
        trimmed = arr
    return sum(trimmed) / len(trimmed)


def avg_for_days(hist: List[Dict[str, Any]], days: int, now_ts: float = None) -> float:
    if now_ts is None:
        now_ts = time.time()
    if not hist or len(hist) < 2:
        return None
    cutoff = now_ts - (days * 86400.0)
    per_day_deltas = compute_per_day_deltas_from_history(hist)
    recent = [d for i, d in enumerate(per_day_deltas) if hist[i + 1]['ts'] >= cutoff]
    if not recent:
        recent = per_day_deltas[-min(len(per_day_deltas), days):]
    if not recent:
        return None
    return robust_average(recent)
