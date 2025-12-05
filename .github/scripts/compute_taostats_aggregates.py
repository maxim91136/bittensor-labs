#!/usr/bin/env python3
"""Compute aggregates for taostats_history and write to Cloudflare KV as taostats_aggregates.

This script is intended to run in CI (GitHub Actions) with the following env vars set:
  - CF_ACCOUNT_ID
  - CF_API_TOKEN
  - CF_METRICS_NAMESPACE_ID

It fetches `taostats_history` from KV, computes simple aggregates (MA, stddev, percent change,
confidence) and writes the result to KV key `taostats_aggregates` for fast UI access.
"""
import os
import sys
import json
import math
from datetime import datetime, timezone
import requests


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
        return default


def fetch_kv_json(account_id, api_token, namespace_id, key):
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/values/{key}"
    headers = {"Authorization": f"Bearer {api_token}"}
    resp = requests.get(url, headers=headers, timeout=30)
    if resp.status_code == 200:
        text = resp.text
        if not text:
            return None
        try:
            return json.loads(text)
        except Exception:
            # KV may contain raw JSON string; try to parse loosely
            try:
                return json.loads(resp.content.decode('utf-8'))
            except Exception:
                return None
    elif resp.status_code == 404:
        return None
    else:
        print(f"Warning: fetch_kv_json got status={resp.status_code} for key={key}", file=sys.stderr)
        return None


def put_kv_json(account_id, api_token, namespace_id, key, obj):
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/values/{key}"
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json",
    }
    data = json.dumps(obj)
    resp = requests.put(url, headers=headers, data=data.encode('utf-8'), timeout=30)
    return resp.status_code in (200, 204)


def mean(values):
    if not values:
        return 0.0
    return sum(values) / len(values)


def stddev(values, ddof=0):
    n = len(values)
    if n <= 1:
        return 0.0
    m = mean(values)
    var = sum((x - m) ** 2 for x in values) / (n - ddof)
    return math.sqrt(var)


