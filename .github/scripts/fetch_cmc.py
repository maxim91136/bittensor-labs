# CoinMarketCap API fetcher for Bittensor-Labs
# Modular CMC data fetcher - stores various CMC data in Cloudflare KV
# Uses CMC_API_TOKEN secret

import os
import sys
import json
import requests
from datetime import datetime, timezone

CMC_BASE_URL = "https://pro-api.coinmarketcap.com"

def get_headers(api_key):
    return {
        "X-CMC_PRO_API_KEY": api_key,
        "Accept": "application/json"
    }

def fetch_fear_and_greed(api_key):
    """Fetch CMC Fear & Greed Index"""
    url = f"{CMC_BASE_URL}/v3/fear-and-greed/latest"
    resp = requests.get(url, headers=get_headers(api_key), timeout=15)
    if resp.status_code != 200:
        raise Exception(f"CMC F&G API error: {resp.status_code} - {resp.text}")
    data = resp.json()
    if not data or 'data' not in data:
        raise Exception("No data in CMC F&G response")
    return data['data']

def fetch_tao_quote(api_key):
    """Fetch TAO price/market data from CMC"""
    url = f"{CMC_BASE_URL}/v2/cryptocurrency/quotes/latest"
    params = {"symbol": "TAO", "convert": "USD"}
    resp = requests.get(url, headers=get_headers(api_key), params=params, timeout=15)
    if resp.status_code != 200:
        raise Exception(f"CMC Quote API error: {resp.status_code} - {resp.text}")
    data = resp.json()
    if not data or 'data' not in data or 'TAO' not in data['data']:
        raise Exception("No TAO data in CMC response")
    return data['data']['TAO'][0]

def fetch_global_metrics(api_key):
    """Fetch global crypto market metrics from CMC"""
    url = f"{CMC_BASE_URL}/v1/global-metrics/quotes/latest"
    resp = requests.get(url, headers=get_headers(api_key), timeout=15)
    if resp.status_code != 200:
        raise Exception(f"CMC Global API error: {resp.status_code} - {resp.text}")
    data = resp.json()
    if not data or 'data' not in data:
        raise Exception("No data in CMC Global response")
    return data['data']

def put_kv_json(account_id, api_token, namespace_id, key, obj):
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/storage/kv/namespaces/{namespace_id}/values/{key}"
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Content-Type": "application/json",
    }
    data = json.dumps(obj)
    resp = requests.put(url, headers=headers, data=data.encode('utf-8'), timeout=30)
    return resp.status_code in (200, 204)

def main():
    # Environment variables
    cmc_key = os.getenv('CMC_API_TOKEN')
    account_id = os.getenv('CF_ACCOUNT_ID')
    cf_token = os.getenv('CF_API_TOKEN')
    namespace_id = os.getenv('CF_METRICS_NAMESPACE_ID')

    if not cmc_key:
        print("CMC_API_TOKEN not set", file=sys.stderr)
        sys.exit(1)
    if not (account_id and cf_token and namespace_id):
        print("Missing Cloudflare KV credentials", file=sys.stderr)
        sys.exit(1)

    now_iso = datetime.now(timezone.utc).isoformat()
    results = {}

    # Fetch Fear & Greed
    try:
        fng = fetch_fear_and_greed(cmc_key)
        results['fear_and_greed'] = {
            'value': fng.get('value'),
            'value_classification': fng.get('value_classification'),
            'last_updated': now_iso,
            '_source': 'coinmarketcap'
        }
        print(f"CMC F&G: {fng.get('value')} ({fng.get('value_classification')})")
    except Exception as e:
        print(f"CMC F&G fetch failed: {e}", file=sys.stderr)
        results['fear_and_greed'] = None

    # Fetch TAO quote (optional - for additional price source)
    try:
        tao = fetch_tao_quote(cmc_key)
        quote = tao.get('quote', {}).get('USD', {})
        results['tao_quote'] = {
            'price': quote.get('price'),
            'volume_24h': quote.get('volume_24h'),
            'percent_change_24h': quote.get('percent_change_24h'),
            'percent_change_7d': quote.get('percent_change_7d'),
            'market_cap': quote.get('market_cap'),
            'last_updated': now_iso,
            '_source': 'coinmarketcap'
        }
        print(f"CMC TAO: ${quote.get('price'):.2f}")
    except Exception as e:
        print(f"CMC TAO quote fetch failed: {e}", file=sys.stderr)
        results['tao_quote'] = None

    # Fetch global metrics (optional)
    try:
        global_data = fetch_global_metrics(cmc_key)
        quote = global_data.get('quote', {}).get('USD', {})
        results['global_metrics'] = {
            'total_market_cap': quote.get('total_market_cap'),
            'total_volume_24h': quote.get('total_volume_24h'),
            'btc_dominance': global_data.get('btc_dominance'),
            'eth_dominance': global_data.get('eth_dominance'),
            'active_cryptocurrencies': global_data.get('active_cryptocurrencies'),
            'last_updated': now_iso,
            '_source': 'coinmarketcap'
        }
        print(f"CMC Global: BTC dominance {global_data.get('btc_dominance'):.1f}%")
    except Exception as e:
        print(f"CMC Global metrics fetch failed: {e}", file=sys.stderr)
        results['global_metrics'] = None

    # Store in KV
    results['_timestamp'] = now_iso
    ok = put_kv_json(account_id, cf_token, namespace_id, 'cmc_data', results)
    if not ok:
        print("Failed to write CMC data to KV", file=sys.stderr)
        sys.exit(1)

    print("CMC data updated in KV.")

if __name__ == "__main__":
    main()
