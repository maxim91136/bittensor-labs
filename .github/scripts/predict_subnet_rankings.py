#!/usr/bin/env python3
"""
Subnet Ranking Prediction System

Analyzes historical subnet ranking data to predict probabilities
of each subnet reaching rank #1 by specified target dates.

Uses statistical model (MVP) with features:
- Ranking momentum and velocity
- Emission trends and growth
- Market share stability
- Network growth metrics

Environment Variables:
  CF_ACCOUNT_ID           Cloudflare Account ID
  CF_API_TOKEN            Cloudflare API Token
  CF_KV_NAMESPACE_ID      KV Namespace ID
  PREDICTION_TARGET_DATES Comma-separated ISO dates (default: +30d)
  LOOKBACK_DAYS          Days of history to analyze (default: 28)
  MIN_DATA_POINTS        Minimum snapshots required (default: 48)

KV Keys:
  INPUT:  top_subnets_history (historical snapshots)
  OUTPUT: subnet_predictions (prediction results)

Usage:
  python .github/scripts/predict_subnet_rankings.py
"""

import os
import sys
import json
import math
import urllib.request
import urllib.error
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional, Tuple, Any
from collections import defaultdict

# === CONFIGURATION ===

DEFAULT_TARGET_DAYS_AHEAD = 30
DEFAULT_LOOKBACK_DAYS = 28
MIN_DATA_POINTS = int(os.getenv('MIN_DATA_POINTS', '48'))
LOOKBACK_DAYS = int(os.getenv('LOOKBACK_DAYS', str(DEFAULT_LOOKBACK_DAYS)))

# Feature weights (tunable parameters)
# v2.1: Reduced current_rank weight, increased gap/tenure (2025-12-16)
FEATURE_WEIGHTS = {
    # Position features (35%)
    'current_rank_inverse': 0.10,      # ↓ Current position (was too strong)
    'rank1_frequency': 0.10,           # Historical #1 time
    'rank_velocity_weighted': 0.05,    # Recent movement
    'top3_tenure': 0.10,               # ↑ Time in top 3 (both Affine/Chutes high)

    # Emission features (50%)
    'emission_share_current': 0.15,    # Current share
    'emission_gap_normalized': 0.20,   # ↑ Gap to leader (MOST critical!)
    'emission_trend_7d': 0.08,         # Growth trend
    'emission_momentum': 0.04,         # Acceleration
    'gap_closing_feasibility': 0.03,   # Can gap be closed?

    # Stability features (15%)
    'share_stability': 0.08,           # Emission consistency
    'rank_stability': 0.07,            # Position consistency
}

# Position penalties (reduced to favor top positions more)
# Tuned based on backtest showing top-2 switching frequency
POSITION_PENALTIES = {
    1: 1.00, 2: 0.95, 3: 0.85, 4: 0.70, 5: 0.55,
    6: 0.42, 7: 0.30, 8: 0.20, 9: 0.12, 10: 0.08
}

# Cloudflare credentials
CF_ACCOUNT_ID = os.getenv('CF_ACCOUNT_ID')
CF_API_TOKEN = os.getenv('CF_API_TOKEN')
CF_KV_NAMESPACE_ID = os.getenv('CF_KV_NAMESPACE_ID') or os.getenv('CF_METRICS_NAMESPACE_ID')


# === CLOUDFLARE KV FUNCTIONS ===

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


def put_to_kv(key: str, data: Any) -> bool:
    """Store a value in Cloudflare KV."""
    if not all([CF_ACCOUNT_ID, CF_API_TOKEN, CF_KV_NAMESPACE_ID]):
        print("⚠️ Missing CF credentials for KV PUT", file=sys.stderr)
        return False

    url = f'https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/storage/kv/namespaces/{CF_KV_NAMESPACE_ID}/values/{key}'
    payload = json.dumps(data).encode('utf-8')

    req = urllib.request.Request(url, data=payload, method='PUT', headers={
        'Authorization': f'Bearer {CF_API_TOKEN}',
        'Content-Type': 'application/json'
    })

    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            if resp.status in (200, 201):
                print(f"✅ KV PUT OK ({key})")
                return True
            else:
                print(f"⚠️ KV PUT returned status {resp.status}", file=sys.stderr)
                return False
    except urllib.error.HTTPError as e:
        print(f"⚠️ KV PUT failed for {key}: HTTP {e.code}", file=sys.stderr)
    except Exception as e:
        print(f"⚠️ KV PUT failed for {key}: {e}", file=sys.stderr)

    return False


