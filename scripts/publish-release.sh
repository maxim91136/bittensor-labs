#!/usr/bin/env bash
set -euo pipefail

# Usage:
#  ./scripts/publish-release.sh v1.0.0-rc.1 "Release notes summary"

TAG=${1:-}
NOTES=${2:-}

if [ -z "$TAG" ]; then
  echo "Usage: $0 <tag> [release-notes]" >&2
  exit 1
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI not found. Install https://cli.github.com/ to publish releases via script." >&2
  exit 1
fi

echo "Creating release $TAG"
if [ -z "${NOTES}" ]; then
  gh release create "$TAG" --generate-notes
else
  gh release create "$TAG" -t "$TAG" -n "$NOTES"
fi

echo "Release $TAG created. Please check the GitHub UI for the release draft." 
