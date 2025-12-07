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
        
        # Collect APR values with stake weights for weighted average
        # Weighted average = sum(APR * stake) / sum(stake)
        aprs = []
        weighted_sum = 0.0
        total_stake = 0.0
        
        for v in validators:
            # Get daily return and stake (both in rao)
            daily_return = v.get("nominator_return_per_day")
            stake = v.get("global_weighted_stake")
            
            if daily_return and stake:
                try:
                    daily_return_val = float(daily_return)
                    stake_val = float(stake)
                    
                    if stake_val > 0:
                        # APR = (daily_return * 365 / stake) * 100
                        apr_val = (daily_return_val * 365 / stake_val) * 100
                        
                        if 0 < apr_val < 1000:  # Sanity check
                            aprs.append(apr_val)
                            # Add to weighted calculation
                            weighted_sum += apr_val * stake_val
                            total_stake += stake_val
                            
                except (ValueError, TypeError):
                    pass
        
        print(f"  Collected {len(aprs)} APR values", file=sys.stderr)
        if aprs:
            print(f"  Sample APRs: {[round(a, 2) for a in aprs[:5]]}", file=sys.stderr)
        
        if not aprs or total_stake == 0:
            print("❌ No valid APR values found", file=sys.stderr)
            return None
        
        # Calculate weighted average (realistic network APR)
        weighted_avg_apr = weighted_sum / total_stake
        # Simple average for comparison
        simple_avg_apr = sum(aprs) / len(aprs)
        min_apr = min(aprs)
        max_apr = max(aprs)
        
        print(f"  Weighted Avg APR: {weighted_avg_apr:.2f}%", file=sys.stderr)
        print(f"  Simple Avg APR: {simple_avg_apr:.2f}%", file=sys.stderr)
        
        # Get top validator info
        top_validator = validators[0] if validators else None
        
        now_iso = datetime.now(timezone.utc).isoformat()
        result = {
            "avg_apr": round(weighted_avg_apr, 2),
            "simple_avg_apr": round(simple_avg_apr, 2),
            "min_apr": round(min_apr, 2),
            "max_apr": round(max_apr, 2),
            "validators_analyzed": len(aprs),
            "top_validator": {
                "name": top_validator.get("name") if top_validator else None,
                "dominance": top_validator.get("dominance") if top_validator else None
            } if top_validator else None,
            "_source": "taostats",
            "_timestamp": now_iso,
            "last_updated": now_iso
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
    print(f"  Weighted Avg APR: {result['avg_apr']}%", file=sys.stderr)
    print(f"  Simple Avg APR: {result['simple_avg_apr']}%", file=sys.stderr)
    print(f"  Range: {result['min_apr']}% - {result['max_apr']}%", file=sys.stderr)
    print(f"  Validators: {result['validators_analyzed']}", file=sys.stderr)
    
    # Output JSON to stdout
    print(json.dumps(result))


if __name__ == "__main__":
    main()
