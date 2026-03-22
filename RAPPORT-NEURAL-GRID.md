# 🔗 Neural Grid — Rapport Technique Complet

> **Système de monitoring temps réel pour une flotte de 7 serveurs OpenClaw**
> Dashboard cyberpunk 3D · Mesh inter-agents · Terminal SSH · File Explorer
>
> Rédigé par Hub 🔗 — Architecte Réseau Inter-Agents
> Date : 22 mars 2026

---

## Table des matières

1. [Architecture & Infrastructure](#partie-1--architecture--infrastructure)
2. [Frontend — Visualisation 3D & Interactivité](#partie-2--frontend--visualisation-3d--interactivité)
3. [Reporter V2 & Data Pipeline](#partie-3--reporter-v2--data-pipeline)
4. [Mesh Comlink — Communication Inter-Agents](#partie-4--mesh-comlink--communication-inter-agents)
5. [Résumé & Statistiques](#résumé--statistiques)

---

# Partie 1 — Architecture & Infrastructure

## 1.1 Vue d'ensemble

**Neural Grid** est un dashboard de monitoring temps réel conçu pour superviser une flotte de 7 serveurs OpenClaw interconnectés via un réseau privé Tailscale. L'interface adopte une esthétique cyberpunk 3D immersive, transformant les métriques système brutes en une visualisation spatiale où chaque serveur est représenté comme un building lumineux dans une grille neuronale virtuelle.

Le système surveille en permanence **~50 agents IA** répartis sur l'ensemble de l'infrastructure. Chaque agent — qu'il s'agisse d'un assistant conversationnel, d'un agent de développement ou d'un orchestrateur réseau — est tracké individuellement : état (ACTIVE/IDLE), uptime, dernière activité, tokens consommés, modèle LLM utilisé, et métriques de session.

Neural Grid est architecturé comme une **Progressive Web App (PWA)**, installable sur desktop et mobile avec un fonctionnement optimisé pour les écrans tactiles.

---

## 1.2 Stack technique

L'architecture suit un modèle **monorepo** hébergé sur GitHub (`Hamoun-IA/neural-grid-multi`) :

```
neural-grid-multi/
├── frontend/          # React 19 + TypeScript + Vite 6
│   ├── src/
│   │   ├── components/    # InteriorView, Building, WebTerminal, FileExplorer
│   │   ├── data/          # mockServers.ts
│   │   ├── services/      # api.ts (REST + WebSocket)
│   │   └── types.ts       # Interfaces partagées
│   └── vite.config.ts
├── backend/           # Express.js + TypeScript + WebSocket (ws)
│   ├── src/
│   │   ├── services/      # poller, mesh, thread, ssh-terminal, gateway
│   │   ├── routes/        # health, servers, mesh, thread, webhook, files
│   │   ├── models/        # thread.ts
│   │   ├── config.ts      # Définition des 7 serveurs
│   │   └── index.ts       # Entry point Express + WS
│   └── scripts/           # activity-reporter-v2.sh
└── .env                   # Tokens gateway (gitignored)
```

| Composant | Technologie | Port |
|---|---|---|
| **Frontend** | React 19 + TypeScript + Vite 6 + Tailwind CSS 4 | 3100 |
| **Backend** | Express.js + TypeScript + WebSocket (ws 8.19) | 3101 |
| **Reverse Proxy** | Caddy v2.11 + TLS Tailscale | 4100 (HTTPS) |
| **Déploiement** | systemd (neural-grid-frontend, neural-grid-backend) | — |
| **Réseau** | Tailscale mesh privé (WireGuard) | — |

### Configuration Caddy

```caddyfile
homelab.tail5327e7.ts.net:4100 {
    tls /etc/caddy/certs/homelab.tail5327e7.ts.net.crt /etc/caddy/certs/homelab.tail5327e7.ts.net.key

    handle /ws {
        reverse_proxy localhost:3101    # WebSocket dashboard events
    }
    handle /ws/* {
        reverse_proxy localhost:3101    # WebSocket SSH terminal
    }
    handle /api/* {
        reverse_proxy localhost:3101    # API REST backend
    }
    handle {
        reverse_proxy localhost:3100    # Frontend Vite
    }
}
```

---

## 1.3 Serveurs et connectivité

Les 7 serveurs forment un **mesh privé Tailscale** :

| Serveur | IP Tailscale | Agents | Rôle | SSH | Notes |
|---|---|---|---|---|---|
| **Nova** | `100.118.127.18` | 16 | Production principale | root:22 | Plus gros nœud |
| **Studio** | `100.85.162.13` | 2 | Telenovela | root:22 | Agents création |
| **Babounette** | `100.66.209.98` | 7 | Pixie + assistants | root:22 | Multi-rôles |
| **Cyberpunk** | `100.76.173.17` | 5 | Main + Nexus | root:22 | Nœud cyberpunk |
| **Homelab** | `127.0.0.1` | 6 | Hub + Monitoring | root (clé SSH) | Héberge Neural Grid |
| **Boss** | `100.119.23.69` | 17 | Serveur principal | root:2222 | Port SSH non-standard |
| **Lab** | `100.65.134.91` | 1 | Environnement test | root:22 | Sandbox ~1 mois |

> **Homelab** utilise `127.0.0.1` car c'est le serveur qui héberge Neural Grid. Les données locales sont collectées sans transit réseau. L'authentification SSH utilise une clé ED25519 (pas de mot de passe root disponible).

> **Boss** utilise le port SSH `2222` car les ACL Tailscale bloquent le port 22 sur ce serveur.

---

## 1.4 Backend polling — Collecte de données

Le gateway OpenClaw expose une API **WebSocket RPC** (pas REST), ce qui rend impossible l'interrogation directe par `curl` ou `fetch`. Le backend Neural Grid utilise **SSH comme transport principal** :

```
Reporter V2 (15s) ──webhook──→ Backend ──broadcast──→ Dashboard (WebSocket)
                                  ↑
SSH Poller (60s) ─────────────────┘ (fallback)
```

Deux mécanismes coexistent :

1. **Reporter Webhook V2** (toutes les **15s**) — Script bash sur chaque serveur qui push proactivement ses métriques via HTTP POST. Mécanisme principal, plus réactif.
2. **SSH Polling backup** (toutes les **60s**) — Le backend SSH vers chaque serveur et exécute les commandes OpenClaw CLI. Filet de sécurité.

---

## 1.5 Architecture WebSocket

Le backend gère **deux serveurs WebSocket** en mode `noServer` :

```typescript
const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
const terminalWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });

httpServer.on('upgrade', (request, socket, head) => {
  const pathname = new URL(request.url!, `http://localhost:${PORT}`).pathname;
  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request));
  } else if (pathname.startsWith('/ws/terminal')) {
    terminalWss.handleUpgrade(request, socket, head, (ws) => terminalWss.emit('connection', ws, request));
  } else {
    socket.destroy();
  }
});
```

**Pourquoi `noServer` ?** Sans ce mode, Express intercepte les requêtes d'upgrade HTTP et écrit des réponses HTTP sur le socket WS. Le `H` de `HTTP/1.1 400 Bad Request` = `0x48` → bit RSV1=1 → corruption du framing WebSocket. Le mode `noServer` + handler manuel d'upgrade résout définitivement ce bug.

- **`/ws`** — Événements dashboard : `server_update`, `mesh_message`, `mesh_thread`, `heartbeat`
- **`/ws/terminal`** — Terminal SSH interactif : stream binaire stdin/stdout via ssh2

---

## 1.6 Sécurité

- **Tailscale mesh privé** — Aucun port exposé sur internet. Toutes les communications transitent par le réseau chiffré WireGuard.
- **Credentials isolés** — Tokens gateway dans `.env` (gitignored). SSH credentials dans le backend, jamais exposés au frontend.
- **TLS Caddy** — Certificats Tailscale pour le reverse proxy HTTPS.
- **Accès SSH par clé** — Homelab utilise une clé ED25519. Les autres serveurs utilisent mot de passe via Tailscale uniquement.

```
[Browser] ──HTTPS:4100──→ [Caddy/TLS] ──HTTP──→ [Frontend:3100]
                                │
                                └──WS/HTTP──→ [Backend:3101]
                                                   │
                                     ┌─────────────┼─────────────┐
                               [SSH/Tailscale] [SSH/Tailscale] [SSH/Tailscale]
                                     │             │             │
                                  [Nova]       [Boss:2222]    [Studio] ...
