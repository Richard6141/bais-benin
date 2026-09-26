# ADR-0034 — Statistiques agricoles officielles : table de référence, import CSV et rapprochement

- Statut : acceptée
- Date : 2026-09-27
- Décideurs : chef d'équipe
- Complète : ADR-0021, ADR-0033

## Contexte

La plateforme produit désormais ses propres surfaces : déclarées au registre, vues par la carte des pixels (ADR-0021), mesurées par parcelle (ADR-0032), estimées par sondage (ADR-0033). Le ministère publie déjà des chiffres : la Direction de la statistique agricole (DSA) du MAEP, par campagne, par commune et par culture ; la FAO les reprend au niveau national (FAOSTAT). Tant que nos chiffres ne sont pas mis face aux siens, personne ne peut dire lesquels citer.

Aucun de ces chiffres officiels n'est dans le dépôt. Les inventer, même « pour la démonstration », serait pire que de ne rien montrer : un chiffre faux affiché à côté d'un chiffre officiel finit toujours cité.

## Décision

1. **Table de référence** `official_crop_statistic` : une ligne par source, campagne, territoire, culture et indicateur.
   - Indicateurs : surface (ha), production (t), rendement (t/ha).
   - Territoire : pays (`BJ`), département (`BJ-AK`) ou commune (`BJ-BOR-008`), par son code.
   - Culture : code du registre.
   - Chaque ligne garde sa source (`MAEP_DSA`, `FAOSTAT`), la référence du document ou du jeu de données, le fichier importé, la date et l'auteur de l'import.
2. **Import CSV par le ministère**, sur `/pilotage/cultures` (onglet « Statistiques officielles »). Nouveau droit `stats.import`, réservé au ministère.
   - Colonnes : `source`, `campagne`, `territoire`, `culture`, `indicateur`, `valeur`, `reference`.
   - La culture s'écrit par son code ou son nom français (« Maïs », « riz paddy », « coton graine ») ; le territoire par son code ; l'indicateur par `superficie_ha`, `production_t` ou `rendement_t_ha`.
   - Séparateur virgule ou point-virgule ; décimale point ou virgule.
   - Tout ou rien : une seule ligne invalide et rien n'est importé ; chaque erreur est rendue avec son numéro de ligne.
   - Une ligne qui existe déjà (même source, campagne, territoire, culture, indicateur) est remplacée : un fichier corrigé se réimporte.
   - Au plus 20 000 lignes et 2 Mo par fichier.
3. **Aucune donnée officielle dans le seed** ni dans le dépôt. Sans import, l'onglet dit quelles données demander, et à qui.
4. **Rapprochement**, pour chaque culture et chaque territoire où une surface officielle existe, avec sa dernière campagne connue :
   - surface déclarée au registre pour la campagne ouverte, et sa part de la surface officielle : c'est la couverture du registre ;
   - dans les communes d'enquête, la surface estimée par sondage et sa marge (ADR-0033) ; on dit si le chiffre officiel tombe dans l'intervalle à 95 % ;
   - l'écart est signalé comme indicatif quand les campagnes diffèrent : une surface varie couramment de 10 à 20 % d'une année sur l'autre.
   Les cultures officielles sont regroupées comme le modèle (sorgho et mil, niébé, arachide et sésame, igname, manioc et patate douce) quand la comparaison porte sur une estimation par groupe.

## Données à demander

- **DSA / MAEP** : surfaces emblavées (ha), productions (t) et rendements (t/ha) par commune et par culture, campagnes 2019-2020 à 2025-2026, pour toutes les cultures du registre ; en priorité les cinq communes pilotes (Tchaourou, Tanguiéta, Bassila, Ouèssè, Ségbana) et leurs départements. Avec la méthode de chaque chiffre (enquête permanente agricole, dires d'experts, estimation) : elle dit quelle confiance lui accorder.
- **FAOSTAT** (domaine « Cultures et produits animaux », QCL) : superficie récoltée, production et rendement du Bénin, 2015 à la dernière année publiée. Public et gratuit ; à télécharger par le ministère ou avec son accord, puis à importer au même format.
- **INStaD** : le recensement national de l'agriculture, s'il est disponible, pour les effectifs d'exploitations par commune (hors de ce lot).

## Conséquences

- Nouvelle table et migration ; nouvelle source `FAOSTAT` (publique) dans les sources de données.
- Nos chiffres et les chiffres officiels se lisent côte à côte ; aucun ne remplace l'autre à l'écran.
- Le rapprochement ne vaut que ce que valent les fichiers importés : leur source et leur référence restent affichées sur chaque ligne.
