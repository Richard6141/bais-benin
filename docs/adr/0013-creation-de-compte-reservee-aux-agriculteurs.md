# ADR-0013 — Création de compte réservée aux agriculteurs, ouverture des autres comptes par l'administration

- Statut : acceptée, complète ADR-0012
- Date : 2026-09-25
- Décideurs : Produit (porteur du projet), Sécurité, Architecte

## Contexte

Avec l'ADR-0012, toute personne qui saisissait un NPI et un numéro inconnus obtenait un compte, sans rôle. Après essai, le porteur du projet a précisé que le ministère et les agents ne doivent pas pouvoir créer eux-mêmes un compte sur la plateforme : seuls les agriculteurs ont cette possibilité. Il annonce par ailleurs que certaines données seront réservées à certaines entités ; ce point fera l'objet d'une décision ultérieure.

## Options étudiées

1. **Inscription ouverte aux seuls agriculteurs** : une première connexion crée un compte d'agriculteur, jamais un autre rôle ; les autres comptes sont ouverts par l'administration. Retenue.
2. **Inscription réservée aux agriculteurs déjà enregistrés par un agent** (fiche producteur préexistante) : plus stricte, elle empêche un agriculteur de s'inscrire avant la visite de l'agent. Proposée au porteur du projet ; à retenir s'il la préfère.

## Décision

- **Inscription** : quand la connexion crée un compte (NPI et numéro inconnus, ADR-0012), ce compte reçoit le rôle `FARMER` sur lui-même (`SELF`), attribué automatiquement (`src/modules/identity/provisioning.ts`, `provisionFarmerSignUp`). S'il existe une seule fiche producteur non reliée enregistrée avec ce numéro, le compte y est relié et en prend le nom (journal : `user.farmer.linked`). Aucun autre rôle ne peut naître d'une connexion.
- **Ouverture par l'administration** : agents, ministère, coopératives et acheteurs reçoivent leur compte de l'administration, qui lie un NPI, un numéro, un rôle et une portée (`provisionAccount`). En attendant un écran d'administration : `pnpm admin:compte --npi … --telephone … --role … [--commune … | --departement …] [--nom …]`. Si un compte existe déjà pour ce numéro, il doit porter le même NPI ; le rôle lui est ajouté et le rôle d'agriculteur attribué automatiquement lui est retiré s'il n'est relié à aucune fiche producteur.
- **Écran de connexion** : il distingue les deux cas (compte créé à la première connexion pour les agriculteurs ; compte ouvert par l'administration pour les autres).

## Conséquences

- Un agent ou un membre du ministère qui se connecte avant l'ouverture de son compte obtient un compte d'agriculteur, sans accès aux espaces professionnels. L'administration lui ajoute ensuite son rôle sur ce même compte (même NPI, même numéro).
- Tant que la vérification ANIP n'est pas ouverte, l'administration doit contrôler le NPI et le numéro d'une personne avant de lui ouvrir un compte professionnel (risque décrit dans l'ADR-0012).
- L'outil en ligne de commande exige un accès au serveur ; un écran d'administration journalisé, réservé au ministère, reste à construire.
