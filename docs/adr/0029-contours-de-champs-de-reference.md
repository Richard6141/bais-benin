# ADR-0029 : Contours de champs de référence (Fields of The World), import filtré et mesure de qualité

- Statut : acceptée
- Date : 2026-09-27
- Décideurs : chef d'équipe
- Complète : ADR-0016 (contour proposé par le satellite) et le chantier C du plan d'action

## Contexte

Seules les parcelles enregistrées ont un contour. Pour que l'agent n'ait plus à dessiner, il faut des contours de tous les champs du pays, déjà délimités, qu'il touche puis attribue à une exploitation.

Le jeu ouvert Fields of The World (FTW, Taylor Geospatial Institute, CC BY 4.0) publie des contours de champs à 10 m, produits par le modèle PRUE sur des mosaïques Sentinel-2. Format : GeoParquet, une partition par pays, catalogue STAC.

Constat sur le fichier du Bénin (`predictions/vectors/alpha/results-by-admin-conf/admin:country_code=BJ/Benin.parquet`) :

- 2 005 001 287 octets (2,0 Go), 19 417 228 polygones, 297 groupes de lignes de 65 536 lignes ;
- colonnes : `id`, `geometry` (WKB, EPSG:4326), `bbox`, `metrics:area` (m2), `metrics:perimeter`, `determination:datetime`, `admin:subdivision_code`, `confidence` (0 à 100, filtre recommandé 69 et plus) ;
- les groupes de lignes sont triés dans l'espace et portent des statistiques d'emprise ; le serveur accepte les requêtes d'octets.

## Décision

1. **Jamais le fichier entier.** Le script `scripts/import-ftw-fields.ts` lit le pied du fichier, retient les groupes de lignes qui croisent l'emprise demandée (commune, département ou rectangle) et ne lit que ceux-là par plages d'octets. Lecteur Parquet en JavaScript pur : `hyparquet` et `hyparquet-compressors`, licence MIT, en dépendances de développement seulement (aucun effet sur l'application).
2. **Filtre à l'import** : confiance 69 et plus, surface 0,05 ha et plus (options `--min-confidence` et `--min-area-ha`). Une confiance nulle signifie « hors de la couche du fournisseur », pas une note basse : elle est écartée tant que le seuil est positif.
3. **Table de référence additive** `reference_field` : identifiant, source (`FTW_GLOBAL`, ligne de `data_source`), référence du fournisseur, année, confiance, surface, commune, géométrie `geography(Polygon, 4326)` avec index GiST. Unicité sur (source, année, référence) : l'import se rejoue sans doublon. La commune est celle du point intérieur du champ.
4. **Aucune donnée nominative.** Ces champs ne sont pas des parcelles enregistrées : ni exploitant ni NPI. La portée d'accès des tuiles suit celle de la lecture du registre (lot suivant), mais la géométrie elle-même n'est pas un secret.
5. **Démonstration et tests sans téléchargement** : un extrait réel versionné, `src/database/seed/reference/fixtures/ftw-djougou.json` (zone pilote de Djougou, 1,62 à 1,72 E et 9,66 à 9,76 N, 2025, 1 139 champs, 646 Ko), chargé par le seed. Il vient du fichier réel, pas d'un générateur.
6. **Attribution** : « Fields of The World, Taylor Geospatial Institute, CC BY 4.0 » dans le contrôle d'attribution de la carte dès que la couche est affichée, et dans la source de données.

## Mesures sur la zone pilote

Fenêtre de 15 km sur 17 km autour de Djougou (environ 260 km2), lue en 2 min 36 s, 9 groupes de lignes sur 297 :

- 6 182 champs gardés après filtre (confiance 69 et plus, 0,05 ha et plus) ;
- surface médiane 0,12 ha, moyenne 0,32 ha, 90e centile 0,44 ha ; 8 % des champs ont 0,5 ha et plus, 3,5 % ont 1 ha et plus ;
- occupation en base : environ 1,3 Ko par champ, index compris (1 139 champs : 1,4 Mo).

Ces surfaces médianes sont très inférieures à celles des exploitations béninoises (souvent 1 à 3 ha en plusieurs parcelles). Le modèle à 10 m découpe probablement des champs en fragments. Conséquence pour le parcours de l'agent : toucher un champ n'ouvre pas toujours une parcelle entière ; l'agent doit pouvoir fusionner des champs voisins avant de valider (lot 3).

## Qualité face aux parcelles relevées au GPS

Outil livré : `scripts/measure-ftw-quality.ts` (module `measureReferenceQuality`). Pour chaque parcelle mesurée (marche GPS ou dessin) située dans la zone couverte : meilleur recouvrement IoU avec un seul champ, part de la parcelle couverte par l'ensemble des champs, taux de parcelles retrouvées (IoU 0,5 et plus). Surfaces calculées en UTM 31N. Vérifié par un test d'intégration sur des géométries construites (champ de 100 m sur 100 m et parcelle décalée de 20 m : IoU 2/3, couverture 0,8).

Limite de cette base de développement : ses parcelles sont synthétiques (jeu de démonstration), placées sans lien avec les champs réels ; la mesure y donne 0 sur 4 parcelles et ne dit rien de la qualité réelle. **La mesure réelle reste à faire** sur la base qui contient de vrais relevés GPS. Cibles de réception du plan : plus de 80 % des champs visibles ont un contour à Djougou.

## Import national

Non lancé. Estimation sur un échantillon de 25 groupes de lignes sur 297 (lecture des seules colonnes de surface, confiance et département, environ 25 Mo par groupe), filtre confiance 69 et plus, 0,05 ha et plus. Ordre de grandeur, à plus ou moins 30 % (l'échantillon est spatialement clairsemé) ; la taille en base vient de la mesure de Djougou, environ 1,3 Ko par champ :

| Département (code FTW) | Polygones bruts | Après filtre | Base |
|---|---|---|---|
| Borgou (BO) | 5,6 M | 1,42 M | 1,8 Go |
| Alibori (AL) | 3,4 M | 1,16 M | 1,5 Go |
| Atacora (AK) | 3,0 M | 0,91 M | 1,2 Go |
| Couffo et Kouffo (KO) | 1,7 M | 0,30 M | 0,4 Go |
| Zou (ZO) | 1,6 M | 0,24 M | 0,3 Go |
| Collines (CO) | 2,0 M | 0,20 M | 0,26 Go |
| Plateau (PL) | 0,27 M | 0,08 M | 0,11 Go |
| Donga (DO) | 1,3 M | 0,05 M | 0,06 Go |
| Atlantique (AQ) | 0,6 M | 0,02 M | 0,03 Go |
| Ouémé (OU) | 0,08 M | 0,006 M | 0,01 Go |
| Total | 19,4 M | environ 4,4 M | environ 5,7 Go |

Le Nord (Borgou, Alibori, Atacora) porte 80 % du total. L'import se lance département par département : `pnpm tsx scripts/import-ftw-fields.ts --departement BJ-BO`, avec `--dry-run` pour compter avant de charger. Le script ne garde qu'un groupe de lignes en mémoire à la fois.

## Conséquences

- Une table de plus, additive ; rien d'existant n'est modifié.
- L'import dépend de la disponibilité du serveur Source Cooperative et du format GeoParquet actuel (`alpha`). Le script échoue proprement si le fichier change ; l'extrait versionné garde la démonstration et les tests indépendants du réseau.
- Le seuil de confiance et la surface minimale sont des paramètres : les durcir ou les assouplir ne demande pas de migration.
