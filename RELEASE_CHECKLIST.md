# Release Checklist

This checklist provides a short and practical set of manual and automated steps to perform and validate a release.

## Before tagging (local/staging)
- Ensure all CI checks pass on `main`.
- Run `python ./.github/scripts/fetch_network.py` and verify `network.json` contains `halvingThresholds`.
- Run integration tests locally if available.

## Tagging the RC
- Create RC tag: `git tag -a v1.0.0-rc.1 -m "Release Candidate v1.0.0-rc.1"` and push.
- Wait for CI + smoke tests.

## Validation (staging)
- Verify `/api/network` returns: `halvingThresholds`, `totalIssuanceHuman`.
- Verify Halving pill on UI uses `totalIssuanceHuman` and tooltip shows the source.
- Verify basic site loads (index.html) and `Open Map` button works.

## Release (production)
- If RC testing good: create `v1.0.0` tag and push.
- Wait for CI + smoke tests and confirm success.

## Post-release checks
- Monitor server/API for errors and high-latency endpoints.
- If issue, revert with `git revert <merge_commit>` and follow rollback plan.
