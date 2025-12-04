#!/usr/bin/env python3
"""
Simple post-deploy smoke test script used by GitHub Actions.
It checks /VERSION and a few critical endpoints returning valid JSON.
"""
import os
import sys
import json
import urllib.request
import urllib.error
from urllib.parse import urljoin

CF_WORKER_URL = os.environ.get("CF_WORKER_URL", "").strip()
EXPECTED_VERSION = os.environ.get("EXPECTED_VERSION", "").strip()
TIMEOUT = int(os.environ.get("SMOKE_TIMEOUT", 10))

if not CF_WORKER_URL:
    print("CF_WORKER_URL not set; skipping smoke test (OK)")
    sys.exit(0)

print(f"Using worker base URL: {CF_WORKER_URL}")
print(f"Expected version: {EXPECTED_VERSION}")

# Helper: fetch URL and return status, body

def fetch(url):
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "bittensor-labs-smoke/1.0"})
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            status = resp.getcode()
            data = resp.read()
            return status, data
    except urllib.error.HTTPError as e:
        return e.code, None
    except urllib.error.URLError as e:
        print(f"Network error fetching {url}: {e}")
        return 0, None

# 1) Check /VERSION
version_url = CF_WORKER_URL.rstrip("/") + "/VERSION"
status, data = fetch(version_url)
if status != 200 or not data:
    print(f"Failed to fetch deployed version; status={status}; url={version_url}")
    sys.exit(1)

try:
    actual_version = data.decode("utf-8").strip()
except Exception as e:
    print(f"Failed to decode version response: {e}")
    sys.exit(1)

if EXPECTED_VERSION and EXPECTED_VERSION != actual_version:
    print(f"Version mismatch! expected={EXPECTED_VERSION}, actual={actual_version}")
    sys.exit(1)

print(f"Version OK: {actual_version}")

# 2) Check endpoints
critical_endpoints = [
    "/api/top_subnets",
    "/api/top_validators",
    "/api/network",
]

for ep in critical_endpoints:
    url = CF_WORKER_URL.rstrip("/") + ep
    print(f"Checking endpoint: {url}")
    status, data = fetch(url)
    if status != 200 or not data:
        print(f"FAILED: {url} returned status {status}")
        sys.exit(1)
    try:
        parsed = json.loads(data.decode("utf-8"))
        if parsed is None:
            raise ValueError("Empty JSON returned")
    except Exception as e:
        print(f"FAILED: endpoint {url} returned non-JSON or malformed data: {e}")
        sys.exit(1)
    print(f"OK: {url}")

print("Smoke tests passed.")
sys.exit(0)