```

---

# Partie 2 — Frontend : Visualisation 3D & Interactivité

## 2.1 Vue Extérieure : Cityscape Isométrique

Le point d'entrée visuel est une **vue urbaine isométrique** où chaque serveur est représenté par un immeuble 3D. La scène repose sur une grille de **1000×1000 pixels**, subdivisée en cellules de **40px** (25×25 unités).

### Buildings 3D en CSS

Chaque serveur est matérialisé par un **building 3D** construit en CSS via `transform-style: preserve-3d`. Le composant `Building.tsx` — marqué **DO NOT MODIFY** — génère des faces HTML (front, back, left, right, top) positionnées via `rotateX/Y` et `translateZ`. La hauteur est proportionnelle au nombre d'agents.

| Serveur | Couleur | Code hex |
|---|---|---|
| Nova | Cyan électrique | `#00f0ff` |
| Studio | Magenta | `#ff00ff` |
| Cyberpunk | Vert néon | `#00ff00` |
| Babounette | Jaune doré | `#ffea00` |
| Homelab | Violet profond | `#b000ff` |
| Boss | Rouge | `#ff4444` |
| Lab | Turquoise | `#44ffcc` |

### Illumination dynamique

Un building s'**illumine** (box-shadow pulsé + opacité augmentée) dès qu'au moins un agent est `ACTIVE`. En idle, le building reste sombre avec une lueur résiduelle.

