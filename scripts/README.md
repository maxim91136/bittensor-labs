# Probe scripts for Tokenomics

Small scripts to verify available metrics (circulating supply, total issuance, emission) from the local API and the Bittensor chain.

## Quickstart

Install dependencies:

```bash
cd /Users/steve/Documents/bittensor-hub/BITTENSOR-HUB/bittensor-labs
npm ci
```

Run endpoint checks:

```bash
BASE_URL=https://bittensor-labs.com TAOSTATS_URL=https://taostats.io npm run check-endpoints
```

Run RPC probe:

```bash
BITTENSOR_RPC=wss://rpc.mainnet.bittensor.com npm run check-rpc
```

## What they check

- `/api/network` — presence of `circulatingSupply`, `totalIssuance`, `emission_7d`/`emission_30d`, `halvingThresholds`, `supplyUsed`.
- Taostats candidates: `/api/taostats`, `/api/tokenomics`, `/api/halving`, `/api/v1/tokenomics`.
- Chain storages and constants like `issuance.totalInCirculation`, `balances.totalIssuance`, `tokenomics.nextHalvingThreshold`, etc.

These helps decide whether to use `circulatingSupply` directly or compute it from on-chain storages.
