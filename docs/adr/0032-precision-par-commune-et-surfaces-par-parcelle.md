# ADR-0032 — Cultures par parcelle : précision jugée sur des communes jamais vues, accord et surfaces pondérées

- Statut : acceptée
- Date : 2026-09-27
- Décideurs : chef d'équipe
- Complète : ADR-0030, ADR-0031

## Contexte

La précision hors sac de la forêt aléatoire (ADR-0030) juge chaque parcelle avec les arbres qui ne l'ont pas tirée. Ces arbres ont pourtant appris sur ses voisines de la même commune : mêmes nuages, mêmes sols, mêmes dates de semis, mêmes agents qui ont vérifié les déclarations. Les parcelles proches se ressemblent : la précision hors sac flatte le modèle. La littérature de télédétection le montre de façon constante.

Le ministère a besoin d'un chiffre qu'il peut défendre. Le chiffre utile est ce que vaut le modèle sur une commune qu'il n'a jamais vue, car c'est ce qui se passera quand il sera étendu hors des communes pilotes.

Côté surfaces, compter une parcelle incertaine (55 % maïs, 45 % sorgho) comme entièrement du maïs gonfle les cultures dominantes.

## Décision

1. **Précision affichée : validation croisée par commune.**
   - Les communes sont réparties en cinq plis au plus, de tailles proches. Avec les cinq communes pilotes, chacune est laissée de côté à son tour.
   - Pour chaque pli, un modèle est entraîné sur les autres communes, avec les mêmes réglages et les mêmes poids d'étiquette (ADR-0031). Il classe les parcelles d'entraînement de la commune laissée de côté.
   - Calcul à chaque réentraînement de nuit : cinq entraînements de plus, quelques secondes, sans appel à Copernicus.
   - Résultat gardé dans `crop_model.metrics.crossValidation` : paires (référence, culture mesurée), précision par commune, précision des parcelles jugées avec au moins 60 % de confiance.
   - La précision hors sac reste dans les métriques, pour l'équipe. Elle n'est plus affichée.
2. **Référence** : les étiquettes d'entraînement (culture constatée, déclaration confirmée à la visite, déclaration d'une exploitation vérifiée). Elles restent bruitées : une déclaration fausse compte comme une erreur du modèle. Le chiffre tend donc à sous-estimer la précision réelle.
3. **Marge d'erreur** : intervalle de Wilson à 95 %. Les parcelles d'une même commune ne sont pas indépendantes : la vraie marge est plus large. Le tableau par commune en montre l'étendue.
4. **« Quand le modèle est sûr »** : précision des parcelles jugées avec au moins 60 % de confiance, et leur part. C'est le seuil qui sépare l'accord ou le désaccord de l'incertitude (ADR-0030).
5. **Accord avec la déclaration**, par culture déclarée : toutes les parcelles lues des communes pilotes, vérifiées ou non (en accord, différente, incertaine).
6. **Désaccords à vérifier** : les 20 parcelles vues autrement que déclarées avec la plus forte confiance, par leur code et leur commune, sans nom de producteur. Chacune ouvre la carte (`/carte?parcelle=`).
7. **Surfaces par culture**, sur la surface relevée de la parcelle (à défaut, déclarée) :
   - pondérée : chaque parcelle compte pour la probabilité que le modèle donne à la culture. C'est l'espérance de la surface sous le modèle ; elle tient compte des parcelles incertaines ;
   - classée : parcelles dont c'est la culture mesurée ;
   - déclarée : parcelles dont c'est la culture déclarée.
8. **Face à la carte des pixels**, par commune et par classe de la carte (ADR-0021) : surface pondérée des parcelles mesurées face à la surface vue par les pixels. La part couverte (au-delà de 50 ha vus) est un taux d'enrôlement vu par satellite, pas une erreur : les parcelles ne couvrent que les exploitations enregistrées. La carte des pixels reste à ne pas citer tant qu'elle n'est pas calée (ADR-0027).

## Chiffres sur la fixture (27/09, base de travail)

- 654 parcelles d'entraînement, cinq plis.
- Validation croisée par commune : 86,5 % (marge de 83,7 à 89,0 %). Hors sac : 89,4 %.
- Avec au moins 60 % de confiance : 90,8 %, sur 80 % des parcelles.
- Par commune laissée de côté : de 81 % (Tanguiéta) à 94 % (Ségbana).
- La fixture ne simule presque pas d'effet propre à chaque commune : l'écart entre hors sac et validation par commune y est faible. Il sera plus large sur les séries réelles, et c'est ce chiffre-là qu'il faudra citer.

## Conséquences

- Le réentraînement de nuit fait six entraînements au lieu d'un. À l'échelle nationale (dizaines de milliers de parcelles), on pourra réduire le nombre d'arbres des plis sans toucher au modèle servi.
- Avec une seule commune, aucune précision n'est affichée (« Pas encore »).
- Une commune où la précision tombe dit où le modèle généralise mal : c'est là que les visites de l'apprentissage actif (ADR-0031) apprennent le plus.
- Aucune table ni migration, aucun coût Copernicus.
