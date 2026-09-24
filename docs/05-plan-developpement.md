# 05 — Plan de développement

> Rédigé par : Product Manager et Architecte, avec QA et DevOps.
> Le plan est découpé en étapes livrables. Chaque étape se termine par une revue croisée des agents (Sécurité, QA, UX) et un compte rendu : terminé, problèmes, améliorations, étape suivante.

## 1. Ordre retenu et justification

Le brief numérote les modules de 1 à 7. Nous les réalisons dans l'ordre suivant :

| Étape | Contenu | Pourquoi à cette place |
|---|---|---|
| 0 | Fondations | Rien de solide sans outillage, design system, base et CI |
| 1 | M1 Identité et accès | Tout le reste dépend des rôles et des périmètres |
| 2 | M2 Registre + dataset + hors-ligne agent | C'est la donnée source ; le hors-ligne se conçoit avec le registre, pas après |
| 3 | M3 Carte agricole | Première visualisation de la donnée ; valide PostGIS et les tuiles |
| 4 | M7 Centre de pilotage État | Cœur de la démonstration ministérielle ; ne dépend que du registre et de la carte |
| 5 | M4 Monitoring et moteur de règles | Enrichit le dashboard avec les alertes |
| 6 | M6 Marché | Indépendant, valeur forte pour producteurs et acheteurs |
| 7 | M5 Assistant IA | Dernier car il consomme tous les autres (contexte exploitation, météo, alertes, corpus) |
| 8 | Durcissement, performance, accessibilité, déploiement | Passage de « fonctionne » à « présentable au Ministère » |

## 2. Détail des étapes

