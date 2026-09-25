# Rapport d'étape 6 — Monitoring agricole et alertes

- Branche : `feature/agri-monitoring` (fusionnée dans `develop`)
- Date : 25 septembre 2026
- Périmètre : météo réelle par commune, moteur de règles d'alerte déclaratif et versionné, évaluation quotidienne, diffusion des alertes (application, WhatsApp, SMS, relais par l'agent), pages producteur, agent et ministère, gouvernance des règles avec simulation.

## Terminé

- **Météo réelle** : Open-Meteo interrogé pour les 77 communes (centroïde communal), 35 jours observés et 8 jours de prévision, en une dizaine de secondes ; écriture idempotente ; trois tentatives puis repli automatique sur des séries synthétiques marquées « Données de démonstration », tracé dans le journal d'ingestion.
- **Moteur de règles** : conditions `all` / `any` / `not` sur 18 indicateurs (cumuls de pluie, jours secs consécutifs, bilan hydrique, températures, prévisions à 3 jours, zone, cultures et stades de la campagne ouverte), validées par Zod ; chaque évaluation conserve sa trace, restituée en phrases françaises (« Cumul de pluie sur 10 jours : 0 mm, seuil < 5 mm (remplie) »).
- **Six règles par défaut** (seuils indicatifs FAO et INRAB, à valider avec l'ATDA) : poche de sécheresse après semis, stress hydrique sévère, risque d'inondation, chaleur sur maïs en floraison, fortes pluies annoncées, conditions favorables à la chenille légionnaire. Chaque règle porte un conseil pratique et un message court de 160 caractères au plus.
- **Évaluation quotidienne** : à la date du dernier jour observé ; une seule alerte active par commune et par catégorie (garantie aussi par un index en base) ; une règle plus grave remplace l'alerte en cours ; délai de refroidissement ; aucune alerte sur des données de plus de 48 heures.
- **Diffusion** : destinataires calculés à la création (compte du producteur, WhatsApp avec consentement, SMS, sinon relais par l'agent ; agents de la commune) ; silence de 21 h à 6 h sauf alerte critique ; repli et relance unique ; accusé de lecture par l'application ou par réponse « OK » sur WhatsApp (webhook wapy.pro signé) ; jamais d'envoi hors application sur des données de démonstration.
- **Producteur** : alertes de sa commune avec le conseil en premier et « J'ai compris » ; météo de sa commune (3 jours observés, 7 jours prévus, pluie sur 30 jours) ; encart sur l'accueil.
- **Agent** : alertes de ses communes ; exploitations concernées avec résumé (à prévenir de vive voix, non lus, relayés), pagination et relais enregistré même sans réseau (commande de synchronisation `alert.relay`).
- **Ministère** : centre d'alertes national (chiffres clés, carte des communes par gravité, liste filtrable, fraîcheur des données), fiche d'audit (règle et version, indicateurs lus, diffusion), levée motivée ; gestion des règles (activation motivée, nouvelle version avec bornes physiques et aperçu du message, simulation sur 30 jours sans aucune alerte ni message).
- **Tâches planifiées** : ingestion, évaluation et envoi chaque jour à 5 h (heure du Bénin), envoi des messages en attente toutes les 10 minutes ; protégées par secret, exclusives (une seconde exécution simultanée est refusée) ; service `scheduler` dans Docker Compose, équivalent crontab et Vercel Cron documentés.
- **Consentement** : table des consentements par canal, exigée par wapy.pro et l'APDP ; consentements de démonstration pour une partie des producteurs synthétiques.
- **Documentation** : `docs/modules/monitoring.md`, `docs/modules/monitoring-parcours-ux.md`, ADR-0011, contrat du webhook dans `docs/09-integrations-externes.md`.

## Tests réalisés

| Test | Commande | Résultat |
|---|---|---|
| Unitaires (moteur de règles, indicateurs, messages, politique de diffusion, adaptateurs météo, routes planifiées, composants, logique des pages, existant) | `pnpm test` | 454 tests OK (47 fichiers) |
| Intégration (ingestion et repli, évaluation et refroidissement, données anciennes, périmètre de lecture, levée, concurrence, diffusion, relais, webhook, gouvernance des règles et simulation, existant) | `pnpm test:integration` | 66 tests OK (12 fichiers) |
| Bout en bout desktop et mobile (alertes et météo du producteur, alertes et exploitations concernées de l'agent, centre d'alertes et règles du ministère avec double authentification, existant) | `pnpm test:e2e` | 81 tests OK, 5 ignorés volontairement (profil desktop ou mobile uniquement), deux exécutions complètes consécutives |
| Données réelles | ingestion Open-Meteo des 77 communes | 3 311 journées écrites, aucune commune en échec |
| Build, lint, types | `pnpm build`, `pnpm lint`, `pnpm typecheck` | OK |
| Revue de code croisée | revue de l'évaluation, de l'ingestion et des routes | trois défauts trouvés et corrigés (voir plus bas) |

## Résultat

OK.

## Captures

- [Alertes de l'agricultrice, mobile](captures/etape-6/agriculteur-alertes-mobile.png)
- [Fiche d'alerte : que faire et pourquoi, mobile](captures/etape-6/agriculteur-alerte-fiche-mobile.png)
- [Météo de la commune, mobile](captures/etape-6/agriculteur-meteo-mobile.png)
- [Alertes des communes de l'agent](captures/etape-6/agent-alertes-desktop.png)
- [Exploitations concernées, mobile](captures/etape-6/agent-alerte-fiche-mobile.png)
- [Centre d'alertes national](captures/etape-6/pilotage-alertes-desktop.png)
- [Fiche d'audit d'une alerte](captures/etape-6/pilotage-alerte-fiche-desktop.png)
- [Règles d'alerte](captures/etape-6/pilotage-regles-desktop.png)
- [Règle : seuils, aperçu et simulation](captures/etape-6/pilotage-regle-fiche-desktop.png)
- [Composants du monitoring](captures/etape-6/design-system-monitoring-desktop.png)

## Problèmes rencontrés et décisions

- **Date de référence** : l'évaluation prenait la date du jour, qui n'a que des prévisions ; le décompte des jours secs était alors toujours vide et les règles de sécheresse ne pouvaient pas se déclencher sur la météo réelle. L'évaluation porte désormais sur le dernier jour entièrement observé (la veille), et les prévisions émises le jour même sont prises en compte.
- **Exécutions concurrentes** (revue croisée) : une relance manuelle pendant la tâche de 5 h pouvait lever deux fois la même alerte et envoyer deux messages. Chaque tâche prend un verrou PostgreSQL ; une seconde exécution reçoit 409 ; un index unique partiel garantit une seule alerte active par commune et par catégorie.
- **Ingestion bloquée** (revue croisée) : un double échec (fournisseur puis repli) laissait une exécution « en cours » pour toujours ; toute erreur la marque désormais en échec avec sa cause.
- **Performance** (revue croisée) : les 462 évaluations quotidiennes étaient écrites une par une ; elles sont calculées en mémoire et écrites en une fois.
- **Doublons de destinataires** : PostgreSQL considère deux valeurs vides comme différentes dans une clé unique ; l'index des destinataires est recréé avec `NULLS NOT DISTINCT`.
- **Codes techniques à l'écran** : l'explication d'une alerte montrait « GROWING, SOWN » ; les cultures et stades sont désormais traduits (« en croissance, semée »).
- **Débordement mobile** : les libellés pour lecteurs d'écran de la bande météo, positionnés hors de leur conteneur défilant, élargissaient la page ; le conteneur est désormais positionné.
- **Démonstration** : la météo réelle de fin septembre (saison des pluies) ne déclenche aucune alerte. Hors production, cinq épisodes plausibles sont rejoués sur des séries synthétiques et évalués par le vrai moteur ; ces alertes sont étiquetées « Données de démonstration » et ne partent jamais par message.
- **Tests du ministère** : l'accès au pilotage exige la double authentification ; la suite crée un compte ministère temporaire, active la double authentification par l'interface avec un code calculé dans le test, puis le supprime. Le compte de démonstration n'est jamais modifié.
- **Limite d'envoi des codes dans les tests** : la suite de bout en bout dépassait la limite de 30 codes par quart d'heure et par adresse, voulue en production. La limite reste inchangée ; les tests se connectent une fois par rôle et réutilisent la session, la vraie connexion par code restant testée à part.
- **Double authentification dans les tests** : l'activation préparatoire fermait parfois le navigateur avant la fin de la vérification du code ; elle attend désormais la confirmation à l'écran et la vérifie en base, sinon la suite s'arrête.
- **Historique météo** : la simulation sur 30 jours a besoin de 60 jours d'observations ; l'ingestion rattrape 65 jours quand l'historique est incomplet.
- **Stade de floraison** : ajouté aux stades de culture ; la règle de chaleur vise les maïs en croissance ou en floraison.

## Reste à faire (suivi)

- Validation des seuils avec l'ATDA et l'INRAB, idéalement après une période d'évaluation sans diffusion.
- Adaptateur SMS (fournisseur à choisir) ; en attendant, les producteurs sans WhatsApp sont relayés par l'agent.
- Contrat de réponse « OK » à confirmer avec wapy.pro ; quotas pour les alertes de masse.
- Messages en langues nationales et lecture audio.
- Recueil du consentement WhatsApp et SMS dans le parcours d'enregistrement de l'agent.

## Commits

```
feat(database): add weather, rules, alerts, recipients and consent tables
feat(monitoring): add the declarative alert rules engine with default rules
feat(monitoring): add weather provider port with open-meteo and fixture adapters
docs(monitoring): specify alert journeys, delivery, ingestion and rules governance
feat(ui): add severity, alert, weather and rain components for monitoring
feat(monitoring): ingest weather by commune and evaluate rules into alerts
feat(monitoring): expose alerts, weather and scheduled ingestion over the api
feat(monitoring): plan and dispatch alert deliveries with quiet hours and fallbacks
feat(sync): let agents relay alerts offline through the sync contract
feat(notifications): receive wapy delivery receipts and replies by signed webhook
feat(data): seed messaging consents for demonstration farmers
feat(monitoring): run daily ingestion, evaluation and dispatch as scheduled tasks
docs(architecture): record the declarative rules and weather source decision
fix(monitoring): evaluate the last observed day and show forecasts issued today
feat(monitoring): list affected farms and let agents record alert relays
feat(monitoring): add alert and weather pages for farmers, agents and the ministry
feat(monitoring): govern alert rules with versions, toggles and simulation
feat(infra): schedule daily ingestion and alert dispatch in a cron container
docs(monitoring): document the monitoring module, scheduling and demo data
feat(infra): accept scheduled monitoring tasks from vercel cron
fix(monitoring): serialize scheduled runs and keep one active alert per category
fix(monitoring): never leave a weather ingestion run marked as running
test(monitoring): type the rotating test alert category
fix(monitoring): explain crop and stage conditions in plain french
test(monitoring): cover the ministry alert center with a temporary two-factor account
feat(monitoring): summarize and paginate affected farms for agents
docs(monitoring): add the step 6 capture plan for farmer and agent screens
test(monitoring): cover rule toggles, versions and simulation end to end
docs(monitoring): capture ministry screens with a temporary two-factor account
fix(monitoring): backfill weather history and report unevaluated simulation days
fix(monitoring): never count a skipped message as a delivery failure
test(farm): reuse phone sessions across end to end tests to stay under otp limits
fix(monitoring): show category labels and a compact weather freshness tile
test(monitoring): wait for confirmed two-factor activation and verify it in the database
docs(monitoring): add the step 6 report and screenshots
```

## Prochaine étape

Étape 7 — Tableau de bord de l'État : vue nationale en agrégats uniquement (producteurs, exploitations, superficies déclarées et mesurées, production par culture, comparaisons de campagnes), classements par département et commune, fiche commune, qualité des données, exports CSV et fiche imprimable, avec masquage des petits effectifs. Branche `feature/state-dashboard`. Spécification prête : `docs/modules/pilotage-parcours-ux.md`.

## Guide de test

```bash
git checkout develop && pnpm install
pnpm db:migrate && pnpm db:seed      # règles, météo réelle (ou démonstration sans réseau), épisodes
pnpm build && pnpm start
```

1. **Agricultrice** : http://localhost:3000/connexion, `01 90 00 00 02`, code `246810`. L'accueil affiche l'encart « Alertes ». Ouvrez l'alerte de Djougou : le conseil vient en premier, puis « Pourquoi cette alerte ? ». Appuyez sur « J'ai compris ». Ouvrez « Météo » : 3 jours observés, 7 jours prévus, pluie du mois, source Open-Meteo.
2. **Agent** : `01 90 00 00 01`. « Alertes » : l'alerte de Djougou ; sur la fiche, le résumé et les exploitations concernées, « Appeler », « Relayer » (fonctionne aussi hors ligne).
3. **Ministère** : connexion institutionnelle `ministere@bais.demo`, mot de passe `Demo-Bais-2026!` ; activez la double authentification demandée (application d'authentification sur téléphone). Ouvrez `/pilotage/alertes` : cinq communes en alerte sur la carte, filtres par gravité ; ouvrez une fiche d'audit. Ouvrez « Règles d'alerte », une règle, modifiez un seuil et lancez « Simuler sur 30 jours » (aucune alerte, aucun message).
4. **Tâche planifiée** (le secret est dans votre `.env`) :

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/v1/monitoring/ingest
curl -X POST http://localhost:3000/api/v1/monitoring/ingest        # 401 sans secret
```
