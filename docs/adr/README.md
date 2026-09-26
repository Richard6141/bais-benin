# Registre des décisions d'architecture (ADR)

Chaque décision structurante est consignée ici au format : contexte, options, décision, conséquences. Une ADR acceptée n'est jamais modifiée ; elle est remplacée par une nouvelle ADR qui la référence.

| Numéro | Titre | Statut |
|---|---|---|
| 0001 | Backend full-stack Next.js plutôt que NestJS séparé | acceptée |
| 0002 | Prisma 7 avec colonnes PostGIS en `Unsupported` et migrations SQL manuelles | acceptée |
| 0003 | Auth.js v5 avec OTP téléphone, identifiants institutionnels et OIDC prêt pour l'ANIP | remplacée par 0010 |
| 0004 | Autorisation par rôles et périmètres territoriaux, moteur maison, RLS en défense en profondeur | acceptée |
| 0005 | Hors-ligne d'abord : Serwist, Dexie et file d'attente outbox avec idempotence serveur | acceptée |
| 0006 | Déploiement bi-cible : Docker Compose et Vercel, sans code spécifique à l'hébergeur | acceptée |
| 0007 | wapy.pro intégré comme canal de messagerie WhatsApp, pas comme fournisseur d'identité | acceptée |
| 0008 | Prisma 7 avec adaptateur `pg`, configuration hors schéma, et Serwist en mode Turbopack | acceptée |
| 0009 | Géométries des départements dérivées de l'union de leurs communes | acceptée |
| 0010 | better-auth remplace Auth.js : sessions en base, Argon2id, TOTP, NPI chiffré | acceptée, remplace 0003 ; connexion et TOTP remplacés par 0012 |
| 0011 | Alertes par règles déclaratives versionnées, météo Open-Meteo avec repli sur la fixture | acceptée |
| 0012 | Connexion unique par NPI et code WhatsApp pour tous les rôles | acceptée, remplace en partie 0010 |
| 0013 | Création de compte réservée aux agriculteurs, autres comptes ouverts par l'administration | acceptée, complète 0012 |
| 0014 | Un agent ne lit que les exploitations qu'il a lui-même enregistrées | acceptée, complète 0004 |
| 0015 | Détection des foyers par regroupement de signalements, dans le moteur de règles | acceptée |
| 0016 | Vue du ciel : Sentinel-2 depuis le Copernicus Data Space Ecosystem, calcul côté Copernicus | acceptée |
| 0018 | Palmarès nominatif des producteurs, réservé au ministère ; palmarès public des lauréats consentants | acceptée, complétée |
