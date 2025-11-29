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
    only_vols = [v for (_, v) in vols]
    N = len(only_vols)

    # windows
    last_3 = only_vols[-3:] if N >= 1 else []
    last_10 = only_vols[-10:] if N >= 1 else only_vols

    ma_short = mean(last_3) if last_3 else mean(only_vols[-1:])
    ma_med = mean(last_10)
    sd_med = stddev(last_10)

    last_volume = only_vols[-1]
    pct_change_vs_ma_med = None
    if ma_med and ma_med != 0:
        pct_change_vs_ma_med = (last_volume - ma_med) / ma_med

    pct_change_vs_ma_short = None
    if ma_short and ma_short != 0:
        pct_change_vs_ma_short = (last_volume - ma_short) / ma_short

    # confidence: based on time-window (10-min samples)
    # low: <1 day (~144 samples), medium: 1-3 days (~144-432 samples), high: >=3 days (~432+ samples)
    if N < 144:
        confidence = 'low'
    elif N < 432:
        confidence = 'medium'
    else:
        confidence = 'high'

    # Determine trend_direction using dual-MA confirmation strategy
    # Short-term (100 min): ±3% threshold filters intraday noise
    # Medium-term (1 day): ±1% threshold confirms the trend is real
    # Both must agree to avoid false signals
    short_threshold = 0.03
    med_threshold = 0.01

    trend_direction = 'neutral'
    try:
        if pct_change_vs_ma_short is not None and pct_change_vs_ma_med is not None:
            # UP: both positive and meet thresholds
            if pct_change_vs_ma_short >= short_threshold and pct_change_vs_ma_med >= med_threshold:
                trend_direction = 'up'
            # DOWN: both negative and meet thresholds
            elif pct_change_vs_ma_short <= -short_threshold and pct_change_vs_ma_med <= -med_threshold:
                trend_direction = 'down'
            else:
                trend_direction = 'neutral'
    except Exception:
        trend_direction = 'neutral'

    aggregates = {
        '_generated_at': datetime.now(timezone.utc).isoformat(),
        'count': N,
        'last_volume': last_volume,
        'ma_short': ma_short,
        'ma_med': ma_med,
        'sd_med': sd_med,
        'pct_change_vs_ma_med': pct_change_vs_ma_med,
        'pct_change_vs_ma_short': pct_change_vs_ma_short,
        'trend_direction': trend_direction,
        'confidence': confidence,
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