def compute_aggregates(history):
    # Expect history as list of objects with volume_24h and _timestamp
    if not history or not isinstance(history, list):
        return None
    # normalize: filter entries that have numeric volume
    vols = [ (e.get('_timestamp'), float(e.get('volume_24h') or 0.0)) for e in history if e ]
    if not vols:
        return None
    # keep order: assume history oldest->newest; if not, sort by timestamp
    try:
        vols = sorted(vols, key=lambda x: x[0])
    except Exception:
        pass
    
    # Also extract prices for price_24h_pct calculation
    prices = []
    for e in history:
        if e and e.get('price') is not None:
            try:
                prices.append((e.get('_timestamp'), float(e.get('price'))))
            except:
                pass
    try:
        prices = sorted(prices, key=lambda x: x[0])
    except Exception:
        pass
    
    # Calculate actual time span in hours
    hours_of_data = 0
    try:
        first_ts = vols[0][0]
        last_ts = vols[-1][0]
        first_dt = datetime.fromisoformat(first_ts.replace('Z', '+00:00'))
        last_dt = datetime.fromisoformat(last_ts.replace('Z', '+00:00'))
        hours_of_data = (last_dt - first_dt).total_seconds() / 3600
    except Exception:
        pass
    
    only_vols = [v for (_, v) in vols]
    N = len(only_vols)

    # Calculate MAs using available data
    # Use time-based logic: show MA if we have enough time coverage
    last_3 = only_vols[-3:] if N >= 3 else only_vols
    last_10 = only_vols[-10:] if N >= 10 else only_vols
    
    ma_short = mean(last_3) if last_3 else None
    ma_med = mean(last_10) if last_10 else None
    
    # 3-day MA: use all data if we have >= 72h, otherwise None
    ma_3d = mean(only_vols) if hours_of_data >= 72 else None

    # 7-day MA: use all data if we have >= 168h (7 days), otherwise None
    ma_7d = mean(only_vols) if hours_of_data >= 168 else None
    
    sd_med = stddev(last_10) if len(last_10) >= 2 else None

    last_volume = only_vols[-1]
    pct_change_vs_ma_short = None
    if ma_short and ma_short != 0:
        pct_change_vs_ma_short = (last_volume - ma_short) / ma_short

    pct_change_vs_ma_med = None
    if ma_med and ma_med != 0:
        pct_change_vs_ma_med = (last_volume - ma_med) / ma_med

    pct_change_vs_ma_3d = None
    if ma_3d and ma_3d != 0:
        pct_change_vs_ma_3d = (last_volume - ma_3d) / ma_3d

    pct_change_vs_ma_7d = None
    if ma_7d and ma_7d != 0:
        pct_change_vs_ma_7d = (last_volume - ma_7d) / ma_7d

    # confidence: based on actual time span
    # low: <24h, medium: 24-72h, high: >=72h
    if hours_of_data < 24:
        confidence = 'low'
    elif hours_of_data < 72:
        confidence = 'medium'
    else:
        confidence = 'high'

    # === Calculate price_24h_pct from history ===
    # Find entry closest to 24h ago and compare with current price
    price_24h_pct = None
    current_price = prices[-1][1] if prices else None
    if prices and len(prices) >= 2 and hours_of_data >= 20:
        try:
            now = datetime.fromisoformat(prices[-1][0].replace('Z', '+00:00'))
            target_time = now.timestamp() - (24 * 3600)  # 24h ago
            
            # Find closest entry to 24h ago
            old_price = None
            min_diff = float('inf')
            for ts, price in prices:
                entry_time = datetime.fromisoformat(ts.replace('Z', '+00:00')).timestamp()
                diff = abs(entry_time - target_time)
                if diff < min_diff:
                    min_diff = diff
                    old_price = price
            
            if old_price and old_price > 0:
                price_24h_pct = ((current_price - old_price) / old_price) * 100
        except Exception as e:
            print(f"Warning: price_24h_pct calculation failed: {e}", file=sys.stderr)
            price_24h_pct = None

    # === Calculate volume_change_24h from history ===
    # Compare current volume with volume from ~24h ago
    volume_change_24h = None
    if vols and len(vols) >= 2 and hours_of_data >= 20:
        try:
            now = datetime.fromisoformat(vols[-1][0].replace('Z', '+00:00'))
            target_time = now.timestamp() - (24 * 3600)  # 24h ago
            
            # Find closest entry to 24h ago
            old_volume = None
            min_diff = float('inf')
            for ts, vol in vols:
                entry_time = datetime.fromisoformat(ts.replace('Z', '+00:00')).timestamp()
                diff = abs(entry_time - target_time)
                if diff < min_diff:
                    min_diff = diff
                    old_volume = vol
            
            if old_volume and old_volume > 0:
                volume_change_24h = ((last_volume - old_volume) / old_volume) * 100
        except Exception as e:
            print(f"Warning: volume_change_24h calculation failed: {e}", file=sys.stderr)
            volume_change_24h = None

    # === Calculate volume_signal based on price and volume changes ===
    volume_signal = None
    if price_24h_pct is not None and volume_change_24h is not None:
        threshold = 3.0  # ±3% for significant change
        vol_up = volume_change_24h > threshold
        vol_down = volume_change_24h < -threshold
        price_up = price_24h_pct > threshold
        price_down = price_24h_pct < -threshold
        price_stable = not price_up and not price_down
        
        if vol_up and price_up:
            volume_signal = 'green'      # Bullish
        elif vol_up and price_down:
            volume_signal = 'red'        # Bearish
        elif vol_up and price_stable:
            volume_signal = 'orange'     # Watch
        elif vol_down and price_up:
            volume_signal = 'yellow'     # Caution
        elif vol_down and price_down:
            volume_signal = 'yellow'     # Consolidation
        else:
            volume_signal = 'neutral'    # Stable

    # Determine trend_direction using hierarchical MA strategy
    # Priority hierarchy: 7-day > 3-day > 1-day > short-term
    # Each level can independently trigger alerts, higher priority overrides lower
    short_threshold = 0.03
    med_threshold = 0.03  # 1-day threshold
    long_threshold = 0.03  # 3-day & 7-day threshold

    trend_direction = 'neutral'
    try:
        # Highest priority: 7-day MA (most structural)
        if pct_change_vs_ma_7d is not None:
            if pct_change_vs_ma_7d <= -long_threshold:
                trend_direction = 'down'
            elif pct_change_vs_ma_7d >= long_threshold:
                trend_direction = 'up'
        
        # If 7-day didn't trigger, check 3-day
        if trend_direction == 'neutral' and pct_change_vs_ma_3d is not None:
            if pct_change_vs_ma_3d <= -long_threshold:
                trend_direction = 'down'
            elif pct_change_vs_ma_3d >= long_threshold:
                trend_direction = 'up'
        
        # If 3-day didn't trigger, check 1-day
        if trend_direction == 'neutral' and pct_change_vs_ma_med is not None:
            if pct_change_vs_ma_med <= -med_threshold:
                trend_direction = 'down'
            elif pct_change_vs_ma_med >= med_threshold:
                trend_direction = 'up'
        
        # If 1-day didn't trigger, check short-term confirmation
        if trend_direction == 'neutral' and pct_change_vs_ma_short is not None and pct_change_vs_ma_med is not None:
            if pct_change_vs_ma_short <= -short_threshold and pct_change_vs_ma_med <= -0.01:
                trend_direction = 'down'
            elif pct_change_vs_ma_short >= short_threshold and pct_change_vs_ma_med >= 0.01:
                trend_direction = 'up'
    except Exception:
        trend_direction = 'neutral'

    aggregates = {
        '_generated_at': datetime.now(timezone.utc).isoformat(),
        'count': N,
        'last_volume': last_volume,
        'last_price': current_price,
        'ma_short': ma_short,
        'ma_med': ma_med,
        'ma_3d': ma_3d,
        'ma_7d': ma_7d,
        'sd_med': sd_med,
        'pct_change_vs_ma_short': pct_change_vs_ma_short,
        'pct_change_vs_ma_med': pct_change_vs_ma_med,
        'pct_change_vs_ma_3d': pct_change_vs_ma_3d,
        'pct_change_vs_ma_7d': pct_change_vs_ma_7d,
        'price_24h_pct': price_24h_pct,
        'volume_change_24h': volume_change_24h,
        'volume_signal': volume_signal,
        'trend_direction': trend_direction,
        'confidence': confidence,
        'hours_of_data': round(hours_of_data, 1),
        'sample_timestamps': [t for (t, _) in vols[-10:]],
    }
    return aggregates


