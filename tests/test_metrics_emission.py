import time
import math
import unittest
import os, sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))
from services.metrics import helpers as metrics_helpers


def create_hist(start_ts, entries, delta_per_day):
    # Create `entries` evenly spaced 1 day apart for simplicity
    hist = []
    for i in range(entries):
        ts = start_ts + i * 86400
        issuance = 100_000 + i * delta_per_day
        hist.append({'ts': ts, 'issuance': float(issuance)})
    return hist


class TestEmissionFunctions(unittest.TestCase):
    def test_compute_per_day_deltas_simple(self):
        now_ts = time.time()
        hist = create_hist(now_ts - 3 * 86400, 3, 700)
        deltas = metrics_helpers.compute_per_day_deltas_from_history(hist)
        self.assertEqual(len(deltas), 2)
        for d in deltas:
            self.assertAlmostEqual(d, 700, places=6)

    def test_avg_for_days_simple(self):
        now_ts = time.time()
        hist = create_hist(now_ts - 3 * 86400, 3, 800)
        avg7 = metrics_helpers.avg_for_days(hist, 7, now_ts)
        self.assertAlmostEqual(avg7, 800, places=6)

    def test_negative_delta(self):
        now_ts = time.time()
        hist = []
        hist.append({'ts': now_ts - 2 * 86400, 'issuance': 1000.0})
        hist.append({'ts': now_ts - 1 * 86400, 'issuance': 900.0})
        hist.append({'ts': now_ts, 'issuance': 1100.0})
        avg = metrics_helpers.avg_for_days(hist, 7, now_ts)
        # deltas are -100/day and +200/day -> average = 50/day
        self.assertAlmostEqual(avg, 50.0, places=6)


if __name__ == '__main__':
    unittest.main()
