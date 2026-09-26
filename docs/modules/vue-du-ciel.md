# Vue du ciel : imagerie Sentinel-2 et confrontation déclaration / satellite

Ce document décrit la vue du ciel : les images de la carte agricole, la confrontation de chaque parcelle relevée avec la culture déclarée, et la délimitation assistée des champs (phase 3). La décision d'architecture (Copernicus Data Space Ecosystem, calcul côté Copernicus, quota) est dans ADR-0016 ; la carte elle-même est décrite dans `docs/modules/carte.md`.

## Ce que voit l'utilisateur

### Carte agricole (`/carte`, pilotage)

- Encadré « Fond de carte » : carte des communes, « Image satellite » (couleur naturelle) ou « Végétation (NDVI) », puis la période : les **60 derniers jours** (comblement des nuages) ou l'un des douze derniers mois, chacun avec son nombre de scènes Sentinel-2 dégagées sur le pays.
- Les images sont **découpées sur la frontière du Bénin** : hors du pays, pas de pixel (le Togo et le Nigeria ne sont plus peints), et Copernicus ne décompte pas les pixels sans donnée.
- La période « 60 derniers jours » est une mosaïque sans nuages, calculée pixel par pixel : Copernicus ne garde que les trois passages les moins nuageux des deux mois, puis prend chaque pixel au plus récent de ces passages où il est dégagé (masque SCL). Un pixel couvert aux trois passages garde le plus récent, nuage compris, plutôt qu'un trou. C'est la période ouverte par défaut dès qu'elle a une scène dégagée ; les mois restent au choix. Coût : environ trois fois celui d'une image d'un mois (un échantillon par passage retenu). En saison des pluies, elle comble une bonne partie des trous d'un mois isolé (95 scènes dégagées sur 60 jours contre 45 pour septembre 2026 seul) ; la légende l'annonce comme telle. Sentinel-1 (radar) reste la vraie réponse pour la pleine saison des pluies (étape suivante, ADR-0016).

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

Deux cas particuliers :

- **Maraîchage** (tomate, gombo, piment, oignon) : cycle court et pic bref, souvent entre deux passages. Un seul pas de 10 jours au-dessus du seuil suffit (0,30), cherché aussi un pas avant et après la période de pic. Une production échelonnée toute l'année (tomate au sud) n'a pas de saison : le pic peut tomber n'importe quand dans la campagne, et rien n'est signalé avant la fin de celle-ci.
- **Petites parcelles** : sous 40 pixels de 10 m (0,4 ha), pas de verdict (« trop peu de données »), plutôt que de lire le sol nu voisin comme une culture absente.

Un « à vérifier » appelle une visite : association de cultures, semis tardif, petite parcelle ou contour imprécis peuvent l'expliquer. Il ne conclut jamais à une fausse déclaration. Les seuils sont prudents et seront recalés sur les visites de terrain.

## Calcul et quota

