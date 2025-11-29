import os
import sys
import json
import requests
from datetime import datetime, timezone
import pathlib

TAOSTATS_API_KEY = os.getenv("TAOSTATS_API_KEY")
TAOSTATS_URL = os.getenv("TAOSTATS_URL", "https://api.taostats.io/api/price/latest/v1?asset=tao")

def _int_env(name, default):
    v = os.getenv(name)
    if v is None:
        return default
    v2 = v.strip()
    if v2 == '':
        return default
    try:
        return int(v2)
    except Exception:
        print(f"Warning: environment variable {name} is invalid ({v!r}), using default {default}")
        return default

def fetch_taostats():
    if not TAOSTATS_API_KEY:
        print("❌ TAOSTATS_API_KEY not set", file=sys.stderr)
        sys.exit(1)
    headers = {
        "accept": "application/json",
        "Authorization": TAOSTATS_API_KEY
    }
    try:
        resp = requests.get(TAOSTATS_URL, headers=headers, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        if not data.get("data"):
            raise ValueError("No data in Taostats response")
        item = data["data"][0]
        # Normalize and select relevant fields
        result = {
            "created_at": item.get("created_at"),
            "last_updated": item.get("last_updated"),
            "name": item.get("name"),
            "symbol": item.get("symbol"),
            "price": float(item.get("price")) if item.get("price") else None,
            "circulating_supply": float(item.get("circulating_supply")) if item.get("circulating_supply") else None,
            "max_supply": float(item.get("max_supply")) if item.get("max_supply") else None,
            "total_supply": float(item.get("total_supply")) if item.get("total_supply") else None,
            "market_cap": float(item.get("market_cap")) if item.get("market_cap") else None,
            "fully_diluted_market_cap": float(item.get("fully_diluted_market_cap")) if item.get("fully_diluted_market_cap") else None,
            "volume_24h": float(item.get("volume_24h")) if item.get("volume_24h") else None,
            "percent_change_1h": float(item.get("percent_change_1h")) if item.get("percent_change_1h") else None,
            "percent_change_24h": float(item.get("percent_change_24h")) if item.get("percent_change_24h") else None,
            "percent_change_7d": float(item.get("percent_change_7d")) if item.get("percent_change_7d") else None,
            "percent_change_30d": float(item.get("percent_change_30d")) if item.get("percent_change_30d") else None,
            "_source": "taostats",
            "_timestamp": datetime.now(timezone.utc).isoformat()
        }
        return result
    except Exception as e:
        print(f"❌ Taostats fetch failed: {e}", file=sys.stderr)
        return None

if __name__ == "__main__":
    result = fetch_taostats()
    if result:
        with open("taostats_latest.json", "w") as f:
            json.dump(result, f, indent=2)
        print("✅ Taostats data written to taostats_latest.json", file=sys.stderr)
        print(json.dumps(result, indent=2))
        # Append price/volume entry to history JSON
        try:
            HIST_FILE = pathlib.Path("taostats_history.json")
            # Keep history size reasonably bounded to avoid KV size issues
            MAX_ENTRIES = _int_env('HISTORY_MAX_ENTRIES', 10000)
            entry = {
                "_timestamp": result.get("_timestamp"),
                "price": result.get("price"),
                "volume_24h": result.get("volume_24h")
            }
            history = []
            if HIST_FILE.exists():
                try:
                    with HIST_FILE.open('r') as hf:
                        history = json.load(hf) or []
                except Exception:
                    # If parsing fails, start fresh
                    history = []
            history.append(entry)
            # Trim history to the last MAX_ENTRIES
            if len(history) > MAX_ENTRIES:
                history = history[-MAX_ENTRIES:]
            with HIST_FILE.open('w') as hf:
                json.dump(history, hf, indent=2)
            print(f"✅ Taostats history written to {HIST_FILE}", file=sys.stderr)
        except Exception as e:
            print(f"⚠️ Failed to update history: {e}", file=sys.stderr)
    else:
        sys.exit(1)