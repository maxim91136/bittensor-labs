#!/usr/bin/env python3
"""Quick validation: Test if model would have predicted current state from 7 days ago"""

import json
import urllib.request
from datetime import datetime, timezone, timedelta
import sys
import os

# Import prediction logic
sys.path.insert(0, os.path.dirname(__file__))
from predict_subnet_rankings import SubnetFeatureExtractor, RankPredictionModel

def get_from_kv(key: str) -> dict:
    """Fetch from deployed API"""
    url = f'https://bittensor-labs.pages.dev/api/{key}'
    req = urllib.request.Request(url, headers={'User-Agent': 'QuickVal/1.0'})
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())

# Get current state
print("📊 Fetching current top subnets...")
current = get_from_kv('top_subnets')
current_top3 = current['top_subnets'][:3]

print("\n🔝 Current Top 3:")
for s in current_top3:
    print(f"   #{s['netuid']}: {s['taostats_name']} - {s['estimated_emission_daily']:.1f} τ/day")

# Get history
print("\n📚 Fetching historical data...")
history_response = get_from_kv('top_subnets_history')

# History API returns {history: [...]} format
if isinstance(history_response, dict) and 'history' in history_response:
    history_raw = history_response['history']
else:
    history_raw = history_response

# Filter to 7 days ago
cutoff = datetime.now(timezone.utc) - timedelta(days=7)
past_data = [
    s for s in history_raw
    if datetime.fromisoformat(s['_timestamp'].replace('Z', '+00:00')) <= cutoff
]

print(f"   Using {len(past_data)} snapshots from before {cutoff.date()}")

if len(past_data) < 48:
    print(f"❌ Insufficient data ({len(past_data)} < 48)")
    sys.exit(1)

# What was rank 1 then?
oldest = past_data[0]
then_top3 = oldest['entries'][:3]

print(f"\n📅 Top 3 on {oldest['_timestamp'][:10]}:")
for e in then_top3:
    print(f"   #{e['rank']}: {e['name']} (netuid {e['id']})")

# Run prediction from that point
print("\n🔮 Running prediction model from 7 days ago...")
from predict_subnet_rankings import FEATURE_WEIGHTS, POSITION_PENALTIES
extractor = SubnetFeatureExtractor(past_data, lookback_days=7)
model = RankPredictionModel(weights=FEATURE_WEIGHTS, position_penalties=POSITION_PENALTIES)

# Get all subnets
all_netuids = set()
for snap in past_data:
    for e in snap['entries']:
        all_netuids.add(str(e['id']))

features = {}
for netuid in all_netuids:
    f = extractor.extract_features(netuid)
    if f:
        features[netuid] = f

target_date = datetime.now(timezone.utc)
prob_dict = model.calculate_probabilities(features, target_date)

# Sort by probability desc
predictions = sorted(
    [{'netuid': k, 'probability': v} for k, v in prob_dict.items()],
    key=lambda x: x['probability'],
    reverse=True
)

print("\n📈 Model predictions from 7 days ago:")
for i, p in enumerate(predictions[:5], 1):
    name = features.get(p['netuid'], {}).get('subnet_name', f"SN{p['netuid']}")
    print(f"   #{i}: Subnet {p['netuid']} - {p['probability']:.1%}")

# Compare
print("\n✅ VALIDATION:")
predicted_top1 = str(predictions[0]['netuid'])
actual_top1 = str(current_top3[0]['netuid'])

if predicted_top1 == actual_top1:
    print(f"   ✅ CORRECT! Predicted #{predicted_top1} would be #1, and it is!")
else:
    print(f"   ❌ WRONG! Predicted #{predicted_top1}, but #{actual_top1} is #1")

# Check if actual #1 was in top 3 predictions
actual_in_top3 = any(str(p['netuid']) == actual_top1 for p in predictions[:3])
if actual_in_top3:
    print(f"   ⚠️  But #{actual_top1} WAS in top 3 predictions")
else:
    print(f"   ❌ #{actual_top1} was NOT in top 3 predictions")

# Key insight: Check top 3 predictions
predicted_netuids = [str(p['netuid']) for p in predictions[:3]]
actual_netuids = [str(s['netuid']) for s in current_top3]

overlap = set(predicted_netuids) & set(actual_netuids)
print(f"\n   Top 3 overlap: {len(overlap)}/3 correct")

# Calculate "Other" probability
chutes_prob = prob_dict.get('64', 0)
affine_prob = prob_dict.get('120', 0)
other_prob = 1.0 - chutes_prob - affine_prob

print(f"\n💰 BETTING ANALYSIS (7 days ago → today):")
print(f"   Chutes (#64) probability: {chutes_prob:.1%}")
print(f"   Affine (#120) probability: {affine_prob:.1%}")
print(f"   Other probability: {other_prob:.1%}")

print(f"\n   Actual result: #{actual_top1} is #1")
if actual_top1 == '64':
    print(f"   → Chutes won ✓")
elif actual_top1 == '120':
    print(f"   → Affine won ✓")
else:
    print(f"   → OTHER won ✓✓✓")
