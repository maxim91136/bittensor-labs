Usage: fetch_x_alerts.py (Nitter RSS)

This script fetches latest TAO Alerts using Nitter RSS (free) and writes a JSON file
ready to be stored in Cloudflare KV. The script supports multiple Nitter instances as
fallback and accepts retries/backoff options.

Common CLI arguments:
-o, --out           Output JSON path (default: x_alerts_latest.json)
--nitter-instances  Comma-separated list of Nitter base URLs to try in order
--username          Username to fetch from (default: bittensor_alert)
-m, --max           Max number of alerts to fetch (e.g., 1..5)
--retries           Retry attempts (fallback to env RETRY_ATTEMPTS)
--backoff           Backoff seconds (fallback to env RETRY_BACKOFF)

Configuration (GitHub Actions):
- Set `NITTER_INSTANCES` as a job env to a comma-separated list of instances
- The workflow uses `.github/scripts/requirements.txt` to install dependencies
