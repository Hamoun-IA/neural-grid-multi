#!/bin/bash
# Activity Reporter — monitors OpenClaw agent sessions and pushes changes to Hub
# Runs as a systemd service on each server
# Usage: activity-reporter.sh <SERVER_ID> <HUB_URL>
#   e.g.: activity-reporter.sh NOVA http://100.114.123.105:3101

SERVER_ID="${1:?Usage: $0 <SERVER_ID> <HUB_URL>}"
HUB_URL="${2:-http://100.114.123.105:3101}"
POLL_INTERVAL=3  # seconds between checks
OPENCLAW_CMD="openclaw"

# Detect if we need sudo
if [ "$(whoami)" != "root" ] && command -v sudo &>/dev/null; then
  # Check if openclaw needs sudo
  if ! $OPENCLAW_CMD status &>/dev/null 2>&1; then
    OPENCLAW_CMD="sudo openclaw"
  fi
fi

LAST_HASH=""

echo "[reporter] Starting activity reporter for $SERVER_ID → $HUB_URL"

while true; do
  # Get session activity from openclaw status
  # Parse the Sessions table to extract agent activity
  STATUS_OUTPUT=$($OPENCLAW_CMD status 2>/dev/null)

  if [ $? -ne 0 ]; then
    sleep $POLL_INTERVAL
    continue
  fi

  # Extract agent sessions and their ages
  # Lines look like: │ agent:painter:main │ direct │ 23m ago │ ...
  AGENTS_JSON=$(echo "$STATUS_OUTPUT" | awk '
  BEGIN { printf "[" ; first=1 }
  /│.*agent:/ {
    # Extract agent ID and age
    split($0, parts, "│")
    key = parts[2]
    age = parts[4]

    # Clean whitespace
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", key)
    gsub(/^[[:space:]]+|[[:space:]]+$/, "", age)

    # Extract agent ID from key (agent:<id>:<rest>)
    split(key, keyparts, ":")
    agentId = keyparts[2]

    # Determine if active (< 60 seconds old)
    active = "IDLE"
    if (age == "just now" || age ~ /^[0-9]+s ago$/) {
      # Check if seconds < 60
      if (age == "just now") {
        active = "ACTIVE"
      } else {
        split(age, ageparts, "s")
        if (ageparts[1]+0 < 60) active = "ACTIVE"
      }
    }

    if (!first) printf ","
    printf "{\"id\":\"%s\",\"status\":\"%s\",\"lastAge\":\"%s\"}", agentId, active, age
    first = 0
  }
  END { printf "]" }
  ')

  # Deduplicate: keep the most recent entry per agent (first seen = most recent in openclaw status)
  DEDUPED=$(echo "$AGENTS_JSON" | python3 -c "
import json, sys
try:
    agents = json.load(sys.stdin)
    seen = {}
    for a in agents:
        aid = a['id']
        if aid not in seen:
            seen[aid] = a
        elif a['status'] == 'ACTIVE':
            seen[aid]['status'] = 'ACTIVE'
    result = list(seen.values())
    print(json.dumps(result))
except:
    print('[]')
" 2>/dev/null)

  # Hash to detect changes
  CURRENT_HASH=$(echo "$DEDUPED" | md5sum | cut -d' ' -f1)

  # Only POST if activity changed
  if [ "$CURRENT_HASH" != "$LAST_HASH" ]; then
    PAYLOAD="{\"serverId\":\"$SERVER_ID\",\"agents\":$DEDUPED,\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}"

    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "$HUB_URL/api/webhook/activity" \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD" \
      --connect-timeout 3 \
      --max-time 5 2>/dev/null)

    if [ "$HTTP_CODE" = "200" ]; then
      ACTIVE_COUNT=$(echo "$DEDUPED" | python3 -c "import json,sys; print(len([a for a in json.load(sys.stdin) if a['status']=='ACTIVE']))" 2>/dev/null)
      echo "[reporter] Pushed update: $ACTIVE_COUNT active agents"
    else
      echo "[reporter] Push failed (HTTP $HTTP_CODE)"
    fi

    LAST_HASH="$CURRENT_HASH"
  fi

  sleep $POLL_INTERVAL
done