def main():
    CF_ACCOUNT_ID = os.getenv('CF_ACCOUNT_ID')
    CF_API_TOKEN = os.getenv('CF_API_TOKEN')
    CF_KV_NAMESPACE_ID = os.getenv('CF_METRICS_NAMESPACE_ID')

    if not CF_ACCOUNT_ID or not CF_API_TOKEN or not CF_KV_NAMESPACE_ID:
        print('CF_ACCOUNT_ID, CF_API_TOKEN, CF_METRICS_NAMESPACE_ID are required', file=sys.stderr)
        sys.exit(1)

    history = fetch_kv_json(CF_ACCOUNT_ID, CF_API_TOKEN, CF_KV_NAMESPACE_ID, 'taostats_history')
    if history is None:
        print('No taostats_history found in KV; nothing to aggregate')
        # still write an empty aggregates object with timestamp
        empty = {
            '_generated_at': datetime.now(timezone.utc).isoformat(),
            'count': 0
        }
        put_kv_json(CF_ACCOUNT_ID, CF_API_TOKEN, CF_KV_NAMESPACE_ID, 'taostats_aggregates', empty)
        sys.exit(0)

    aggregates = compute_aggregates(history)
    if aggregates is None:
        print('Failed to compute aggregates', file=sys.stderr)
        sys.exit(1)

    ok = put_kv_json(CF_ACCOUNT_ID, CF_API_TOKEN, CF_KV_NAMESPACE_ID, 'taostats_aggregates', aggregates)
    if not ok:
        print('Failed to write taostats_aggregates to KV', file=sys.stderr)
        sys.exit(1)
    print('Aggregates written to KV: count=', aggregates.get('count'))


if __name__ == '__main__':
    main()
