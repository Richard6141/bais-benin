# ADR-0037 — Enquête aréolaire stratifiée par la carte des cultures (tirage à deux phases)

- Statut : acceptée
- Date : 2026-09-27
- Décideurs : chef d'équipe
- Complète : ADR-0033, ADR-0035, ADR-0036

## Contexte

L'enquête aréolaire (ADR-0033) tire 120 points par commune avec une grille à égale probabilité, puis corrige leur moyenne par la carte des pixels (estimateur par régression). Pour le bilan alimentaire (ADR-0035), la cible qui compte est la part des céréales, racines et tubercules. Elle ne couvre que 3 à 10 % d'une commune. Sur 120 points à égale probabilité, l'agent n'en voit donc que 4 à 12. C'est trop peu :

- sous 10 points positifs, une surface n'est jamais citée (ADR-0033, `MIN_POSITIVES_TO_CITE`) ;
- sous 5 points vivriers, la commune n'est pas évaluée (ADR-0036).

Ajouter des points coûte des visites de terrain. Le levier est de mieux placer les mêmes 120 points : davantage là où les cultures vivrières se trouvent, avec des poids de sondage qui gardent l'estimation sans biais.

ADR-0033 avait écarté la stratification par la carte, parce qu'elle demande la classe de la carte en chaque point de la base. La solution des services statistiques est le **tirage à deux phases**. Le programme européen LUCAS l'applique : une grille dense est classée sans visite (photo-interprétation chez LUCAS, la carte des pixels ici), puis on tire un sous-échantillon stratifié pour le terrain. La lecture de la carte ne porte alors que sur les points de la grille dense, pas sur tout le territoire.

## Décision

### 1. Première phase : une grille dense classée par la carte

- Dans chaque commune d'enquête, une grille systématique à origine aléatoire, comme en ADR-0033 (UTM 31 N, graine propre à la campagne et à la commune). Elle est **quatre fois plus dense** : `n′ = 4 × 120 = 480` points, soit un écart d'environ 2,5 km pour une commune de 3 000 km².
- La classe de la carte des pixels est lue à chacun de ces points, par la tâche existante et la même méthode (ADR-0033 §3). Cela coûte environ 0,16 unité par point :
  - 77 unités par commune ;
  - 384 unités pour les cinq communes pilotes, une fois par campagne, soit 4 % du budget mensuel de 9 000 unités.
- Sur Copernicus, la lecture attend toujours `SURVEY_MAP_READS=1`. Le rythme planifié (100 lectures par jour, du 20 au 26 du mois) ne suffit pas pour les 2 400 points d'une nouvelle campagne : pour ouvrir une campagne, la tâche est appelée avec `limit=500` pendant une semaine. C'est une décision du chef d'équipe, comme toute passe réelle.
- Les points de première phase ne sont pas montrés aux agents.

### 2. Deux strates

- **Cultures annuelles** : la carte voit au point la classe « cultures annuelles » ou « riz ». Ce sont les deux classes des céréales, racines et tubercules (cible `STAPLES`).
- **Autres terres** : toutes les autres classes, non classé compris.

La strate d'un point est **figée** au moment du tirage de la seconde phase. Une nouvelle version de la carte ne la change plus : les poids de sondage restent ceux du tirage.

### 3. Seconde phase : allocation de Neyman avec plancher

Les 120 points à visiter sont répartis entre les strates par l'**allocation de Neyman** (Cochran, 1977, §5.5) : `n_h ∝ W_h S_h`. Elle est calculée pour la part vivrière, la cible du bilan alimentaire.

- `W_h` est le poids de la strate (§4).
- `S_h = √(P_h (1 − P_h))`, avec `P_h` la part vivrière attendue dans la strate. Première campagne : 0,5 dans les cultures annuelles, 0,05 dans les autres terres. La strate des cultures annuelles est ainsi échantillonnée environ 2,3 fois plus densément que les autres terres.
- **Plancher** : au moins 20 points par strate, ou tous ses points de première phase s'il y en a moins. Au-dessus du plancher, le reste est réparti selon Neyman. Aucune strate ne reçoit plus de points qu'elle n'en a en première phase. Les arrondis vont aux plus grands restes, et le total reste 120.
- **Dans chaque strate**, tirage systématique le long de la grille, du nord au sud puis d'ouest en est. Le départ est aléatoire, tiré d'une graine propre à la campagne, à la commune et à la strate. Les points restent ainsi étalés sur toute la commune.

### 4. Poids des strates et poids de sondage

Le poids `W_h` d'une strate est sa part de la commune :

- **Connu** : la part des classes de la strate dans les surfaces par commune (`crop_area_estimate.pixel_share`). Il n'est utilisé que si la carte est compatible avec celle des points :
  - même version de méthode ;
  - pas de correction du riz par le radar (ADR-0026) ;
  - un écart avec la part mesurée en première phase de moins de trois écarts types, soit `|W_h − w_h| ≤ 3 √(w_h (1 − w_h) / n′)`.
