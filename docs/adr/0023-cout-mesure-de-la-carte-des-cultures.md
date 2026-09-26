# ADR-0023 — Carte des cultures : coût mesuré, pixels de 120 m, quatre bandes, douze passages

- Statut : acceptée
- Date : 2026-09-26
- Décideurs : chef d'équipe
- Remplace en partie : ADR-0021 (résolution des surfaces, bandes lues, règles de l'eau et de la submersion, durée du cache de la carte)

## Contexte

ADR-0021 estimait environ 12 unités de traitement (PU) par commune et 900 PU par passe nationale. La première mesure réelle, le 26/09 sur trois communes de l'Alibori, a donné :

| Commune | PU mesurées |
|---|---|
| BJ-ALI-001 | 65,4 |
| BJ-ALI-002 | 64,4 |
| BJ-ALI-003 | 49,0 |

Ces trois valeurs suivent exactement la formule de facturation de Copernicus :

PU = (pixels du rectangle englobant de la commune / 512²) × (bandes lues / 3) × passages retenus

Soit cinq bandes (B03, B04, B08, B11, SCL) et treize passages. Une fenêtre de 365 jours touche treize mois calendaires, et `preProcessScenes` garde un passage par mois. L'erreur de l'estimation venait de là, et du rectangle englobant, plus grand que la commune elle-même. Sur les 77 communes, la passe coûtait 1 694 PU, soit 22 PU par commune en moyenne. Les trois premières mesurées sont parmi les plus grandes du pays.

## Décision

1. **Douze passages au plus** : `preProcessScenes` ne garde que les douze mois les plus récents.
2. **Quatre bandes** : B04, B08, B11 et SCL (`dataMask` n'est pas facturé). B03 n'est plus lue.
   - L'eau libre vient de la classe SCL 6 (eau) : un pixel vu en eau à au moins la moitié de ses passages, et jamais vert, est de l'eau.
   - La submersion des rizières vient de l'indice LSWI = (B08 − B11) / (B08 + B11), la règle classique de détection du repiquage : LSWI + 0,05 ≥ NDVI, avec un NDVI ≤ 0,35. Un passage classé eau (SCL 6) compte aussi comme submersion.
3. **Pixels de 120 m** (1,44 ha) pour les surfaces par commune, au lieu de 100 m.
4. **Carte des cultures** (image d'ensemble) : même règle et mêmes bandes, soit environ 115 PU par image. Elle est gardée 30 jours en cache au lieu d'une semaine, et refaite une fois par mois comme les surfaces.

Coût attendu, calculé avec la formule sur les emprises réelles des communes :

| | 100 m, 5 bandes, 13 passages | 120 m, 4 bandes, 12 passages |
|---|---|---|
| Passe nationale | 1 694 PU | 869 PU |
| Moyenne par commune | 22 PU | 11,3 PU |
| BJ-ALI-001 | 65,4 PU | 33,5 PU |
| Plus grande emprise (BJ-BOR-008) | 111 PU | 57 PU |

## Options écartées

- **Pixels de 200 m** : 4 fois moins cher, mais un pixel de 4 ha mêle plusieurs champs d'un hectare en moyenne, et les cultures morcelées seraient sous-estimées.
- **Trois bandes** (sans B11) : 20 % de moins encore, mais on perdrait la submersion des rizières (LSWI) et la séparation entre bâti et sol nu.
- **Moins de six passages** : la règle a besoin de la saison sèche, de la levée, du pic et de novembre (coton). Un passage par mois reste le minimum sûr.

## Conséquences

- La passe mensuelle tient dans la part des statistiques avec de la marge : 869 PU, contre 1 694 avant.
- La résolution et le nombre de passages sont des constantes du code (`CROP_AREA_RESOLUTION_M`, `preProcessScenes`) : les relever ou les baisser se mesure avec la formule avant tout essai réel.
- Les surfaces déjà calculées à 100 m restent en base jusqu'au calcul du mois suivant ; la colonne `resolution_m` dit laquelle s'applique.
- Rizières : la règle LSWI est reprise de la littérature. Elle sera vérifiée sur les rizières de bas-fond relevées par les agents (matrice de confusion, ADR-0021).
