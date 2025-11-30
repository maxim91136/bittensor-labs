#!/usr/bin/env python3
"""
Fetch average staking APY from Taostats Validator API.
Calculates network-wide average APR from top validators.
"""

import os
import sys
import json
import requests
from datetime import datetime, timezone

TAOSTATS_API_KEY = os.getenv('TAOSTATS_API_KEY')
VALIDATOR_URL = "https://api.taostats.io/api/dtao/validator/latest/v1"


def fetch_staking_apy(num_validators=50):
    """Fetch top validators and calculate average APY."""
    if not TAOSTATS_API_KEY:
        print("❌ TAOSTATS_API_KEY not set", file=sys.stderr)
        return None
    
    headers = {
        "accept": "application/json",
        "Authorization": TAOSTATS_API_KEY
    }
    
    try:
        # Fetch top validators ordered by stake (descending)
        url = f"{VALIDATOR_URL}?limit={num_validators}"
        print(f"📊 Fetching top {num_validators} validators for APY calculation...", file=sys.stderr)
        
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        
        validators = data.get("data", [])
        if not validators:
            print("❌ No validator data returned", file=sys.stderr)
            return None
        
        print(f"✅ Fetched {len(validators)} validators", file=sys.stderr)
        
        # Collect APR values
        aprs = []
        apr_7d = []
        apr_30d = []
        
        for v in validators:
            # Current APR
            apr = v.get("apr")
            if apr:
                try:
                    apr_val = float(apr)
                    if 0 < apr_val < 100:  # Sanity check (0-100%)
                        aprs.append(apr_val)
                except (ValueError, TypeError):
                    pass
            
            # 7-day average
            apr_7 = v.get("apr_7_day_average")
            if apr_7:
                try:
                    apr_7_val = float(apr_7)
                    if 0 < apr_7_val < 100:
                        apr_7d.append(apr_7_val)
                except (ValueError, TypeError):
                    pass
            
            # 30-day average
            apr_30 = v.get("apr_30_day_average")
            if apr_30:
                try:
                    apr_30_val = float(apr_30)
                    if 0 < apr_30_val < 100:
                        apr_30d.append(apr_30_val)
                except (ValueError, TypeError):
                    pass
        
        if not aprs:
            print("❌ No valid APR values found", file=sys.stderr)
            return None
        
        # Calculate averages
        avg_apr = sum(aprs) / len(aprs)
        min_apr = min(aprs)
        max_apr = max(aprs)
        
        avg_apr_7d = sum(apr_7d) / len(apr_7d) if apr_7d else None
        avg_apr_30d = sum(apr_30d) / len(apr_30d) if apr_30d else None
        
        # Get top validator info
        top_validator = validators[0] if validators else None
        
        result = {
            "avg_apr": round(avg_apr, 2),
            "min_apr": round(min_apr, 2),
            "max_apr": round(max_apr, 2),
            "avg_apr_7d": round(avg_apr_7d, 2) if avg_apr_7d else None,
            "avg_apr_30d": round(avg_apr_30d, 2) if avg_apr_30d else None,
            "validators_analyzed": len(aprs),
            "top_validator": {
                "name": top_validator.get("name") if top_validator else None,
                "apr": float(top_validator.get("apr", 0)) if top_validator and top_validator.get("apr") else None,
                "dominance": top_validator.get("dominance") if top_validator else None
            } if top_validator else None,
            "_source": "taostats",
            "_timestamp": datetime.now(timezone.utc).isoformat()
        }
        
        return result
        
    except Exception as e:
        print(f"❌ Failed to fetch validators: {e}", file=sys.stderr)
        return None


def main():
    # Fetch staking APY data
    result = fetch_staking_apy(50)
    
    if not result:
        print("❌ Failed to fetch staking APY data", file=sys.stderr)
        sys.exit(1)
    
    # Save to file
    output_file = "staking_apy.json"
    with open(output_file, "w") as f:
        json.dump(result, indent=2, fp=f)
    
    print(f"✅ Staking APY data written to {output_file}", file=sys.stderr)
    
    # Print summary
    print(f"\n📊 Staking APY Summary:", file=sys.stderr)
    print(f"  Average APR: {result['avg_apr']}%", file=sys.stderr)
    print(f"  Range: {result['min_apr']}% - {result['max_apr']}%", file=sys.stderr)
    if result['avg_apr_7d']:
        print(f"  7-Day Avg: {result['avg_apr_7d']}%", file=sys.stderr)
    if result['avg_apr_30d']:
        print(f"  30-Day Avg: {result['avg_apr_30d']}%", file=sys.stderr)
    print(f"  Validators: {result['validators_analyzed']}", file=sys.stderr)
    
    # Output JSON to stdout
    print(json.dumps(result))


if __name__ == "__main__":
    main()