# === FEATURE EXTRACTION ===

class SubnetFeatureExtractor:
    """Extract prediction features from historical data."""

    def __init__(self, history: List[Dict], lookback_days: int):
        self.history = history
        self.lookback_days = lookback_days
        self.cutoff_time = self._calculate_cutoff()

        # Pre-process history into subnet-indexed structure
        self._subnet_snapshots = self._index_by_subnet()

    def _calculate_cutoff(self) -> datetime:
        """Calculate cutoff timestamp for lookback window."""
        if not self.history:
            return datetime.now(timezone.utc)

        latest = self.history[-1]['_timestamp']
        latest_dt = datetime.fromisoformat(latest.replace('Z', '+00:00'))
        return latest_dt - timedelta(days=self.lookback_days)

    def _index_by_subnet(self) -> Dict[str, List[Dict]]:
        """Index history by subnet ID for efficient lookup."""
        indexed = defaultdict(list)

        for snapshot in self.history:
            timestamp = snapshot['_timestamp']
            ts_dt = datetime.fromisoformat(timestamp.replace('Z', '+00:00'))

            # Only include snapshots within lookback window
            if ts_dt < self.cutoff_time:
                continue

            for entry in snapshot.get('entries', []):
                subnet_id = entry['id']
                indexed[subnet_id].append({
                    'timestamp': timestamp,
                    'rank': entry['rank'],
                    'name': entry['name'],
                    'value': entry['value'],  # emission
                    'ts_dt': ts_dt
                })

        return dict(indexed)

    def extract_features(self, netuid: str) -> Optional[Dict]:
        """Extract all features for a subnet."""
        snapshots = self._subnet_snapshots.get(netuid)

        if not snapshots or len(snapshots) < 3:
            return None

        # Sort by timestamp (oldest first)
        snapshots = sorted(snapshots, key=lambda x: x['ts_dt'])

        features = {}

        # Current state
        current = snapshots[-1]
        features['current_rank'] = current['rank']
        features['current_emission'] = current['value']
        features['subnet_name'] = current['name']

        # Extract feature groups (order matters - gap features need emission features)
        features.update(self._extract_rank_features(snapshots))
        features.update(self._extract_emission_features(snapshots))
        features.update(self._extract_gap_features(netuid, snapshots, features))
        features.update(self._extract_tenure_features(snapshots))

        return features

    def _extract_rank_features(self, snapshots: List[Dict]) -> Dict:
        """Extract ranking-based features."""
        features = {}

        current_rank = snapshots[-1]['rank']
        ranks = [s['rank'] for s in snapshots]

        # Rank velocity (position changes over time)
        if len(snapshots) >= 2:
            # Recent velocity (last vs previous)
            features['rank_delta_recent'] = snapshots[-2]['rank'] - current_rank
        else:
            features['rank_delta_recent'] = 0

        # 7-day velocity (if enough data)
        snapshots_7d = [s for s in snapshots if (snapshots[-1]['ts_dt'] - s['ts_dt']).days <= 7]
        if len(snapshots_7d) >= 2:
            features['rank_delta_7d'] = snapshots_7d[0]['rank'] - current_rank
        else:
            features['rank_delta_7d'] = features['rank_delta_recent']

        # Rank #1 frequency
        rank1_count = sum(1 for r in ranks if r == 1)
        features['rank1_frequency'] = rank1_count / len(ranks) if ranks else 0

        # Rank stability (inverse of standard deviation)
        if len(ranks) >= 3:
            mean_rank = sum(ranks) / len(ranks)
            variance = sum((r - mean_rank) ** 2 for r in ranks) / len(ranks)
            stddev = math.sqrt(variance)
            features['rank_stability'] = 1.0 / (1.0 + stddev)
        else:
            features['rank_stability'] = 0.5

        # Average rank over period
        features['avg_rank'] = sum(ranks) / len(ranks) if ranks else 10

        return features

    def _extract_emission_features(self, snapshots: List[Dict]) -> Dict:
        """Extract emission-based features."""
        features = {}

        current_emission = snapshots[-1]['value']
        emissions = [s['value'] for s in snapshots]

        # Current emission share (approximate)
        # Assume total daily emission ~7200 TAO
        DAILY_EMISSION = 7200
        features['emission_share_current'] = (current_emission / DAILY_EMISSION) * 100

        # Emission trend (percent change)
        if len(snapshots) >= 2:
            prev_emission = snapshots[-2]['value']
            if prev_emission > 0:
                features['emission_pct_change_recent'] = ((current_emission - prev_emission) / prev_emission) * 100
            else:
                features['emission_pct_change_recent'] = 0
        else:
            features['emission_pct_change_recent'] = 0

        # 7-day emission trend
        snapshots_7d = [s for s in snapshots if (snapshots[-1]['ts_dt'] - s['ts_dt']).days <= 7]
        if len(snapshots_7d) >= 2:
            old_emission = snapshots_7d[0]['value']
            if old_emission > 0:
                features['emission_pct_change_7d'] = ((current_emission - old_emission) / old_emission) * 100
            else:
                features['emission_pct_change_7d'] = 0
        else:
            features['emission_pct_change_7d'] = features['emission_pct_change_recent']

        # Emission volatility
        if len(emissions) >= 3:
            mean_emission = sum(emissions) / len(emissions)
            variance = sum((e - mean_emission) ** 2 for e in emissions) / len(emissions)
            stddev = math.sqrt(variance)
            features['emission_volatility'] = stddev / mean_emission if mean_emission > 0 else 0
            features['share_stability'] = 1.0 / (1.0 + features['emission_volatility'])
        else:
            features['emission_volatility'] = 0
            features['share_stability'] = 0.5

        # Emission momentum (acceleration)
        if len(snapshots) >= 3:
            # Simple momentum: compare recent change to older change
            recent_change = features['emission_pct_change_recent']

            if len(snapshots) >= 4:
                mid_emission = snapshots[-3]['value']
                old_emission = snapshots[-4]['value']
                if old_emission > 0:
                    older_change = ((mid_emission - old_emission) / old_emission) * 100
                else:
                    older_change = 0
            else:
                older_change = 0

            features['emission_momentum'] = recent_change - older_change
        else:
            features['emission_momentum'] = 0

        return features

    def _extract_gap_features(self, netuid: str, snapshots: List[Dict], existing_features: Dict) -> Dict:
        """Extract emission gap features relative to current leader."""
        features = {}

        current_emission = snapshots[-1]['value']
        current_timestamp = snapshots[-1]['ts_dt']

        # Find current leader (rank #1) emission at same timestamp
        leader_emission = None
        for other_netuid, other_snapshots in self._subnet_snapshots.items():
            for snap in other_snapshots:
                # Find snapshot at same time with rank #1
                if abs((snap['ts_dt'] - current_timestamp).total_seconds()) < 3600:  # within 1 hour
                    if snap['rank'] == 1:
                        leader_emission = snap['value']
                        break
            if leader_emission:
                break

        if leader_emission is None or leader_emission == 0:
            # Fallback: If we ARE rank 1, gap is 0
            if snapshots[-1]['rank'] == 1:
                features['emission_gap_to_leader'] = 0
                features['emission_gap_normalized'] = 1.0  # No gap = best score
            else:
                # Unknown leader, assume large gap
                features['emission_gap_to_leader'] = 100
                features['emission_gap_normalized'] = 0.0
        else:
            # Gap in absolute τ/day
            gap = leader_emission - current_emission
            features['emission_gap_to_leader'] = max(0, gap)

            # Normalized: 0 = far from leader, 1 = at leader level
            # Use sigmoid to smooth: e^(-gap/50)
            # gap=0 → 1.0, gap=50 → 0.37, gap=100 → 0.14
            features['emission_gap_normalized'] = math.exp(-max(0, gap) / 50.0)

        # Gap closing feasibility
        # Can current growth trend close the gap in reasonable time?
        emission_trend = existing_features.get('emission_pct_change_7d', 0)
        gap_to_leader = features['emission_gap_to_leader']

        if gap_to_leader == 0:
            # Already leader
            features['gap_closing_feasibility'] = 1.0
        elif current_emission == 0 or emission_trend <= 0:
            # Not growing or zero emissions → can't close gap
            features['gap_closing_feasibility'] = 0.0
        else:
            # Calculate: at current growth rate, how many days to close gap?
            # growth_per_day = current * (trend/100) / 7
            growth_per_day = current_emission * (emission_trend / 100.0) / 7.0
            if growth_per_day > 0:
                days_to_close = gap_to_leader / growth_per_day
                # Normalize: 15 days = 1.0, 30 days = 0.5, 60+ days = 0.0
                features['gap_closing_feasibility'] = max(0, min(1.0, 1.0 - (days_to_close - 15) / 45.0))
            else:
                features['gap_closing_feasibility'] = 0.0

        return features

    def _extract_tenure_features(self, snapshots: List[Dict]) -> Dict:
        """Extract tenure (time in top positions) features."""
        features = {}

        # Count how many days subnet has been in top 3
        top3_days = 0
        prev_date = None

        for snap in snapshots:
            if snap['rank'] <= 3:
                current_date = snap['ts_dt'].date()
                if prev_date is None or current_date != prev_date:
                    top3_days += 1
                    prev_date = current_date

        # Normalize: 0-14 days → 0.0-1.0
        features['top3_tenure'] = min(1.0, top3_days / 14.0)

        return features

    def get_all_subnet_ids(self) -> List[str]:
        """Get all unique subnet IDs from history."""
        return list(self._subnet_snapshots.keys())


