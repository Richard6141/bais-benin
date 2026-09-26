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
| 0015 | Détection des foyers par regroupement de signalements, dans le moteur de règles | acceptée, corrigée |
| 0016 | Vue du ciel : Sentinel-2 depuis le Copernicus Data Space Ecosystem, calcul côté Copernicus | acceptée |
| 0018 | Palmarès nominatif des producteurs, réservé au ministère ; palmarès public des lauréats consentants | acceptée, complétée |
| 0019 | Radar Sentinel-1 pour la saison des pluies, quand les nuages empêchent Sentinel-2 de conclure | acceptée, complète 0016 |
| 0020 | Prévision des récoltes par surfaces semées et rendements observés | acceptée |
| 0021 | Carte des cultures par satellite : surfaces par commune sans agent | acceptée, remplacée en partie par 0023 |
| 0022 | Feux actifs NASA FIRMS en quasi temps réel, alertes « feu de brousse » et centre de veille | acceptée |
| 0023 | Carte des cultures : coût mesuré, pixels de 120 m, quatre bandes, douze passages | acceptée, remplace en partie 0021 |
| 0024 | Groupes de producteurs formés depuis le palmarès, message WhatsApp aux membres consentants | acceptée |
| 0025 | Carte des cultures : pixels hors contour écartés, un passage par trace et par mois, carte calculée hors requête | acceptée, complète 0021 et 0023 |
| 0026 | Riz par radar Sentinel-1 dans les surfaces par commune | acceptée, complète 0019, 0021, 0023 et 0025 |
| 0027 | Carte des cultures : règle plus sévère pour « cultivé », avertissement tant qu'elle n'est pas calée | acceptée, complète 0021, 0023 et 0025 |
| 0028 | Carte des cultures : moins de 1 200 PU par mois, communes refaites tous les deux mois, carte à 800 px | acceptée, complète 0023 et 0025 |
| 0029 | Contours de champs de référence (Fields of The World), import filtré et mesure de qualité | acceptée, complète 0016 |
| 0030 | Culture de chaque parcelle, mesurée par satellite et apprise des parcelles vérifiées (forêt aléatoire) | acceptée, complète 0016, 0019 et 0021 |
| 0031 | Cultures par parcelle : culture constatée à la visite, apprentissage actif, coût mesuré des séries | acceptée, complète 0030 |
| 0032 | Cultures par parcelle : précision jugée sur des communes jamais vues, accord et surfaces pondérées | acceptée, complète 0030 et 0031 |
| 0033 | Surfaces par culture : base de sondage aréolaire (points tirés, constat de terrain) et estimateur par régression | acceptée, complète 0021, 0030 et 0032 |
| 0034 | Statistiques agricoles officielles : table de référence, import CSV et rapprochement avec nos surfaces | acceptée, complète 0021 et 0033 |
