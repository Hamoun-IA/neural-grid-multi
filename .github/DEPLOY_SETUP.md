# 🚀 Deploy Setup — Neural Grid CI/CD

Ce document explique comment configurer le déploiement automatique via GitHub Actions.

---

## Secrets GitHub à configurer

Aller dans **GitHub → Settings → Secrets and variables → Actions → New repository secret**

| Secret | Valeur |
|--------|--------|
| `HOMELAB_HOST` | `100.114.123.105` (IP Tailscale du homelab) |
| `HOMELAB_SSH_KEY` | Contenu de `/root/.ssh/id_ed25519` sur le homelab |

### Récupérer la clé SSH

```bash
cat /root/.ssh/id_ed25519
```

Copier le contenu **entier** (y compris les lignes `-----BEGIN...` et `-----END...`) et le coller dans le secret `HOMELAB_SSH_KEY`.

---

## ⚠️ Limitation importante : accès réseau Tailscale

**Le runner GitHub Actions (ubuntu-latest) tourne sur internet public et ne peut PAS accéder directement au réseau Tailscale.**

Le SSH vers `100.114.123.105` échouera depuis un runner standard.

### Option 1 — Tailscale Funnel (exposer SSH sur internet)

Tailscale Funnel permet d'exposer un port local sur internet via `*.ts.net`.

```bash
# Sur le homelab, exposer le port SSH (22) via Funnel
tailscale funnel 22
```

> ⚠️ **Attention** : exposer SSH sur internet augmente la surface d'attaque.
> S'assurer que `PermitRootLogin` est sécurisé et que seules les clés SSH sont acceptées.

Dans ce cas, utiliser l'hostname Funnel (ex: `homelab.tail1234.ts.net`) comme valeur du secret `HOMELAB_HOST` à la place de l'IP Tailscale.

### Option 2 — Self-hosted runner (recommandée ✅)

Installer un **GitHub Actions runner** directement sur le homelab (ou une machine sur le réseau Tailscale). Le runner a accès natif au réseau Tailscale et peut SSH localement.

```bash
# Sur le homelab — suivre les instructions GitHub :
# Settings → Actions → Runners → New self-hosted runner

# Exemple pour Linux x64 :
mkdir actions-runner && cd actions-runner
curl -o actions-runner-linux-x64-2.x.x.tar.gz -L https://github.com/actions/runner/releases/download/v2.x.x/actions-runner-linux-x64-2.x.x.tar.gz
tar xzf ./actions-runner-linux-x64-2.x.x.tar.gz
./config.sh --url https://github.com/Hamoun-IA/neural-grid-multi --token <TOKEN>
./run.sh
```

Puis modifier le workflow pour utiliser le self-hosted runner :

```yaml
jobs:
  deploy:
    runs-on: self-hosted   # ← au lieu de ubuntu-latest
```

Avec cette option, le step SSH peut aussi être remplacé par des commandes directes (pas besoin d'`appleboy/ssh-action`) puisque le runner est déjà sur le homelab.

---

## Flux de déploiement

```
git push → main
    ↓
GitHub Actions déclenché
    ↓
Runner SSH vers homelab
    ↓
git pull sur neural-grid-mono
    ↓
rsync frontend/src/ → workspace-hub/Neural-grid/src/
rsync backend/src/  → workspace-backend/src/
    ↓
npm install (si nouvelles dépendances)
    ↓
systemctl restart neural-grid-backend
systemctl restart neural-grid-frontend
    ↓
✅ Deploy complete
```

---

## Services systemd concernés

- `neural-grid-frontend` — Vite/React sur port 3100
- `neural-grid-backend` — Node.js backend

```bash
# Vérifier le statut après deploy
systemctl status neural-grid-frontend
systemctl status neural-grid-backend
```
