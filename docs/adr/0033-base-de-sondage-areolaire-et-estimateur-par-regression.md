# ADR-0033 — Surfaces par culture : base de sondage aréolaire et estimateur par régression

- Statut : acceptée
- Date : 2026-09-27
- Décideurs : chef d'équipe
- Complète : ADR-0021, ADR-0030, ADR-0032

## Contexte

Le ministère veut des surfaces par culture défendables, chacune avec sa marge d'erreur, sa méthode, sa source et sa date. Ce que la plateforme sait aujourd'hui ne suffit pas :

- **La carte des pixels** (ADR-0021) couvre tout le territoire mais se trompe : elle confond cultures, jachères et savane, et reste « à ne pas citer » (ADR-0027). Elle n'a pas de marge d'erreur.
- **Le registre et les cultures par parcelle** (ADR-0030 à 0032) sont précis sur les parcelles enregistrées, mais ces parcelles ne sont pas un échantillon : elles viennent des exploitations qui se sont fait enregistrer. On ne peut pas en déduire la surface d'une commune.

La méthode des services statistiques agricoles (FAO, USDA, programme européen LUCAS et MARS) répond à ce problème : un **échantillon probabiliste du territoire** (base de sondage aréolaire), observé sur le terrain, et la carte satellite comme **variable auxiliaire** d'un estimateur par régression. Le terrain garantit l'absence de biais, la carte réduit la marge d'erreur.

## Décision

### 1. Base de sondage : des points tirés sur le territoire

- **Unité** : un point du territoire, pas une parcelle ni une exploitation. L'agent y constate l'occupation du sol. Un point ne désigne aucun producteur.
- **Tirage** : dans chaque commune d'enquête, une grille systématique à origine aléatoire, dans une projection métrique (UTM 31 N), gardée si le point tombe dans la commune. L'écart de la grille donne environ `n` points : `écart = √(surface / n)`. Chaque point du territoire a la même chance d'être tiré ; la grille étale l'échantillon sur toute la commune.
- **Origine** : tirée d'une graine propre à la campagne et à la commune. Le tirage est reproductible et ne se refait pas en cours de campagne.
- **Taille, première campagne** : 120 points par commune pilote, 600 au total, soit un écart de 5 à 8 km.
- **Strates** : les communes. Chaque commune est estimée à part, les communes s'additionnent.

### 2. Observation sur le terrain

