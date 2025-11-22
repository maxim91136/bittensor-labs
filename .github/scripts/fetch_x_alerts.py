#!/usr/bin/env python3
"""Fetch latest alerts for a user using Nitter RSS (TAO Alert) and write to file / stdout.

Primary source is Nitter RSS (free, no API key). This script keeps legacy
`fetch_tweets()` (X/Twitter API) as an optional fallback, but Nitter RSS is
the preferred method to avoid rate limits and API changes.

Usage:
    python3 .github/scripts/fetch_x_alerts.py --out alerts.json --max 3
"""
import os
import sys
import json
import argparse
from datetime import datetime, timezone
import time
from typing import Optional

try:
    import requests
except Exception:
    requests = None

def now_iso():
    return datetime.now(timezone.utc).isoformat()

def fetch_tweets(bearer_token: str, user_id: str, max_results: int = 5, max_attempts: int = 3, backoff_seconds: int = 2, since_id: Optional[str] = None):
    # Deprecated: Legacy X/Twitter API fetcher retained for compatibility.
    # Prefer `fetch_nitter()` for Nitter RSS as the primary data source.
    url = f"https://api.twitter.com/2/users/{user_id}/tweets"
    params = {
        'max_results': min(100, max_results),
        'tweet.fields': 'created_at,edit_history_tweet_ids,author_id'
    }
    headers = {'Authorization': f'Bearer {bearer_token}', 'Accept': 'application/json'}

    attempt = 0
    while True:
        attempt += 1
        if since_id:
            params['since_id'] = str(since_id)
        if requests:
            try:
                resp = requests.get(url, headers=headers, params=params, timeout=15)
            except Exception as e:
                if attempt >= max_attempts:
                    raise
                sleep_for = backoff_seconds * (2 ** (attempt - 1))
                print(f"Request failed (attempt {attempt}/{max_attempts}) with error {e}, retrying in {sleep_for}s")
                import time; time.sleep(sleep_for)
                continue
        else:
            # fallback to standard library
            from urllib.request import Request, urlopen
            from urllib.parse import urlencode
            query = urlencode({k: str(v) for k, v in params.items()})
            req = Request(url + '?' + query, headers=headers)
            try:
                with urlopen(req, timeout=15) as r:
                    raw = r.read()
                class R:
                    status_code = 200
                    headers = {}
                    def json(self):
                        return json.loads(raw)
                resp = R()
            except Exception as e:
                if attempt >= max_attempts:
                    raise
                sleep_for = backoff_seconds * (2 ** (attempt - 1))
                print(f"Stdlib request failed (attempt {attempt}/{max_attempts}) error: {e}, retrying in {sleep_for}s")
                time.sleep(sleep_for)
                continue

        # Handle HTTP responses
        status_code = getattr(resp, 'status_code', 200)
        # If requests, also get headers
        resp_headers = getattr(resp, 'headers', {})
        if status_code == 429:
            reset = None
            # Twitter often includes x-rate-limit-reset (epoch seconds) header
            if isinstance(resp_headers, dict):
                reset = resp_headers.get('x-rate-limit-reset') or resp_headers.get('X-Rate-Limit-Reset')
            if reset:
                try:
                    reset_ts = int(reset)
                    import time
                    now_ts = int(time.time())
                    wait = max(0, reset_ts - now_ts)
                    print(f"Rate limited: will wait until reset in {wait}s")
                    # If reset is soon, wait before next attempt; otherwise use backoff
                    if wait <= 60:
                        time.sleep(wait + 1)
                    else:
                        # If the wait is long, break earlier and let the job fail
                        # If the wait is longer than 5 minutes, write a _skipped file and exit gracefully
                        if wait > 300:
                            skipped = {'fetched_at': now_iso(), 'alerts': [], '_skipped': True, 'wait_seconds': wait}
                            return skipped
                        if attempt >= max_attempts:
                            raise RuntimeError(f"Rate limited and reset too far in future ({wait}s)")
                        time.sleep(backoff_seconds * (2 ** (attempt - 1)))
                except Exception:
                    # fallback generic sleep
                    if attempt >= max_attempts:
                        raise RuntimeError("Rate limited and failed to parse reset header")
                    import time; time.sleep(backoff_seconds * (2 ** (attempt - 1)))
                continue
            else:
                # generic handling for 429 without reset header
                if attempt >= max_attempts:
                    raise RuntimeError("Rate limited (429) and no more attempts left")
                import time; time.sleep(backoff_seconds * (2 ** (attempt - 1)))
                continue

        if status_code == 401:
            # Unauthorized access: token may be missing/invalid/expired
            raise PermissionError('Unauthorized: HTTP 401 received from X API. Check X_BEARER_TOKEN validity and permission scopes (read/tweets).')
        if 400 <= status_code:
            # non-429 client/server errors
            try:
                body = resp.json() if hasattr(resp, 'json') else None
            except Exception:
                body = None
            raise RuntimeError(f"X API error: status={status_code} body={body}")
        data = resp.json() if hasattr(resp, 'json') else None
        # Successful response - exit retry loop
        break

    tweets = data.get('data', []) if data else []
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

