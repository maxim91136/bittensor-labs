#!/usr/bin/env python3
"""
Backtest Subnet Ranking Predictions

Validates prediction model accuracy by testing on historical data.
Uses time-shifted windows to predict future rankings, then compares to actual outcomes.

Usage:
  python .github/scripts/backtest_predictions.py

Environment Variables:
  CF_ACCOUNT_ID           Cloudflare Account ID
  CF_API_TOKEN            Cloudflare API Token
  CF_KV_NAMESPACE_ID      KV Namespace ID
  BACKTEST_DAYS           Days to look back for testing (default: 14)
  BACKTEST_PREDICTION_WINDOW  Days ahead to predict (default: 7, 14, 30)
"""

import os
import sys
import json
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Any, Tuple
from collections import defaultdict
import math

# Import prediction logic from main script
sys.path.insert(0, os.path.dirname(__file__))
try:
    from predict_subnet_rankings import (
        SubnetFeatureExtractor,
        RankPredictionModel,
        FEATURE_WEIGHTS,
        POSITION_PENALTIES
    )
except ImportError:
    print("❌ Could not import prediction modules. Ensure predict_subnet_rankings.py exists.", file=sys.stderr)
    sys.exit(1)

# Configuration
CF_ACCOUNT_ID = os.getenv('CF_ACCOUNT_ID')
CF_API_TOKEN = os.getenv('CF_API_TOKEN')
CF_KV_NAMESPACE_ID = os.getenv('CF_KV_NAMESPACE_ID') or os.getenv('CF_METRICS_NAMESPACE_ID')

BACKTEST_DAYS = int(os.getenv('BACKTEST_DAYS', '14'))  # How far back to test
BACKTEST_PREDICTION_WINDOWS = [7, 14, 30]  # Days ahead to predict


def get_from_kv(key: str) -> Optional[Any]:
    """Fetch a value from Cloudflare KV."""
    if not all([CF_ACCOUNT_ID, CF_API_TOKEN, CF_KV_NAMESPACE_ID]):
        return None

    url = f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/storage/kv/namespaces/{CF_KV_NAMESPACE_ID}/values/{key}'
    req = urllib.request.Request(url, method='GET', headers={
        'Authorization': f'Bearer {CF_API_TOKEN}',
        'Accept': 'application/json'
    })

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            if resp.status == 200:
                return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        print(f"⚠️ KV GET failed for {key}: HTTP {e.code}", file=sys.stderr)
    except Exception as e:
        print(f"⚠️ KV GET failed for {key}: {e}", file=sys.stderr)

    return None


def find_snapshot_at_time(history: List[Dict], target_time: datetime) -> Optional[Dict]:
    """Find the snapshot closest to target time (but not after)."""
    closest = None
    min_diff = float('inf')

    for snapshot in history:
        snap_time = datetime.fromisoformat(snapshot['_timestamp'].replace('Z', '+00:00'))

        # Only consider snapshots BEFORE target time
        if snap_time > target_time:
            continue

        diff = (target_time - snap_time).total_seconds()
        if diff < min_diff:
            min_diff = diff
            closest = snapshot

    return closest


def extract_rank_at_time(history: List[Dict], netuid: str, target_time: datetime) -> Optional[int]:
    """Extract the rank of a subnet at a specific time."""
    snapshot = find_snapshot_at_time(history, target_time)
    if not snapshot or 'entries' not in snapshot:
        return None

    for entry in snapshot['entries']:
        if str(entry.get('id')) == str(netuid):
            return entry.get('rank')

    return None


