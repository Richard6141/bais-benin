# ESA WorldCereal pour le Bénin : ce qu'on peut en attendre

Note de recherche, 26 septembre 2026. Aucun appel à WorldCereal ni à openEO n'a été fait : tout ce qui suit vient de la documentation publique, citée en fin de note. Les points non vérifiés sont signalés comme tels.

## En bref

- **Couverture** : les cartes mondiales 2021 couvrent le Bénin, à 10 m. Elles datent de 2021 : ce sont des indices, pas des chiffres de campagne.
- **Coût** : télécharger ces cartes ne coûte aucune unité de traitement (PU). Produire une nouvelle carte se paie en crédits openEO, un compteur distinct de nos PU Sentinel Hub, dont le coût à la surface n'est pas publié et doit être mesuré.
- **Nos parcelles** : WorldCereal permet d'entraîner un modèle de cultures avec ses propres données de référence. Nos parcelles vérifiées, les cultures constatées et les points d'enquête en sont exactement.
- **Usage** : le meilleur usage immédiat est gratuit. La carte des terres cultivées de 2021 peut servir de variable auxiliaire au sondage (ADR-0033) et de variable du modèle par parcelle (ADR-0030), après une mesure de sa précision sur nos propres points.

## 1. Le Bénin est-il couvert ?

**Oui, pour 2021.** Les produits mondiaux de WorldCereal (phase 1) couvrent toutes les terres émergées, à 10 m :

- étendue des cultures temporaires (annuelles), pour l'année ;
- terres cultivées actives, par saison ;
- maïs, céréales d'hiver et céréales de printemps, par saison ;
- irrigation active, par saison.

Chaque pixel porte une valeur de 0 à 100 : la part de cultures temporaires dans le pixel, ou celle de la culture dans les cultures temporaires. Digital Earth Africa redistribue pour l'Afrique sept couches 2021, dont l'étendue des cultures temporaires, les terres cultivées actives et le maïs de saison principale.

Limites :

- **Une seule année, 2021.** Le site annonce d'autres produits d'ici fin 2026, sans date ni année précise.
- **Précision** : l'article de référence donne, au niveau mondial, 88,5 % d'exactitude de l'usager et 92,1 % d'exactitude du producteur pour l'étendue des cultures temporaires. Il précise que l'Afrique a les chiffres les plus bas, faute de données d'entraînement et à cause de paysages agricoles complexes. Nos savanes cultivées du centre et du nord sont précisément ce cas.
- **Maïs** : la couche existe pour l'Afrique ; sa qualité sur le Bénin **n'est pas vérifiée** ici. Seules nos parcelles vérifiées peuvent le dire.
- **Nos autres cultures** (coton, sorgho et mil, soja, niébé, igname, anacarde) n'ont pas de carte WorldCereal publiée. Elles demandent un modèle personnalisé (question 3).

## 2. Combien coûte-t-il, en PU ?

Deux usages, deux compteurs :

| Usage | Compteur | Coût |
| --- | --- | --- |
| Télécharger les cartes 2021 (Zenodo, Digital Earth Africa, Google Earth Engine) | aucun | **0 PU** ; volume à mesurer au téléchargement |
| Produire une carte à la demande (autre année, modèle personnalisé) | crédits openEO du Copernicus Data Space Ecosystem | **non publié à la surface** ; à mesurer |

Ce qu'on sait des crédits openEO :

- 1 crédit vaut environ 0,01 € ; le CDSE annonce 10 000 crédits gratuits pour un compte. **À vérifier** : s'ils sont renouvelés chaque mois sur notre compte ;
- ils sont comptés sur le calcul, la mémoire, le stockage et l'accès aux données, pas en PU Sentinel Hub : ils ne consomment pas notre budget de 9 000 PU par mois ;
- une révision du barème (mars 2026) les a réduits d'environ 25 % par tâche ;
- le CDSE conseille d'estimer un coût en lançant d'abord une tâche sur 10 ha à 10 m : « quelques centimes, au pire quelques euros ».

Une carte WorldCereal lit une année entière de Sentinel-1, de Sentinel-2 et de données météo, à 10 m, puis passe un modèle d'apprentissage profond (Presto). À la surface, c'est bien plus lourd que notre carte des pixels à 120 m. Le coût d'une commune pilote (de 3 000 à 7 000 km²) est inconnu. **Aucune estimation n'est avancée sans mesure.**

Protocole de mesure proposé, soumis à l'accord du chef d'équipe :