- Tâche planifiée `POST /api/v1/satellite/vegetation-checks` (Vercel Cron et `docker/scheduler`, chaque jour à 6 h à Porto-Novo, `Authorization: Bearer CRON_SECRET`) : 150 parcelles par jour (`?limit=` jusqu'à 1 000), soit environ 4 500 requêtes Statistical par mois, la part des statistiques (`SATELLITE_STATISTICS_SHARE`, 50 %). Répond 503 tant que le compte CDSE n'est pas configuré.
- Ordre : parcelles jamais examinées ou portant un verdict synthétique, les exploitations enregistrées par un agent d'abord ; puis réexamen, dix jours après, des saisons en cours ou trop nuageuses.
- Chaque requête réserve sa place dans la part des statistiques avant l'appel ; part ou unités de traitement épuisées, la tâche s'arrête et reprend le mois suivant. Elle s'arrête aussi à la limite par minute, ou après cinq échecs de Copernicus d'affilée, et reprend au lot suivant.

### Garde-fous du compte CDSE (revue de sécurité R2)

Chaque appel aux API de traitement passe d'abord par `reserveProcessingRequest` (`src/database/sql/satellite.sql.ts`). Une seule requête SQL y vérifie trois conditions, puis compte l'appel :

| Garde-fou | Réglage | Défaut |
|---|---|---|
| Part des propositions de contours | `SATELLITE_PROPOSAL_SHARE` × plafond mensuel | 30 % de 9 000 |
| Part des statistiques de la confrontation | `SATELLITE_STATISTICS_SHARE` × plafond mensuel | 50 % de 9 000 |
| Part des images de la carte | le reste | 20 % de 9 000 |
| Unités de traitement du mois | `SATELLITE_MONTHLY_UNIT_BUDGET` | 9 000 PU (quota : 10 000) |
| Requêtes par minute, tous usages | `SATELLITE_REQUESTS_PER_MINUTE` | 250 (Copernicus : 300) |

Les parts sont étanches : aucune ne prend la place d'une autre. Un refus dit sa cause (part épuisée, unités épuisées, minute pleine), et l'appelant répond en conséquence.

S'y ajoutent, en amont :

- **Tuiles détaillées** : réservées aux agents et au ministère. Les producteurs, coopératives et acheteurs n'ont que l'image d'ensemble.
- **Plafond par compte** : il porte sur les seules tuiles à calculer, `SATELLITE_TILE_MISSES_PER_ACCOUNT` par mois (400 par défaut). Revoir une zone déjà en cache ne coûte rien et n'est pas compté. Un plafond large de 5 000 demandes par heure et par compte protège seulement la base.
- **Frontière** : une tuile qui ne touche pas le contour réel du pays (pas seulement son rectangle) ne réserve rien.
- **Échecs** : un échec de Copernicus est gardé une heure (l'image périmée est resservie, ou la zone reste vide) au lieu d'être redemandé aussitôt.
- **Réponses illisibles** : une réponse illisible (JSON, schéma, image) devient un échec du fournisseur, jamais une erreur 500 après réservation.
- Table `parcel_vegetation_check` : une ligne par parcelle, campagne et sous-saison, avec la série par décade (audit), le pic, le plancher, le seuil comparé, la source et la fiabilité (`ESTIMATED` pour Copernicus, `SYNTHETIC` pour la fixture).

## Radar Sentinel-1 en saison des pluies (ADR-0019)

Quand les nuages empêchent Sentinel-2 de conclure (« trop de nuages »), la confrontation peut demander l'indice de végétation radar de Sentinel-1 :

- RVI = 4·VH / (VV + VH), par pas de 12 jours ;
- mode IW, rétrodiffusion normalisée au relief, orbite descendante ;
- même règle que le NDVI, avec des seuils propres au RVI (à calibrer).

Le verdict porte alors le capteur `S1` et la source `COPERNICUS_S1`, et la série radar est gardée à part. Sentinel-2 reste la source principale.

Mise en service :

1. `SATELLITE_RADAR_FALLBACK=0` au départ.
2. Mesurer le coût réel : `curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://…/api/v1/satellite/radar-calibration?limit=20"`. La commande renvoie les unités de traitement consommées par requête radar, sur une parcelle d'au moins 0,5 ha par commune et les 120 derniers jours. Chaque requête compte dans la part des statistiques.
3. Rapporter la moyenne au plafond de `SATELLITE_MONTHLY_UNIT_BUDGET`, puis passer `SATELLITE_RADAR_FALLBACK=1`.

Les unités de traitement des statistiques, optiques comme radar, sont désormais comptées dans le plafond mensuel ; seules celles des images l'étaient.

## Délimitation assistée des champs (phase 3)

### Ce que fait l'agent

Fiche exploitation, bouton « Relever le contour », onglet **Depuis le satellite** (à côté de « À pied ») :

1. Sur l'image Sentinel-2 des 60 derniers jours, l'agent touche l'intérieur du champ. À défaut, le centre de la parcelle ou le siège de l'exploitation sert de point de départ.
2. « Proposer un contour » : jusqu'à trois contours (serré, moyen, large), chacun avec sa surface et un indice de confiance. Le plus sûr, qui ne déborde pas de l'image, est présélectionné.
3. Il fait glisser les sommets à corriger, compare la surface à la superficie déclarée, puis « Valider ce contour ».
4. Le contour part par la file hors ligne, comme un relevé à pied (`parcel.geometry.set`), avec le mode `SATELLITE_ASSISTED`. La proposition demande le réseau ; l'enregistrement non.

Fiabilité : un contour satellite validé par l'agent devient `AGENT_VERIFIED`, jamais `FIELD_VERIFIED`, qui reste réservé à la marche GPS sur place (testé dans le handler). Le ministère n'a pas le droit de modifier les exploitations (`farm.update`) et ne demande donc pas de proposition.

### Calcul

- **Côté Copernicus** : une requête de l'API Process par proposition, sur une fenêtre de 640 m × 640 m (64 × 64 pixels de 10 m) centrée sur le point, avec tous les passages des dix derniers mois (mosaïque par orbite, scènes couvertes à plus de 60 % écartées). Pour chaque pixel, nuages exclus, elle calcule le NDVI le plus haut, le NDVI le plus bas et la réflectance B11 moyenne, codés dans un PNG de quatre canaux 8 bits.
- **Côté serveur**, en TypeScript pur, sans GDAL (`src/modules/satellite/field-segmentation.ts`) :
  1. croissance de région depuis le pixel du point, arrêtée par les bords nets ;
  2. trous comblés et ouverture 3 × 3 ;
  3. contour suivi le long des bords de pixels et simplifié à 7 m (Douglas-Peucker) ;
  4. surfaces recalculées par PostGIS.
- **Indice de confiance** : il combine le contraste au bord et la compacité de la forme. Il est divisé par deux quand la région atteint le bord de l'image, c'est-à-dire quand le champ déborde.

### Limites et garde-fous

- Pas de proposition sous 0,5 ha (50 pixels) ni au-delà de 20 ha (plusieurs champs fondus) : « relevez à pied ».
- Point à moins de 2 km de la parcelle, au Bénin : le service ne balaie pas le territoire.
- 30 propositions par agent et par jour ; même point dans la même journée : proposition resservie sans nouvelle requête.
- **Quota** : les propositions ont leur part réservée du plafond mensuel (`SATELLITE_PROPOSAL_SHARE`, 30 % par défaut), que la tâche de confrontation et les images de la carte ne peuvent pas prendre, et inversement. Une part épuisée affiche : « La part mensuelle des propositions satellite est épuisée : relevez le contour à pied, les propositions reviennent le mois prochain ».
- **Précision attendue** à 10 m : un pixel près sur les bords (5 à 10 m). Sur la surface, 15 à 25 % près à 2 ha et 30 à 50 % à 0,5 ha. Sont difficiles :
  - les champs voisins de même culture sans limite visible ;
  - les parcs arborés ;
  - les bas-fonds.

La marche GPS reste la référence pour les petites parcelles.

### Protocole de mesure de la précision (pilote terrain)

À lancer par le ministère avec un agent volontaire, avant de généraliser :

1. **Échantillon** : 30 champs réels d'au moins 1 ha, répartis sur trois zones agro-écologiques (nord, centre, sud), dont un tiers en association de cultures ou en parc arboré.
2. **Référence** : chaque champ est relevé à pied au GPS, mode `GPS_WALK`, précision moyenne affichée ≤ 5 m.
3. **Proposition** : le même jour ou dans la même quinzaine, depuis la fiche, touchez l'intérieur du champ, retenez le candidat présélectionné **sans correction**, puis notez le niveau choisi et sa confiance.
4. **Mesure**, par champ : l'IoU (surface de l'intersection ÷ surface de l'union, par PostGIS) et l'écart de surface (|proposé − marché| ÷ marché).
5. **Critère d'acceptation** : IoU ≥ 0,6 et écart de surface ≤ 25 % pour au moins 80 % des champs d'1 ha et plus.
6. **Analyse** : résultats par zone et par type de champ, et seuils de segmentation recalés si besoin (`LEVELS` dans `field-segmentation.ts`). Les deux contours restent en base, l'événement de l'exploitation gardant la trace de chacun.

Tant que le pilote n'a pas eu lieu, la délimitation assistée sert de point de départ, que l'agent corrige ; elle ne remplace pas la marche sur les parcelles de moins d'un hectare.

## Carte des cultures et surfaces par satellite (ADR-0021, ADR-0023)

L'État voit depuis son bureau ce qui est cultivé, par culture et par zone, sans envoyer d'agent. Les agents ne font plus que vérifier là où l'écart avec le registre est le plus fort.

- **Classification par pixel**, calculée par Copernicus : un passage par mois sur les 12 derniers mois, le moins nuageux. La courbe de végétation de chaque pixel le range dans l'une de ces classes : riz, maïs et cultures annuelles, coton, cultures pérennes, maraîchage, jachère et sol nu, forêt et savane, eau, bâti. Règles et seuils dans `src/services/remote-sensing/crop-classes.ts`.
- **Carte** : fond « Carte des cultures » sur `/carte` (`?ciel=cultures`), placé sous les limites et les parcelles, sans tuiles détaillées. Elle est faite de quatre quarts du pays, d'environ 400 m par pixel (ADR-0025) :
  - la commande `POST /api/v1/satellite/crop-map`, planifiée du 1er au 8 du mois, les calcule hors de toute requête de visiteur, et `?force=1` refait tout ;
  - les quarts restent en cache jusqu'au mois suivant, pour 120 à 300 PU au total ;
  - la route publique ne sert que le cache, et la légende affiche « Carte en préparation » tant qu'aucun quart n'est prêt.
- **Surfaces par commune** : `POST /api/v1/satellite/crop-areas?limit=12`, planifiée du 1er au 8 de chaque mois.
  - Chaque commune reçoit un histogramme des classes par l'API Statistical, en pixels de 120 m.
  - Chaque lot reprend les communes pas encore calculées ce mois-ci, puis s'arrête net quand la part des statistiques ou le plafond d'unités est atteint.
  - Seuls les pixels du contour comptent, et chaque mois garde un passage par trace Sentinel-2 (ADR-0025).
  - Coût : environ 14 PU par commune en moyenne, 1 100 PU par passe nationale. La formule est dans ADR-0023.
  - Une estimation faite avec une méthode antérieure (`method_version`) est refaite au lot suivant.
  - Riz par radar Sentinel-1 (ADR-0026), avec `SATELLITE_RADAR_RICE=1` : une requête de plus par commune, environ 2 PU. Le radar reconnaît la rizière à l'eau libre du repiquage puis à la montée du couvert, sous les nuages. La part de riz retenue est la plus grande de l'optique et du radar, reprise sur les cultures annuelles, la jachère puis la savane. La page le signale.
  - Résultats dans la table `crop_area_estimate`.
- **Ministère** (`/pilotage/cultures`, « Surfaces par satellite ») : surfaces vues par culture et par département face aux surfaces déclarées au registre.
  - Taux d'enrôlement = surface déclarée rapportée à la surface vue. Il n'est pas calculé sous 50 ha vus.
  - Classement des communes au plus gros écart en hectares, où envoyer les agents en premier.
  - Part non classée par commune (nuages persistants).
  - Toujours affiché avec « Estimation satellite, à confirmer ».
- **Correspondance registre et classes** : riz et coton ont leur classe. Anacarde, palmier à huile, karité, plantain et ananas vont en cultures pérennes. Tomate, piment, gombo et oignon vont en maraîchage. Toutes les autres cultures du registre vont en cultures annuelles (`cropMapClassOf`).
- **Précision** (`/pilotage/cultures`, section « Précision de la carte ») : la même classification est appliquée, en pixels de 10 m, sur le contour des parcelles des exploitations vérifiées.
  - La classe la plus fréquente de la parcelle est comparée à sa culture principale déclarée ; sous 20 pixels classés, la parcelle est comptée « sans classe dominante ».
  - La page donne la précision globale, puis par culture : part des parcelles reconnues, part de la classe qui cultive vraiment cette culture, et confusion principale. Elle montre aussi la matrice de confusion complète.
  - Aucun taux n'est affiché sous 10 parcelles.
  - Commande `POST /api/v1/satellite/crop-accuracy?limit=300`, le 9 de chaque mois : les parcelles jamais contrôlées passent d'abord, puis les contrôles les plus anciens. Environ 0,16 PU par parcelle.
  - Résultats dans la table `parcel_crop_class_check`.
- **Limites** : un champ isolé plus petit qu'un pixel n'apparaît pas sur la carte. Les seuils sont des valeurs de départ, à recaler d'après la matrice de confusion.

## Démonstration sans compte

Le seed (`src/database/seed/steps/satellite.seed.ts`, sauté avec `SEED_VEGETATION=0`, jamais en production) calcule des verdicts pour 3 000 parcelles avec l'adaptateur fixture : séries NDVI synthétiques selon le régime des pluies, une parcelle sur huit restée nue. Ces verdicts portent la source `BAIS_SEED` et sont remplacés par une mesure réelle dès que la tâche planifiée tourne avec le compte CDSE. Avec `SATELLITE_PROVIDER=fixture`, les propositions de contours dessinent un champ rectangulaire synthétique de 1 à 4 ha autour du point, pour montrer l'écran sans compte. Le seed écrit aussi des surfaces par satellite de démonstration, déduites des surfaces déclarées avec un taux d'enrôlement propre à chaque commune (entre 25 et 95 %). Une mesure réelle n'est jamais écrasée, et la passe mensuelle réelle remplace ces lignes. Il contrôle enfin 1 500 parcelles vérifiées avec la fixture, qui retrouve la culture déclarée quatre fois sur cinq, pour montrer une matrice de confusion.

## Vérifier

```bash
pnpm exec vitest run --project unit src/modules/satellite src/services/remote-sensing src/features/satellite src/features/agri-map src/features/registry/parcel-survey
pnpm exec vitest run --project integration tests/integration/satellite.test.ts tests/integration/vegetation-checks.test.ts tests/integration/field-proposals.test.ts tests/integration/satellite-contour-reliability.test.ts
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/v1/satellite/vegetation-checks?limit=20"
pnpm exec vitest run --project integration tests/integration/crop-areas.test.ts tests/integration/satellite-route.test.ts
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/v1/satellite/crop-areas?limit=2"
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/v1/satellite/crop-map"
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "http://localhost:3000/api/v1/satellite/crop-accuracy?limit=20"
```
