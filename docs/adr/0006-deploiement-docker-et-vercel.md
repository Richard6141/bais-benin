# ADR-0006 — Déploiement bi-cible : Docker Compose (souverain) et Vercel (démonstration), sans code spécifique à l'hébergeur

- Statut : acceptée
- Date : 2026-09-24
- Décideurs : DevOps, Architecte, Sécurité

## Contexte

Le brief exige une compatibilité Vercel, Docker et cloud public. Une plateforme nationale devra pouvoir être hébergée sur une infrastructure contrôlée par l'État.

## Décision

- Le code applicatif n'importe aucune API propre à un hébergeur. Les fonctions planifiées sont des routes protégées par secret, déclenchables par un cron Vercel, un conteneur `worker` ou un planificateur externe.
- Cible 1 (référence) : `docker-compose.yml` avec `app` (Next standalone, image non root), `worker`, `db` (PostGIS + pgvector), reverse proxy TLS. Documentation de déploiement sur une machine virtuelle ou un cluster.
- Cible 2 (démonstration) : Vercel pour l'application, base PostGIS via une intégration du Marketplace, crons Vercel.
- Configuration exclusivement par variables d'environnement validées au démarrage.
- CI GitHub Actions : lint, typecheck, tests unitaires, tests d'intégration sur PostGIS en service, build, construction de l'image Docker.

## Conséquences

- Deux chemins à maintenir, mais aucun couplage ; la démonstration publique bénéficie de la simplicité de Vercel, la production nationale de la souveraineté du conteneur.
- Le stockage de fichiers passe par un port (`FileStorage`) avec adaptateurs disque local, S3 compatible et Vercel Blob.