### Étape 0 — Fondations
**Branche** : `develop` (commits directs pour l'outillage), puis `feature/foundations`.

- Initialisation Next.js 16 + TypeScript strict, Tailwind 4, shadcn/ui, Motion, ESLint (frontières de modules), Prettier, Husky, commitlint.
- Design system : tokens (couleurs, typographie, espacements, rayons, ombres), thèmes clair et sombre, composants de base personnalisés (voir document 07).
- Docker Compose avec PostGIS + pgvector ; Prisma 7 ; `lib/env.ts` ; migration initiale (extensions).
- Squelette des modules `territory`, `audit`, `authorization` ; seed des 12 départements et 77 communes avec géométries.
- Coquille applicative : layouts par espace, navigation, bannière hors-ligne, page d'accueil publique.
- PWA : manifeste, service worker Serwist, cache de l'app shell et des référentiels.
- CI GitHub Actions : lint, typecheck, tests, build.
- **Livrable** : application vide mais déployable, avec une carte du Bénin qui affiche les communes.
- **Tests** : env, tokens de design (snapshot), seed territoire (77 communes, géométries valides), politique d'accès de base.

### Étape 1 — M1 Identité et accès
**Branche** : `feature/authentication`.

- Auth.js v5 : fournisseur OTP téléphone (WhatsApp via wapy.pro, repli console en dev), fournisseur identifiants e-mail pour institutions, sessions JWT courtes, rotation.
- Modèle User, RoleAssignment, Organization, profils ; écrans de connexion, saisie OTP, création de compte agriculteur (par lui-même ou par un agent), invitation institutionnelle.
- Moteur `can()` avec périmètres territoriaux ; middleware de protection des espaces ; helper `requireActor()` pour les Server Actions.
- Champ NPI : hachage + chiffrement, port `IdentityVerificationProvider` avec adaptateur `anip-stub`.
- Journal d'audit branché sur les actions de compte.
- **Tests** : unitaires sur le moteur de politiques (matrice rôle × action × périmètre), intégration OTP, e2e connexion par rôle, test de non-régression « un agriculteur ne peut pas lire une autre exploitation ».

### Étape 2 — M2 Registre national et hors-ligne
**Branche** : `feature/farm-management`.

- Modèles Farmer, Farm, Parcel, Crop, Season, CropSeason, ProductionDeclaration, Verification, FarmEvent ; migrations PostGIS.
- Référentiels cultures et campagnes ; générateur déterministe de 50 000 exploitations (document 08).
- Espace agent : assistant d'enregistrement en étapes (identité, localisation, parcelles, cultures, confirmation), tracé de parcelle par marche GPS et par dessin sur carte, file de vérification, portefeuille d'exploitations.
- Hors-ligne : schéma Dexie, outbox, synchronisation par lots, idempotence serveur (`SyncCommand`), résolution de conflits, indicateur d'état et écran de conflits.
- Espace agriculteur : fiche « mon exploitation », déclaration de récolte simplifiée, historique.
- Espace coopérative : membres, agrégats.
- **Tests** : unitaires (calcul de superficie, normalisation des unités, machine à états de vérification), intégration (synchronisation rejouée deux fois = un seul enregistrement), e2e agent hors-ligne avec Playwright en mode `offline`.

### Étape 3 — M3 Carte agricole
**Branche** : `feature/agri-map`.

- Route de tuiles vectorielles (`/api/tiles/{layer}/{z}/{x}/{y}`) générée par `ST_AsMVT`, cache HTTP.
- Composant carte : fond OSM, couches communes (choroplèthe), exploitations (points agrégés en clusters), parcelles (polygones au zoom élevé), alertes (étape 5).
- Filtres : culture, campagne, statut de vérification, département, commune ; statistiques de l'emprise visible ; panneau de détail d'exploitation.
- Emplacements pour couches raster futures (`RasterLayer`).
- **Tests** : intégration sur la génération de tuiles, composants (filtres et légende), e2e (filtrer maïs à Djougou et lire le compteur).

### Étape 4 — M7 Centre de pilotage État
**Branche** : `feature/dashboard`.

- Vues matérialisées et module `analytics` ; API d'indicateurs avec enveloppe de provenance.
- Interface « centre de contrôle » : tuiles d'indicateurs avec tendance, carte nationale de synthèse, séries par campagne, classement des communes, panneau qualité des données (part vérifiée, fraîcheur), descente département → commune.
- Exports CSV et PNG des graphiques ; mode plein écran pour projection.
- **Tests** : exactitude des agrégats contre un calcul de référence sur le dataset, temps de réponse (< 1 s), e2e.

### Étape 5 — M4 Monitoring et moteur de règles
**Branche** : `feature/monitoring`.

- Port `WeatherProvider`, adaptateur Open-Meteo et adaptateur fixtures ; tâche d'ingestion quotidienne.
- Moteur de règles : DSL JSON validée par Zod, évaluateur pur, indicateurs dérivés (moyennes glissantes, cumuls), règles par défaut (stress hydrique, excès de pluie, chaleur en floraison).
- Alertes : création, ciblage des exploitations, diffusion via `notifications`, accusé de réception, résolution.
- UI : centre d'alertes par rôle, widget météo, couche carte, remontée au dashboard.
- **Tests** : évaluateur (table de vérité), idempotence des alertes (cooldown), intégration ingestion, e2e réception d'alerte côté agriculteur.

### Étape 6 — M6 Marché
**Branche** : `feature/marketplace`.

- Listing, PurchaseRequest, Match ; publication d'offre (agriculteur ou coopérative), recherche multicritères avec carte, demande d'achat, mise en relation, notifications.
- **Tests** : politiques (un acheteur ne voit que les données de contact autorisées), e2e parcours publication → demande → mise en relation.

### Étape 7 — M5 Assistant IA
**Branche** : `feature/assistant`.

- Corpus de fiches techniques (données de démonstration réalistes), découpage, embeddings, pgvector.
- Port `LlmProvider` via AI SDK et AI Gateway (fournisseur et modèle configurables par variable d'environnement), adaptateur fixtures pour les tests.
- Génération avec contexte (exploitation, météo, alertes) + passages cités ; scoring de confiance combinant similarité, couverture des citations et auto-évaluation ; seuil sous lequel l'assistant répond « je ne dispose pas d'une information fiable ».
- UI : chat, citations dépliables, jauge de confiance, suggestions contextuelles, garde-fous visibles.
- **Tests** : scoring de confiance (unitaires), refus hors corpus, non-fabrication de chiffres officiels (jeu de questions pièges), e2e.

### Étape 8 — Durcissement et livraison
**Branche** : `release/1.0`.

- Audit de sécurité interne (OWASP ASVS niveau 2 ciblé), en-têtes de sécurité, limitation de débit, revue des politiques, tests de permissions exhaustifs.
- Performance : budgets, Lighthouse, profil 3G, tuiles, vues matérialisées.
- Accessibilité : WCAG 2.2 AA, navigation clavier, contrastes, lecteurs d'écran, tailles de cible tactile.
- Documentation finale : guide de déploiement, guide d'exploitation, API OpenAPI, guide de contribution.
- Déploiement : image Docker publiée, environnement de démonstration Vercel, données de démonstration chargées.

## 3. Rituels par étape

1. **Ouverture** : l'Architecte relit l'ADR concernée, le PM confirme le périmètre, l'UX fournit les écrans cibles.
2. **Développement** en TDD pour les modules (tests du domaine avant l'implémentation), composants testés à la création.
3. **Revue croisée** : Sécurité (permissions, validation), QA (couverture, cas limites), UX (parcours mobile et hors-ligne).
4. **Compte rendu** au format imposé : terminé, problèmes rencontrés, améliorations possibles, étape suivante.
5. **Fusion** de la branche `feature/*` dans `develop` par PR ; `main` ne reçoit que des versions étiquetées.

## 4. Définition de « terminé » pour un module

- Schémas Zod en entrée et en sortie de chaque action et route.
- Politiques d'accès écrites et testées pour chaque ressource.
- Tests unitaires du module verts, tests d'intégration verts sur PostGIS, au moins un parcours e2e.
- Fonctionne en mobile 360 px et en desktop 1440 px ; l'espace agent fonctionne hors-ligne quand le module le concerne.
- Chaque donnée affichée peut révéler sa source et sa fiabilité.
- Journal d'audit alimenté pour les actions sensibles.
- Documentation du module mise à jour dans `docs/modules/`.

## 5. Risques d'exécution

| Risque | Mitigation |
|---|---|
| PostGIS et Prisma : friction sur les migrations | ADR-0002 ; migrations SQL manuelles dès l'étape 0 ; tests d'intégration sur vraie base |
| Hors-ligne : cas de conflits imprévus | Périmètre volontairement simple (dernière écriture + priorité vérification), journal de synchronisation consultable |
| Dataset peu crédible | Générateur paramétré par ZAE et population rurale ; revue par l'expert data |
| Performance carte avec 120 000 parcelles | Tuiles vectorielles précalculées, simplification par zoom, clusters |
| Dépendances externes indisponibles pendant la démo | Adaptateurs fixtures pour météo, messagerie et IA ; démonstration possible sans réseau sortant |
