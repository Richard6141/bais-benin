# Registre des décisions d'architecture (ADR)

Chaque décision structurante est consignée ici au format : contexte, options, décision, conséquences. Une ADR acceptée n'est jamais modifiée ; elle est remplacée par une nouvelle ADR qui la référence.

| Numéro | Titre | Statut |
|---|---|---|
| 0001 | Backend full-stack Next.js plutôt que NestJS séparé | acceptée |
| 0002 | Prisma 7 avec colonnes PostGIS en `Unsupported` et migrations SQL manuelles | acceptée |
| 0003 | Auth.js v5 avec OTP téléphone, identifiants institutionnels et OIDC prêt pour l'ANIP | acceptée |
| 0004 | Autorisation par rôles et périmètres territoriaux, moteur maison, RLS en défense en profondeur | acceptée |
| 0005 | Hors-ligne d'abord : Serwist, Dexie et file d'attente outbox avec idempotence serveur | acceptée |
| 0006 | Déploiement bi-cible : Docker Compose et Vercel, sans code spécifique à l'hébergeur | acceptée |
| 0007 | wapy.pro intégré comme canal de messagerie WhatsApp, pas comme fournisseur d'identité | acceptée |
