#!/usr/bin/env python3
"""Temporäre Diagnose: welche Taostats-Validator-Endpunkte antworten und welche APR-Felder sie liefern. Wird nach der Analyse gelöscht."""
import os, json, requests
KEY = os.getenv("TAOSTATS_API_KEY")
H = {"accept": "application/json", "Authorization": KEY}
BASE = "https://api.taostats.io"
HOSTS = ["https://api.taostats.io", "https://api-prod2-v2.taostats.io", "https://api-legacy.taostats.io"]
EXTRA = ["/api/price/latest/v1?asset=tao", "/api/block/v1?limit=1", "/api/subnet/latest/v1?limit=1", "/api/validator/latest/v1?limit=1"]
PATHS = [
    "/api/dtao/validator/latest/v1?limit=3",
    "/api/validator/latest/v1?limit=3",
    "/api/dtao/validator/yield/latest/v1?limit=3",
    "/api/validator/yield/latest/v1?limit=3",
    "/api/dtao/validator/performance/latest/v1?limit=3",
    "/api/validator/metrics/latest/v1?limit=3",
]
import itertools
combos = [(BASE, p) for p in PATHS] + [(h, p) for h in HOSTS for p in EXTRA]
for host, p in combos:
    try:
        r = requests.get(host + p, headers=H, timeout=30)
        line = f"{r.status_code} {host.split('//')[1]} {p}"
        if not r.ok:
            line += " | body=" + r.text[:200].replace("\n", " ") + " | loc=" + str(r.headers.get("location") or r.headers.get("link") or "")
        if r.ok:
            j = r.json(); d = j.get("data") or []
            line += f" | top={list(j.keys())} n={len(d)}"
            if d:
                keys = sorted(d[0].keys()); hit = [k for k in keys if any(w in k.lower() for w in ("apr", "apy", "return", "yield", "stake", "dominance"))]
                line += f" | felder={hit} | alle={len(keys)}"
        print(line)
    except Exception as e:
        print("FEHLER", host, p, e)