- **Sinon, estimé** par la première phase : `w_h = n′_h / n′` (estimateur à deux phases, §5).

Le **poids de sondage** d'un point constaté de la strate `h` est `d = A × W_h / n_h` hectares. Ici `A` est la surface de la commune et `n_h` le nombre de points constatés de la strate. Un point de la strate des cultures annuelles, plus souvent tiré, représente donc moins d'hectares qu'un point des autres terres. Un point inaccessible est une non-réponse : il sort du calcul de sa strate, et les poids de la strate sont recalculés sur les points constatés.

### 5. Estimateur stratifié

Pour une cible `g` (une culture, les cultures vivrières, les terres cultivées), `ȳ_h` est la part des points constatés de la strate où l'agent voit `g`, et `s²_h` sa variance d'échantillon.

- Part estimée : `p̂ = Σ W_h ȳ_h`, bornée à [0, 1]. Surface : `A × p̂`.
- Variance avec des poids connus : `V = Σ W_h² s²_h / n_h`.
- Variance avec des poids estimés (double échantillonnage pour la stratification, Cochran 1977, §12.2 et 12.3, Rao 1973, population de points infinie) :
  `V = Σ [(n′_h − 1) / (n′ − 1)] w_h s²_h / n_h + [1 / (n′ − 1)] Σ w_h (ȳ_h − p̂)²`.
  Le second terme est le prix de ne connaître les poids que par la première phase.
- Une strate sans point constaté, ou avec un seul, ne permet pas de calcul : la cible n'a pas d'estimation dans la commune.
- **Gain affiché** : le rapport entre la variance d'un tirage simple de même taille, `p̂ (1 − p̂) / n`, et `V`.
- Plusieurs communes : surfaces et variances s'additionnent, comme en ADR-0033.
- Les points positifs comptés pour les seuils de citation (10 points, ADR-0033) et d'évaluation (5 points vivriers, ADR-0036) restent des nombres de points, sans pondération. Ils disent si la variance est fiable.

### 6. Enquêtes déjà tirées

Une commune tirée selon ADR-0033, sans strate, garde son tirage et son estimateur par régression. Rien n'est retiré en cours de campagne. Les deux types de communes peuvent coexister dans une même campagne : les totaux additionnent les communes, et la méthode affichée est alors « mixte ».

## Ordres de grandeur

Commune type, 120 points : les cultures annuelles de la carte couvrent 10 % des terres, et la part vivrière est de 8 %. Une culture vivrière est vue sur 60 % des points de la strate des cultures annuelles, et sur 2,2 % des autres.

| Méthode | Points de cultures annuelles | Points vivriers attendus | CV de la part vivrière |
| --- | --- | --- | --- |
| Tirage simple, estimateur direct | 12 | 10 | 31 % |
| Tirage simple, régression (ADR-0033) | 12 | 10 | 24 % |
| Stratifié, poids estimés en première phase | 24 | 16 | 23 % |
| Stratifié, poids connus par la carte | 24 | 16 | 21 % |

Le gain de précision reste modeste pour une commune seule. Le gain décisif porte sur le nombre de points vivriers, qui passe au-dessus des seuils de citation et d'évaluation dans la plupart des communes. Sur les cinq communes réunies, le CV de la part vivrière passe d'environ 11 % à 9 % : il devient citable (10 % au plus).

## Alternatives écartées

- **Raster de classes par commune** (une requête Process API par commune au lieu de 480 lectures de points) : moins d'unités, mais un nouveau chemin chez le fournisseur et dans la fixture. À reconsidérer au passage à l'échelle nationale (des milliers de points).
- **Post-stratification du tirage actuel** : elle réduit un peu la variance, mais n'ajoute aucun point vivrier.
- **Plus de points à égale probabilité** : il en faudrait environ 1,7 fois plus pour le même nombre de points vivriers, donc 1,7 fois plus de visites.
- **WorldCereal 2021 comme couche de stratification** : gratuite et plus fine (75 m), mais elle date de 2021 et ne connaît que les cultures temporaires. Elle reste un repli possible si la lecture de la carte n'est pas autorisée.

## Conséquences

- `area_frame_point` gagne :
  - la strate du point (`stratum`, nulle pour un tirage ADR-0033 ou un point pas encore stratifié) ;
  - un drapeau de seconde phase (`selected`, vrai pour les points déjà tirés).
- Seuls les points de seconde phase sont montrés aux agents et acceptent un constat. Les points de première phase déjà stratifiés ne sont plus relus par la carte.
- La tâche de l'enquête tire la seconde phase d'une commune dès que tous ses points de première phase ont leur classe.
- La démonstration refait ses communes d'enquête en tirage stratifié, sauf une commune qui porte un vrai constat ou une vraie lecture de la carte.
- À partir de la deuxième campagne, les parts attendues `P_h` pourront venir des constats de la campagne précédente.