def run_backtest(
    history: List[Dict],
    test_date: datetime,
    prediction_window_days: int
) -> Dict:
    """
    Run a single backtest:
    1. Use data UP TO test_date
    2. Predict ranking at test_date + prediction_window_days
    3. Compare to actual ranking
    """
    # Filter history to only include data before test_date
    training_data = [
        s for s in history
        if datetime.fromisoformat(s['_timestamp'].replace('Z', '+00:00')) <= test_date
    ]

    if len(training_data) < 48:  # Need minimum data
        return {
            'status': 'insufficient_data',
            'error': f'Only {len(training_data)} snapshots available'
        }

    # Calculate prediction using training data
    extractor = SubnetFeatureExtractor(training_data)
    model = RankPredictionModel()

    # Get all unique subnets from training data
    all_netuids = set()
    for snapshot in training_data:
        if 'entries' in snapshot:
            for entry in snapshot['entries']:
                all_netuids.add(str(entry.get('id')))

    # Extract features for each subnet
    features_by_subnet = {}
    for netuid in all_netuids:
        features = extractor.extract_features(netuid)
        if features:
            features_by_subnet[netuid] = features

    if not features_by_subnet:
        return {
            'status': 'no_features',
            'error': 'Could not extract features from training data'
        }

    # Calculate prediction
    target_date = test_date + timedelta(days=prediction_window_days)
    probabilities = model.calculate_probabilities(features_by_subnet, target_date)

    # Get top prediction
    top_prediction = probabilities[0]
    predicted_netuid = top_prediction['netuid']
    predicted_probability = top_prediction['probability']

    # Get actual rank at target date
    actual_rank = extract_rank_at_time(history, predicted_netuid, target_date)

    # Get actual #1 at target date
    actual_snapshot = find_snapshot_at_time(history, target_date)
    actual_rank1_netuid = None
    if actual_snapshot and 'entries' in actual_snapshot:
        for entry in actual_snapshot['entries']:
            if entry.get('rank') == 1:
                actual_rank1_netuid = str(entry.get('id'))
                break

    # Calculate metrics
    prediction_correct = (actual_rank == 1)
    predicted_rank1_probability = 0.0

    # Find probability assigned to actual #1
    for prob in probabilities:
        if str(prob['netuid']) == str(actual_rank1_netuid):
            predicted_rank1_probability = prob['probability']
            break

    return {
        'status': 'success',
        'test_date': test_date.isoformat(),
        'target_date': target_date.isoformat(),
        'prediction_window_days': prediction_window_days,
        'training_snapshots': len(training_data),
        'predicted_netuid': predicted_netuid,
        'predicted_probability': predicted_probability,
        'actual_rank': actual_rank,
        'actual_rank1_netuid': actual_rank1_netuid,
        'predicted_rank1_probability': predicted_rank1_probability,
        'prediction_correct': prediction_correct,
        'top_5_predictions': probabilities[:5]
    }


def calculate_brier_score(tests: List[Dict]) -> float:
    """
    Calculate Brier score (lower is better, 0 = perfect).
    Measures calibration of probability predictions.
    """
    scores = []
    for test in tests:
        if test.get('status') != 'success':
            continue

        # For the subnet we predicted as #1
        predicted_prob = test.get('predicted_probability', 0)
        actual_outcome = 1.0 if test.get('prediction_correct') else 0.0

        # Brier score for this prediction
        score = (predicted_prob - actual_outcome) ** 2
        scores.append(score)

    return sum(scores) / len(scores) if scores else float('inf')


