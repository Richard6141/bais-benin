# ADR-0021 — Carte des cultures par satellite : surfaces par commune sans agent

- Statut : acceptée
- Date : 2026-09-26
- Décideurs : Utilisateur (ministère), chef d'équipe
- Complète : ADR-0016, ADR-0019

## Contexte

L'utilisateur veut que l'État voie depuis son bureau, par satellite, les surfaces de riz, de maïs, de coton et des autres cultures, par commune et par zone. Les agents ne font plus que vérifier. Le registre, lui, ne connaît que ce qui a été déclaré ; l'écart entre les deux montre où l'enregistrement est en retard, donc où envoyer les agents.

Contraintes connues : Copernicus sans intermédiaire (ADR-0016), aucun traitement raster local (machine à 2 Go libres), quota gratuit de 10 000 requêtes et 10 000 unités de traitement (PU) par mois, champs de petite taille (1 ha en moyenne).

## Décision

1. **Classification phénologique par pixel, calculée chez Copernicus.** Un evalscript multi-temporel (mosaïque par orbite) reçoit toute la série des 12 derniers mois du pixel. `preProcessScenes` ne garde qu'un passage par mois, le moins nuageux, ce qui borne les unités de traitement à 12 échantillons. Pixels de nuage, d'ombre et de neige écartés (classes SCL). Descripteurs calculés :
   - NDVI le plus haut et son mois ;
   - NDVI de saison sèche (décembre à mars) ;
   - amplitude ;
   - nombre de mois verts (NDVI ≥ 0,5) ;
   - verdeur en fin de saison (octobre-novembre) ;
   - indice d'eau MNDWI, dont la submersion en début de cycle ;
   - indice de bâti.
2. **Classes et règles** (seuils de départ, à calibrer) :

| Code | Classe | Règle principale |
|---|---|---|
| 1 | Riz | Submersion (MNDWI ≥ 0,05, NDVI ≤ 0,35) suivie dans les trois mois d'un NDVI ≥ 0,5 |
| 2 | Maïs, céréales et autres cultures annuelles | Sol nu en saison sèche (≤ 0,35), amplitude ≥ 0,25, un à quatre mois verts |
| 3 | Coton | Culture annuelle au pic tardif (septembre-octobre), encore verte en novembre (≥ 0,45), sans pic de juin |
| 4 | Cultures pérennes (anacarde, palmier…) | Verte en saison sèche (≥ 0,45), faible amplitude (≤ 0,25) |
| 5 | Maraîchage et contre-saison | Pic en saison sèche (≥ 0,45), peu de vert en saison des pluies |
| 6 | Jachère et sol nu | NDVI le plus haut < 0,35 |
| 7 | Forêt et savane | Couvert dense en saison sèche (≥ 0,6), ou saison verte longue (cinq mois ou plus) |
| 8 | Eau | MNDWI médian > 0,1, NDVI faible |
| 9 | Bâti | Indice de bâti médian > 0,05, NDVI faible toute l'année |

   Les règles ne dépendent pas de la latitude : le coton se reconnaît au pic tardif sans pic de juin, ce qui écarte le régime bimodal du sud. Pour les surfaces par commune, les seuils de végétation sont abaissés dans les zones les plus sèches du nord (ZAE 1 et 2), comme pour la confrontation.
3. **Surfaces par commune et par classe** : la même classification, par l'API Statistical, avec un histogramme par classe sur la géométrie simplifiée de chaque commune. Pixels de 100 m, soit un hectare par pixel ; 20 m coûterait environ 25 fois plus, au-delà du quota mensuel. Environ 12 PU par commune, soit à peu près 900 PU pour les 77 communes par calcul, dans la part des statistiques. Table `crop_area_estimate` : commune, campagne, classe, hectares, part des pixels, part non classée (nuages persistants), date, résolution, source.
4. **Couche « Carte des cultures »** sur la carte agricole : image d'ensemble du pays seulement (environ 380 m par pixel, environ 150 PU par saison), gardée en cache une semaine. Pas de tuiles détaillées pour cette couche : leur coût dépasserait la part des images. Légende des classes et mention « estimation satellite, à confirmer ».
5. **Vue ministère** : surfaces estimées par classe et par commune ou département, face aux surfaces déclarées au registre pour la campagne (cultures regroupées dans les mêmes classes). Le rapport déclaré ÷ estimé donne un **taux d'enregistrement** par commune : les communes au taux le plus bas sont celles où envoyer les agents enrôler.
6. **Précision honnête** : « estimation satellite, à confirmer » partout. Une matrice de confusion sera calculée sur les parcelles vérifiées (classe proposée à la parcelle face à la culture principale déclarée et vérifiée), dès qu'il y en aura assez. Une commande de mesure en donne le coût et les premiers chiffres.
7. **Mise en service** : une commande protégée par `CRON_SECRET` calcule les surfaces d'un lot de communes. Le chef d'équipe la lance avec les vraies clés. Le seed produit des estimations de démonstration (source `BAIS_SEED`) à partir des surfaces déclarées, pour montrer l'écran sans compte.

## Options écartées pour l'instant

- **Masque de terres cultivées ESA WorldCereal ou Digital Earth Africa** : ouverts, mais pas servis par l'API de traitement du CDSE. Les intégrer demanderait de télécharger et d'héberger des rasters, ce qu'exclut la contrainte de traitement local. À réexaminer via openEO.
- **Sentinel-1 pour le riz** : la submersion se lit déjà dans le MNDWI de Sentinel-2 ; le radar (ADR-0019) viendra en complément là où les nuages masquent le début de cycle.
- **Classification apprise** (forêts aléatoires sur parcelles vérifiées) : à envisager quand la matrice de confusion aura assez de parcelles vérifiées.

## Conséquences

- Des surfaces par culture et par commune sans visite de terrain, rafraîchies à la demande pour environ 1 000 PU.
- **Confusions attendues** :
  - coton et maïs au nord (pics voisins) ;
  - cultures pérennes et savane arborée ;
  - maraîchage et bas-fonds verts toute l'année ;
  - petits champs mêlés à la végétation naturelle dans un pixel de 100 m.

  L'interface le dit, et la matrice de confusion le mesurera.
- **Suite** : état des cultures à la manière de l'USDA, soit le NDVI de la période comparé à la normale des années précédentes, en cinq classes par commune.