1. une tâche sur 10 ha dans une commune pilote, pour lire le coût réel en crédits ;
2. puis un carré de 20 km sur 20 km ;
3. extrapolation à une commune, puis décision.

## 3. Peut-on l'entraîner avec nos parcelles ?

**Oui, c'est prévu par le système.** En phase 2 (depuis décembre 2023), WorldCereal permet :

- d'entraîner un modèle de culture personnalisé : des représentations tirées du modèle de fond Presto, puis un classifieur CatBoost léger. L'entraînement se fait en local, et la carte est produite par openEO avec ce modèle ;
- d'y verser ses propres données de référence, par le module de données de référence (RDM), seules ou avec les données publiques de la région.

Ce que nous avons à y verser :

- les parcelles vérifiées, avec leur contour et leur culture ;
- les cultures constatées sur place par les agents (ADR-0031) : les meilleures étiquettes ;
- les points d'enquête constatés (ADR-0033) : tirés au hasard, donc aussi un jeu de validation honnête.

Conditions avant tout versement :

- **aucune donnée nominative** : contour, culture, date et fiabilité seulement, jamais le producteur, son NPI ni son exploitation ;
- **décision du ministère** : verser des données nationales dans un système étranger, même sans nom, est un choix de souveraineté. La documentation dit qu'on peut entraîner avec des données privées ; elle ne dit pas clairement comment le RDM les tient à l'écart du public. **À vérifier** avant tout envoi, par écrit auprès de l'équipe WorldCereal ;
- un entraînement « en local » avec nos seules données, sans versement au RDM, est l'option la plus sûre. Sa faisabilité complète reste à confirmer sur la documentation du dépôt.

## 4. Variable ou a priori ?

Les deux, à des places différentes, et d'abord avec les cartes gratuites de 2021.

**a. Variable auxiliaire du sondage (ADR-0033)**, à la place ou à côté de notre carte des pixels :

- pour chaque point tiré, la valeur WorldCereal au point ; pour la commune, la moyenne sur son contour. Les deux se lisent dans le fichier téléchargé, à 0 PU ;
- l'estimateur par régression ne suppose pas que la carte soit juste, seulement qu'elle soit corrélée au terrain. Une carte de 2021 fausse sur la date reste utile si elle sépare bien les terres cultivées du reste ;
- le gain se mesure directement : c'est la colonne « Gain de la carte » de l'onglet Sondage. On garde la carte qui donne le meilleur gain, ou les deux dans une régression à deux variables.

**b. Variable du modèle par parcelle (ADR-0030)** :

- ajouter à chaque parcelle la part de cultures temporaires et la probabilité de maïs WorldCereal sur son contour ;
- la forêt aléatoire décidera seule de son poids, et la validation croisée par commune (ADR-0032) dira si la précision gagne vraiment.

**c. A priori, pas vérité** : une carte de 2021 ne dit rien de la campagne en cours (jachères, défrichements, rotation maïs-coton). Elle ne doit jamais remplacer un constat de terrain ni la mesure de la campagne ; elle aide seulement à le prévoir.

## Recommandation

1. **Fait le 26/09/2026, sans coût en PU ni en crédits** : l'étendue des cultures temporaires 2021 est sur `/carte`, fond « Terres cultivées 2021 (ESA WorldCereal) » (voir plus bas).
2. **Mesurer sa précision sur nos données**, une fois les vraies visites faites, selon le protocole ci-dessous. Pas avant : sur les parcelles de démonstration, synthétiques, le chiffre n'aurait aucun sens.
3. **Si la corrélation est bonne** : les brancher comme variable auxiliaire du sondage et comme variable du modèle par parcelle, puis lire le gain.
4. **Plus tard, sur décision** : un modèle personnalisé entraîné sur nos parcelles, seulement après une mesure du coût en crédits (protocole ci-dessus) et une décision du ministère sur le partage des données.

## La couche « Terres cultivées 2021 » sur la carte

