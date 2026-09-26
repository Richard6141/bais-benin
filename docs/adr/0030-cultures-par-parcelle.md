# ADR-0030 — Culture de chaque parcelle, mesurée par satellite et apprise des parcelles vérifiées

- Statut : acceptée
- Date : 2026-09-27
- Décideurs : chef d'équipe
- Complète : ADR-0016, ADR-0019 et ADR-0021

## Contexte

Le ministère veut passer de « le producteur déclare du maïs » à « le satellite voit du maïs, avec 87 % de confiance, et l'agent l'a confirmé le 12 août ».

La carte des cultures (ADR-0021 à ADR-0028) classe des pixels avec des seuils écrits à la main. Sa première passe nationale a donné 6,1 M ha cultivés et 2 M ha de coton, là où les ordres de grandeur publics sont de 0,6 à 0,7 M ha de coton. Des seuils ne s'ajustent pas seuls.

Or le registre a ce qu'il faut pour apprendre : des parcelles relevées au GPS, avec leur culture déclarée, dont une partie est vérifiée par les agents (2 336 exploitations sur 5 001 en démonstration).

C'est la démarche des organismes payeurs de la politique agricole commune et du système ouvert Sen4CAP de l'ESA : série satellite agrégée sur chaque parcelle, variables tirées de la série, modèle entraîné sur des parcelles vérifiées.

## Décision

1. **Séries par parcelle**, par l'API Statistical, sur le contour relevé :
   - **Sentinel-2** par décade : NDVI (B04, B08), NDMI (B08, B11 : humidité du couvert, submersion des rizières) et part de pixels vus sans nuage (masque SCL). La scène la moins nuageuse passe d'abord.
   - **Sentinel-1** par pas de 12 jours : VV et VH en décibels, orbites descendantes, orthorectifié. Pas de correction de relief ni de filtre de chatoiement : le pays est plat, la moyenne sur la parcelle lisse le chatoiement, et chacune de ces options multiplie le coût.
   - **Fenêtre** : du 1er janvier de l'année de campagne jusqu'à la date lue. La saison sèche avant semis et la contre-saison distinguent autant les cultures que la saison des pluies.
   - **Complément mensuel** : seul le nouveau morceau est demandé, à partir de la dernière décade connue, qui était peut-être incomplète.
2. **Variables** (`FEATURE_VERSION` 1, 76 variables) :
   - moyennes mensuelles de NDVI, NDMI, VH et VV sur quinze mois, les mois pas encore lus valant −1 ;
   - pic de NDVI et sa décade, minimum avant juin, amplitude et intégrale ;
   - vitesses de verdissement et de sénescence, et part des décades vertes ;
   - moyenne de saison sèche et part des décades vues ;
   - maximum de NDMI et décades submergées ;
   - maximum, minimum et montée de VH, écart VH moins VV.
   Les trous nuageux sont comblés par interpolation linéaire.
3. **Classes apprises** : neuf groupes de cultures que le satellite peut séparer :
   - maïs, sorgho ou mil, riz, coton, soja ;
   - niébé, arachide ou sésame ;
   - igname, manioc ou patate douce ;
   - cultures pérennes ;
   - maraîchage.
   Une classe vue sur moins de 8 parcelles vérifiées n'est pas apprise.
4. **Modèle** : forêt aléatoire écrite en TypeScript, sans dépendance (`src/lib/ml/random-forest.ts`) :
   - 100 arbres CART, indice de Gini, profondeur 14 au plus, racine du nombre de variables tirées à chaque nœud ;
   - poids des classes inverses de leur fréquence ;
   - tirage à graine fixe, donc entraînement reproductible ;
   - modèle gardé en JSON dans `crop_model`, une version par entraînement.
   Sur la démonstration, l'entraînement sur 654 parcelles prend 3 s et la prédiction de 1 377 parcelles une fraction de seconde. Il faut rester sous 2 Go de mémoire, sans processus parallèle.