### Particules inter-serveurs

Des traînées de particules relient les buildings, mais **uniquement sur événements mesh réels** (`mesh_message`, `mesh_thread`). Pas d'animation cosmétique permanente — les particules représentent fidèlement les communications en cours.

### Véhicules animés

Des véhicules lumineux circulent sur les axes de la grille via des `@keyframes` CSS purs.

---

## 2.2 Vue Intérieure : InteriorView — CSS 3D Tower

Un clic sur un building ouvre la **vue intérieure** : une tour 3D en CSS pur.

### Rendu 3D

- `perspective: 1200px` (desktop) / `800px` (mobile)
- `transform-style: preserve-3d` sur le conteneur
- Chaque agent = **rack serveur 3D** avec 6 faces HTML

**Face avant** :
- Nom agent en monospace `tracking-[0.2em]`
- 3 indicateurs circulaires : 🟢 actif, 🟡 idle, ⚪ autre
- Barre de progression tokens avec effet shimmer

**Couleurs** : palette de 12 teintes cycliques (cyan, magenta, mint, orange, violet, jaune, rose, teal, bleu, ambre, vert, pink). Le premier rack utilise la couleur du serveur.

**Wireframe** : rack tower avec étagères en lignes fines. Grid au sol coloré selon le serveur.

### Interaction

- **Drag rotation** : souris (mousedown/mousemove) + tactile (touch)
- **Scroll zoom** : event listener non-passif avec `{ passive: false }` (fix du bug `preventDefault()` sur listener passif)
- **Pinch-to-zoom** : 2 doigts sur mobile

### Auto-scale

| Agents | Zoom | Espacement |
|---|---|---|
| 1–7 | 0.6x | 120px |
| 8–10 | 0.4x | 100px |
| 11+ | 0.3x | 100px |

L'**agent main** est toujours placé en **haut de la tour**.

### Navigation

`history.pushState` permet au bouton **Back** du navigateur/téléphone de fermer la vue intérieure proprement.

---

## 2.3 DetailPanel : Trois Onglets

### 📋 Onglet Info

Métadonnées de l'agent sélectionné :
- Emoji, nom, rôle, statut (dot coloré)
- MODÈLE : Claude Opus / Claude Sonnet / Claude Haiku
- UPTIME, DERNIÈRE ACTIVITÉ (via `lastAge` du reporter)
- TOKENS (SESSION) : ex. "46k / 100k"
- TOKENS (ALL-TIME) : total historique cumulé ex. "208k" ou "1.4M"
- MESSAGES TRAITÉS, SESSION ACTIVE, TÂCHE EN COURS
- CONNEXIONS MESH

Design inspiré de `Css3dApp.tsx` de David, labels en français.

