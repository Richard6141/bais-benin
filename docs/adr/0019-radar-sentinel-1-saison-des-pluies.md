# ADR-0019 — Radar Sentinel-1 pour la saison des pluies

- Statut : acceptée
- Date : 2026-09-26
- Décideurs : Utilisateur (ministère), chef d'équipe
- Complète : ADR-0016

## Contexte

La confrontation déclaration / satellite (ADR-0016) lit le NDVI de Sentinel-2. De juin à septembre, le pays n'a que 45 à 70 scènes optiques dégagées par mois, contre 200 à 360 en saison sèche. Beaucoup de parcelles restent donc « trop de nuages pour conclure », justement pendant la grande saison. Le radar Sentinel-1 voit à travers les nuages.

## Décision

- **Source et traitement** : Sentinel-1 GRD depuis le Copernicus Data Space Ecosystem, par la même API Statistical, le même compte et les mêmes garde-fous de quota qu'ADR-0016 (parts, unités de traitement, limite par minute). Rien n'est traité localement.
- **Paramètres de mesure** :
  - mode IW en double polarisation VV + VH, 10 m ;
  - rétrodiffusion `GAMMA0_TERRAIN` orthorectifiée sur le MNT Copernicus 30 m, pour les reliefs de l'Atacora ;
  - filtre de Lee 3 × 3 ;
  - un seul sens d'orbite (descendante) pour que les dates se comparent ;
  - un pas de 12 jours.
- **Indicateur** : indice de végétation radar RVI = 4·VH / (VV + VH), en puissances linéaires, de 0,2 au sol nu à 0,5 ou 0,6 en plein couvert. La rétrodiffusion VH (dB) est gardée en contrôle.
- **Sentinel-2 reste la source principale** : le radar ne tranche que si Sentinel-2 n'a pas pu conclure (verdict « trop de nuages »). Il a sa propre réservation, dans la part des statistiques.
- **Règle** : même règle que le NDVI (pic, amplitude, couvert durable), avec des seuils propres au RVI par catégorie de culture, tirés de la littérature et **à calibrer** sur le pilote terrain et une saison complète.
- **Traçabilité** : un verdict radar porte le capteur `S1`, la source `COPERNICUS_S1` (fiabilité `ESTIMATED`) et sa série radar, gardée à part de la série optique. « À vérifier » ne conclut jamais à une fausse déclaration, radar compris.
- **Activation progressive** : `SATELLITE_RADAR_FALLBACK=0` par défaut. La commande `POST /api/v1/satellite/radar-calibration?limit=20` (protégée par `CRON_SECRET`) mesure d'abord les unités de traitement consommées par requête radar, que la documentation CDSE ne chiffre pas pour la correction de terrain. Le radar n'est activé qu'ensuite, et l'interface indique alors « d'après le radar Sentinel-1 ».

## Conséquences

- **Plus de conclusions** : en saison des pluies, la plupart des parcelles aujourd'hui « trop de nuages » reçoivent un verdict. Le coût est une requête de plus par parcelle concernée, dans la part des statistiques.
- **Limites** :
  - l'humidité du sol après une pluie fait monter le signal, d'où le jugement sur l'amplitude de la saison et un seul sens d'orbite ;
  - arbres et parcs arborés renvoient un signal fort et durable ;
  - le radar dit que quelque chose pousse, pas quelle culture ;
  - sous 0,4 ha, pas de verdict, pour le radar comme pour l'optique.
- **Suite** : calibration des seuils radar ; signature de mise en eau du riz de bas-fond (chute de VV) ; affichage de la source radar dans le pilotage et sur la fiche de l'agent.
