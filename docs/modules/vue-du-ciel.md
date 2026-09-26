# Vue du ciel : imagerie Sentinel-2 et confrontation déclaration / satellite

Ce document décrit la phase 1 de la vue du ciel : les images de la carte agricole et la confrontation de chaque parcelle relevée avec la culture déclarée. La décision d'architecture (Copernicus Data Space Ecosystem, calcul côté Copernicus, quota) est dans ADR-0016 ; la carte elle-même est décrite dans `docs/modules/carte.md`.

## Ce que voit l'utilisateur

### Carte agricole (`/carte`, pilotage)

- Encadré « Fond de carte » : carte des communes, « Image satellite » (couleur naturelle) ou « Végétation (NDVI) », puis la période : les **60 derniers jours** (comblement des nuages) ou l'un des douze derniers mois, chacun avec son nombre de scènes Sentinel-2 dégagées sur le pays.
- Les images sont **découpées sur la frontière du Bénin** : hors du pays, pas de pixel (le Togo et le Nigeria ne sont plus peints), et Copernicus ne décompte pas les pixels sans donnée.
- La période « 60 derniers jours » est une mosaïque : chaque zone prend sa scène la moins nuageuse sur deux mois. En saison des pluies, elle comble une bonne partie des trous d'un mois isolé (95 scènes dégagées sur 60 jours contre 45 pour septembre 2026 seul) ; la légende l'annonce comme telle. Sentinel-1 (radar) reste la vraie réponse pour la pleine saison des pluies (étape suivante, ADR-0016).

### Ministère (`/pilotage/qualite`, section « Confrontation déclaration / satellite »)

- Parcelles jugées, à vérifier (et leur part), saison encore en cours, trop de nuages pour conclure, pour la campagne ouverte et le département choisi.
- Communes aux parcelles les plus signalées, puis les parcelles à vérifier : code de parcelle et d'exploitation, commune, culture déclarée, motif, NDVI observé et seuil attendu. Des codes seulement, comme le reste de la page : aucun nom de producteur.
- Source et date du calcul : « Copernicus Sentinel-2 L2A (API Statistical du CDSE) · Contains modified Copernicus Sentinel data », ou « Série NDVI synthétique de démonstration » pour les verdicts du seed.

### Agent de terrain

- Fiche exploitation, onglet Parcelles : le verdict satellite de chaque parcelle (cohérente, à vérifier, saison en cours, trop de nuages). Une parcelle à vérifier explique l'écart (« Végétation trop faible pour la culture déclarée : NDVI observé 0,21, attendu au moins 0,45 ») et invite à une visite.
- File « À vérifier » : une section « Signalées par le satellite » liste ses exploitations dont une parcelle est à vérifier.
- Règle d'accès (ADR-0014) : un agent ne voit que les exploitations qu'il a lui-même enregistrées ; le module satellite applique `authorize(actor, "farm.read", …)` avant de rendre un verdict, et `scopeFilter` pour la liste. Le ministère (portée nationale) voit tout.

## Règle de confrontation

Fonctions pures dans `src/modules/satellite/crop-profiles.ts`, testées dans `__tests__/crop-profiles.test.ts`.

1. **Culture examinée** : la culture principale (plus grande surface) de la parcelle pour chaque sous-saison de la campagne ouverte. La contre-saison irriguée n'est pas examinée (parcelles maraîchères trop petites pour des pixels de 10 m).
2. **Fenêtre de saison** : du premier mois de semis au dernier mois de récolte du calendrier de la culture, pour le régime de pluies de la zone (sud bimodal, nord unimodal). La période de pic va du mois qui suit la fin des semis au début de la récolte. Petite saison du sud : septembre à décembre. Cultures pérennes : les six derniers mois.
3. **Série** : NDVI moyen de la parcelle par décade, calculé par Copernicus (API Statistical, géométrie de la parcelle en EPSG:3857, 10 m), pixels de nuage, d'ombre et de neige exclus (classes SCL). Une décade compte si au moins 3 pixels sont restés visibles.
4. **Profil attendu** :

| Catégorie | Pic minimal en saison | Amplitude minimale (pic − plancher) |
|---|---|---|
| Céréales, cultures de rente | 0,45 | 0,15 |
| Racines et tubercules | 0,45 | 0,12 |
| Légumineuses, oléagineux | 0,40 | 0,12 |
| Fruits (annuels) | 0,40 | 0,10 |
| Maraîchage | 0,35 | 0,10 |
| Cultures pérennes et de cueillette | couvert médian ≥ 0,40 | — |

Seuils abaissés de 0,08 dans la zone de l'extrême nord (ZAE 1) et de 0,04 dans la zone cotonnière du nord (ZAE 2), au couvert naturellement plus clair.

5. **Verdict** :
   - **Cohérente** : pic et amplitude atteints (possible avant la fin de la période de pic) ;
   - **Saison en cours** : la période de pic n'est pas terminée ;
   - **Trop de nuages** : moins de deux décades visibles sur la période de pic (moins de trois pour une plantation) ;
   - **À vérifier** : pic trop bas (`LOW_PEAK`), couvert dense sans cycle, comme une jachère arborée déclarée en maïs (`NO_CYCLE`), ou plantation au couvert trop faible (`LOW_COVER`).

Un « à vérifier » appelle une visite : association de cultures, semis tardif, petite parcelle ou contour imprécis peuvent l'expliquer. Il ne conclut jamais à une fausse déclaration. Les seuils sont prudents et seront recalés sur les visites de terrain.

## Calcul et quota

- Tâche planifiée `POST /api/v1/satellite/vegetation-checks` (Vercel Cron et `docker/scheduler`, chaque jour à 6 h à Porto-Novo, `Authorization: Bearer CRON_SECRET`) : 150 parcelles par jour (`?limit=` jusqu'à 1 000), soit environ 4 500 requêtes Statistical par mois, la moitié de `SATELLITE_MONTHLY_REQUEST_BUDGET`. Répond 503 tant que le compte CDSE n'est pas configuré.
- Ordre : parcelles jamais examinées ou portant un verdict synthétique, les exploitations enregistrées par un agent d'abord ; puis réexamen, dix jours après, des saisons en cours ou trop nuageuses.
- Chaque requête réserve sa place sous le plafond mensuel avant l'appel (même garde-fou que les images) ; au-delà, la tâche s'arrête et reprend le mois suivant.
- Table `parcel_vegetation_check` : une ligne par parcelle, campagne et sous-saison, avec la série par décade (audit), le pic, le plancher, le seuil comparé, la source et la fiabilité (`ESTIMATED` pour Copernicus, `SYNTHETIC` pour la fixture).

## Démonstration sans compte

Le seed (`src/database/seed/steps/satellite.seed.ts`, sauté avec `SEED_VEGETATION=0`, jamais en production) calcule des verdicts pour 3 000 parcelles avec l'adaptateur fixture : séries NDVI synthétiques selon le régime des pluies, une parcelle sur huit restée nue. Ces verdicts portent la source `BAIS_SEED` et sont remplacés par une mesure réelle dès que la tâche planifiée tourne avec le compte CDSE.

## Vérifier

```bash
pnpm exec vitest run --project unit src/modules/satellite src/services/remote-sensing src/features/satellite src/features/agri-map
pnpm exec vitest run --project integration tests/integration/satellite.test.ts tests/integration/vegetation-checks.test.ts
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/v1/satellite/vegetation-checks?limit=20"
```
