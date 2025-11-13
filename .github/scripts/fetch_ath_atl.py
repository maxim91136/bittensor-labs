import requests
import json
import os
from datetime import datetime

COINGECKO_API = 'https://api.coingecko.com/api/v3/coins/bittensor'
CF_API_TOKEN = os.getenv('CF_API_TOKEN')
CF_ACCOUNT_ID = os.getenv('CF_ACCOUNT_ID')
CF_METRICS_NAMESPACE_ID = os.getenv('CF_METRICS_NAMESPACE_ID')
KV_KEY = 'tao_ath_atl'

# Cloudflare KV API endpoint
CF_KV_API = f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/storage/kv/namespaces/{CF_METRICS_NAMESPACE_ID}/values/{KV_KEY}'

def fetch_ath_atl():
    try:
        res = requests.get(COINGECKO_API, timeout=10)
        res.raise_for_status()
        data = res.json()
        ath = data.get('market_data', {}).get('ath', {}).get('usd')
        ath_date = data.get('market_data', {}).get('ath_date', {}).get('usd')
        atl = data.get('market_data', {}).get('atl', {}).get('usd')
        atl_date = data.get('market_data', {}).get('atl_date', {}).get('usd')
        if ath is None or atl is None:
            raise ValueError('ATH/ATL not found in response')
        result = {
            'ath': ath,
            'ath_date': ath_date,
            'atl': atl,
            'atl_date': atl_date,
            'source': 'coingecko',
            'updated': datetime.utcnow().isoformat() + 'Z'
        }
        # Store result in Cloudflare KV
        headers = {
            'Authorization': f'Bearer {CF_API_TOKEN}',
            'Content-Type': 'application/json'
        }
        kv_res = requests.put(CF_KV_API, headers=headers, data=json.dumps(result))
        kv_res.raise_for_status()
        print('ATH/ATL data saved to Cloudflare KV:', result)
    except Exception as e:
        print('Error:', str(e))
        exit(1)

if __name__ == '__main__':
    fetch_ath_atl()
