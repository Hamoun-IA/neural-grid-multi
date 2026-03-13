#!/bin/bash
# Activity Reporter V2 — enriched agent + system metrics
# Sends: tokens, model, role, emoji, sessions, CPU, RAM, disk, uptime
# Rétro-compatible with V1 webhook endpoint
# Usage: activity-reporter-v2.sh <SERVER_ID> <HUB_URL>

SERVER_ID="${1:?Usage: $0 <SERVER_ID> <HUB_URL>}"
HUB_URL="${2:-http://100.114.123.105:3101}"
POLL_INTERVAL=15  # seconds between checks
OPENCLAW_CMD="openclaw"
VERSION=2

# Detect if we need sudo
if [ "$(whoami)" != "root" ] && command -v sudo &>/dev/null; then
  if ! $OPENCLAW_CMD status &>/dev/null 2>&1; then
    OPENCLAW_CMD="sudo openclaw"
  fi
fi

# ─── Role/Emoji maps per server (customize per deployment) ────────────────────
# Format: ROLE_MAP[agent_id]="role"  EMOJI_MAP[agent_id]="emoji"
declare -A ROLE_MAP
declare -A EMOJI_MAP

case "$SERVER_ID" in
  NOVA)
    ROLE_MAP=([main]="Coordinatrice" [painter]="Artiste" [jarvis]="Assistant" [debug]="Sysadmin" [emma]="IA Compagne" [penny]="Finances" [brainstorm]="Créatif" [baboudog]="Compagnon" [memory]="Mémoire" [observer]="Observateur" [emotional]="Émotions")
    EMOJI_MAP=([main]="✨" [painter]="🎨" [jarvis]="🤖" [debug]="🐛" [emma]="💜" [penny]="💰" [brainstorm]="🧠" [baboudog]="🐕" [memory]="📝" [observer]="👁️" [emotional]="💗")
    ;;
  BABOUNETTE)
    ROLE_MAP=([main]="Pixie" [sentinelle]="Sécurité" [flora]="Jardin" [cocotte]="Cuisine" [gribouille]="Dessin" [courses]="Shopping" [penny]="Finances")
    EMOJI_MAP=([main]="🧚" [sentinelle]="🛡️" [flora]="🌸" [cocotte]="🍳" [gribouille]="✏️" [courses]="🛒" [penny]="💰")
    ;;
  CYBERPUNK)
    ROLE_MAP=([main]="Main" [supervisor]="Nexus" [design]="Neon" [tech]="Volt" [data]="Cortex")
    EMOJI_MAP=([main]="⚡" [supervisor]="🔮" [design]="🎨" [tech]="🔧" [data]="📊")
    ;;
  STUDIO)
    ROLE_MAP=([main]="Director" [valentina]="Valentina" [jess]="Jess" [lorane]="Lorane")
    EMOJI_MAP=([main]="🎬" [valentina]="💃" [jess]="🌟" [lorane]="🎭")
    ;;
  HOMELAB)
    ROLE_MAP=([main]="Debug" [hub]="Hub" [frontend]="Frontend" [backend]="Backend")
    EMOJI_MAP=([main]="🐛" [hub]="🔗" [frontend]="🎨" [backend]="⚙️")
    ;;
  TELENOVELAV3)
    ROLE_MAP=([main]="Main")
    EMOJI_MAP=([main]="🎭")
    ;;
esac

LAST_HASH=""

echo "[reporter-v2] Starting for $SERVER_ID → $HUB_URL (poll: ${POLL_INTERVAL}s)"

