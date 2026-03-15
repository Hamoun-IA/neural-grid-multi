#!/bin/bash
# Activity Reporter V2 — enriched agent + system metrics
# Lists ALL configured agents, enriches with session data when available.
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
    ROLE_MAP=([main]="Debug" [hub]="Hub" [frontend]="Frontend" [backend]="Backend" [homenas]="HomeNAS" [skillking]="SkillKing")
    EMOJI_MAP=([main]="🐛" [hub]="🔗" [frontend]="🎨" [backend]="⚙️" [homenas]="💾" [skillking]="👑")
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
  # Get ALL configured agents (timeout 15s to avoid hanging)
  AGENTS_OUTPUT=$(timeout 15 $OPENCLAW_CMD agents list 2>/dev/null | grep "^-")
  # Get session data (timeout 20s — can be slow on busy servers)
  STATUS_OUTPUT=$(timeout 20 $OPENCLAW_CMD status 2>/dev/null)

  if [ $? -ne 0 ]; then
    sleep $POLL_INTERVAL
    continue
  fi

  # If agents list is empty/failed, use ROLE_MAP keys as fallback
  if [ -z "$AGENTS_OUTPUT" ] || ! echo "$AGENTS_OUTPUT" | grep -q "^-"; then
    AGENTS_OUTPUT=""
    for k in "${!ROLE_MAP[@]}"; do
      AGENTS_OUTPUT="$AGENTS_OUTPUT
- $k"
    done
  fi

  # Write inputs for Python
  echo "$AGENTS_OUTPUT" > "$TMPDIR/agents_list.txt"
  echo "$STATUS_OUTPUT" > "$TMPDIR/status.txt"
  : > "$TMPDIR/roles.txt"
  for k in "${!ROLE_MAP[@]}"; do echo "$k=${ROLE_MAP[$k]}" >> "$TMPDIR/roles.txt"; done
  : > "$TMPDIR/emojis.txt"
  for k in "${!EMOJI_MAP[@]}"; do echo "$k=${EMOJI_MAP[$k]}" >> "$TMPDIR/emojis.txt"; done

  TMPDIR_PY="$TMPDIR" SERVER_ID_PY="$SERVER_ID" python3 << 'PYEOF'
import json, re, subprocess, hashlib, os
from datetime import datetime, timezone

tmpdir = os.environ.get("TMPDIR_PY", "/tmp")
server_id = os.environ.get("SERVER_ID_PY", "UNKNOWN")

# Read inputs
with open(f"{tmpdir}/agents_list.txt") as f:
    agents_lines = f.readlines()
with open(f"{tmpdir}/status.txt") as f:
    status_lines = f.readlines()

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

# 1. Parse ALL configured agents from "openclaw agents list"
all_agents = {}
for line in agents_lines:
    # Lines like: "- main (default) (Nova)" or "- painter (Painter)"
    m = re.match(r'^-\s+(\S+)', line)
    if m:
        aid = m.group(1)
        all_agents[aid] = {
            'id': aid,
            'name': aid,
            'status': 'IDLE',
            'lastAge': '—',
            'sessionCount': 0,
            'activeSessions': 0,
            'tokensUsed': 0,
            'tokensMax': 0,
            'tokensPct': 0,
            'model': 'unknown',
        }

# 2. Parse sessions from "openclaw status" to enrich agents
for line in status_lines:
    if '│' not in line or 'agent:' not in line:
        continue
    parts = [p.strip() for p in line.split('│') if p.strip()]
    if len(parts) < 5:
        continue
    key, kind, age, model_str, tokens_str = parts[0], parts[1], parts[2], parts[3], parts[4]
    m = re.match(r'agent:([^:]+)', key)
    if not m:
        continue
    aid = m.group(1)

    # Determine if active
    status = 'IDLE'
    if age == 'just now':
        status = 'ACTIVE'
    elif re.match(r'^\d+s ago$', age):
        if int(re.match(r'(\d+)', age).group(1)) < 300:
            status = 'ACTIVE'
    elif re.match(r'^\d+m ago$', age):
        if int(re.match(r'(\d+)', age).group(1)) < 5:
            status = 'ACTIVE'

    # Parse tokens: "92k/1000k (9%) · 🗄️ 100% cached" or "unknown/100k (?%)"
    tokens_used, tokens_max, tokens_pct = 0, 0, 0
    tm = re.match(r'([\d.]+k?)\/([\d.]+k?)\s*\((\d+)%\)', tokens_str)
    if tm:
        def parse_tok(s):
            if s.endswith('k'):
                return int(float(s[:-1]) * 1000)
            return int(float(s))
        tokens_used = parse_tok(tm.group(1))
        tokens_max = parse_tok(tm.group(2))
        tokens_pct = int(tm.group(3))

    if aid not in all_agents:
        all_agents[aid] = {
            'id': aid, 'name': aid, 'status': status, 'lastAge': age,
            'sessionCount': 1, 'activeSessions': 1 if status == 'ACTIVE' else 0,
            'tokensUsed': tokens_used, 'tokensMax': tokens_max, 'tokensPct': tokens_pct,
            'tokensTotalUsed': tokens_used,
            'model': model_str,
        }
    else:
        a = all_agents[aid]
        a['sessionCount'] += 1
        a['tokensTotalUsed'] = a.get('tokensTotalUsed', 0) + tokens_used
        if status == 'ACTIVE':
            a['status'] = 'ACTIVE'
            a['activeSessions'] = a.get('activeSessions', 0) + 1
        # Keep the most recent session's data (for tokensUsed = current session)
        if a['lastAge'] == '—' or age == 'just now':
            a['lastAge'] = age
            a['model'] = model_str
            a['tokensUsed'] = tokens_used
            a['tokensMax'] = tokens_max
            a['tokensPct'] = tokens_pct

# 3. Enrich with role/emoji maps
for aid, a in all_agents.items():
    if aid in role_map: a['role'] = role_map[aid]
    if aid in emoji_map: a['emoji'] = emoji_map[aid]
    # Friendly model name
    m = a.get('model', '')
    if 'opus' in m: a['modelFriendly'] = 'Claude Opus'
    elif 'sonnet' in m: a['modelFriendly'] = 'Claude Sonnet'
    elif 'haiku' in m: a['modelFriendly'] = 'Claude Haiku'
    else: a['modelFriendly'] = 'Unknown'

agent_list = list(all_agents.values())

# 4. System metrics
system = {}
try:
    top = subprocess.run(['top', '-bn1'], capture_output=True, text=True, timeout=5).stdout
    for l in top.split('\n'):
        if 'Cpu' in l:
            m2 = re.search(r'(\d+[.,]\d+)\s*id', l)
            if m2:
                system['cpu'] = round(100.0 - float(m2.group(1).replace(',', '.')), 1)
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
