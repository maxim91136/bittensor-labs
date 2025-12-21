#!/usr/bin/env python3
"""
GitHub Developer Activity Tracker for Bittensor

Fetches developer metrics from opentensor GitHub repos:
- Active contributors (30d)
- Code commits (7d, 30d)
- Total contributors

Uses GitHub API (free, 5000 req/hour with token)
"""

import os
import sys
import json
import requests
from datetime import datetime, timezone, timedelta

# GitHub API
GITHUB_TOKEN = os.getenv('GITHUB_TOKEN')
GITHUB_API = "https://api.github.com"

# Bittensor repos to track
REPOS = [
    "opentensor/bittensor",      # Main SDK
    "opentensor/subtensor",      # Blockchain layer
    "opentensor/bittensor-subnet-template",  # Subnet template
]

# Cloudflare KV & R2
CF_ACCOUNT_ID = os.getenv('CF_ACCOUNT_ID')
CF_API_TOKEN = os.getenv('CF_API_TOKEN')
CF_KV_NAMESPACE_ID = os.getenv('CF_METRICS_NAMESPACE_ID')
R2_BUCKET = os.getenv('R2_BUCKET')


def get_headers():
    """Get GitHub API headers."""
    headers = {
        "Accept": "application/vnd.github.v3+json",
        "User-Agent": "bittensor-labs-dashboard"
    }
    if GITHUB_TOKEN:
        headers["Authorization"] = f"token {GITHUB_TOKEN}"
    return headers


def fetch_commits(repo: str, since_days: int) -> list:
    """Fetch commits from a repo since N days ago."""
    since = (datetime.now(timezone.utc) - timedelta(days=since_days)).isoformat()
    url = f"{GITHUB_API}/repos/{repo}/commits"
    params = {"since": since, "per_page": 100}

    all_commits = []
    page = 1

    while True:
        params["page"] = page
        try:
            resp = requests.get(url, headers=get_headers(), params=params, timeout=30)
            if resp.status_code == 403:
                print(f"⚠️ Rate limited on {repo}", file=sys.stderr)
                break
            if resp.status_code != 200:
                print(f"⚠️ Failed to fetch {repo}: {resp.status_code}", file=sys.stderr)
                break

            commits = resp.json()
            if not commits:
                break

            all_commits.extend(commits)

            # Check if there are more pages
            if len(commits) < 100:
                break
            page += 1

        except Exception as e:
            print(f"❌ Error fetching {repo}: {e}", file=sys.stderr)
            break

    return all_commits


def fetch_contributors(repo: str) -> list:
    """Fetch all contributors for a repo."""
    url = f"{GITHUB_API}/repos/{repo}/contributors"
    params = {"per_page": 100}

    all_contributors = []
    page = 1

    while True:
        params["page"] = page
        try:
            resp = requests.get(url, headers=get_headers(), params=params, timeout=30)
            if resp.status_code != 200:
                break

            contributors = resp.json()
            if not contributors:
                break

            all_contributors.extend(contributors)

            if len(contributors) < 100:
                break
            page += 1

        except Exception as e:
            print(f"❌ Error fetching contributors for {repo}: {e}", file=sys.stderr)
            break

    return all_contributors


def get_active_contributors(commits: list) -> set:
    """Extract unique contributor logins from commits."""
    contributors = set()
    for commit in commits:
        if commit.get("author") and commit["author"].get("login"):
            contributors.add(commit["author"]["login"])
        elif commit.get("commit", {}).get("author", {}).get("email"):
            # Fallback to email if no GitHub login
            contributors.add(commit["commit"]["author"]["email"])
    return contributors


def write_to_kv(key: str, value: str) -> bool:
    """Write data to Cloudflare KV."""
    if not all([CF_ACCOUNT_ID, CF_API_TOKEN, CF_KV_NAMESPACE_ID]):
        print("⚠️ KV credentials not set", file=sys.stderr)
        return False

    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/storage/kv/namespaces/{CF_KV_NAMESPACE_ID}/values/{key}"
    headers = {
        "Authorization": f"Bearer {CF_API_TOKEN}",
        "Content-Type": "application/json"
    }

    try:
        resp = requests.put(url, headers=headers, data=value, timeout=30)
        return resp.status_code == 200
    except Exception as e:
        print(f"❌ KV write error: {e}", file=sys.stderr)
        return False