while true; do
  STATUS_OUTPUT=$($OPENCLAW_CMD status 2>/dev/null)
  if [ $? -ne 0 ]; then
    sleep $POLL_INTERVAL
    continue
  fi

  # ─── Parse agents with enriched data ─────────────────────────────────────
  AGENTS_JSON=$(echo "$STATUS_OUTPUT" | python3 -c "
import sys, json, re

lines = sys.stdin.read().split('\n')
agents = {}

# Parse sessions table
for line in lines:
    if '│' not in line or 'agent:' not in line:
        continue
    parts = [p.strip() for p in line.split('│') if p.strip()]
    if len(parts) < 3:
        continue
    
    key = parts[0]  # e.g. agent:painter:main
    age = parts[2] if len(parts) > 2 else ''
    
    # Extract agent ID
    m = re.match(r'agent:([^:]+)', key)
    if not m:
        continue
    agent_id = m.group(1)
    
    # Determine status
    status = 'IDLE'
    if age in ('just now',) or re.match(r'^\d+s ago$', age):
        if age == 'just now':
            status = 'ACTIVE'
        else:
            secs = int(re.match(r'(\d+)s', age).group(1))
            if secs < 300:
                status = 'ACTIVE'
    elif re.match(r'^\d+m ago$', age):
        mins = int(re.match(r'(\d+)m', age).group(1))
        if mins < 5:
            status = 'ACTIVE'
    
    if agent_id not in agents:
        agents[agent_id] = {
            'id': agent_id,
            'status': status,
            'lastAge': age,
            'sessionCount': 1,
            'activeSessions': 1 if status == 'ACTIVE' else 0
        }
    else:
        agents[agent_id]['sessionCount'] += 1
        if status == 'ACTIVE':
            agents[agent_id]['status'] = 'ACTIVE'
            agents[agent_id]['activeSessions'] += 1

# Parse model info from status output
# Look for lines with model info (varies by openclaw version)
for line in lines:
    # Look for agent config sections or model mentions
    m = re.match(r'.*agent[=:](\w+).*model[=:]([^\s,|]+)', line, re.I)
    if m:
        aid, model = m.group(1), m.group(2)
        if aid in agents:
            agents[aid]['model'] = model
            # Friendly name
            if 'opus' in model.lower():
                agents[aid]['modelFriendly'] = 'Claude Opus'
            elif 'sonnet' in model.lower():
                agents[aid]['modelFriendly'] = 'Claude Sonnet'
            else:
                agents[aid]['modelFriendly'] = model

# Parse token usage if available
for line in lines:
    m = re.match(r'.*tokens?.*?(\d[\d,]+)\s*/\s*(\d[\d,]+)', line, re.I)
    if m:
        used = int(m.group(1).replace(',', ''))
        total = int(m.group(2).replace(',', ''))
        # Try to associate with an agent (best effort)
        pass  # Token parsing is format-dependent

print(json.dumps(list(agents.values())))
" 2>/dev/null)

  if [ -z "$AGENTS_JSON" ] || [ "$AGENTS_JSON" = "[]" ]; then
    AGENTS_JSON="[]"
  fi

  # ─── Enrich with role/emoji from maps ────────────────────────────────────
  ENRICHED=$(echo "$AGENTS_JSON" | python3 -c "
import json, sys, os

agents = json.load(sys.stdin)
role_map = dict(item.split('=',1) for item in '''$(for k in "${!ROLE_MAP[@]}"; do echo "$k=${ROLE_MAP[$k]}"; done)'''.strip().split('\n') if '=' in item) if '''$(for k in "${!ROLE_MAP[@]}"; do echo "$k=${ROLE_MAP[$k]}"; done)'''.strip() else {}
emoji_map = dict(item.split('=',1) for item in '''$(for k in "${!EMOJI_MAP[@]}"; do echo "$k=${EMOJI_MAP[$k]}"; done)'''.strip().split('\n') if '=' in item) if '''$(for k in "${!EMOJI_MAP[@]}"; do echo "$k=${EMOJI_MAP[$k]}"; done)'''.strip() else {}

for a in agents:
    aid = a['id']
    if aid in role_map:
        a['role'] = role_map[aid]
    if aid in emoji_map:
        a['emoji'] = emoji_map[aid]

print(json.dumps(agents))
" 2>/dev/null)

  if [ -z "$ENRICHED" ]; then
    ENRICHED="$AGENTS_JSON"
  fi

  # ─── System metrics ──────────────────────────────────────────────────────
  CPU=$(top -bn1 2>/dev/null | awk '/^%?Cpu/{gsub(/[^0-9.]/, "", $2); print $2; exit}' || echo "0")
  MEM_INFO=$(free -m 2>/dev/null | awk '/^Mem:/{print $2, $3}')
  MEM_TOTAL=$(echo "$MEM_INFO" | awk '{print $1}')
  MEM_USED=$(echo "$MEM_INFO" | awk '{print $2}')
  MEM_PCT=$(echo "$MEM_TOTAL $MEM_USED" | awk '{if($1>0) printf "%.1f", $2/$1*100; else print "0"}')
  DISK_INFO=$(df -BG / 2>/dev/null | awk 'NR==2{gsub(/G/,"",$2); gsub(/G/,"",$3); gsub(/%/,"",$5); print $2, $3, $5}')
  DISK_TOTAL=$(echo "$DISK_INFO" | awk '{print $1}')
  DISK_USED=$(echo "$DISK_INFO" | awk '{print $2}')
  DISK_PCT=$(echo "$DISK_INFO" | awk '{print $3}')
  UPTIME_HUMAN=$(uptime -p 2>/dev/null | sed 's/^up //' || echo "unknown")
  LOAD=$(cat /proc/loadavg 2>/dev/null | awk '{print $1, $2, $3}')
  LOAD1=$(echo "$LOAD" | awk '{print $1}')
  LOAD5=$(echo "$LOAD" | awk '{print $2}')
  LOAD15=$(echo "$LOAD" | awk '{print $3}')

  # ─── Build payload ───────────────────────────────────────────────────────
  AGENT_COUNT=$(echo "$ENRICHED" | python3 -c "import json,sys; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")
  ACTIVE_COUNT=$(echo "$ENRICHED" | python3 -c "import json,sys; print(len([a for a in json.load(sys.stdin) if a.get('status')=='ACTIVE']))" 2>/dev/null || echo "0")

  SYSTEM_JSON=$(python3 -c "
import json
print(json.dumps({
    'cpu': float('${CPU:-0}'),
    'memUsedMB': int('${MEM_USED:-0}'),
    'memTotalMB': int('${MEM_TOTAL:-0}'),
    'memPct': float('${MEM_PCT:-0}'),
    'diskUsedGB': float('${DISK_USED:-0}'),
    'diskTotalGB': float('${DISK_TOTAL:-0}'),
    'diskPct': float('${DISK_PCT:-0}'),
    'uptimeHuman': '${UPTIME_HUMAN}',
    'load1': float('${LOAD1:-0}'),
    'load5': float('${LOAD5:-0}'),
    'load15': float('${LOAD15:-0}')
}))
" 2>/dev/null)

  PAYLOAD=$(python3 -c "
import json
agents = json.loads('''$ENRICHED''')
system = json.loads('''${SYSTEM_JSON:-{}}''')
print(json.dumps({
    'serverId': '$SERVER_ID',
    'agents': agents,
    'agentCount': int('${AGENT_COUNT:-0}'),
    'activeCount': int('${ACTIVE_COUNT:-0}'),
    'system': system,
    'reporterVersion': $VERSION,
    'timestamp': '$(date -u +%Y-%m-%dT%H:%M:%SZ)'
}))
" 2>/dev/null)

  if [ -z "$PAYLOAD" ]; then
    sleep $POLL_INTERVAL
    continue
  fi

  # ─── Hash and send ───────────────────────────────────────────────────────
  CURRENT_HASH=$(echo "$PAYLOAD" | md5sum | cut -d' ' -f1)

  if [ "$CURRENT_HASH" != "$LAST_HASH" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "$HUB_URL/api/webhook/activity" \
      -H "Content-Type: application/json" \
      -d "$PAYLOAD" \
      --connect-timeout 5 \
      --max-time 10 2>/dev/null)

    if [ "$HTTP_CODE" = "200" ]; then
      echo "[reporter-v2] Pushed: ${ACTIVE_COUNT}/${AGENT_COUNT} active, CPU=${CPU}%, MEM=${MEM_PCT}%"
    else
      echo "[reporter-v2] Push failed (HTTP $HTTP_CODE)"
    fi

    LAST_HASH="$CURRENT_HASH"
  fi

  sleep $POLL_INTERVAL
done