5. **Étiquettes** : la culture principale déclarée (la plus grande surface de la campagne) des parcelles d'exploitations `AGENT_VERIFIED` ou `FIELD_VERIFIED`.
6. **Culture mesurée** (`parcel_crop_prediction`), une ligne par parcelle et par campagne :
   - classe retenue, et culture du registre quand la classe n'en compte qu'une ;
   - confiance : probabilité de la classe, c'est-à-dire la moyenne des feuilles des arbres ;
   - probabilité de chaque classe et classe déclarée ;
   - accord : `AGREES`, `DIFFERS`, ou `UNCERTAIN` sous 0,6 de confiance.
   La fiche de parcelle la lit par `getParcelCropPrediction(actor, parcelId)`, avec les droits de la fiche. La fonction renvoie null sans mesure ou sans droit.
7. **Périmètre** : les parcelles des communes pilotes seulement (`CROP_MODEL_PILOT_COMMUNES` : Tchaourou, Tanguiéta, Bassila, Ouèssè et Ségbana, soit 1 377 parcelles relevées dont 654 vérifiées), les vérifiées d'abord. L'échantillon aréolaire (chantier E) viendra ensuite ; jamais tout le registre d'un coup.
8. **Tâches planifiées** :
   - `POST /api/v1/satellite/parcel-series` : 300 parcelles par appel, du 10 au 14 du mois ;
   - `POST /api/v1/satellite/crop-model` : entraînement et prédiction le 15, sans appel à Copernicus.

## Coût (à confirmer par une mesure réelle)

Formule de facturation : pixels / 512² × bandes lues / 3 × passages, avec une surface minimale facturée. La mesure du radar sur les parcelles, le 26/09, correspond à un plancher de 0,01 par intervalle.

- **Sentinel-2** : 0,01 × 4/3 par décade. De janvier à fin septembre (27 décades), environ 0,36 unité par parcelle.
- **Sentinel-1** : 0,01 × 2/3 × 2 (orthorectification) par pas. Sur la même période (23 pas), environ 0,31 unité.
- **Première lecture** : environ 0,67 unité par parcelle. Pour les 654 parcelles vérifiées des communes pilotes, environ 440 unités ; pour les 1 377 parcelles pilotes, environ 920.
- **Complément mensuel** : trois décades et deux ou trois pas radar, la dernière décade relue comprise, soit environ 0,08 unité par parcelle et environ 110 unités par mois pour les communes pilotes.

À mesurer d'abord sur 5 parcelles (`?limit=5`) : la réponse donne `processingUnits`.

## Options écartées

- **Service à part en Python** (scikit-learn, LightGBM) : plus riche, mais un processus de plus à héberger et à surveiller, sur une machine à 2 Go libres. La forêt en TypeScript suffit à ce volume ; un gradient boosting ou un modèle temporel pourra la remplacer derrière la même table.
- **Modèle temporel profond** (réseaux récurrents ou à attention, comme dans les travaux de référence de la PAC) : il faut des dizaines de milliers de parcelles vérifiées, pas quelques centaines.
- **WorldCereal (ESA)** : étudié à part (note `docs/recherche/worldcereal.md`) ; il pourra entrer comme variable ou avis préalable.

## Conséquences

- La précision affichée en lot 1 est la précision hors sac (90 % sur la démonstration, où les courbes sont synthétiques). Une précision honnête demande des parcelles jamais vues à l'entraînement et éloignées de celles-ci : validation croisée par commune (lot 3).
- Les étiquettes restent des déclarations vérifiées. Une vérification au bureau vaut moins qu'une visite ; les visites de terrain (`farm_verification`, `FIELD_VISIT`) seront privilégiées dès qu'elles existent (lot 2).
- Les séries et le modèle suivent la campagne ouverte. Une nouvelle campagne repart d'une série vide et d'un nouveau modèle.