# === SCORING AND PROBABILITY CALCULATION ===

class RankPredictionModel:
    """Statistical model for subnet rank prediction."""

    def __init__(self, weights: Dict[str, float], position_penalties: Dict[int, float]):
        self.weights = weights
        self.position_penalties = position_penalties

    def calculate_probabilities(
        self,
        features_by_subnet: Dict[str, Dict],
        target_date: datetime
    ) -> Dict[str, float]:
        """Calculate rank #1 probabilities for all subnets."""

        # Calculate raw scores
        scores = {}
        for netuid, feat in features_by_subnet.items():
            if feat is None:
                continue
            score = self._calculate_score(feat)
            scores[netuid] = score

        if not scores:
            return {}

        # Apply position penalties
        days_until = max(1, (target_date - datetime.now(timezone.utc)).days)
        adjusted = {}
        for netuid, score in scores.items():
            feat = features_by_subnet[netuid]
            penalty = self._position_penalty(feat['current_rank'], days_until)
            adjusted[netuid] = score * penalty

        # Normalize to probabilities
        total = sum(adjusted.values())
        if total == 0:
            # Equal distribution if all scores are 0
            n = len(adjusted)
            return {netuid: 1.0/n for netuid in adjusted.keys()}

        probs = {
            netuid: score / total
            for netuid, score in adjusted.items()
        }

        return probs

    def _calculate_score(self, features: Dict) -> float:
        """Calculate weighted composite score with v2 features."""
        components = {}

        # Position components (40%)
        components['current_rank_inverse'] = 1.0 / max(1, features['current_rank'])
        components['rank1_frequency'] = features.get('rank1_frequency', 0)
        rank_velocity = (features.get('rank_delta_7d', 0) + features.get('rank_delta_recent', 0)) / 2
        components['rank_velocity_weighted'] = self._sigmoid(rank_velocity / 5.0)
        components['top3_tenure'] = features.get('top3_tenure', 0)  # NEW

        # Emission components (45%)
        components['emission_share_current'] = features.get('emission_share_current', 0) / 100.0
        components['emission_gap_normalized'] = features.get('emission_gap_normalized', 0)  # NEW
        components['emission_trend_7d'] = self._sigmoid(features.get('emission_pct_change_7d', 0) / 10.0)
        components['emission_momentum'] = self._sigmoid(features.get('emission_momentum', 0) / 5.0)
        components['gap_closing_feasibility'] = features.get('gap_closing_feasibility', 0)  # NEW

        # Stability components (15%)
        components['share_stability'] = features.get('share_stability', 0.5)
        components['rank_stability'] = features.get('rank_stability', 0.5)

        # Weighted sum
        score = sum(
            components.get(key, 0) * weight
            for key, weight in self.weights.items()
        )

        return max(0.0, min(1.0, score))

    def _position_penalty(self, rank: int, days_until: int) -> float:
        """Calculate position-based penalty."""
        if rank < 1:
            rank = 1
        elif rank > 10:
            rank = 10

        base_penalty = self.position_penalties.get(rank, 0.05)

        # Time adjustment: more time = less penalty
        time_factor = min(1.0, days_until / 30.0)
        adjusted_penalty = base_penalty + (1.0 - base_penalty) * time_factor * 0.3

        return adjusted_penalty

    @staticmethod
    def _sigmoid(x: float, steepness: float = 1.0) -> float:
        """Map value to 0-1 range with sigmoid."""
        try:
            return 1.0 / (1.0 + math.exp(-steepness * x))
        except:
            return 0.5


