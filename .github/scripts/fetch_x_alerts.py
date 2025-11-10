"""
fetch_x_alerts.py

Fetches TAO Alerts and relevant data from X (Twitter) using OAuth2 authentication.
Stores results for use in the dashboard or further processing.
"""
import os
import requests

# Usage: python fetch_x_alerts.py <USER_ID>
import os
import sys
import requests
import json
from datetime import datetime, timezone

X_BEARER_TOKEN = os.getenv('X_BEARER_TOKEN')
if len(sys.argv) < 2:
    print("Usage: python fetch_x_alerts.py <USER_ID>")
    sys.exit(1)
X_USER_ID = sys.argv[1]

API_URL = f"https://api.twitter.com/2/users/{X_USER_ID}/tweets?max_results=10&tweet.fields=created_at,author_id,text"
HEADERS = {
    "Authorization": f"Bearer {X_BEARER_TOKEN}",
    "Content-Type": "application/json"
}

def fetch_alerts():
    if not X_BEARER_TOKEN:
        raise RuntimeError("Missing X_BEARER_TOKEN environment variable.")
    response = requests.get(API_URL, headers=HEADERS)
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

if __name__ == "__main__":
    fetch_alerts()
