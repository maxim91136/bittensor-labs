import unittest
from datetime import datetime, timezone, timedelta
from .utils import compute_per_interval_deltas, winsorized_mean

class TestFetchNetworkHelpers(unittest.TestCase):
    def test_per_interval_deltas(self):
        now = int(datetime.now(timezone.utc).timestamp())
        h = [
            {'ts': now - 900, 'issuance': 1000.0},
            {'ts': now, 'issuance': 1001.0}
        ]
        deltas = compute_per_interval_deltas(h)
        self.assertEqual(len(deltas), 1)
        self.assertAlmostEqual(deltas[0]['per_day'], (1.0) * (86400.0 / 900))

    def test_winsorized_mean(self):
        arr = [1, 2, 100, 3, 4, 5]
        w = winsorized_mean(arr, 0.1)
        self.assertIsNotNone(w)

if __name__ == '__main__':
    unittest.main()