### 💻 Onglet Terminal

**`WebTerminal.tsx`** — Terminal SSH interactif dans le browser via xterm.js :
- Connexion WebSocket `/ws/terminal?server=ID`
- Support 256 couleurs, cursor blinkant, liens cliquables
- Redimensionnement dynamique (FitAddon + ResizeObserver)
- Thème : fond `#0a0a0f`, cursor de la couleur du serveur

### 📁 Onglet Files

**`FileExplorer.tsx`** — Navigation SFTP des fichiers serveur :
- Browse directories (icônes Folder/File colorées)
- Ouvrir + éditer fichiers texte (textarea monospace)
- Sauvegarder (POST /api/files/:id/write)
- Répertoire par défaut : `~/.openclaw/`
- API REST : `/api/files/:id/list`, `/api/files/:id/read`, `/api/files/:id/write`

### Layout

- **Desktop** : side panel `w-96` (Info) ou `w-[600px]` (Terminal/Files)
- **Mobile** : bottom sheet `60vh` (Info) ou **plein écran** (Terminal/Files)

---

## 2.4 Responsive Mobile

- Racks **240×56px** (vs 400×80px desktop)
- **Bottom sheet** glissant depuis le bas
- Tab bar compacte (Info / Terminal / Files)
- Header condensé, perspective réduite à 800px
- Pinch-to-zoom natif

---

## 2.5 PWA

- `manifest.json` : `display: standalone`, `theme-color: #050505`, icônes 192/512px
- Service Worker : cache-first sur assets statiques
- Installable iOS (Add to Home Screen) + Android (banner natif)

---

# Partie 3 — Reporter V2 & Data Pipeline

## 3.1 Activity Reporter V2

Script bash `activity-reporter-v2.sh` déployé sur les 7 serveurs à `/opt/neural-grid/activity-reporter-v2.sh`.

### Cycle de polling

Boucle infinie, intervalle **15 secondes**. Hash MD5 du payload → **push uniquement si changement**.

```
┌─────────────┐     ┌──────────────┐     ┌────────────┐     ┌──────────────┐
│  Collecte   │────→│  Build JSON  │────→│  Hash MD5  │────→│  Push si ≠   │
│  données    │     │  payload     │     │  compare   │     │  précédent   │
└─────────────┘     └──────────────┘     └────────────┘     └──────────────┘
       ↑                                                           │
       └───────────── sleep 15s ───────────────────────────────────┘
```

### Sources de données

| Commande | Timeout | Données |
|---|---|---|
| `openclaw agents list` | 15s | **Tous** les agents configurés (actifs ou non) |
| `openclaw sessions --all-agents --json` | 20s | Sessions structurées : totalTokens, contextTokens, model, I/O tokens |
| `openclaw status` | 20s | Fallback texte si JSON échoue |

### Fallback ROLE_MAP

Si `agents list` timeout (ex: Nova avec sudo lent), le script utilise un mapping statique codé en dur (ROLE_MAP/EMOJI_MAP par serveur) comme source de secours.

---

## 3.2 Données enrichies par agent

| Champ | Description |
|---|---|
| `id`, `name` | Identifiant et nom d'affichage |
| `status` | `ACTIVE` si session < 5min, sinon `IDLE` |
| `lastAge` | "just now", "2m ago", "3h ago" |
| `model` / `modelFriendly` | `claude-opus-4-6` → "Claude Opus" |
| `tokensUsed` / `tokensMax` / `tokensPct` | Session courante |
| `tokensTotalUsed` | Somme des sessions actives |
| `tokensAllTime` | **Total historique** lu depuis `~/.openclaw/agents/<id>/sessions/sessions.json` |
| `role` / `emoji` | Depuis ROLE_MAP/EMOJI_MAP (ex: "Coordinatrice" / "✨") |
| `sessionCount` / `activeSessions` | Compteurs de sessions |

### tokensAllTime

Ce champ est lu directement depuis le fichier `sessions.json` local à chaque agent. Il contient l'intégralité des sessions passées — même les supprimées ou réinitialisées. C'est la métrique la plus fidèle de la consommation réelle de tokens depuis la création de l'agent.

