# ADR-0004 — Autorisation par rôles et périmètres territoriaux, moteur maison, RLS en défense en profondeur

- Statut : acceptée
- Date : 2026-09-24
- Décideurs : Sécurité, Backend/Data

## Contexte

Le brief impose le RBAC et des règles d'accès territoriales : un agriculteur ne voit que ses données, un agent les exploitations de sa zone, le ministère les données globales. Un rôle seul ne suffit pas ; il faut savoir *sur quel territoire ou quelle organisation* il s'applique.

## Options étudiées

1. RBAC pur (rôle → permissions) — insuffisant pour le périmètre.
2. Bibliothèque d'autorisation basée sur les attributs (CASL) — viable, mais la sérialisation des règles vers SQL reste manuelle et l'abstraction ajoute peu ici.
3. Moteur maison `can(actor, action, resource)` + filtres SQL de périmètre dans les dépôts + politiques RLS PostgreSQL — retenu.

## Décision

- `RoleAssignment` associe un rôle à un périmètre (`NATIONAL`, `DEPARTEMENT`, `COMMUNE`, `ARRONDISSEMENT`, `ORGANIZATION`, `SELF`).
- Le module `authorization` expose `authorize()` (décision unitaire) et `scopeFilter()` (fragment de filtre à injecter dans les requêtes de liste).
- La matrice rôle × action × périmètre est un fichier de données versionné ; les tests sont générés à partir d'elle.
- RLS PostgreSQL activée sur les tables personnelles avec des variables de session posées par le dépôt, comme seconde barrière.

## Conséquences

- Aucune requête de liste ne peut oublier le périmètre : le dépôt l'exige comme paramètre.
- Le coût de la RLS est accepté sur les tables personnelles ; les agrégats du pilotage lisent des vues sans RLS, réservées par rôle.
