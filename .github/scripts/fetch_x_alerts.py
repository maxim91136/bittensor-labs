"""
fetch_x_alerts.py

Fetches TAO Alerts and relevant data from X (Twitter) using OAuth2 authentication.
Stores results for use in the dashboard or further processing.
"""
import os
import requests
import json
from datetime import datetime, timezone

# Configuration
X_BEARER_TOKEN = os.getenv('X_BEARER_TOKEN')  # Set this in your GitHub secrets or environment
X_USER_ID = os.getenv('X_USER_ID')           # The user ID to fetch alerts from
ALERTS_QUERY = os.getenv('X_ALERTS_QUERY', 'TAO OR Bittensor')  # Search query for TAO alerts
OUTPUT_PATH = os.getenv('X_ALERTS_OUTPUT', 'x_alerts.json')

API_URL = f"https://api.twitter.com/2/tweets/search/recent"
HEADERS = {
    "Authorization": f"Bearer {X_BEARER_TOKEN}",
    "Content-Type": "application/json"
}

PARAMS = {
    "query": ALERTS_QUERY,
    "max_results": 5,
    "tweet.fields": "created_at,author_id,text"
}

def fetch_alerts():
    if not X_BEARER_TOKEN:
        raise RuntimeError("Missing X_BEARER_TOKEN environment variable.")
    response = requests.get(API_URL, headers=HEADERS, params=PARAMS)
    if response.status_code != 200:
        raise Exception(f"X API error: {response.status_code} {response.text}")
    data = response.json()
    # Add timestamp
    result = {
        "fetched_at": datetime.now(timezone.utc).isoformat() + 'Z',
        "alerts": data.get('data', [])
    }
    with open('x_alerts_latest.json', 'w', encoding='utf-8') as f:
        json.dump(result, f, ensure_ascii=False, indent=2)
    print(f"Fetched {len(result['alerts'])} alerts from X. Saved to x_alerts_latest.json.")

if __name__ == "__main__":
    fetch_alerts()
