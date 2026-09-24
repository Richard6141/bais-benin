# 08 — Données de référence et sources

> Rédigé par : Expert data et systèmes d'information agricoles.
> Statut : version 1.0 — phase 1 (analyse). Ce document décrit le référentiel de données que la plateforme BAIS doit charger, les sources dont il provient et les règles qui garantissent sa qualité. Aucune donnée réelle nominative n'est manipulée en phase 1 : le jeu de données de démonstration est intégralement synthétique.

## 1. Principe de provenance

Une donnée sans source n'existe pas dans BAIS. Chaque enregistrement (agriculteur, exploitation, parcelle, culture, relevé météo, indicateur agrégé) porte trois attributs obligatoires :

- **`source_id`** : identifiant court de la source d'origine, tiré de la table des sources ci-dessous ;
- **`source_date`** : date à laquelle la donnée a été produite ou collectée par la source (distincte de la date d'ingestion, qui est également conservée) ;
- **`reliability`** : niveau de fiabilité, exprimé par une énumération fermée.

### 1.1 Énumération des niveaux de fiabilité

L'énumération suivante est à utiliser telle quelle, dans les schémas de base de données, les API et les interfaces. L'ordre reflète une confiance croissante, sauf pour les deux dernières valeurs qui décrivent une nature différente de donnée.

| Valeur | Signification | Exemple |
|---|---|---|
| `DECLARED` | Déclaré par l'agriculteur lui-même, sans contrôle | Superficie annoncée lors de l'enrôlement par téléphone |
| `AGENT_VERIFIED` | Vérifié par un agent de terrain (ATDA, coopérative habilitée) sans relevé de géométrie | Identité et village confirmés lors d'une visite |
| `FIELD_VERIFIED` | Vérifié sur le terrain avec relevé GPS de la parcelle | Contour de parcelle tracé à pied avec l'application mobile |
| `OFFICIAL` | Issu d'une source officielle (MAEP, INStaD, ANIP, IGN) | Découpage administratif, population communale |
| `ESTIMATED` | Estimation ou sortie de modèle | Rendement moyen d'une culture par zone, indice de stress hydrique |
| `SYNTHETIC` | Donnée de démonstration générée artificiellement | Tout le jeu de données de phase 1 |

Règles associées :

- un enregistrement `SYNTHETIC` ne peut jamais être promu à un autre niveau ; il est purgé au moment de la mise en production ;
- une donnée ne peut monter de niveau (par exemple de `DECLARED` à `FIELD_VERIFIED`) que par une action tracée d'un utilisateur habilité, avec conservation de l'ancienne valeur dans l'historique ;
- le tableau de bord ministériel affiche systématiquement la répartition des niveaux de fiabilité derrière chaque indicateur.

### 1.2 Table des sources

| Identifiant | Organisme ou produit | Nature | Licence / accès | Statut phase 1 |
|---|---|---|---|---|
| `MAEP_DSA` | Ministère de l'Agriculture, de l'Élevage et de la Pêche — Direction de la Statistique Agricole | Statistiques de production, superficies, rendements par commune | Convention à établir | Non connecté |
| `INSTAD_RGPH5` | Institut National de la Statistique et de la Démographie — Recensement Général de la Population et de l'Habitation (5e édition, 2023) | Population par commune et arrondissement, part rurale | Données publiques agrégées | Utilisé pour la pondération du dataset fictif |
| `OSM` | OpenStreetMap | Routes, localités, plans d'eau, marchés | ODbL | Utilisé (fond de carte) |
| `GEOBOUNDARIES` | geoBoundaries (William & Mary geoLab) | Limites administratives ADM0, ADM1, ADM2 | CC BY 4.0 | Utilisé (géométries) |
| `OPEN_METEO` | Open-Meteo | Prévisions et historique météo par point | CC BY 4.0, API sans clé | Utilisé |
| `ATDA_TERRAIN` | Agences Territoriales de Développement Agricole | Relevés des agents (visites, GPS, photos) | Production interne | Simulé en phase 1 |
| `BAIS_SEED` | Générateur de données de démonstration BAIS | Jeu synthétique complet | Interne | Utilisé, marqué `SYNTHETIC` |

## 2. Découpage administratif

Le Bénin est organisé en 12 départements, 77 communes, 546 arrondissements et environ 5 300 villages et quartiers de ville. Les deux premiers niveaux sont chargés de manière exhaustive dès la phase 1. Les arrondissements et les villages sont prévus dans le modèle de données mais seront seedés partiellement, à partir des listes disponibles dans OSM et des nomenclatures INStaD, puis complétés au fil des enrôlements.

### 2.1 Départements et communes

Le tableau ci-dessous constitue la liste de référence. Le chef-lieu de département est indiqué entre parenthèses. L'orthographe suit la nomenclature officielle utilisée par l'INStaD et le MAEP ; les variantes locales (par exemple « Sèmè-Podji » pour Sèmè-Kpodji) seront acceptées comme alias de recherche mais jamais comme libellé principal.

| Département (chef-lieu) | Communes | Nombre |
|---|---|---|
| Alibori (Kandi) | Banikoara, Gogounou, Kandi, Karimama, Malanville, Ségbana | 6 |
| Atacora (Natitingou) | Boukoumbé, Cobly, Kérou, Kouandé, Matéri, Natitingou, Péhunco, Tanguiéta, Toucountouna | 9 |
| Atlantique (Allada) | Abomey-Calavi, Allada, Kpomassè, Ouidah, Sô-Ava, Toffo, Tori-Bossito, Zè | 8 |
| Borgou (Parakou) | Bembèrèkè, Kalalé, N'Dali, Nikki, Parakou, Pèrèrè, Sinendé, Tchaourou | 8 |
| Collines (Dassa-Zoumè) | Bantè, Dassa-Zoumè, Glazoué, Ouèssè, Savalou, Savè | 6 |
| Couffo (Aplahoué) | Aplahoué, Djakotomey, Dogbo, Klouékanmè, Lalo, Toviklin | 6 |
| Donga (Djougou) | Bassila, Copargo, Djougou, Ouaké | 4 |
| Littoral (Cotonou) | Cotonou | 1 |
| Mono (Lokossa) | Athiémé, Bopa, Comè, Grand-Popo, Houéyogbé, Lokossa | 6 |
| Ouémé (Porto-Novo) | Adjarra, Adjohoun, Aguégués, Akpro-Missérété, Avrankou, Bonou, Dangbo, Porto-Novo, Sèmè-Kpodji | 9 |
| Plateau (Pobè) | Adja-Ouèrè, Ifangni, Kétou, Pobè, Sakété | 5 |
| Zou (Abomey) | Abomey, Agbangnizoun, Bohicon, Covè, Djidja, Ouinhi, Za-Kpota, Zagnanado, Zogbodomey | 9 |
| **Total** | | **77** |

Chaque commune reçoit un code stable de la forme `BJ-<DEP>-<NNN>` (par exemple `BJ-DON-002` pour Copargo), indépendant du libellé, afin que les renommages éventuels n'affectent jamais les clés étrangères.

### 2.2 Géométries

- **Source principale** : geoBoundaries, niveaux ADM1 (départements) et ADM2 (communes), licence CC BY 4.0 avec mention obligatoire de la source dans l'interface. Les géométries sont importées en WGS 84 (EPSG:4326) et stockées avec leur version geoBoundaries.
- **Source complémentaire** : OSM pour les limites d'arrondissements lorsqu'elles existent, les localités (nœuds `place=village`, `place=hamlet`) et le réseau routier.
- **Simplification** : les contours sont simplifiés (algorithme de Douglas-Peucker, tolérance différenciée par niveau de zoom) pour produire des tuiles vectorielles légères, adaptées à une consultation sur mobile en 2G. La géométrie complète reste disponible côté serveur pour les calculs de surface et d'appartenance.
- **Centroïdes** : chaque commune et chaque arrondissement possède un centroïde calculé, utilisé comme point de référence météo et comme position par défaut d'une exploitation non encore géolocalisée.
