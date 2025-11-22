#!/usr/bin/env python3
"""Fetch latest Tweets for a user (TAO Alert) and write to file / stdout.

Usage:
  X_BEARER_TOKEN='...' X_USER_ID='...' python3 .github/scripts/fetch_x_alerts.py --out alerts.json --max 5
"""
import os
import sys
import json
import argparse
from datetime import datetime, timezone

try:
    import requests
except Exception:
    requests = None

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def fetch_tweets(bearer_token: str, user_id: str, max_results: int = 5):
    url = f"https://api.twitter.com/2/users/{user_id}/tweets"
    params = {
        'max_results': min(100, max_results),
        'tweet.fields': 'created_at,edit_history_tweet_ids,author_id'
    }
    headers = {'Authorization': f'Bearer {bearer_token}', 'Accept': 'application/json'}
    if requests:
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        resp.raise_for_status()
        data = resp.json()
    else:
        # fallback to standard library
        from urllib.request import Request, urlopen
        from urllib.parse import urlencode
        query = urlencode({k: str(v) for k, v in params.items()})
        req = Request(url + '?' + query, headers=headers)
        with urlopen(req, timeout=15) as r:
            data = json.loads(r.read())

    tweets = data.get('data', [])
    alerts = []
    for t in tweets[:max_results]:
        alerts.append({
            'id': t.get('id'),
            'text': t.get('text'),
            'edit_history_tweet_ids': t.get('edit_history_tweet_ids') or [],
            'author_id': t.get('author_id'),
            'created_at': t.get('created_at')
        })
    return {'fetched_at': now_iso(), 'alerts': alerts}

def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument('--out', '-o', help='Write output JSON to path (default: stdout)')
    p.add_argument('--max', '-m', help='Max number of tweets to fetch', type=int, default=5)
    args = p.parse_args(argv)

    bearer = os.getenv('X_BEARER_TOKEN')
    user_id = os.getenv('X_USER_ID')
    if not bearer or not user_id:
        print('X_BEARER_TOKEN and X_USER_ID must be set', file=sys.stderr)
        sys.exit(2)

    try:
        out = fetch_tweets(bearer, user_id, args.max)
        out_str = json.dumps(out, indent=2)
        if args.out:
            with open(args.out, 'w', encoding='utf-8') as fh:
                fh.write(out_str)
            print('Wrote', args.out)
        else:
            print(out_str)
    except Exception as e:
        print('Error', e, file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
