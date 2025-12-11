#!/usr/bin/env python3
"""
Calculate Network Decentralization Score for Bittensor.

Reads existing KV data (distribution, validators, subnets) and computes:
- Gini coefficients (wealth inequality)
- Nakamoto coefficients (min entities for 51% control)
- Concentration metrics (Top 10, Top 100)
- Composite decentralization score

No additional API calls needed - uses cached KV data.
"""

import os
import sys
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone
from typing import List, Dict, Optional, Tuple


def get_from_kv(account: str, token: str, namespace: str, key: str) -> Optional[Dict]:
    """Fetch a value from Cloudflare KV."""
    url = f'https://api.cloudflare.com/client/v4/accounts/{account}/storage/kv/namespaces/{namespace}/values/{key}'
    req = urllib.request.Request(url, method='GET', headers={
        'Authorization': f'Bearer {token}',
        'Accept': 'application/json'
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status == 200:
                return json.loads(resp.read())
    except Exception as e:
        print(f"⚠️ Failed to fetch {key} from KV: {e}", file=sys.stderr)
    return None


def put_to_kv(account: str, token: str, namespace: str, key: str, data: bytes) -> bool:
    """Store a value in Cloudflare KV."""
    url = f'https://api.cloudflare.com/client/v4/accounts/{account}/storage/kv/namespaces/{namespace}/values/{key}'
    req = urllib.request.Request(url, data=data, method='PUT', headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json'
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            if resp.status in (200, 201):
                print(f"✅ KV PUT OK ({key})")
                return True
    except Exception as e:
        print(f"⚠️ KV PUT failed: {e}", file=sys.stderr)
    return False


def calculate_gini(values: List[float]) -> float:
    """
    Calculate Gini coefficient (0 = perfect equality, 1 = maximum inequality).

    Formula: G = (2 * sum(i * x_i)) / (n * sum(x_i)) - (n + 1) / n
    Where values are sorted ascending and i is 1-indexed.
    """
    if not values or len(values) < 2:
        return 0.0

    sorted_values = sorted(values)
    n = len(sorted_values)
    total = sum(sorted_values)

    if total == 0:
        return 0.0

    # Calculate using the standard formula
    cumsum = sum((i + 1) * v for i, v in enumerate(sorted_values))
    gini = (2 * cumsum) / (n * total) - (n + 1) / n

    return round(max(0.0, min(1.0, gini)), 4)


def calculate_nakamoto(values: List[float], threshold: float = 0.51) -> int:
    """
    Calculate Nakamoto coefficient - minimum entities to control threshold (default 51%).

    Returns the count of top entities needed to exceed the threshold.
    """
    if not values:
        return 0

    sorted_desc = sorted(values, reverse=True)
    total = sum(sorted_desc)

    if total == 0:
        return len(sorted_desc)

    cumulative = 0.0
    for i, v in enumerate(sorted_desc):
        cumulative += v
        if cumulative / total >= threshold:
            return i + 1

    return len(sorted_desc)


def calculate_hhi(shares: List[float]) -> float:
    """
    Calculate Herfindahl-Hirschman Index (HHI).

    HHI = sum(s_i^2) where s_i is market share (0-1)
    Range: 1/n (perfect competition) to 1 (monopoly)

    For decentralization: lower is better.
    """
    if not shares:
        return 1.0

    # Normalize to ensure shares sum to 1
    total = sum(shares)
    if total == 0:
        return 1.0

    normalized = [s / total for s in shares]
    hhi = sum(s ** 2 for s in normalized)

    return round(hhi, 6)


def calculate_top_concentration(values: List[float], top_n: int = 10) -> float:
    """
    Calculate what percentage of total is held by top N entities.
    """
    if not values:
        return 0.0

    sorted_desc = sorted(values, reverse=True)
    total = sum(sorted_desc)

    if total == 0:
        return 0.0

    top_sum = sum(sorted_desc[:top_n])
    return round(top_sum / total, 4)


def score_from_gini(gini: float) -> float:
    """
    Convert Gini to a 0-100 score (higher = more decentralized).

    Gini 0 = perfect equality = score 100
    Gini 1 = complete inequality = score 0
    """
    return round((1 - gini) * 100, 1)


def score_from_nakamoto(nakamoto: int, max_good: int = 100) -> float:
    """
    Convert Nakamoto coefficient to 0-100 score.

    More entities needed for 51% = more decentralized = higher score.
    We consider 100+ entities for 51% as excellent (score 100).
    """
    if nakamoto >= max_good:
        return 100.0
    return round((nakamoto / max_good) * 100, 1)


def score_from_hhi(hhi: float) -> float:
    """
    Convert HHI to 0-100 score.

    HHI close to 0 = very distributed = score 100
    HHI close to 1 = monopoly = score 0
    """
    return round((1 - hhi) * 100, 1)


def analyze_wallets(distribution_data: Dict) -> Dict:
    """Analyze wallet distribution for decentralization metrics."""

    # We don't have raw balances in KV, but we have percentile thresholds
    # For Gini/Nakamoto we'd need the actual balance list
    # Let's use what we have: brackets and percentiles

    result = {
        "source": "distribution",
        "sample_size": distribution_data.get("sample_size", 0),
        "total_wallets": distribution_data.get("total_wallets", 0),
    }

    # Extract percentile data
    percentiles = distribution_data.get("percentiles", {})
    brackets = distribution_data.get("brackets", {})

    # Top 1% threshold gives us concentration insight
    top_1_data = percentiles.get("1", {})
    top_1_threshold = top_1_data.get("threshold", 0)
    top_1_count = top_1_data.get("wallet_count", 0)

    result["top_1_percent"] = {
        "threshold_tao": top_1_threshold,
        "wallet_count": top_1_count
    }

    # Calculate concentration from brackets
    # >10k TAO wallets
    bracket_10k = brackets.get("10000", {})
    whale_count = bracket_10k.get("count", 0)
    whale_pct = bracket_10k.get("percentage", 0)

    result["whales_10k_plus"] = {
        "count": whale_count,
        "percentage": whale_pct
    }

    # Estimate a "wallet concentration score" based on available data
    # Lower whale concentration = more decentralized
    # If 0.07% hold >10k TAO, that's fairly concentrated
    # Score: 100 - (whale_pct * 100) with some scaling
    whale_score = max(0, 100 - (whale_pct * 500))  # Scale: 0.2% whales = 0 score
    result["wallet_score"] = round(whale_score, 1)

    return result


def analyze_validators(validator_data: Dict) -> Dict:
    """Analyze validator stake distribution for decentralization metrics."""

    validators = validator_data.get("top_validators", [])
    total_stake = validator_data.get("total_stake", 0)
    total_validators = validator_data.get("total_validators", 0)

    result = {
        "source": "validators",
        "total_validators": total_validators,
        "total_stake": total_stake,
    }

    if not validators:
        result["validator_score"] = 50.0  # Neutral if no data
        return result

    # Extract stakes
    stakes = [v.get("stake", 0) for v in validators if v.get("stake", 0) > 0]

    if stakes:
        # Calculate metrics
        gini = calculate_gini(stakes)
        nakamoto = calculate_nakamoto(stakes)
        top_10_conc = calculate_top_concentration(stakes, 10)

        result["gini"] = gini
        result["nakamoto_coefficient"] = nakamoto
        result["top_10_concentration"] = top_10_conc

        # Composite validator score
        gini_score = score_from_gini(gini)
        nakamoto_score = score_from_nakamoto(nakamoto, max_good=50)  # 50 validators for 51% is good
        conc_score = (1 - top_10_conc) * 100

        # Weight: Nakamoto most important, then Gini, then concentration
        validator_score = (nakamoto_score * 0.4 + gini_score * 0.35 + conc_score * 0.25)
        result["validator_score"] = round(validator_score, 1)
    else:
        result["validator_score"] = 50.0

    return result


def analyze_subnets(subnet_data: Dict) -> Dict:
    """Analyze subnet emission distribution for decentralization metrics."""

    all_subnets = subnet_data.get("all_subnets", [])
    total_neurons = subnet_data.get("total_neurons", 0)

    result = {
        "source": "subnets",
        "total_subnets": len(all_subnets),
        "total_neurons": total_neurons,
    }

    if not all_subnets:
        result["subnet_score"] = 50.0
        return result

    # Extract emission shares
    emissions = [s.get("estimated_emission_daily", 0) for s in all_subnets if s.get("estimated_emission_daily", 0) > 0]

    if emissions:
        # Calculate HHI for emission distribution
        hhi = calculate_hhi(emissions)
        nakamoto = calculate_nakamoto(emissions)
        top_5_conc = calculate_top_concentration(emissions, 5)

        result["emission_hhi"] = hhi
        result["nakamoto_coefficient"] = nakamoto
        result["top_5_emission_concentration"] = top_5_conc

        # Composite subnet score
        hhi_score = score_from_hhi(hhi)
        nakamoto_score = score_from_nakamoto(nakamoto, max_good=20)  # 20 subnets for 51% is good
        conc_score = (1 - top_5_conc) * 100

        subnet_score = (hhi_score * 0.35 + nakamoto_score * 0.35 + conc_score * 0.30)
        result["subnet_score"] = round(subnet_score, 1)
    else:
        result["subnet_score"] = 50.0

    return result


def calculate_composite_score(wallet_analysis: Dict, validator_analysis: Dict, subnet_analysis: Dict) -> Dict:
    """
    Calculate composite Network Decentralization Score.

    Weights:
    - Wallets: 40% (wealth distribution matters most)
    - Validators: 35% (consensus security)
    - Subnets: 25% (economic activity distribution)
    """

    wallet_score = wallet_analysis.get("wallet_score", 50)
    validator_score = validator_analysis.get("validator_score", 50)
    subnet_score = subnet_analysis.get("subnet_score", 50)

    # Weighting: Subnets are TAO's core differentiator
    composite = (
        wallet_score * 0.30 +
        validator_score * 0.30 +
        subnet_score * 0.40
    )

    # Determine rating
    if composite >= 80:
        rating = "Excellent"
    elif composite >= 65:
        rating = "Good"
    elif composite >= 50:
        rating = "Moderate"
    elif composite >= 35:
        rating = "Concerning"
    else:
        rating = "Poor"

    return {
        "composite_score": round(composite, 1),
        "rating": rating,
        "components": {
            "wallet_score": wallet_score,
            "wallet_weight": 0.30,
            "validator_score": validator_score,
            "validator_weight": 0.30,
            "subnet_score": subnet_score,
            "subnet_weight": 0.40
        }
    }


def main():
    print("🔍 Bittensor Network Decentralization Score Calculator", file=sys.stderr)
    print("=" * 55, file=sys.stderr)

    # Get KV credentials
    cf_acc = os.getenv('CF_ACCOUNT_ID')
    cf_token = os.getenv('CF_API_TOKEN')
    cf_ns = os.getenv('CF_KV_NAMESPACE_ID') or os.getenv('CF_METRICS_NAMESPACE_ID')

    if not all([cf_acc, cf_token, cf_ns]):
        print("❌ Missing Cloudflare KV credentials", file=sys.stderr)
        sys.exit(1)

    # Fetch existing data from KV
    print("\n📊 Fetching data from KV...", file=sys.stderr)

    distribution_data = get_from_kv(cf_acc, cf_token, cf_ns, 'distribution')
    validator_data = get_from_kv(cf_acc, cf_token, cf_ns, 'top_validators')
    subnet_data = get_from_kv(cf_acc, cf_token, cf_ns, 'top_subnets')

    # Analyze each dimension
    print("\n🔢 Analyzing wallet distribution...", file=sys.stderr)
    wallet_analysis = analyze_wallets(distribution_data or {})
    print(f"   Wallet Score: {wallet_analysis.get('wallet_score', 'N/A')}", file=sys.stderr)

    print("\n🔢 Analyzing validator distribution...", file=sys.stderr)
    validator_analysis = analyze_validators(validator_data or {})
    print(f"   Validator Score: {validator_analysis.get('validator_score', 'N/A')}", file=sys.stderr)
    if validator_analysis.get('gini'):
        print(f"   Gini: {validator_analysis['gini']}, Nakamoto: {validator_analysis.get('nakamoto_coefficient')}", file=sys.stderr)

    print("\n🔢 Analyzing subnet distribution...", file=sys.stderr)
    subnet_analysis = analyze_subnets(subnet_data or {})
    print(f"   Subnet Score: {subnet_analysis.get('subnet_score', 'N/A')}", file=sys.stderr)
    if subnet_analysis.get('emission_hhi'):
        print(f"   HHI: {subnet_analysis['emission_hhi']}, Nakamoto: {subnet_analysis.get('nakamoto_coefficient')}", file=sys.stderr)

    # Calculate composite score
    print("\n📈 Calculating composite score...", file=sys.stderr)
    composite = calculate_composite_score(wallet_analysis, validator_analysis, subnet_analysis)

    print(f"\n{'='*55}", file=sys.stderr)
    print(f"🎯 Network Decentralization Score: {composite['composite_score']}/100", file=sys.stderr)
    print(f"   Rating: {composite['rating']}", file=sys.stderr)
    print(f"{'='*55}", file=sys.stderr)

    # Build result
    now_iso = datetime.now(timezone.utc).isoformat()
    result = {
        "score": composite["composite_score"],
        "rating": composite["rating"],
        "components": composite["components"],
        "wallet_analysis": wallet_analysis,
        "validator_analysis": validator_analysis,
        "subnet_analysis": subnet_analysis,
        "last_updated": now_iso,
        "_source": "decentralization_calculator",
        "_version": "1.1.0"
    }

    # Save to KV
    print("\n💾 Saving to KV...", file=sys.stderr)
    data = json.dumps(result).encode('utf-8')
    put_to_kv(cf_acc, cf_token, cf_ns, 'decentralization_score', data)

    # Save to history (append daily entry)
    print("📜 Updating history...", file=sys.stderr)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    history_entry = {
        "date": today,
        "score": composite["composite_score"],
        "rating": composite["rating"],
        "wallet_score": wallet_analysis.get("wallet_score"),
        "validator_score": validator_analysis.get("validator_score"),
        "subnet_score": subnet_analysis.get("subnet_score"),
        "validator_nakamoto": validator_analysis.get("nakamoto_coefficient"),
        "subnet_nakamoto": subnet_analysis.get("nakamoto_coefficient"),
    }

    # Fetch existing history
    history = get_from_kv(cf_acc, cf_token, cf_ns, 'decentralization_history') or {"entries": []}
    entries = history.get("entries", [])

    # Update or append today's entry (avoid duplicates)
    existing_dates = {e.get("date") for e in entries}
    if today in existing_dates:
        entries = [e if e.get("date") != today else history_entry for e in entries]
    else:
        entries.append(history_entry)

    # Keep last 365 days
    entries = sorted(entries, key=lambda x: x.get("date", ""), reverse=True)[:365]

    history_data = {
        "entries": entries,
        "last_updated": now_iso,
        "_source": "decentralization_calculator"
    }
    put_to_kv(cf_acc, cf_token, cf_ns, 'decentralization_history', json.dumps(history_data).encode('utf-8'))
    print(f"   History: {len(entries)} entries", file=sys.stderr)

    # Output JSON
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