- **Donnée** : étendue des cultures temporaires 2021 (`esa_worldcereal_temporarycrops`), lue dans les fichiers COG publics de Digital Earth Africa, par lectures fenêtrées sur l'emprise du Bénin : 34,7 Mo lus le 26/09/2026, aucun fichier mondial.
- **Traitement** (`scripts/extract-worldcereal-2021.mjs`, qui reproduit les images à l'octet près) : niveau réduit du fichier (environ 75 m), mosaïque des cinq zones agro-écologiques qui touchent le Bénin, découpe au contour du pays, reprojection en Web Mercator, quatre images PNG à deux couleurs (1,2 Mo en tout) sur les mêmes quarts que la carte des cultures.
- **Service** : images statiques (`public/cartes/worldcereal-2021/`), sans calcul ni base de données : le plus léger pour le serveur.
- **À l'écran** : la légende et l'attribution disent « ESA WorldCereal 2021, CC BY 4.0, via Digital Earth Africa » et « Carte de 2021, pas la campagne en cours ». Les champs détectés se superposent pour comparer.
- **Ce qu'on y voit** : 22,8 % des pixels du Bénin en cultures temporaires. Des coupures nettes apparaissent entre zones de calcul de WorldCereal, notamment au nord-ouest : c'est un défaut de la carte source, pas du traitement.

## Protocole de mesure, quand les vraies visites existeront

1. **Données de référence** : seulement du terrain réel.
   - Jeu principal : les points d'enquête constatés (ADR-0033). Tirés au hasard, ils donnent une précision sans biais, commune par commune.
   - Jeu secondaire : les cultures constatées sur les parcelles (ADR-0031). Choisies là où le modèle doute, elles ne sont pas un échantillon : leurs chiffres se publient à part, jamais comme « la » précision.
   - Jamais les déclarations vérifiées au bureau, ni les lignes de démonstration (`BAIS_SEED`).
2. **Correspondance des classes** : « culture temporaire » au terrain = une culture annuelle (maïs, sorgho, mil, riz, coton, soja, niébé, arachide, sésame, igname, manioc, patate douce, maraîchage). Anacarde, palmier, karité, plantain et ananas, jachère, savane, eau et bâti comptent comme « autre ».
3. **Lecture de WorldCereal au point** : à 10 m, dans le fichier d'origine (lecture fenêtrée d'un pixel par point, 0 PU), pas dans l'image d'affichage à 75 m.
4. **Mesures** :
   - matrice de confusion à deux classes, précision globale, exactitudes de l'usager et du producteur, chacune avec son intervalle de Wilson à 95 %, par commune et toutes communes réunies ;
   - les mêmes chiffres pour notre carte des pixels, aux mêmes points ;
   - pour le sondage : corrélation entre WorldCereal et le terrain, et gain de variance attendu (environ 1 / (1 - r²)), face à celui de notre carte.
5. **Lecture honnête** : WorldCereal date de 2021. Un désaccord mêle l'erreur de la carte et le changement réel (jachère, défrichement, rotation). Le chiffre s'appelle « accord avec la carte 2021 », pas « précision ».
6. **Seuils avant publication** : au moins 30 points constatés par commune et 100 en tout, sinon « trop peu ».
7. **Décision** :
   - variable auxiliaire du sondage si son gain dépasse celui de notre carte, ou si la régression à deux variables réduit la marge ;
   - variable du modèle par parcelle si la validation croisée par commune (ADR-0032) gagne au-delà de sa marge.

## Sources

- [WorldCereal, cartes mondiales](https://esa-worldcereal.org/en/products/global-maps) : produits, 10 m, 2021, téléchargements (Zenodo 7875105, visualiseur, Google Earth Engine).
- [Digital Earth Africa, spécifications WorldCereal](https://docs.digitalearthafrica.org/en/latest/data_specs/ESA_World_Cereal_specs.html) : sept couches 2021 pour l'Afrique, licence CC BY 4.0, accès S3, WMS et WCS.
- [Van Tricht et al., 2023, Earth System Science Data 15, 5491](https://essd.copernicus.org/articles/15/5491/2023/) : méthode et précision (88,5 % et 92,1 % au niveau mondial ; Afrique la plus basse).
- [WorldCereal, le système](https://esa-worldcereal.org/en/products/worldcereal-system) : données de référence privées, modèles appliqués à d'autres saisons.
- [Dépôt worldcereal-classification](https://github.com/WorldCereal/worldcereal-classification) : cartes de terres cultivées, de cultures et entraînement personnalisé, licence MIT.
- [CDSE, WorldCereal et openEO](https://dataspace.copernicus.eu/cases/global-cropland-monitoring-esa-worldcereal-and-openeo) : entrées Sentinel-1, Sentinel-2 et météo ; entraînement CatBoost en local.
- [CDSE, usage des crédits openEO](https://documentation.dataspace.copernicus.eu/APIs/openEO/credit_usage.html), [révision du barème, mars 2026](https://dataspace.copernicus.eu/news/2026-3-2-platform-wide-updates-openeo-credit-billing) et [10 000 crédits openEO](https://dataspace.copernicus.eu/news/2024-9-23-discover-how-make-most-your-10000-openeo-credits).