# === OUTPUT FORMATTING ===

def format_prediction_output(
    probabilities: Dict[str, float],
    features: Dict[str, Dict],
    target_date: datetime,
    history_metadata: Dict
) -> Dict:
    """Format predictions for storage."""

    # Sort by probability descending
    sorted_predictions = sorted(
        probabilities.items(),
        key=lambda x: x[1],
        reverse=True
    )

    predictions = []
    for netuid, prob in sorted_predictions:
        feat = features.get(netuid)
        if not feat:
            continue

        # Determine trend indicators
        # rank_delta_7d: positive = moved UP, negative = moved DOWN
        rank_delta = feat.get('rank_delta_7d', 0)
        rank_momentum = "stable"
        if rank_delta > 1:
            rank_momentum = "strong_positive"  # climbed 2+ ranks
        elif rank_delta > 0:
            rank_momentum = "positive"
        elif rank_delta < -1:
            rank_momentum = "strong_negative"  # dropped 2+ ranks
        elif rank_delta < 0:
            rank_momentum = "negative"

        emission_trend = "stable"
        if feat.get('emission_pct_change_7d', 0) > 5:
            emission_trend = "growing_strong"
        elif feat.get('emission_pct_change_7d', 0) > 0:
            emission_trend = "growing_moderate"
        elif feat.get('emission_pct_change_7d', 0) < -5:
            emission_trend = "declining_strong"
        elif feat.get('emission_pct_change_7d', 0) < 0:
            emission_trend = "declining_moderate"

        position_advantage = "challenger"
        if feat['current_rank'] == 1:
            position_advantage = "leader"
        elif feat['current_rank'] <= 3:
            position_advantage = "contender"
        elif feat['current_rank'] <= 5:
            position_advantage = "challenger"
        else:
            position_advantage = "underdog"

        predictions.append({
            'netuid': int(netuid),
            'subnet_name': feat.get('subnet_name', f'SN{netuid}'),
            'probability': round(prob, 4),
            'probability_pct': f"{prob * 100:.2f}%",
            'current_rank': feat['current_rank'],
            'current_emission_daily': round(feat['current_emission'], 2),
            'emission_share_pct': round(feat.get('emission_share_current', 0), 2),
            'trend_indicators': {
                'rank_momentum': rank_momentum,
                'emission_trend': emission_trend,
                'position_advantage': position_advantage
            },
            'key_metrics': {
                'rank_velocity_7d': round(feat.get('rank_delta_7d', 0), 2),
                'emission_change_7d_pct': round(feat.get('emission_pct_change_7d', 0), 2),
                'rank_stability': round(feat.get('rank_stability', 0), 2)
            }
        })

    # Top 5 contenders
    top_5 = [
        {
            'netuid': p['netuid'],
            'name': p['subnet_name'],
            'probability': p['probability']
        }
        for p in predictions[:5]
    ]

    # Market insights
    market_insights = {}
    if predictions:
        market_insights['most_stable'] = min(
            predictions,
            key=lambda p: p['key_metrics'].get('rank_velocity_7d', 0) ** 2
        )['netuid']

        market_insights['fastest_rising'] = max(
            predictions,
            key=lambda p: p['key_metrics'].get('rank_velocity_7d', 0)
        )['netuid']

    # Calculate confidence based on data quality
    snapshots_count = history_metadata.get('snapshots_count', 0)
    if snapshots_count >= 168:  # 1 week @ 1 snapshot/hour
        confidence = "high"
    elif snapshots_count >= 72:  # 3 days
        confidence = "medium"
    else:
        confidence = "low"

    days_ahead = (target_date - datetime.now(timezone.utc)).days

    return {
        'target_date': target_date.isoformat(),
        'days_ahead': days_ahead,
        'confidence': confidence,
        'data_quality': {
            'snapshots_analyzed': snapshots_count,
            'lookback_days': LOOKBACK_DAYS,
            'date_range': {
                'from': history_metadata.get('oldest_timestamp', ''),
                'to': history_metadata.get('newest_timestamp', '')
            }
        },
        'predictions': predictions,
        'top_5_contenders': top_5,
        'market_insights': market_insights
    }


