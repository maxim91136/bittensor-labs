# Issuance History & Emission Metrics

This file documents the collection and usage of the `issuance_history` Cloudflare KV key.

- The scheduled job `.github/workflows/publish-network.yml` runs every 15 minutes and executes the `fetch_network.py` script.
- `fetch_network.py` reads the existing `issuance_history` key from Cloudflare KV to append a new 15-minute snapshot instead of overwriting the history.
- If the `issuance_history` key does not exist (404), a new history starts.
- If a KV READ fails (403 or network error), the script will omit writing the local `issuance_history.json` to prevent accidental overwrites.
- The script computes emission metrics (emission_daily, emission_7d, emission_30d) using normalized per-interval deltas and winsorized mean to smooth spikes.

Testing & Local Tools
- `.github/scripts/generate_test_issuance_history.py` can be used to generate synthetic history for local testing.
- `.github/scripts/compute_emission_from_history.py` will compute emission stats from a local `issuance_history.json` file.
  

Security Notes
- The Cloudflare token used by the CI (`CF_API_TOKEN`) must have **both** read and write permissions for the KV namespace to allow the script to append snapshots safely.
- If you need to backfill historical issuance data for testing, either use the `generate_test_issuance_history.py` script or perform a controlled PUT to the `issuance_history` KV key.
