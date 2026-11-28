#!/usr/bin/env python3
"""
Fetch TAO price history from Taostats API for chart display.
Stores multiple timeframes: 7d, 30d, 60d, 90d, 365d
"""

import os
import sys
import json
import time
import requests
from datetime import datetime, timezone, timedelta

TAOSTATS_API_KEY = os.getenv("TAOSTATS_API_KEY")
# OHLC endpoint for daily candles - better for longer timeframes
TAOSTATS_OHLC_URL = "https://api.taostats.io/v1/price/ohlc"
# History endpoint for detailed data
TAOSTATS_HISTORY_URL = "https://api.taostats.io/v1/price/history"
# Fallback when Taostats refuses (e.g. 410 Gone): public market-data mirror of Binance, no key needed
BINANCE_KLINES_URL = "https://data-api.binance.vision/api/v3/klines"


def fetch_price_history_binance(days: int):
    """Fallback: TAOUSDT klines from Binance. Hourly for <= 3 days, daily otherwise.
    Returns [[timestamp_ms, close_price], ...] ascending, same shape as the Taostats functions."""
    interval = "1h" if days <= 3 else "1d"
    limit = days * 24 if days <= 3 else days
    try:
        resp = requests.get(BINANCE_KLINES_URL, params={"symbol": "TAOUSDT", "interval": interval, "limit": min(limit, 1000)}, timeout=30)
        resp.raise_for_status()
        klines = resp.json()
        chart_data = [[int(k[0]), float(k[4])] for k in klines]
        chart_data.sort(key=lambda x: x[0])
        print(f"✅ Binance fallback: {len(chart_data)} points for {days}d", file=sys.stderr)
        return chart_data or None
    except Exception as e:
        print(f"❌ Binance fallback failed for {days}d: {e}", file=sys.stderr)
        return None


def fetch_price_history_ohlc(days: int):
    """Fetch price history using OHLC endpoint (daily candles)."""
    if not TAOSTATS_API_KEY:
        print("❌ TAOSTATS_API_KEY not set", file=sys.stderr)
        return None
    
    headers = {
        "accept": "application/json",
        "Authorization": TAOSTATS_API_KEY
    }
    
    # Calculate timestamp range
    now = datetime.now(timezone.utc)
    start_ts = int((now - timedelta(days=days)).timestamp())
    end_ts = int(now.timestamp())
    
    all_data = []
    page = 1
    
    try:
        while True:
            url = f"{TAOSTATS_OHLC_URL}?asset=tao&period=1d&timestamp_start={start_ts}&timestamp_end={end_ts}&limit=200&page={page}"
            resp = requests.get(url, headers=headers, timeout=30)
            resp.raise_for_status()
            data = resp.json()
            
            if not data.get("data"):
                break
                
            all_data.extend(data["data"])
            
            # Check for next page
            pagination = data.get("pagination", {})
            if pagination.get("next_page"):
                page = pagination["next_page"]
            else:
                break
        
        if not all_data:
            print(f"❌ No OHLC data for {days}d", file=sys.stderr)
            return None
        
        # Convert to chart format: [[timestamp_ms, close_price], ...]
        # Sort by timestamp ascending (oldest first)
        chart_data = []
        for item in all_data:
            ts = item.get("timestamp")
            close = item.get("close")
            if ts and close:
                # Parse timestamp and convert to milliseconds
                try:
                    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    ts_ms = int(dt.timestamp() * 1000)
                    chart_data.append([ts_ms, float(close)])
                except Exception as e:
                    print(f"⚠️ Failed to parse timestamp {ts}: {e}", file=sys.stderr)
        
        # Sort ascending by timestamp
        chart_data.sort(key=lambda x: x[0])
        
        print(f"✅ Fetched {len(chart_data)} OHLC points for {days}d", file=sys.stderr)
        return chart_data
        
    except Exception as e:
        print(f"❌ OHLC fetch failed for {days}d: {e}", file=sys.stderr)
        return None


def fetch_price_history_detailed(days: int, limit: int = 200):
    """Fetch price history using detailed history endpoint (for shorter timeframes)."""
    if not TAOSTATS_API_KEY:
        print("❌ TAOSTATS_API_KEY not set", file=sys.stderr)
        return None
    
    headers = {
        "accept": "application/json",
        "Authorization": TAOSTATS_API_KEY
    }
    
    # Calculate timestamp range
    now = datetime.now(timezone.utc)
    start_ts = int((now - timedelta(days=days)).timestamp())
    end_ts = int(now.timestamp())
    
    try:
        url = f"{TAOSTATS_HISTORY_URL}?asset=tao&timestamp_start={start_ts}&timestamp_end={end_ts}&limit={limit}"
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        
        if not data.get("data"):
            print(f"❌ No history data for {days}d", file=sys.stderr)
            return None
        
        # Convert to chart format
        chart_data = []
        for item in data["data"]:
            ts = item.get("created_at") or item.get("timestamp")
            price = item.get("price")
            if ts and price:
                try:
                    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
                    ts_ms = int(dt.timestamp() * 1000)
                    chart_data.append([ts_ms, float(price)])
                except Exception as e:
                    print(f"⚠️ Failed to parse timestamp {ts}: {e}", file=sys.stderr)
        
        # Sort ascending by timestamp
        chart_data.sort(key=lambda x: x[0])
        
        print(f"✅ Fetched {len(chart_data)} detailed points for {days}d", file=sys.stderr)
        return chart_data
        
    except Exception as e:
        print(f"❌ Detailed fetch failed for {days}d: {e}", file=sys.stderr)
        return None


def main():
    """Fetch all timeframes and save to JSON."""
    
    # Define timeframes to fetch
    timeframes = {
        "1": 1,
        "3": 3,
        "7": 7,
        "30": 30,
        "60": 60,
        "90": 90,
        "365": 365
    }
    
    result = {
        "_source": "taostats",
        "_timestamp": datetime.now(timezone.utc).isoformat(),
        "data": {}
    }
    sources = set()
    
    for key, days in timeframes.items():
        print(f"📊 Fetching {days}d price history...", file=sys.stderr)
        time.sleep(5)  # stay below the Taostats rate limit (a burst caused HTTP 429 on the 365d call)
        
        # Use detailed history for short timeframes, OHLC for longer ones
        if days <= 3:
            # For 1-3 days, use hourly data from detailed endpoint
            data = fetch_price_history_detailed(days, limit=days * 24 + 10)
        else:
            # For longer timeframes, daily OHLC is sufficient
            data = fetch_price_history_ohlc(days)
        
        if data:
            sources.add("taostats")
        else:
            data = fetch_price_history_binance(days)
            if data:
                sources.add("binance")

        if data:
            result["data"][key] = data
        else:
            print(f"⚠️ No data for {key}d timeframe", file=sys.stderr)
    
    if not result["data"]:
        print("❌ No price history data fetched", file=sys.stderr)
        sys.exit(1)
    
    result["_source"] = "+".join(sorted(sources)) or "taostats"

    # Save to file
    output_file = "price_history.json"
    with open(output_file, "w") as f:
        json.dump(result, f, indent=2)
    
    print(f"✅ Price history written to {output_file}", file=sys.stderr)
    
    # Print summary
    for key, data in result["data"].items():
        print(f"  {key}d: {len(data)} points", file=sys.stderr)
    
    # Output JSON to stdout for workflow
    print(json.dumps(result))


if __name__ == "__main__":
    main()
