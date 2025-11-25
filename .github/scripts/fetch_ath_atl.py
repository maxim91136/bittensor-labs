
import requests
import json
from datetime import datetime

COINGECKO_API = 'https://api.coingecko.com/api/v3/coins/bittensor'

def fetch_ath_atl():
    try:
        res = requests.get(COINGECKO_API, timeout=10)
        res.raise_for_status()
        import requests
        import json
        import os
        from datetime import datetime

        COINGECKO_API = 'https://api.coingecko.com/api/v3/coins/bittensor'

        KEEP_BACKUPS = int(os.environ.get('KEEP_ATH_ATL_BACKUPS', '30'))

        def rotate_backups(pattern='tao_ath_atl-', keep=KEEP_BACKUPS):
            # Keep last `keep` backups sorted by filename (timestamp encoded in name)
            files = [f for f in os.listdir('.') if f.startswith(pattern) and f.endswith('.json')]
            files.sort(reverse=True)
            to_remove = files[keep:]
            for f in to_remove:
                try:
                    os.remove(f)
                except Exception:
                    pass

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
                # Write canonical file
                with open('tao_ath_atl.json', 'w') as f:
                    json.dump(result, f, indent=2)
                # Also write a timestamped backup for archives/diagnostics
                timestamp = datetime.utcnow().strftime('%Y%m%dT%H%M%SZ')
                backup_name = f'tao_ath_atl-{timestamp}.json'
                with open(backup_name, 'w') as bf:
                    json.dump(result, bf, indent=2)
                # Rotate backups to keep disk usage bounded
                rotate_backups()
                print('ATH/ATL data written to tao_ath_atl.json')
                print(f'Backup written to {backup_name}')
                print(json.dumps(result, indent=2))
            except Exception as e:
                print('Error:', str(e))
                # Do not write any partial output; exit non-zero so CI alerts.
                exit(1)

        if __name__ == '__main__':
            fetch_ath_atl()