def write_to_r2(key: str, value: str) -> bool:
    """Write data to Cloudflare R2 (public bucket for frontend)."""
    if not all([CF_ACCOUNT_ID, CF_API_TOKEN, R2_BUCKET]):
        print("⚠️ R2 credentials not set", file=sys.stderr)
        return False

    url = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/r2/buckets/{R2_BUCKET}/objects/{key}"
    headers = {
        "Authorization": f"Bearer {CF_API_TOKEN}",
        "Content-Type": "application/json"
    }

    try:
        resp = requests.put(url, headers=headers, data=value, timeout=30)
        return resp.status_code in (200, 201)
    except Exception as e:
        print(f"❌ R2 write error: {e}", file=sys.stderr)
        return False


def main():
    print("=" * 60, file=sys.stderr)
    print("🐙 GITHUB DEVELOPER ACTIVITY TRACKER", file=sys.stderr)
    print("   Fetching Bittensor development metrics...", file=sys.stderr)
    print("=" * 60, file=sys.stderr)

    # Aggregate data across all repos
    all_commits_7d = []
    all_commits_30d = []
    all_contributors = set()
    total_contributors_count = 0
    repo_stats = []

    for repo in REPOS:
        print(f"\n📦 {repo}...", file=sys.stderr)

        # Fetch commits
        commits_30d = fetch_commits(repo, 30)
        commits_7d = [c for c in commits_30d if
                      datetime.fromisoformat(c["commit"]["author"]["date"].replace("Z", "+00:00"))
                      > datetime.now(timezone.utc) - timedelta(days=7)]

        # Fetch total contributors
        contributors = fetch_contributors(repo)

        # Get active contributors from commits
        active_30d = get_active_contributors(commits_30d)
        active_7d = get_active_contributors(commits_7d)

        repo_stat = {
            "repo": repo,
            "commits_7d": len(commits_7d),
            "commits_30d": len(commits_30d),
            "active_devs_7d": len(active_7d),
            "active_devs_30d": len(active_30d),
            "total_contributors": len(contributors)
        }
        repo_stats.append(repo_stat)

        print(f"   Commits: {len(commits_7d)} (7d) / {len(commits_30d)} (30d)", file=sys.stderr)
        print(f"   Active devs: {len(active_7d)} (7d) / {len(active_30d)} (30d)", file=sys.stderr)
        print(f"   Total contributors: {len(contributors)}", file=sys.stderr)

        # Aggregate
        all_commits_7d.extend(commits_7d)
        all_commits_30d.extend(commits_30d)
        all_contributors.update(active_30d)
        total_contributors_count += len(contributors)

    # Calculate totals (deduplicated active devs)
    total_active_7d = get_active_contributors(all_commits_7d)
    total_active_30d = get_active_contributors(all_commits_30d)

    # Build output
    output = {
        "_timestamp": datetime.now(timezone.utc).isoformat(),
        "_source": "github-api",
        "repos_tracked": len(REPOS),
        "totals": {
            "commits_7d": len(all_commits_7d),
            "commits_30d": len(all_commits_30d),
            "active_devs_7d": len(total_active_7d),
            "active_devs_30d": len(total_active_30d),
            "total_contributors": total_contributors_count
        },
        "repos": repo_stats
    }

    # Print summary
    print("\n" + "=" * 60, file=sys.stderr)
    print("📊 SUMMARY", file=sys.stderr)
    print("=" * 60, file=sys.stderr)
    print(f"   Commits (7d):  {output['totals']['commits_7d']}", file=sys.stderr)
    print(f"   Commits (30d): {output['totals']['commits_30d']}", file=sys.stderr)
    print(f"   Active Devs (7d):  {output['totals']['active_devs_7d']}", file=sys.stderr)
    print(f"   Active Devs (30d): {output['totals']['active_devs_30d']}", file=sys.stderr)
    print(f"   Total Contributors: {output['totals']['total_contributors']}", file=sys.stderr)

    # Write to KV
    json_data = json.dumps(output, indent=2)
    if write_to_kv("github_activity", json_data):
        print("\n✅ Results written to KV: github_activity", file=sys.stderr)

    # Write to R2 (for public frontend access)
    if write_to_r2("bittensor-metrics/github_activity.json", json_data):
        print("✅ Results written to R2: bittensor-metrics/github_activity.json", file=sys.stderr)

    # Output JSON
    print(json_data)


if __name__ == "__main__":
    main()
