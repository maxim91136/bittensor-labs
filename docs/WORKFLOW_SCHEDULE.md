# Workflow Schedule Overview

## Execution Timeline (Daily)

```
Every 10 min:    ✓ publish-taostats.yml
                 ✓ compute-taostats-aggregates.yml

Every 15 min:    ✓ publish-network.yml

Every 3 hours:   ✓ backup-taostats-r2.yml
                 ✓ backup-network-history-r2.yml
                 ✓ publish-ath-athl.yml

Every 6 hours:   ✓ backup-issuance-history-r2.yml

Manual only:     • deploy-worker.yml
                 • fetch-top-subnets.yml (commented out: was */30 min)
```

## Detailed Schedule

| Workflow | Schedule | Purpose | Type |
|----------|----------|---------|------|
| **publish-taostats.yml** | 10 min | Fetch price/volume from Taostats API | Data Collection |
| **compute-taostats-aggregates.yml** | 10 min | Calculate MAs, trend direction | Analysis |
| **publish-network.yml** | 15 min | Fetch network metrics from SDK | Data Collection |
| **publish-ath-athl.yml** | 3 hours | Fetch ATH/ATL data | Data Collection |
| **backup-taostats-r2.yml** | 3 hours | Archive taostats history | Archival |
| **backup-network-history-r2.yml** | 3 hours | Archive network history | Archival |
| **backup-issuance-history-r2.yml** | 6 hours | Archive issuance history | Archival |
| **deploy-worker.yml** | Manual | Deploy Cloudflare Worker | CI/CD |
| **fetch-top-subnets.yml** | Manual | Fetch top subnets (disabled) | Data Collection |

## Data Flow Per Hour

```
:00 - backup-issuance-history-r2.yml (every 6h)
      backup-taostats-r2.yml
      backup-network-history-r2.yml  
      publish-ath-athl.yml

:10 - publish-taostats.yml
      compute-taostats-aggregates.yml

:15 - publish-network.yml

:20 - publish-taostats.yml
      compute-taostats-aggregates.yml

:25 - (idle)

:30 - publish-taostats.yml
      compute-taostats-aggregates.yml

:40 - publish-taostats.yml
      compute-taostats-aggregates.yml

:50 - publish-taostats.yml
      compute-taostats-aggregates.yml

(repeats)
```

## Resource Utilization

**High Frequency (10 min):**
- 144 runs/day × 2 workflows = 288 runs
- Python dependencies: requests, bittensor

**Medium Frequency (15 min):**
- 96 runs/day × 1 workflow = 96 runs
- Python dependencies: bittensor

**Low Frequency (3-6 hours):**
- Archival workflows: 8 + 8 + 4 = 20 runs/day
- Python dependencies: boto3, requests

## Notes

- All scheduled via GitHub Actions cron (UTC)
- All workflows support `workflow_dispatch` (manual trigger)
- No overlapping executions (sequential by schedule)
- Each run is independent (no shared state)
