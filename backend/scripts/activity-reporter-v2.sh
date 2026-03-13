#!/bin/bash
# Activity Reporter V2 — enriched agent + system metrics
# Usage: activity-reporter-v2.sh <SERVER_ID> <HUB_URL>

SERVER_ID="${1:?Usage: $0 <SERVER_ID> <HUB_URL>}"
HUB_URL="${2:-http://100.114.123.105:3101}"
POLL_INTERVAL=15
OPENCLAW_CMD="openclaw"

if [ "$(whoami)" != "root" ] && command -v sudo &>/dev/null; then
  if ! $OPENCLAW_CMD status &>/dev/null 2>&1; then
    OPENCLAW_CMD="sudo openclaw"
  fi
fi

# Role/Emoji maps
declare -A ROLE_MAP EMOJI_MAP
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
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

echo "[reporter-v2] Starting for $SERVER_ID → $HUB_URL (poll: ${POLL_INTERVAL}s)"

while true; do
  STATUS_OUTPUT=$($OPENCLAW_CMD status 2>/dev/null)
  if [ $? -ne 0 ]; then
    sleep $POLL_INTERVAL
    continue
  fi

  # Write inputs for Python
  echo "$STATUS_OUTPUT" > "$TMPDIR/status.txt"
  : > "$TMPDIR/roles.txt"
  for k in "${!ROLE_MAP[@]}"; do echo "$k=${ROLE_MAP[$k]}" >> "$TMPDIR/roles.txt"; done
  : > "$TMPDIR/emojis.txt"
  for k in "${!EMOJI_MAP[@]}"; do echo "$k=${EMOJI_MAP[$k]}" >> "$TMPDIR/emojis.txt"; done

  # Python does everything: parse, enrich, system metrics, build payload, write files
  python3 << PYEOF
import json, re, subprocess, hashlib, os
from datetime import datetime, timezone

tmpdir = "$TMPDIR"
server_id = "$SERVER_ID"

with open(f"{tmpdir}/status.txt") as f:
    lines = f.readlines()

role_map, emoji_map = {}, {}
try:
    with open(f"{tmpdir}/roles.txt") as f:
        for l in f:
            l = l.strip()
            if '=' in l:
                k, v = l.split('=', 1)
                role_map[k] = v
except: pass
try:
    with open(f"{tmpdir}/emojis.txt") as f:
        for l in f:
            l = l.strip()
            if '=' in l:
                k, v = l.split('=', 1)
                emoji_map[k] = v
except: pass

agents = {}
for line in lines:
    if '│' not in line or 'agent:' not in line:
        continue
    parts = [p.strip() for p in line.split('│') if p.strip()]
    if len(parts) < 3:
        continue
    key, age = parts[0], parts[2]
    m = re.match(r'agent:([^:]+)', key)
    if not m:
        continue
    aid = m.group(1)
    status = 'IDLE'
    if age == 'just now':
        status = 'ACTIVE'
    elif re.match(r'^\d+s ago$', age):
        if int(re.match(r'(\d+)', age).group(1)) < 300:
            status = 'ACTIVE'
    elif re.match(r'^\d+m ago$', age):
        if int(re.match(r'(\d+)', age).group(1)) < 5:
            status = 'ACTIVE'
    if aid not in agents:
        agents[aid] = {'id': aid, 'status': status, 'lastAge': age, 'sessionCount': 1, 'activeSessions': 1 if status == 'ACTIVE' else 0}
    else:
        agents[aid]['sessionCount'] += 1
        if status == 'ACTIVE':
            agents[aid]['status'] = 'ACTIVE'
            agents[aid]['activeSessions'] += 1

for aid, a in agents.items():
    if aid in role_map: a['role'] = role_map[aid]
    if aid in emoji_map: a['emoji'] = emoji_map[aid]

agent_list = list(agents.values())

# System metrics
system = {}
try:
    top = subprocess.run(['top', '-bn1'], capture_output=True, text=True, timeout=5).stdout
    for l in top.split('\n'):
        if 'Cpu' in l:
            m = re.search(r'(\d+[.,]\d+)\s*id', l)
            if m:
                system['cpu'] = round(100.0 - float(m.group(1).replace(',', '.')), 1)
            break
    mem = subprocess.run(['free', '-m'], capture_output=True, text=True, timeout=5).stdout
    for l in mem.split('\n'):
        if l.startswith('Mem:'):
            p = l.split()
            system['memTotalMB'] = int(p[1])
            system['memUsedMB'] = int(p[2])
            system['memPct'] = round(int(p[2]) / int(p[1]) * 100, 1) if int(p[1]) > 0 else 0
            break
    df = subprocess.run(['df', '-BG', '/'], capture_output=True, text=True, timeout=5).stdout
    for l in df.split('\n')[1:]:
        p = l.split()
        if len(p) >= 5:
            system['diskTotalGB'] = float(p[1].rstrip('G'))
            system['diskUsedGB'] = float(p[2].rstrip('G'))
            system['diskPct'] = float(p[4].rstrip('%'))
            break
    up = subprocess.run(['uptime', '-p'], capture_output=True, text=True, timeout=5).stdout.strip()
    system['uptimeHuman'] = up.replace('up ', '')
    with open('/proc/loadavg') as f:
        p = f.read().split()
        system['load1'] = float(p[0])
        system['load5'] = float(p[1])
        system['load15'] = float(p[2])
except: pass

active_count = len([a for a in agent_list if a['status'] == 'ACTIVE'])
payload = {
    'serverId': server_id,
    'agents': agent_list,
    'agentCount': len(agent_list),
    'activeCount': active_count,
    'system': system,
    'reporterVersion': 2,
    'timestamp': datetime.now(timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ'),
}

payload_json = json.dumps(payload)
h = hashlib.md5(payload_json.encode()).hexdigest()

with open(f"{tmpdir}/payload.json", 'w') as f:
    f.write(payload_json)
with open(f"{tmpdir}/hash.txt", 'w') as f:
    f.write(h)
PYEOF

  if [ ! -f "$TMPDIR/payload.json" ] || [ ! -f "$TMPDIR/hash.txt" ]; then
    sleep $POLL_INTERVAL
    continue
  fi

  CURRENT_HASH=$(cat "$TMPDIR/hash.txt")

  if [ "$CURRENT_HASH" != "$LAST_HASH" ]; then
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "$HUB_URL/api/webhook/activity" \
      -H "Content-Type: application/json" \
      -d @"$TMPDIR/payload.json" \
      --connect-timeout 5 \
      --max-time 10 2>/dev/null)

    if [ "$HTTP_CODE" = "200" ]; then
      INFO=$(python3 -c "import json; d=json.load(open('$TMPDIR/payload.json')); s=d.get('system',{}); print(f\"{d['activeCount']}/{d['agentCount']} active, CPU={s.get('cpu','?')}% MEM={s.get('memPct','?')}%\")" 2>/dev/null)
      echo "[reporter-v2] Pushed: $INFO"
    else
      echo "[reporter-v2] Push failed (HTTP $HTTP_CODE)"
    fi
    LAST_HASH="$CURRENT_HASH"
  fi

  sleep $POLL_INTERVAL
done
