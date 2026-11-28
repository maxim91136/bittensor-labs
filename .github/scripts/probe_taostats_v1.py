#!/usr/bin/env python3
"""TEMPORÄR: gibt die Antwortform der neuen Taostats-/v1-Endpunkte aus (nur Struktur, gekürzte Werte)."""
import json
import os
import sys
import time

import requests

BASE = "https://api.taostats.io"
KEY = os.getenv("TAOSTATS_API_KEY")
HEADERS = {"accept": "application/json", "Authorization": KEY or "", "User-Agent": "bittensor-labs-probe/1"}


def short(v):
    s = json.dumps(v, ensure_ascii=False) if not isinstance(v, str) else v
    return s if len(s) <= 70 else s[:67] + "..."


def show(path, params=None):
    time.sleep(8)
    try:
        r = requests.get(BASE + path, headers=HEADERS, params=params, timeout=30)
    except Exception as e:  # noqa: BLE001
        print(f"\n### {path} {params} -> ERROR {e}")
        return None
    print(f"\n### {path} {params} -> HTTP {r.status_code}")
    try:
        j = r.json()
    except Exception:  # noqa: BLE001
        print(r.text[:300])
        return None
    if r.status_code != 200:
        print(short(j))
        return None
    print("top-level keys:", list(j.keys()) if isinstance(j, dict) else type(j).__name__)
    if isinstance(j, dict) and "pagination" in j:
        print("pagination:", short(j["pagination"]))
    rows = j.get("data") if isinstance(j, dict) else j
    row = rows[0] if isinstance(rows, list) and rows else rows
    if isinstance(row, dict):
        for k, v in row.items():
            print(f"  {k}: {short(v)}")
    else:
        print("  data:", short(row))
    return j


def main():
    if not KEY:
        print("TAOSTATS_API_KEY fehlt")
        sys.exit(1)
    show("/v1/price", {"asset": "tao"})
    v = show("/v1/validators", {"limit": 2})
    show("/v1/validators/yield", {"limit": 2})
    if v and v.get("data"):
        hk = v["data"][0].get("hotkey")
        hk = hk.get("ss58") if isinstance(hk, dict) else hk
        if hk:
            show(f"/v1/validators/performance/{hk}")
    show("/v1/accounts/leaderboard", {"limit": 2})
    show("/v1/accounts/identities", {"limit": 2})
    show("/v1/exchange-addresses")
    show("/v1/subnets/metrics", {"limit": 2})
    show("/v1/subnets/hyperparameters", {"limit": 2})
    show("/v1/blocks", {"limit": 2})
    show("/v1/price/history", {"asset": "tao", "limit": 2})
    show("/v1/price/ohlc", {"asset": "tao", "period": "1d", "limit": 2})
    show("/v1/transfers", {"limit": 2})


if __name__ == "__main__":
    main()
