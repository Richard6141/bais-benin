# ADR-0009 — Géométries des départements dérivées de l'union de leurs communes

- Statut : acceptée
- Date : 2026-09-24
- Décideurs : Backend/Data, Expert data

## Contexte

Les contours administratifs proviennent de geoBoundaries (gbOpen, CC BY 4.0) : couche ADM1 pour les douze départements, couche ADM2 pour les 77 communes. Les deux couches ont des sources d'origine différentes et ne s'emboîtent pas : en mesurant la part de chaque commune comprise dans le contour ADM1 de son département, dix-neuf communes tombent sous 90 % et Avrankou n'est couverte qu'à 56 %. Le centroïde de deux communes (Sô-Ava, Avrankou) sort même de son département.

Une plateforme qui agrège des exploitations par commune puis par département ne peut pas tolérer qu'un point appartienne à une commune mais pas au département qui la contient.

## Options étudiées

1. Conserver les deux couches telles quelles et accepter les incohérences — écarté.
2. Remplacer ADM1 par une autre source (OSM, IGN Bénin) — pas de source homogène disponible avec ADM2 aujourd'hui ; possible plus tard.
3. Dériver le département de l'union spatiale de ses communes — retenu.

## Décision

- La table `commune` porte la géométrie de référence (ADM2 geoBoundaries, identifiant `geoboundaries_id` conservé).
- Après chargement des communes, le seed recalcule chaque département : `geom = ST_Multi(ST_MakeValid(ST_Union(communes.geom)))`, centroïde par `ST_PointOnSurface`, surface par `ST_Area` en géographie.
- L'identifiant ADM1 geoBoundaries reste stocké sur le département pour suivre les mises à jour de la source, mais son contour n'est plus utilisé.
- Un test d'intégration vérifie que le centroïde de chaque commune est contenu dans son département et que la somme des surfaces départementales approche la superficie du pays (115 600 km² calculés pour 114 763 km² officiels, l'écart venant de la simplification des contours et des plans d'eau).

## Conséquences

- La hiérarchie territoriale est cohérente par construction ; les agrégations par département sont exactes vis-à-vis des communes.
- Quand un référentiel géographique national (IGN Bénin) sera disponible, il remplacera la couche communale et les départements suivront automatiquement.
- Les contours d'arrondissements, s'ils sont chargés un jour, devront suivre la même règle : la commune deviendra l'union de ses arrondissements.
