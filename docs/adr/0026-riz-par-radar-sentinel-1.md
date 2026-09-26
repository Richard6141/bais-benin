# ADR-0026 — Riz par radar Sentinel-1 dans les surfaces par commune

- Statut : acceptée
- Date : 2026-09-27
- Décideurs : Utilisateur (ministère), chef d'équipe
- Complète : ADR-0019, ADR-0021, ADR-0023 et ADR-0025

## Contexte

Le riz du Bénin pousse surtout dans les bas-fonds, en pleine saison des pluies, quand Sentinel-2 ne voit presque rien. La carte optique (ADR-0021) le reconnaît à la submersion suivie d'un couvert dense. Encore faut-il qu'un passage dégagé tombe au bon mois, ce qui est rare de juin à septembre. Les surfaces de riz sont donc probablement sous-estimées. L'utilisateur a demandé le radar « pour le riz seulement », après la carte optique.

## Décision

1. **Règle radar par pixel**, calculée par Copernicus sur Sentinel-1 GRD, orbites descendantes, rétrodiffusion corrigée du relief (GAMMA0_TERRAIN), filtre de chatoiement Lee 5 × 5 :
   - un passage par mois et par trace, de mai à novembre (une même trace est survolée tous les six jours : jour modulo 6) ;
   - rizière : un mois de mai à septembre où VH ≤ −19 dB (eau libre au repiquage), suivi dans les deux mois d'un VH ≥ −17 dB remonté d'au moins 4 dB (couvert de riz) ;
   - écartés : moins de quatre mois vus, et plan d'eau permanent (VH ≤ −20 dB presque tous les mois) ;
   - bande VH seule : un tiers d'unité par passage.
2. **Surface par commune** : histogramme riz / pas riz par l'API Statistical, pixels de 120 m, pixels hors contour écartés, pour environ 2 PU de plus par commune. La saison lue est la dernière commencée, de mai à novembre.
3. **Fusion au niveau de la commune** :
   - la part de riz retenue est la plus grande de l'optique et du radar ;
   - l'écart est repris sur les cultures annuelles, puis la jachère, puis la savane, là où une rizière vue sous les nuages était rangée ;
   - la part radar est gardée à part (`radar_rice_share`, ligne RICE), et la page du ministère signale « riz complété par le radar Sentinel-1 ».
4. **Interrupteur** `SATELLITE_RADAR_RICE`, désactivé par défaut. Il s'active après une mesure réelle (`POST /api/v1/satellite/crop-areas?limit=2`) qui vérifie le coût et la vraisemblance des parts de riz.

## Options écartées

- **Fusion pixel par pixel** dans un seul script Sentinel-1 + Sentinel-2 : plus juste, mais les deux capteurs ont des dates différentes, et l'accès aux dates de chaque source dans un script de fusion n'a pas pu être vérifié sans compte. À reprendre une fois la règle radar validée seule.
- **Carte du riz radar** : ajoutée plus tard si la mesure est concluante. La carte reste optique.

## Conséquences

- Coût : environ 150 PU de plus par passe nationale, dans la part des statistiques.
- Le riz ne peut que monter par rapport à l'optique seule : un faux positif du radar (zone humide qui reverdit) gonfle le riz. La matrice de confusion (parcelles de riz vérifiées) et la mesure réelle diront s'il faut resserrer les seuils (`RICE_WET_DB`, `RICE_RISE_DB`, `RICE_CANOPY_DB`).
