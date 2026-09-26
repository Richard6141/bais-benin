# Feux actifs et centre de veille — guide du module livré

Décision et raisons : ADR-0022. Ce guide dit où se trouve chaque morceau et comment le faire
fonctionner.

## 1. Ingestion

| Élément | Emplacement |
|---|---|
| Port du fournisseur | `src/services/ports/fire-detection-provider.ts` |
| Fichiers publics NASA FIRMS (sans clé) | `src/services/fires/firms-public.ts` |
| Jeu fixe pour les tests et la démonstration hors réseau | `FixtureFireProvider` (`src/services/fires/index.ts`) |
| Dédoublonnage entre satellites (fonctions pures) | `src/modules/fires/merge.ts` |
| Passage d'ingestion | `src/modules/fires/ingest.ts` (`runFireIngestion`) |
| Écriture et requêtes spatiales | `src/database/sql/fires.sql.ts` |
| Tâche planifiée | `POST` ou `GET /api/v1/fires/ingest`, toutes les 30 minutes, `Authorization: Bearer <CRON_SECRET>` |
| Tables | `fire_detection`, `fire_ingestion_run` (migration `20260926220000_live_fires`) |

Variables d'environnement :
- `FIRE_PROVIDER` : `firms` par défaut, `fixture` hors réseau ;
- `FIRMS_BASE_URL` : `https://firms.modaps.eosdis.nasa.gov` par défaut.

Aucune clé n'est nécessaire. Réponse de la tâche : statut (`SUCCEEDED`, `PARTIAL` si un fichier
manque, `FAILED`), lignes lues au Bénin, détections créées ou complétées, alertes levées.

## 2. Alertes « feu de brousse »

- Indicateur `fire_near_parcels` et règle par défaut `FIRE_NEAR_PARCELS`
  (`src/modules/monitoring/rules/default-rules.ts`), réglable dans « Règles d'alerte » comme les
  autres (nombre d'exploitations).
- Évaluation après chaque passage : `evaluateNewFires` (`src/modules/monitoring/fire-alerts.ts`).
- Destinataires : `src/modules/monitoring/delivery/plan.ts`. Pour une règle de feu, ce sont les
  exploitations touchées et les agents qui les ont enregistrées ; l'envoi suit le circuit
  existant (consentements, silence de nuit, relais).

## 3. Carte et centre de veille

- Couche partagée : `src/features/agri-map/fire-layer.ts`. Chargement :
  `src/features/agri-map/use-fires.ts`. Choix et légende : `src/features/agri-map/fire-control.tsx`.
- `/carte` : réglage « Feux actifs » (masqués, 24 heures, 7 jours), dans l'adresse (`?feux=24h`
  ou `?feux=7j`).
- `/pilotage/veille` (ministère) : synthèse `src/modules/watch/summary.ts`, requêtes
  `src/database/sql/watch.sql.ts`, écran `src/features/watch/`, relecture `GET /api/v1/veille`
  (réservée au ministère, jamais en cache).
- Encart « État des cultures » du centre de veille : les trois cultures dont la part de surface
  en état faible est la plus haute sur la campagne en cours, d'après `getCropCondition`
  (`src/modules/analytics/crop-condition.ts`), avec un lien vers `/pilotage/etat-des-cultures`.
  Une culture observée sur moins de 5 parcelles n'est pas citée.

## 4. Essayer en local

1. Appliquer les migrations (`pnpm prisma migrate deploy`).
2. Lancer un passage :
   `curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/v1/fires/ingest`.
3. Ouvrir `/carte?feux=7j` et `/pilotage/veille` avec le compte du ministère.

En saison des pluies, il y a peu de feux ; le 26 septembre 2026, un seul était détecté au Bénin
(Djougou).

## 5. Tests

- `src/modules/fires/__tests__/merge.test.ts` : lecture des fichiers VIIRS et MODIS, confiance,
  fusion entre satellites, relecture sans effet.
- `tests/integration/live-fires.test.ts` : de bout en bout avec le jeu fixe. Il vérifie le feu
  hors frontière écarté, l'alerte limitée aux exploitations touchées et à leur agent, et
  l'exposition de la commune.
- `tests/integration/watch-centre.test.ts` : synthèse du ministère, refus à un agent, volumes
  des demandes sans donnée nominative.
- Tests unitaires des règles par défaut : règle de feu, message court de 160 caractères au plus.
