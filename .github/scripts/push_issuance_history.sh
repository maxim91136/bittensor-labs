#!/usr/bin/env bash
set -euo pipefail
if [ ! -f issuance_history.json ]; then
  echo "issuance_history.json not present; skipping issuance_history push"
  exit 0
fi
if [ -z "${CF_ACCOUNT_ID:-}" ] || [ -z "${CF_API_TOKEN:-}" ] || [ -z "${CF_KV_NAMESPACE_ID:-}" ]; then
  echo "CF env not configured; failing to avoid silent skips" >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  sudo apt-get update && sudo apt-get install -y jq
fi
LOCAL_CANONICAL=$(jq -cS 'if type=="array" then . elif type=="object" then [.] else [.] end' issuance_history.json 2>/dev/null || cat issuance_history.json | jq -cS 'if type=="array" then . elif type=="object" then [.] else [.] end')
URL="https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/issuance_history"
HTTP_STATUS_KV=$(curl -s -o /tmp/kv_current.json -w "%{http_code}" -H "Authorization: Bearer ${CF_API_TOKEN}" "$URL" || true)
echo "DEBUG: HTTP_STATUS_KV=$HTTP_STATUS_KV" >&2
PUSH_FILE=issuance_history.json
FORCE_LOCAL=${FORCE_ISSUANCE_ON_KV_FAIL:-0}
REPLACE_HISTORY=${REPLACE_ISSUANCE_HISTORY:-0}

# If REPLACE_ISSUANCE_HISTORY=1, skip merge and just push local data
if [ "$REPLACE_HISTORY" = "1" ]; then
  echo "REPLACE_ISSUANCE_HISTORY=1: Replacing KV history with local sanitized data (no merge)" >&2
  PUSH_FILE=issuance_history.json
elif [ "$HTTP_STATUS_KV" = "200" ]; then
  set +e
  KV_JSON=$(jq -cS '.' /tmp/kv_current.json 2>/dev/null || true)
  if [ -s /tmp/kv_current.json ]; then
    echo "DEBUG: KV current body (first 500 bytes):" >&2
    head -c 500 /tmp/kv_current.json | sed -e 's/[^[:print:]	]/?/g' >&2 || true
  else
    echo "DEBUG: /tmp/kv_current.json is empty" >&2
  fi
  if [ -z "$KV_JSON" ]; then
    KV_FROMSTRING=$(jq -r 'if type=="string" then . else empty end' /tmp/kv_current.json 2>/dev/null || true)
    if [ -n "$KV_FROMSTRING" ] && echo "$KV_FROMSTRING" | jq -e '.' >/dev/null 2>&1; then
      KV_JSON=$(echo "$KV_FROMSTRING" | jq -cS '.')
    fi
  fi
  set -e
  if [ -z "$KV_JSON" ]; then
    echo "Warning: Could not parse KV JSON; will push local issuance_history.json" >&2
    PUSH_FILE=issuance_history.json
  else
    echo "DEBUG: KV_JSON parsed (length=$(printf '%s' "$KV_JSON" | wc -c))" >&2
    KV_CANONICAL=$(echo "$KV_JSON" | jq -cS 'if type=="array" then . elif type=="object" then [.] else [.] end')
    MERGED_CANONICAL=$(jq -s 'add | unique_by(.ts) | sort_by(.ts)' <(echo "$KV_CANONICAL") <(echo "$LOCAL_CANONICAL") 2>/dev/null || true)
    if [ -z "$MERGED_CANONICAL" ]; then
      echo "Failed to merge KV and local issuance_history; will push local" >&2
      PUSH_FILE=issuance_history.json
    else
      KV_HASH=$(printf "%s" "$KV_CANONICAL" | sha256sum | awk '{print $1}')
      MERGED_HASH=$(printf "%s" "$MERGED_CANONICAL" | sha256sum | awk '{print $1}')
      if [ "$MERGED_HASH" = "$KV_HASH" ]; then
        echo "issuance_history.json unchanged after merge; skipping push"
        exit 0
      fi
      printf "%s" "$MERGED_CANONICAL" > /tmp/issuance_history_merged.json
      PUSH_FILE=/tmp/issuance_history_merged.json
    fi
  fi
elif [ "$HTTP_STATUS_KV" = "404" ]; then
  echo "issuance_history not present on KV; pushing local issuance_history.json"
  PUSH_FILE=issuance_history.json
else
  echo "Warning: Unable to read KV (HTTP $HTTP_STATUS_KV)" >&2
  if [ "$FORCE_LOCAL" = "1" ]; then
    echo "FORCE_ISSUANCE_ON_KV_FAIL=1: will push local issuance_history.json despite KV read failure" >&2
    PUSH_FILE=issuance_history.json
  else
    echo "Skipping issuance_history push to avoid overwriting remote KV as KV read failed" >&2
    exit 0
  fi
fi
echo "DEBUG: PUSH_FILE=$PUSH_FILE" >&2
HTTP_STATUS_PUT=$(curl -s -o /tmp/push_output.json -w "%{http_code}" -X PUT "$URL" -H "Authorization: Bearer $CF_API_TOKEN" -H "Content-Type: application/json" --data-binary @$PUSH_FILE || true)
echo "DEBUG: HTTP_STATUS_PUT=$HTTP_STATUS_PUT" >&2
if [ -s /tmp/push_output.json ]; then
  echo "DEBUG: push response (first 500 bytes):" >&2
  head -c 500 /tmp/push_output.json | sed -e 's/[^[:print:]	]/?/g' >&2 || true
fi
if [ "$HTTP_STATUS_PUT" != "200" ] && [ "$HTTP_STATUS_PUT" != "204" ]; then
  echo "Failed to push issuance_history to Cloudflare KV: HTTP $HTTP_STATUS_PUT" >&2
  cat /tmp/push_output.json || true
  exit 1
fi
echo "OK: issuance_history pushed to Cloudflare KV"
