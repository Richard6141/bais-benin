# ADR-0025 — Carte des cultures : pixels hors contour, couverture par trace, carte calculée hors requête

- Statut : acceptée
- Date : 2026-09-27
- Décideurs : chef d'équipe
- Complète : ADR-0021 et ADR-0023

## Contexte

Trois défauts sont apparus dès les premières mesures réelles.

1. **Part « non classée » de 35 à 49 %** sur les cinq communes de l'Alibori mesurées, pourtant peu nuageuses. Le script de l'API Statistical rendait `dataMask` à 1 pour tous les pixels du rectangle englobant, y compris hors du contour de la commune. La part non classée valait donc exactement la part du rectangle hors commune (Banikoara : 1 − 4 386 / 7 906 km² = 44,5 %). Toutes les surfaces par classe étaient sous-estimées d'autant.
2. **Un seul passage par mois ne couvre qu'une trace Sentinel-2.** Une trace fait 290 km de large et les traces voisines sont espacées d'environ 275 km. Un seul passage par mois laisse donc sans image, ce mois-là, la partie d'une commune ou du pays vue par l'autre trace. Une zone à cheval sur deux traces perdait ainsi environ la moitié de ses mois.
3. **La carte du pays expirait** : douze mois de série par pixel sur tout le pays dépassent le délai de 30 s d'une requête de visiteur. La route renvoyait 204 et la carte restait vide.

## Décision

1. **Pixels hors du contour écartés** : le script rend `dataMask` à 0 quand aucun échantillon du pixel n'est dans la géométrie. La part non classée ne compte plus que les pixels de la commune vus moins de quatre mois.
2. **Un passage par mois et par trace** : une même trace est survolée tous les cinq jours, donc le jour modulo 5 la désigne sans lire de métadonnée. `preProcessScenes` garde le passage le moins nuageux de chaque trace, chaque mois. Quand deux traces voient le même pixel, la règle lit le moins nuageux.
3. **Version de méthode** (`method_version`, 2) sur `crop_area_estimate` : une estimation d'une version antérieure est refaite au lot suivant, même dans le mois.
4. **Carte calculée hors requête**, en quatre quarts du pays de 500 px de large :
   - une commande planifiée (`POST /api/v1/satellite/crop-map`, du 1er au 8 du mois) calcule les quarts manquants avec un délai de 200 s chacun, et les garde en cache jusqu'au mois suivant ;
   - la route publique (`/api/satellite/cultures/12-mois/q0.png` à `q3.png`) ne sert que le cache ;
   - la légende affiche « Carte en préparation » tant qu'aucun quart n'est prêt.
5. **Garde-fous de durée** : le lot des surfaces s'arrête après 200 s (`time-budget`), et chaque requête de commune a 90 s. Le lot suivant reprend.

## Conséquences

- **Coût des surfaces** : une commune vue par une seule trace coûte autant qu'avant ; une commune à cheval sur deux traces coûte le double. Estimation : environ 1 100 PU par passe nationale (14 par commune en moyenne) au lieu de 870. Les cinq communes déjà mesurées sont refaites une fois (environ 180 PU).
- **Coût de la carte** : environ 50 PU par quart, soit 120 à 300 PU par mois selon le nombre de traces par quart, dans la part des images.
- **Surfaces** : elles remontent d'autant que le rectangle débordait du contour, soit de +55 % (Gogounou) à +80 % (Banikoara) sur les communes mesurées de l'Alibori. Les estimations d'avant la version 2 ne doivent pas être citées.