def fetch_nitter(nitter_instance: str, username: str, max_results: int = 5, since_id: Optional[str] = None, max_attempts: int = 3, backoff_seconds: int = 2):
    # Fetch RSS feed for the user using Nitter instance and parse to alerts format
    url = f"{nitter_instance.rstrip('/')}/{username}/rss"
    attempt = 0
    while True:
        attempt += 1
        try:
            if requests:
                r = requests.get(url, headers={'Accept': 'application/rss+xml'}, timeout=15)
                # If 429, allow handling below
                status_code = getattr(r, 'status_code', None)
                if status_code == 429:
                    resp_headers = getattr(r, 'headers', {}) or {}
                    reset = resp_headers.get('x-rate-limit-reset') or resp_headers.get('X-Rate-Limit-Reset')
                    if reset:
                        try:
                            reset_ts = int(reset)
                            now_ts = int(time.time())
                            wait = max(0, reset_ts - now_ts)
                            if wait > 300:
                                return {'fetched_at': now_iso(), 'alerts': [], '_skipped': True, 'wait_seconds': wait}
                            time.sleep(wait + 1)
                        except Exception:
                            pass
                    else:
                        if attempt >= max_attempts:
                            raise RuntimeError('Rate limited (429)')
                        time.sleep(backoff_seconds * (2 ** (attempt - 1)))
                        continue
                r.raise_for_status()
                raw = r.text
            else:
                from urllib.request import Request, urlopen
                req = Request(url, headers={'Accept': 'application/rss+xml'})
                with urlopen(req, timeout=15) as res:
                    raw = res.read().decode('utf-8')
            # Success: exit the loop
            break
        except Exception as e:
            if attempt >= max_attempts:
                raise RuntimeError(f"Failed to fetch Nitter RSS from {nitter_instance}: {e}")
            sleep_for = backoff_seconds * (2 ** (attempt - 1))
            time.sleep(sleep_for)
            continue

    # Parse RSS XML
    import xml.etree.ElementTree as ET
    try:
        root = ET.fromstring(raw)
    except Exception as e:
        raise RuntimeError(f"Failed to parse RSS XML: {e}")

    # Support both rss->channel->item and atom entries
    items = root.findall('.//item') or root.findall('.//{http://www.w3.org/2005/Atom}entry')
    alerts = []
    for item in items:
        # fields: title / description / link / pubDate
        title = (item.find('title').text if item.find('title') is not None else '')
        desc = (item.find('description').text if item.find('description') is not None else '')
        link = (item.find('link').text if item.find('link') is not None else '')
        pub = (item.find('pubDate').text if item.find('pubDate') is not None else '')
        # fallback for atom
        if not link:
            link_el = item.find('{http://www.w3.org/2005/Atom}link')
            link = link_el.get('href') if link_el is not None else ''
        # Extract the tweet id from link `.../status/<id>`
        tid = None
        if link:
            import re
            m = re.search(r'/status/(\d+)', link)
            if m:
                tid = m.group(1)
        # Parse pubDate into ISO
        created_at = None
        if pub:
            try:
                from email.utils import parsedate_to_datetime
                dt = parsedate_to_datetime(pub)
                # normalize to ISO 8601 UTC
                created_at = dt.astimezone(timezone.utc).isoformat()
            except Exception:
                created_at = None

        text = desc or title or ''
        if since_id and tid:
            try:
                if int(tid) <= int(since_id):
                    continue
            except Exception:
                pass
        alerts.append({
            'id': tid or '',
            'text': text,
            'edit_history_tweet_ids': [],
            'author_id': '',
            'created_at': created_at
        })
        if len(alerts) >= max_results:
            break
    return {'fetched_at': now_iso(), 'alerts': alerts}

