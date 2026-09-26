# ADR-0020 — Prévision des récoltes par surfaces semées et rendements observés

- Statut : acceptée
- Date : 2026-09-26
- Décideurs : chef d'équipe, Backend/Data

## Contexte

La feuille de route nationale demande à l'État d'anticiper les récoltes de la campagne en cours,
par culture et par territoire, pour préparer stocks, importations ou exportations avant la fin de
la saison. La plateforme connaît les surfaces semées déclarées de la campagne en cours, les
récoltes déclarées des campagnes closes et, depuis ADR-0016, un contrôle satellite de la
végétation par parcelle.

## Options étudiées

1. **Modèle statistique ou appris (météo, NDVI, historique)** : plus précis à terme, mais il faut
   plusieurs saisons de récoltes réelles pour l'étalonner ; aujourd'hui il n'aurait rien de solide
   sur quoi apprendre.
2. **Surfaces semées × rendements observés, avec fourchette empirique** : explicable à un
   décideur, recalculable à la main, honnête sur son incertitude. Retenu comme première version.

## Décision

- Pour chaque culture et chaque commune de la campagne : surface semée × rendement de référence.
- Rendement de référence : celui des deux dernières campagnes closes (récolte déclarée ÷ surface
  de la parcelle), pris au niveau le plus fin qui compte au moins 5 récoltes déclarées — commune,
  sinon département, sinon pays, sinon le rendement type de la culture (référentiel).
- Fourchette : du premier au troisième quartile des rendements par parcelle au même niveau. Les
  bornes sont additionnées quand on agrège, ce qui élargit volontairement la fourchette.
- Confiance : part de la surface dont le rendement vient de sa propre commune (élevée ≥ 70 %,
  moyenne ≥ 30 %, faible sinon).
- Comparaison : la campagne précédente est estimée de la même façon avec ses propres rendements ;
  une baisse de 15 % ou plus signale un déficit probable.
- Satellite : la part des parcelles contrôlées dont la végétation ne correspond pas à la culture
  déclarée est affichée comme signal de risque ; elle ne modifie pas le chiffre, faute
  d'étalonnage.
- Accès : ministère seulement (portée nationale, `analytics.read` et `requireNational`), page
  `/pilotage/previsions`, détail par département pour une culture.

## Conséquences

- La prévision ne vaut que ce que valent les déclarations de semis ; une campagne peu déclarée
  sous-estime la production. La page le dit.
- Le bilan alimentaire (besoins = population × consommation par habitant) n'est pas encore
  calculé : il faudra les données de l'INStaD.
- Quand plusieurs saisons de récoltes vérifiées et de séries NDVI seront disponibles, un modèle
  étalonné pourra remplacer le rendement de référence sans changer la page.