- L'agent voit les points de ses communes, avec leurs coordonnées et un lien vers la carte.
- Sur place, à moins de **50 m** du point (position du téléphone, distance vérifiée par le serveur), il note l'occupation du sol **au point même**, pas celle du champ voisin :
  - culture, avec la culture présente au point (la dominante en cas d'association) ;
  - jachère ou sol nu, végétation naturelle (savane, forêt), eau, bâti ;
  - ou « inaccessible », avec la raison (rivière en crue, refus, zone dangereuse).
- Fenêtre conseillée, saison principale des communes pilotes (une seule saison des pluies au centre et au nord) : du 15 juillet au 30 septembre.
- Commande hors ligne, comme les visites (ADR-0005) : l'agent enregistre sans réseau, la synchronisation envoie.
- Un point inaccessible est une non-réponse. Il est exclu du calcul, et le taux de réponse est affiché : au-delà de 10 % de non-réponse, le chiffre de la commune est signalé.

### 3. Variable auxiliaire : la carte des pixels au point

- Pour chaque point tiré, la classe de la carte des pixels est lue par la même méthode que les surfaces par commune : même script, même résolution (120 m), mêmes douze mois, même version de méthode. Un pixel non classé compte comme « pas cette classe ».
- La moyenne de cette variable sur toute la commune est connue : c'est la part de la classe dans les surfaces par commune (`crop_area_estimate.pixel_share`).
- Coût : environ 0,16 unité par point (surface minimale facturée), soit environ 100 unités pour les 600 points, une fois par campagne. À refaire seulement si la version de méthode de la carte change.

### 4. Estimateur par régression (Cochran, chapitre 7)

Pour une commune de surface `A`, une culture `g` et les `n` points observés :

- `yᵢ = 1` si l'agent a vu la culture `g` au point, sinon 0 ;
- `xᵢ = 1` si la carte y voit la classe de `g` (maïs, soja, niébé et igname tombent dans « cultures annuelles »), sinon 0 ;
- `X̄` = part de cette classe dans la commune, selon la carte.

Estimation de la part de la culture :

`p̂ = ȳ + b (X̄ − x̄)`, avec `b = Sxy / Sxx` (pente de y sur x dans l'échantillon).

Surface : `A × p̂`, bornée à [0, A].

Variance : `V(p̂) = s²ₑ / n`, avec `s²ₑ = Σ eᵢ² / (n − 2)` et `eᵢ = yᵢ − ȳ − b (xᵢ − x̄)`.

- Écart type de la surface : `A √V`. Marge à 95 % : ± 1,96 écart type. Coefficient de variation (CV) : écart type / surface.
- **Estimateur direct** (sans la carte), pour comparaison et en repli : `p̂ = ȳ`, `V = s²ᵧ / n`. Le gain de la carte est le rapport des deux variances, environ `1 / (1 − r²)`.
- **Repli sur l'estimateur direct** quand la carte ne peut pas servir d'auxiliaire : pas de surface par commune pour la campagne, version de méthode différente de celle des points, pente indéfinie (tous les points dans la même classe), ou surface corrigée par le radar (ADR-0026 : les parts de riz, cultures annuelles, jachère et savane n'y sont plus celles de l'optique).
- Plusieurs communes : surfaces et variances s'additionnent (échantillons indépendants).
- La variance d'un tirage systématique est calculée comme celle d'un tirage aléatoire simple. C'est l'usage ; elle est d'ordinaire un peu pessimiste.

### 5. Ce qu'on affiche, et quand on peut le citer

Par culture, pour les communes d'enquête et pour chaque commune : surface estimée, marge à 95 %, CV, nombre de points, gain de la carte. Face à elle : la surface de la carte (`A × X̄`), celle des parcelles mesurées (ADR-0032) et celle déclarée au registre.

- CV de 10 % au plus : à citer, avec sa marge ;
- de 10 à 20 % : indicatif ;
- au-delà de 20 %, ou moins de 30 points observés : à ne pas citer.

Ordres de grandeur, pour une culture qui couvre 10 % d'une commune et 120 points : CV d'environ 27 % sans la carte, 19 % avec une carte corrélée à 0,7. Sur les cinq communes réunies : 12 % et 9 %. Pour l'ensemble des cultures (35 % du territoire) : 12 % par commune, 4 % sur les cinq communes avec la carte. **Les chiffres des cinq communes réunies sont citables pour les grandes cultures dès la première campagne ; ceux d'une commune seule restent indicatifs.**

## Alternatives écartées

- **Extrapoler le registre** : biais inconnu, les exploitations enregistrées ne sont pas un échantillon.
- **Segments** (carrés de 500 m levés en entier par l'agent) : plus d'information par visite, mais un levé de chaque champ du carré, trop lourd pour la première campagne. À reconsidérer quand les agents lèveront les contours en routine.
- **Strates par classe de la carte** (méthode d'Olofsson) : demande la classe de la carte en chaque point de la base, soit des milliers de lectures. La régression tire le même profit de la carte avec la seule classe des points tirés.

## Conséquences

- Nouvelles tables : points tirés (`area_frame_point`, avec la classe de la carte) et observations (`area_frame_observation`). Aucune donnée nominative.
- Une tâche lit la classe de la carte aux points tirés, sous plafond ; une autre tire les points d'une commune d'enquête, une fois par campagne.
- Un écran agent (« Points d'enquête ») et un volet « Sondage » sur `/pilotage/cultures`.
- Le passage à l'échelle nationale est une affaire de taille d'échantillon : environ 3 000 à 5 000 points pour des chiffres par département à 10 % près sur les grandes cultures. Ce sera décidé après la première campagne, sur les CV observés.
- La production (surface × rendement) et le rapprochement avec les statistiques officielles viennent au lot suivant.