# === MAIN EXECUTION ===

def parse_target_dates(date_str: Optional[str]) -> List[datetime]:
    """Parse target dates from env var or use defaults."""
    if not date_str:
        # Default: 30 days from now
        return [datetime.now(timezone.utc) + timedelta(days=DEFAULT_TARGET_DAYS_AHEAD)]

    dates = []
    for ds in date_str.split(','):
        ds = ds.strip()
        try:
            dates.append(datetime.fromisoformat(ds.replace('Z', '+00:00')))
        except:
            print(f'⚠️ Invalid date format: {ds}', file=sys.stderr)

    return dates if dates else [datetime.now(timezone.utc) + timedelta(days=30)]


def main():
    print("=" * 60)
    print("Subnet Ranking Prediction System")
    print("=" * 60)

    # 1. Validate environment
    if not all([CF_ACCOUNT_ID, CF_API_TOKEN, CF_KV_NAMESPACE_ID]):
        print('❌ Missing CF credentials (CF_ACCOUNT_ID, CF_API_TOKEN, CF_KV_NAMESPACE_ID)')
        sys.exit(1)

    print(f"📅 Generated: {datetime.now(timezone.utc).isoformat()}")
    print(f"📊 Lookback: {LOOKBACK_DAYS} days")
    print(f"📈 Min data points: {MIN_DATA_POINTS}")
    print()

    # 2. Fetch historical data
    print('📥 Fetching subnet history from KV...')
    history = get_from_kv('top_subnets_history')

    if not history or not isinstance(history, list):
        print('❌ No history data available', file=sys.stderr)
        sys.exit(1)

    if len(history) < MIN_DATA_POINTS:
        print(f'❌ Insufficient data: {len(history)} snapshots (need {MIN_DATA_POINTS})', file=sys.stderr)
        sys.exit(1)

    print(f'✅ Loaded {len(history)} historical snapshots')

    # 3. Parse target dates
    target_dates_str = os.getenv('PREDICTION_TARGET_DATES')
    target_dates = parse_target_dates(target_dates_str)
    print(f'🎯 Target dates: {[d.strftime("%Y-%m-%d") for d in target_dates]}')
    print()

    # 4. Extract features
    print('🔍 Extracting features...')
    extractor = SubnetFeatureExtractor(history, LOOKBACK_DAYS)

    all_netuids = extractor.get_all_subnet_ids()
    print(f'   Found {len(all_netuids)} unique subnets in history')

    features = {}
    for netuid in all_netuids:
        feat = extractor.extract_features(netuid)
        if feat:
            features[netuid] = feat

    print(f'✅ Extracted features for {len(features)} subnets')
    print()

    # 5. Calculate predictions for each target date
    model = RankPredictionModel(FEATURE_WEIGHTS, POSITION_PENALTIES)

    all_predictions = []
    for target_date in target_dates:
        print(f'⚡ Calculating predictions for {target_date.strftime("%Y-%m-%d")}...')

        probs = model.calculate_probabilities(features, target_date)

        history_metadata = {
            'snapshots_count': len(history),
            'oldest_timestamp': history[0]['_timestamp'] if history else '',
            'newest_timestamp': history[-1]['_timestamp'] if history else ''
        }

        prediction_output = format_prediction_output(
            probs, features, target_date, history_metadata
        )

        all_predictions.append(prediction_output)

        # Show top 3 predictions
        print(f'   Top 3 predictions:')
        for p in prediction_output['predictions'][:3]:
            print(f'   #{p["current_rank"]} {p["subnet_name"]}: {p["probability_pct"]} probability')

    print()

    # 6. Store to KV
    output = {
        '_generated_at': datetime.now(timezone.utc).isoformat(),
        'model_version': '1.0-statistical',
        'predictions_by_date': all_predictions,
        'configuration': {
            'lookback_days': LOOKBACK_DAYS,
            'min_data_points': MIN_DATA_POINTS,
            'feature_weights': FEATURE_WEIGHTS,
            'position_penalties': POSITION_PENALTIES
        }
    }

    print('💾 Storing predictions to KV...')
    success = put_to_kv('subnet_predictions', output)

    if success:
        print('✅ SUCCESS: Predictions stored')

        # Validate probabilities sum to ~1.0
        for pred in all_predictions:
            total_prob = sum(p['probability'] for p in pred['predictions'])
            print(f'   Validation: probabilities sum to {total_prob:.4f}')
            if not (0.99 <= total_prob <= 1.01):
                print(f'   ⚠️ Warning: probabilities do not sum to 1.0', file=sys.stderr)

        print()
        print("=" * 60)
        sys.exit(0)
    else:
        print('❌ ERROR: Failed to store predictions', file=sys.stderr)
        print("=" * 60)
        sys.exit(1)


if __name__ == '__main__':
    main()