Détection intelligente du chemin `~/.openclaw/` : le script teste `/root/.openclaw/agents`, `/home/david/.openclaw/agents`, et utilise `glob` comme fallback.

---

## 3.3 System Metrics

| Métrique | Source | Format |
|---|---|---|
| CPU % | `top -bn1` | Pourcentage |
| RAM | `free -m` | used / total / % (Mo) |
| Disque | `df -BG /` | used / total / % (Go) |
| Uptime | `uptime -p` | "4 weeks, 5 days, 11 hours" |
| Load | `/proc/loadavg` | 1min / 5min / 15min |

---

## 3.4 Webhook Endpoint

### POST /api/webhook/activity

Rétrocompatible V1 + V2. La fonction `updateCachedAgentActivity()` **merge** les données reporter dans le cache SSH existant (au lieu de remplacer).

**Bug critique résolu** : le reporter n'envoyait que 2 agents (ceux avec sessions), le webhook écrasait les 11 du poller SSH. Fix : merge d'abord (`updateCachedAgentActivity()`), puis broadcast de `getServerState()` — la liste **complète mergée**.

### Broadcast WebSocket

`broadcastEvent()` émet un `server_update` avec la liste complète. Le frontend reçoit et merge les champs V2 dans son état React.

---

## 3.5 Frontend Data Flow

1. **Chargement** : `fetchServers()` → `mapApiServer()` enrichit avec champs V2
2. **Temps réel** : WebSocket `server_update` → App.tsx merge lastAge, role, emoji, tokens, model, system
3. **Fusion** : `mergeWithMock()` combine API + mockServers. **Inclut dynamiquement** les nouveaux serveurs API non présents dans le mock.

---

## 3.6 Déploiement reporter

Déployé via `scp` + `systemctl restart` (ou `nohup`) sur les 7 serveurs depuis Homelab. Mise à jour centralisée en quelques secondes.

---

# Partie 4 — Mesh Comlink : Communication Inter-Agents

## 4.1 Concept

Le **Mesh Comlink** permet à n'importe quel agent du réseau de communiquer avec n'importe quel autre, **cross-serveur**. Architecture en étoile : Hub (Homelab) = point central de routage. Transport : **SSH + `openclaw agent` CLI** via Tailscale.

```
[Agent A / Nova] ──SSH──→ [Hub / Homelab] ──SSH──→ [Agent B / Babounette]
                          ↕ routage central
[Agent C / Studio] ←────────────────────→ [Agent D / Cyberpunk]
```

---

## 4.2 Les trois modes

### 🔹 One-shot (Envoyer)

Un message, une réponse. Pas de contexte persistant.

```
POST /api/mesh/send
{ "fromAgent": "skillking", "fromServer": "HOMELAB",
  "toAgent": "main", "toServer": "NOVA", "message": "..." }
```

### 🔹 Thread Manuel

Conversation multi-tours contrôlée par David.

```
POST /api/mesh/thread          → crée threadId
POST /api/mesh/thread/:id/send → envoie un message, reçoit la réponse
```

### 🔹 Thread Autonome

**Deux agents discutent seuls** pendant max 10 rounds. David initie, l'agent source (A) drive la conversation. Signal `[MESH_DONE]` + résumé quand terminé. Notification Telegram automatique.

---

## 4.3 Implémentation technique

### `sendToAgent()`

```bash
echo '<base64_message>' | base64 -d > /tmp/mesh-<threadId>.txt
openclaw agent --agent <agent_id> \
  --session-id "mesh-<threadId>" \
  --message "$(cat /tmp/mesh-<threadId>.txt)" \
  --timeout 300
rm -f /tmp/mesh-<threadId>.txt
```

Points clés :
- **Base64** : neutralise les caractères spéciaux shell
- **Fichier tmp** : évite les limites de longueur des arguments shell
- **`--session-id "mesh-<threadId>"`** : contexte natif OpenClaw persistant entre les rounds
- **Timeout** : 300s agent, 320s execAsync, maxBuffer 5MB

---

## 4.4 Prompts Mesh

