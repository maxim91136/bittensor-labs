#!/usr/bin/env python3
"""Temporäre Diagnose: welche Taostats-Validator-Endpunkte antworten und welche APR-Felder sie liefern. Wird nach der Analyse gelöscht."""
import os, json, requests
KEY = os.getenv("TAOSTATS_API_KEY")
H = {"accept": "application/json", "Authorization": KEY}
BASE = "https://api.taostats.io"
PATHS = [
    "/api/dtao/validator/latest/v1?limit=3",
    "/api/validator/latest/v1?limit=3",
    "/api/dtao/validator/yield/latest/v1?limit=3",
    "/api/validator/yield/latest/v1?limit=3",
    "/api/dtao/validator/performance/latest/v1?limit=3",
    "/api/validator/metrics/latest/v1?limit=3",
]
for p in PATHS:
    try:
        r = requests.get(BASE + p, headers=H, timeout=30)
        line = f"{r.status_code} {p}"
        if r.ok:
            j = r.json(); d = j.get("data") or []
            line += f" | top={list(j.keys())} n={len(d)}"
            if d:
                keys = sorted(d[0].keys()); hit = [k for k in keys if any(w in k.lower() for w in ("apr", "apy", "return", "yield", "stake", "dominance"))]
                line += f" | felder={hit} | alle={len(keys)}"
        print(line)
    except Exception as e:
        print("FEHLER", p, e)
