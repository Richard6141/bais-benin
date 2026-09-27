# ADR-0040 — Surface brûlée : garde-fous de coût, parcelles réelles et limites de la mesure

- Statut : acceptée
- Date : 2026-09-27
- Décideurs : chef d'équipe
- Complète : ADR-0038

## Contexte

L'ADR-0038 (§2) décide de mesurer la surface brûlée des parcelles exposées par dNBR Sentinel-2, puis de proposer une déclaration de sinistre. L'utilisateur active les lectures Copernicus en production (`FIRE_BURN_READS=1`, plafond de 100 unités par mois), en mesurant d'abord 5 parcelles.

La relecture a relevé des chemins par lesquels la mesure pouvait dépenser plus que prévu, ou écrire une déclaration inventée sur une vraie exploitation. Cet ADR fixe les garde-fous retenus.

## Décision

1. **Parcelles réelles et de démonstration séparées, à la mise en file comme à la mesure.**
   - **Ce qu'est une parcelle réelle** : une parcelle dont la fiabilité n'est pas SYNTHETIC.
     - Les parcelles de démonstration sont toutes notées « relevé GPS » alors que leur contour est inventé : le mode de relevé ne distingue donc rien.
     - Un contour relevé sur place par un agent fait passer la parcelle en FIELD_VERIFIED ou AGENT_VERIFIED, et la rend mesurable.
   - **Lecture Copernicus** : parcelles réelles seulement. Cela vaut même pour une mesure mise en file quand la fixture tournait encore.
   - **Fixture** : parcelles de démonstration seulement. Aucune déclaration inventée n'atteint une vraie exploitation.
2. **Un seul passage à la fois.**
   - Un verrou consultatif PostgreSQL couvre tout le passage (`burnedAreas`, sur le modèle des tâches du monitoring). Un second appel reçoit 409 et ne lit rien.
   - Le plafond du mois est lu au début du passage et tenu parcelle par parcelle.
   - Chaque mesure n'est écrite que si elle est encore en attente, et la déclaration seulement dans ce cas.
3. **Deux lectures en échec au plus.**
   - Chaque échec du fournisseur compte une tentative. À la deuxième, la mesure sort de la file (FAILED), et un contour illisible en sort tout de suite.
   - La file est lue des moins tentées aux plus anciennes : une parcelle en échec ne bloque plus les suivantes, et ne consomme plus une réservation à chaque passage.
4. **Révision atomique d'une déclaration.**
   - La décision de l'agent n'est écrite que si la déclaration est encore proposée.
   - Deux décisions contraires venues de deux appareils au même moment : une seule est appliquée, l'autre reçoit « déjà traitée ». Une même décision rejouée est un doublon.
5. **Mesure 15 jours après le feu**, dans la plage de l'ADR-0038 (10 à 30 jours) : la fenêtre d'après le feu (15 jours) est alors close.

## Limite connue : les cicatrices fraîches et le masque de nuages

- **Le problème** : Sen2Cor classe souvent une cicatrice de brûlis fraîche, très sombre, en ombre de nuage (classe 3) ou en eau (classe 6). Masquer ces classes sans condition effacerait des brûlis réels.
- **Le choix retenu** : une image d'après le feu classée 3 ou 6 n'est retenue qu'aux trois conditions suivantes :
  - il n'existe aucune image nette après le feu ;
  - le pixel était net et terrestre avant le feu (végétation, sol nu ou non classé) ;
  - ce n'est donc jamais une vraie eau.
- **Ce qui reste possible** : une vraie ombre de nuage, sur un pixel sans autre image nette dans les 15 jours, peut encore passer pour une cicatrice. C'est rare en saison sèche, et le constat de l'agent tranche.

## Conséquences

- La table `burn_assessment` porte le nombre de tentatives, et un statut FAILED.
- Première mesure réelle : `POST /api/v1/fires/burned-areas?limit=5`, puis lecture de `processingUnits` dans la réponse avant de laisser la tâche du jour aller jusqu'au plafond.
- En démonstration, la fixture continue de produire des surfaces et des déclarations, marquées « Démonstration », sur les seules parcelles de démonstration.
