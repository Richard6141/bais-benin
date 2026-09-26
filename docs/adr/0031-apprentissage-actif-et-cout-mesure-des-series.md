# ADR-0031 — Cultures par parcelle : culture constatée à la visite, apprentissage actif, coût mesuré des séries

- Statut : acceptée
- Date : 2026-09-27
- Décideurs : chef d'équipe
- Complète : ADR-0030

## Contexte

Le modèle de l'ADR-0030 apprend de déclarations d'exploitations vérifiées, le plus souvent au bureau. Ce sont des étiquettes bruitées : une déclaration vérifiée peut rester fausse sur une parcelle. La meilleure étiquette est la culture que l'agent voit sur place. Or la visite de vérification enregistrait un verdict sur l'exploitation, sans culture par parcelle.

Les visites coûtent du temps d'agent. Elles doivent aller là où le modèle apprend le plus : parcelles incertaines, ou vues autrement que déclarées. C'est l'apprentissage actif.

La première mesure réelle des séries (5 parcelles, 27/09) a donné 0,93 unité par parcelle, là où la formule de l'ADR-0030 annonçait 0,67.

## Décision

1. **Culture constatée à la visite.**
   - La commande hors ligne `verification.record` reçoit un champ facultatif `observedCrops` (parcelle et code de culture). Les appareils plus anciens continuent de fonctionner sans lui.
   - Le serveur vérifie parcelles et cultures avant toute écriture, car un rejet ne défait pas la transaction. Il enregistre ensuite une ligne `parcel_crop_observation` par parcelle, pour la campagne ouverte.
   - Une visite rejetée n'en donne pas.
   - La déclaration n'est pas modifiée : l'écart entre déclaré et vu reste lisible.
2. **Écran de visite** : une étape « Cultures » (quand l'exploitation a des parcelles) montre pour chaque parcelle la culture déclarée et, en cas de désaccord ou de doute, l'avis du satellite (« Satellite : coton, 72 % »). L'agent choisit la culture vue, ou « Non vue ».
3. **Étiquettes, de la plus sûre à la moins sûre** :
   - culture constatée : poids 2 ;
   - déclaration confirmée par une visite de la parcelle : poids 2 ;
   - déclaration d'une exploitation vérifiée au bureau : poids 1.
   Une parcelle rejetée à la visite est écartée. Les poids s'ajoutent à l'équilibrage des classes de la forêt.
4. **Réentraînement chaque nuit** (`POST /api/v1/satellite/crop-model`, 2 h 00 UTC). Une empreinte des données (étiquettes, visites, cultures constatées, séries) évite une nouvelle version quand rien n'a changé. Aucun appel à Copernicus.
5. **File de l'agent** (`/agent/verification`, section « Cultures à confirmer »), dans son seul périmètre, sans culture déjà constatée cette campagne :
   - d'abord les parcelles vues autrement que déclarées, les plus sûres d'abord (déclaration probablement fausse) ;
   - puis les incertaines (confiance sous 0,6), les moins sûres d'abord (là où une visite apprend le plus au modèle).
   Raison lisible : « Satellite : coton, déclaré : maïs, confiance 72 % ».
6. **Coût des séries** :
   - les sorties des scripts passent de flottants 32 bits à des entiers 16 bits (indices × 10 000, décibels × 100), décodés à la lecture ;
   - un plafond mensuel en unités est tenu par la tâche (`CROP_MODEL_MONTHLY_UNIT_CAP`, 600 par défaut), à partir de la dépense de chaque lecture gardée par parcelle (`last_processing_units`) ;
   - lectures étalées : 150 parcelles par jour du 10 au 19 du mois, les vérifiées d'abord.

## Coût mesuré

- **Mesure** : 4,667 unités pour 5 parcelles lues de janvier au 27 septembre, soit 0,93 par parcelle.
- **Plancher** : il porte sur chaque intervalle, pas sur la requête. Un plancher par requête ferait coûter la série Sentinel-2 environ 0,01 unité, pas quelque 0,5.
- **Écart de 40 %** avec la formule : il vient très probablement des sorties en flottant 32 bits, facturées double. Trois indices vont dans ce sens :
  - les surfaces par commune, en entiers 8 bits, suivaient la formule à la décimale près ;
  - le radar sur parcelles du 26/09, en flottant, s'explique par un tel doublement ;
  - un doublement de la seule part Sentinel-2 donne 1,03 unité, proche de la mesure.
- **Attendu en entiers 16 bits** : environ 0,67 unité par parcelle. À confirmer par une nouvelle mesure sur 5 parcelles.
- **Budget des communes pilotes** : 654 parcelles vérifiées font environ 440 unités (610 si le doublement ne tombe pas), donc un mois sous le plafond de 600. Les 723 autres parcelles pilotes suivent le mois suivant. Ensuite, environ 110 unités par mois de compléments.

## Conséquences

- Chaque visite améliore le modèle dès la nuit suivante, là où il hésitait.
- Les parcelles vues autrement que déclarées remontent aussi comme contrôle de la déclaration : une même visite sert le registre et le modèle.
- Le plafond mensuel de la tâche s'ajoute aux parts du compte Copernicus (ADR-0016, R2), sans les remplacer.