| Prompt | Rôle |
|---|---|
| `AUTONOMOUS_PROMPT_FOR_A` | Agent source : "le mesh relay s'occupe de la livraison, ne PAS chercher l'agent destination" |
| `AUTONOMOUS_RELAY_TO_B` | Agent destination : "message cross-serveur reçu, ta réponse sera automatiquement relayée" |
| `AUTONOMOUS_RELAY_TO_A` | Relaye la réponse de B vers A avec contexte |

**Bug résolu** : Nova essayait de "trouver" SkillKing localement au lieu de répondre via le relay. Prompts affinés pour indiquer explicitement que le relay gère tout.

---

## 4.5 Sécurités

| Mécanisme | Valeur |
|---|---|
| Max rounds | 10 (configurable) |
| Auto-close inactivité | 5 minutes |
| Anti-doublon | 1 thread actif max entre 2 mêmes agents |
| Timeout agent | 300s |
| Timeout exec | 320s |
| maxBuffer | 5 MB |

---

## 4.6 Notifications

- **Telegram** : l'agent participant envoie le résumé à David via `openclaw agent --message`
- **Dashboard** : WebSocket broadcast `mesh_thread` + `mesh_message` → particules visuelles entre buildings

**Bug résolu** : `--deliver` routait via l'agent par défaut (Debug) → notification dupliquée. Fix : l'agent participant envoie lui-même.

---

## 4.7 API Endpoints Mesh

| Méthode | Endpoint | Description |
|---|---|---|
| `GET` | `/api/mesh/registry` | Liste des ~50 agents |
| `POST` | `/api/mesh/send` | Message one-shot |
| `GET` | `/api/mesh/history` | Historique des messages |
| `POST` | `/api/mesh/thread` | Créer un thread |
| `GET` | `/api/mesh/threads` | Lister les threads |
| `GET` | `/api/mesh/thread/:id` | Détail d'un thread |
| `POST` | `/api/mesh/thread/:id/send` | Envoyer dans un thread |
| `POST` | `/api/mesh/thread/:id/close` | Fermer un thread |

---

# Résumé & Statistiques

## Chiffres clés

| Métrique | Valeur |
|---|---|
| Serveurs monitorés | 7 |
| Agents IA total | ~50 |
| Tokens consommés (all-time, tous serveurs) | ~5.8M |
| Fréquence reporter | 15s (push-on-change) |
| Fréquence polling SSH backup | 60s |
| API endpoints REST | 15+ |
| WebSocket endpoints | 2 (/ws, /ws/terminal) |
| Threads mesh créés | 29+ |

## Technologies

| Catégorie | Stack |
|---|---|
| Frontend | React 19, TypeScript, Vite 6, Tailwind CSS 4, xterm.js, CSS 3D |
| Backend | Express.js, TypeScript, ws 8.19, ssh2, SFTP |
| Infra | Tailscale, Caddy v2.11, systemd, OpenClaw CLI |
| Monitoring | Reporter V2 bash + Python, WebSocket broadcast |
| Communication | Mesh Comlink (3 modes), base64 encoding, session persistence |

## Bugs majeurs résolus

1. **RSV1 WebSocket** : Express écrivait HTTP 400 sur le socket WS → mode `noServer` + upgrade manuel
2. **Reporter partiel** : webhook écrasait la liste complète avec 2 agents → merge avant broadcast
3. **Nova "je trouve pas SkillKing"** : agent cherchait localement au lieu de répondre via relay → prompts affinés
4. **Notification dupliquée** : `--deliver` routait via Debug → l'agent participant envoie lui-même
5. **Passive event listener** : `preventDefault()` sur `onWheel` passif → `addEventListener({ passive: false })`
6. **Font loading crash** : URL Google Fonts dans `Text` drei → font intégrée par défaut

## Repositories

| Repo | URL |
|---|---|
| Monorepo principal | `https://github.com/Hamoun-IA/neural-grid-multi` |
| Prototype Three.js (David) | `https://github.com/Hamoun-IA/neural-grid-internal` |

## Accès

- **Dashboard** : `https://homelab.tail5327e7.ts.net:4100/`
- **API Health** : `https://homelab.tail5327e7.ts.net:4100/api/health`
- **Backend direct** : `http://100.114.123.105:3101/api/servers`

---

*Rapport généré par Hub 🔗 avec 4 sous-agents de rédaction, supervisé et assemblé en un document unifié.*