def main():
    print("=" * 70)
    print("Subnet Ranking Prediction - BACKTEST")
    print("=" * 70)
    print()

    # Validate credentials
    if not all([CF_ACCOUNT_ID, CF_API_TOKEN, CF_KV_NAMESPACE_ID]):
        print("❌ Missing Cloudflare credentials")
        sys.exit(1)

    # Fetch historical data
    print("📊 Fetching historical subnet data...")
    history = get_from_kv('top_subnets_history')

    if not history or not isinstance(history, list):
        print("❌ No historical data available")
        sys.exit(1)

    print(f"✅ Loaded {len(history)} historical snapshots")

    # Parse timestamps
    history_with_time = []
    for snapshot in history:
        try:
            timestamp = datetime.fromisoformat(snapshot['_timestamp'].replace('Z', '+00:00'))
            history_with_time.append((timestamp, snapshot))
        except:
            continue

    history_with_time.sort(key=lambda x: x[0])
    history = [s for _, s in history_with_time]

    oldest = history_with_time[0][0]
    newest = history_with_time[-1][0]

    print(f"   Date range: {oldest.date()} → {newest.date()}")
    print(f"   Span: {(newest - oldest).days} days")
    print()

    # Run backtests for different prediction windows
    all_results = {}

    for window_days in BACKTEST_PREDICTION_WINDOWS:
        print(f"🔬 Backtesting {window_days}-day predictions...")
        print("-" * 70)

        results = []

        # Test at multiple points in history
        # Start from oldest + 28 days (need lookback), end at newest - window_days (need future data)
        test_start = oldest + timedelta(days=28)
        test_end = newest - timedelta(days=window_days)

        if test_start >= test_end:
            print(f"⚠️  Insufficient historical span for {window_days}-day backtesting")
            print()
            continue

        # Run backtest every BACKTEST_DAYS
        current_test_date = test_start
        test_count = 0

        while current_test_date <= test_end and test_count < 10:  # Limit to 10 tests
            result = run_backtest(history, current_test_date, window_days)
            results.append(result)

            if result['status'] == 'success':
                correct = "✅" if result['prediction_correct'] else "❌"
                print(f"   {correct} {result['test_date'][:10]} → {result['target_date'][:10]}")
                print(f"      Predicted: #{result['predicted_netuid']} ({result['predicted_probability']:.1%})")
                print(f"      Actual #1: #{result['actual_rank1_netuid']} (assigned prob: {result['predicted_rank1_probability']:.1%})")

            current_test_date += timedelta(days=BACKTEST_DAYS)
            test_count += 1

        # Calculate metrics
        successful_tests = [r for r in results if r.get('status') == 'success']

        if not successful_tests:
            print("   ⚠️  No successful backtests")
            print()
            continue

        correct_predictions = sum(1 for r in successful_tests if r.get('prediction_correct'))
        total_tests = len(successful_tests)
        accuracy = correct_predictions / total_tests

        brier_score = calculate_brier_score(successful_tests)

        # Average probability assigned to actual #1
        avg_rank1_prob = sum(r.get('predicted_rank1_probability', 0) for r in successful_tests) / total_tests

        print()
        print(f"📈 Results ({window_days}-day window):")
        print(f"   Accuracy: {correct_predictions}/{total_tests} = {accuracy:.1%}")
        print(f"   Brier Score: {brier_score:.4f} (lower is better)")
        print(f"   Avg probability assigned to actual #1: {avg_rank1_prob:.1%}")
        print()

        all_results[f'{window_days}d'] = {
            'window_days': window_days,
            'total_tests': total_tests,
            'correct_predictions': correct_predictions,
            'accuracy': accuracy,
            'brier_score': brier_score,
            'avg_rank1_probability': avg_rank1_prob,
            'tests': successful_tests
        }

    # Summary
    print("=" * 70)
    print("SUMMARY")
    print("=" * 70)

    for window_label, metrics in all_results.items():
        print(f"{window_label:>6}: {metrics['accuracy']:>6.1%} accuracy, Brier={metrics['brier_score']:.4f}")

    print()

    # Interpretation
    if all_results:
        best_window = max(all_results.items(), key=lambda x: x[1]['accuracy'])
        print(f"🏆 Best performing window: {best_window[0]} ({best_window[1]['accuracy']:.1%} accuracy)")

        # Check if model is better than random
        # Random would be ~10% for top 10 subnets
        avg_accuracy = sum(m['accuracy'] for m in all_results.values()) / len(all_results)

        if avg_accuracy > 0.2:
            print("✅ Model significantly outperforms random baseline (~10%)")
        elif avg_accuracy > 0.1:
            print("⚠️  Model slightly better than random, needs improvement")
        else:
            print("❌ Model not better than random, requires major improvements")

    print()

    # Write results to file
    output_path = os.path.join(os.getcwd(), '.github', 'data', 'backtest_results.json')
    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, 'w') as f:
        json.dump({
            '_generated_at': datetime.now(timezone.utc).isoformat(),
            'backtest_days': BACKTEST_DAYS,
            'prediction_windows': BACKTEST_PREDICTION_WINDOWS,
            'results': all_results
        }, f, indent=2)

    print(f"📁 Backtest results saved to: {output_path}")
    print()


if __name__ == '__main__':
    main()