def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument('--out', '-o', help='Write output JSON to path (default: x_alerts_latest.json)')
    p.add_argument('--since', help='Only return tweets with ID greater than (i.e., more recent) than this Tweet ID', default=None)
    p.add_argument('--source', help='Data source to fetch (x|nitter)', choices=['x','nitter'], default=None)
    p.add_argument('--nitter-instance', help='Nitter instance base URL (e.g. https://nitter.net)', default=None)
    p.add_argument('--nitter-instances', help='Comma-separated list of Nitter instance base URLs (try in order)', default=None)
    p.add_argument('--username', help='Username to fetch from (for Nitter source)', default='bittensor_alert')
    p.add_argument('--max', '-m', help='Max number of tweets to fetch', type=int, default=5)
    p.add_argument('--retries', type=int, help='Number of retry attempts for requests (overrides env RETRY_ATTEMPTS)', default=None)
    p.add_argument('--backoff', type=int, help='Backoff seconds for retry backoff (overrides env RETRY_BACKOFF)', default=None)
    args = p.parse_args(argv)

    # We now use only Nitter as the primary data source (free RSS). Keep CLI `--source` for future use.
    source = args.source or 'nitter'

    attempts = int(args.retries) if (args.retries is not None) else int(os.getenv('RETRY_ATTEMPTS', '3'))
    backoff = int(args.backoff) if (args.backoff is not None) else int(os.getenv('RETRY_BACKOFF', '2'))
    since_id = args.since or os.getenv('SINCE_ID')
    try:
        # Always fetch from Nitter (free RSS) to avoid X API usage and rate limits
        username = args.username or os.getenv('NITTER_USERNAME', 'bittensor_alert')
        # Create a list of candidate Nitter instances to try
        inst_list = []
        if args.nitter_instances:
            inst_list = [i.strip() for i in args.nitter_instances.split(',') if i.strip()]
        elif args.nitter_instance:
            inst_list = [args.nitter_instance]
        elif os.getenv('NITTER_INSTANCES'):
            inst_list = [i.strip() for i in os.getenv('NITTER_INSTANCES').split(',') if i.strip()]
        elif os.getenv('NITTER_INSTANCE'):
            inst_list = [os.getenv('NITTER_INSTANCE')]
        else:
            inst_list = ['https://nitter.net']

        out = None
        last_error = None
        for inst in inst_list:
            try:
                out = fetch_nitter(inst, username, max_results=args.max, since_id=since_id, max_attempts=attempts, backoff_seconds=backoff)
                break
            except Exception as e:
                last_error = e
                print(f"Failed to fetch from {inst}: {e}")
                continue
        if out is None:
            print(f"All Nitter instances failed. Last error: {last_error}")
            out = {'fetched_at': now_iso(), 'alerts': [], '_skipped': True, 'error': str(last_error)}
        out_str = json.dumps(out, indent=2)
        out_path = args.out or 'x_alerts_latest.json'
        if out_path:
            with open(out_path, 'w', encoding='utf-8') as fh:
                fh.write(out_str)
            print('Wrote', out_path)
        else:
            print(out_str)
    except PermissionError as e:
        print('Unauthorized error:', e, file=sys.stderr)
        sys.exit(3)
    except Exception as e:
        print('Error', e, file=sys.stderr)
        sys.exit(1)

if __name__ == '__main__':
    main()
