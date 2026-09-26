# ADR-0027 — Carte des cultures : règle plus sévère pour « cultivé » et avertissement tant qu'elle n'est pas calée

- Statut : acceptée
- Date : 2026-09-27
- Décideurs : chef d'équipe
- Complète : ADR-0021, ADR-0023 et ADR-0025

## Contexte

La première passe nationale réelle a donné des surfaces non crédibles :

- 6,14 M ha « cultivés », soit environ 53 % du pays ;
- dont 3,85 M ha de maïs et d'annuelles et 2,02 M ha de coton ;
- 1,84 M ha dans le seul Alibori.

Les ordres de grandeur publics sont d'environ 3 M ha de terres arables, et de 0,6 à 0,7 M ha de coton par campagne.

Cause : une savane soudanienne du nord est sèche l'hiver (NDVI 0,2 à 0,3), verte de juillet à octobre et culmine en septembre. Elle remplissait tous les critères d'une culture annuelle (sol clair en saison sèche, amplitude, quatre mois verts au plus), et ceux du coton quand elle culminait en septembre. Une simulation sur la règle réelle, avec bruit et nuages, le montre : 97 % des pixels de savane arbustive sortaient « cultivés », soit 74 % d'un paysage type du nord où la vraie part cultivée est de 25 %.

## Décision

1. **Montée rapide exigée** d'une culture annuelle ou du coton :
   - on repère le premier mois vert d'avril à novembre (NDVI ≥ 0,5, abaissé dans les zones sèches) ;
   - deux mois plus tôt (trois à défaut), le NDVI doit être ≤ 0,35 (sol nu ou juste semé), et la montée d'au moins 0,25 ;
   - un champ passe du sol nu au couvert en deux mois, alors qu'une savane reverdit progressivement dès les premières pluies.
2. **Amplitude minimale portée à 0,30** (abaissée dans les zones sèches), et coton seulement si juin reste sous 0,35.
3. **Savane saisonnière** : une saison verte nette sans montée rapide est classée forêt et savane, et non plus jachère.
4. **Version de méthode 3** (`method_version`) : toutes les surfaces sont refaites à la passe suivante. La clé de cache de la carte change aussi.
5. **Avertissement** tant que la règle n'est pas calée sur les parcelles vérifiées (`CROP_MAP_CALIBRATED`, faux) : en tête de `/pilotage/cultures`, « Surfaces en cours de calibrage, probablement surestimées : à ne pas citer ». La légende de la carte le rappelle, et « Estimation satellite, à confirmer » reste en bas. Le passage à vrai est une décision du ministère, après une passe réelle jugée crédible et une matrice de confusion réelle.

## Mesure (synthétique, sans appel réel)

Part des pixels vus « cultivés », 4 000 pixels par type, deux ou trois passages par mois, nuages de saison des pluies :

| Type | Avant | Après |
|---|---|---|
| Maïs du nord | 77 % | 64 % |
| Coton du nord | 97 % | 63 % |
| Sorgho clair | 51 % | 42 % |
| Savane arbustive | 97 % | 5 % |
| Savane brûlée en saison sèche | 91 % | 19 % |
| Savane herbeuse | 76 % | 29 % |
| Paysage type du nord (25 % de cultures) | 74 % | 24 % |

Ces chiffres viennent de courbes synthétiques. Ils montrent le sens et l'ordre de grandeur de la correction, pas la précision réelle. Celle-ci se mesurera sur les parcelles vérifiées (`POST /api/v1/satellite/crop-accuracy`).

## Conséquences

- Les surfaces cultivées baissent fortement dans le nord ; le coton surtout.
- Le rappel des cultures baisse aussi (environ deux champs sur trois reconnus en simulation) : la règle préfère manquer un champ que compter une savane. À recaler sur la matrice réelle.
- La colonne « Non classé » reste proche de 0 %, et c'est juste : il faut moins de quatre mois dégagés sur douze pour qu'un pixel ne soit pas classé, et la saison sèche en donne toujours assez. L'incertitude de la saison des pluies ne s'y lit pas ; elle se lit dans la matrice de confusion.
