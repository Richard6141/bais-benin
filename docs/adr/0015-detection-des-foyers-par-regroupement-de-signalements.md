# ADR-0015 — Détection des foyers par regroupement de signalements, dans le moteur de règles

- Statut : acceptée, corrigée le 2026-09-26 (revue de sécurité des phases 0 à 2)
- Date : 2026-09-26
- Décideurs : Chef d'équipe (feuille de route validée par l'utilisateur), Architecte

## Contexte

Depuis la phase 0, les producteurs signalent ravageurs, maladies des cultures et maladies animales
sur leurs parcelles (`field_report`, docs/modules/signalements.md). Un signalement isolé n'est
jamais une alerte : il prévient l'agent de l'exploitation. Mais plusieurs signalements du même
type, proches dans l'espace et dans le temps, annoncent une épidémie probable, qu'il faut signaler
à toute la zone avant la visite de l'agent. La feuille de route fixe des valeurs de départ
(3 signalements, 5 km, 7 jours) et demande qu'elles restent réglables par le ministère, comme les
seuils météo, et que la diffusion existante (agents, WhatsApp, relais) soit réutilisée.

Le moteur d'alertes (ADR-0011) évalue chaque jour des règles déclaratives par commune, à partir
d'indicateurs calculés d'avance (pluie, température, cultures présentes), avec une alerte active
au plus par catégorie et par commune, un délai de refroidissement, une trace expliquée en
français et un éditeur de seuils généré depuis l'arbre de conditions.

## Options étudiées

1. **Détection à part du moteur** (tâche dédiée qui crée les alertes) : écartée, elle aurait
   dupliqué ce que le moteur fait déjà (refroidissement, une alerte par catégorie, trace,
   simulation, diffusion, gouvernance des règles par le ministère).
2. **Indicateurs à nom fixe** (`report_pest_5km_7d`) : écartée, le rayon et la durée ne seraient
   pas réglables sans ajouter un indicateur par combinaison.
3. **Indicateur paramétré dans le langage de règles** : retenue.

## Décision

- **Indicateur `report_cluster`**, numérique, avec des paramètres portés par la condition :
  `{ "indicator": "report_cluster", "params": { "type": "PEST", "radiusKm": 5, "days": 7 },
  "op": ">=", "value": 3 }`. Sa valeur pour une commune : le plus grand nombre d'**exploitations
  distinctes** ayant signalé ce type de problème à moins de `radiusKm` d'un signalement de la
  commune, pendant les `days` jours qui se terminent à la date de référence. Les signalements
  écartés après visite ne comptent jamais ; `confirmedOnly: true` restreint aux signalements
  confirmés. Compter des exploitations et non des signalements évite qu'un seul producteur, en
  signalant trois fois, déclenche une alerte.
- **Calcul** par PostGIS (`ST_DWithin` sur la colonne géographique indexée), une requête par jeu
  de paramètres présent dans les règles actives, pour toutes les communes évaluées.
- **Trois règles par défaut**, une par type (ravageurs, maladies des cultures, maladies animales),
  seuil de 3 exploitations, 5 km, 7 jours, gravité « avertissement ». Deux catégories d'alerte
  nouvelles, `CROP_DISEASE` et `ANIMAL_DISEASE`, à côté de `PEST` : une épidémie animale et une
  sécheresse ne s'annulent pas l'une l'autre (une alerte active par catégorie et par commune).
- **Réglage** : l'éditeur de seuils du ministère propose le nombre d'exploitations, le rayon
  (1 à 50 km) et la durée (1 à 60 jours) ; chaque modification crée une nouvelle version de la
  règle, comme pour les seuils météo.
- **Météo ancienne** : elle bloque les règles météo (pas d'alerte sur des données de plus de
  48 h), jamais une règle qui ne lit que des signalements.
- **Délai** : en plus de l'évaluation quotidienne, l'arrivée d'un signalement par la
  synchronisation déclenche aussitôt l'évaluation des règles de regroupement pour les communes
  concernées (celle du signalement et celles des signalements voisins). Le refroidissement et la
  règle d'une alerte active par catégorie évitent les répétitions.
- **Provenance** : source « Signalements des producteurs et des agents » (`BAIS_SIGNALEMENTS`),
  fiabilité « déclaratif » ; « vérifié par un agent » quand la règle ne compte que des
  signalements confirmés.
- **Diffusion** inchangée : destinataires planifiés par le module de diffusion (producteurs de la
  commune selon consentement, agents, relais oral). Le message parle d'« épidémie probable » et
  demande de vérifier ses parcelles ou son bétail ; l'agent confirme sur place.

## Conséquences

- Le langage de règles accepte des paramètres, pour ce seul indicateur ; toute condition reste
  validée par Zod à l'écriture comme à la lecture.
- La détection dépend de la qualité des positions : un signalement sans position (ni GPS, ni
  parcelle, ni exploitation localisée) ne compte pas.
- Un producteur malveillant ne peut pas déclencher seul une alerte (exploitations distinctes),
  mais trois comptes coordonnés le peuvent : c'est une alerte « probable », que l'agent confirme
  ou lève, et le ministère voit qui a signalé quoi.
- Photos des signalements stockées en base (docs/modules/signalements.md) : à déplacer vers un
  stockage objet avant un déploiement à grande échelle.

## Correction du 2026-09-26 : producteurs distincts (revue de sécurité des phases 0 à 2)

La conséquence « un producteur malveillant ne peut pas déclencher seul une alerte » était fausse :
un producteur déclare lui-même autant d'exploitations qu'il veut, dans n'importe quelle commune,
et son point GPS pouvait être placé n'importe où au Bénin. Trois exploitations d'un même compte
levaient une alerte diffusée par WhatsApp à toute une commune.

- `report_cluster` compte désormais les **producteurs distincts** (`farm.farmer_id`), et non plus
  les exploitations. Un producteur ne peut pas créer d'autre fiche producteur (droit réservé aux
  agents) ; chaque compte exige un NPI et un numéro vérifié par code WhatsApp.
- Un point GPS à plus de 30 km de l'exploitation est ignoré : le signalement est gardé, placé sur
  la parcelle ou l'exploitation. La date d'observation est bornée (pas dans le futur au-delà d'un
  jour, pas plus de 60 jours en arrière) ; 20 signalements au plus par compte et par 24 heures.
- Libellés, messages et éditeur de seuils parlent de producteurs.
- Reste ouvert (docs/recherche/revue-securite-phases-0-2.md, R1) : trois comptes coordonnés dont le
  NPI n'est pas encore vérifié par l'ANIP suffisent encore à lever une alerte diffusée.
