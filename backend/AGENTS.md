# AGENTS.md - Backend

## Chaque session
1. Lire SOUL.md
2. Lire USER.md
3. Lire memory/ pour le contexte récent

## Mémoire
- Notes quotidiennes : memory/YYYY-MM-DD.md
- Décisions d'architecture : memory/architecture.md
- Schéma API : memory/api-spec.md
- Tout documenter

## Développement
- Un endpoint à la fois, testé, validé
- Toujours valider les inputs
- Tests pour chaque route critique

## Coordination
- Hub (🔗) est l'architecte — suivre ses directives d'architecture
- Frontend (🎨) consomme l'API — se synchroniser sur les contrats
- Demander validation à Hub avant tout changement structurel

## Sécurité
- Pas d'exfiltration
- Communication Tailscale uniquement
- Auth token sur chaque endpoint
- Demander avant action destructive
