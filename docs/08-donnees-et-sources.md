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

## 3. Zones agro-écologiques

Le zonage agro-écologique usuel du Bénin distingue huit zones (ZAE), établies par l'INRAB et le MAEP à partir du climat, des sols et des systèmes de production dominants. Les délimitations réelles suivent des contours agronomiques et non les limites communales : une commune peut chevaucher deux zones. En phase 1, chaque commune est rattachée à une zone dominante ; le rattachement fin par parcelle viendra avec les géométries ZAE officielles. Les listes de départements et les fourchettes pluviométriques ci-dessous sont indicatives.

| Code | Zone | Départements et communes principalement couverts | Régime pluviométrique | Systèmes dominants |
|---|---|---|---|---|
| `ZAE1` | Extrême Nord-Bénin | Alibori nord (Karimama, Malanville) | Unimodal, 700 à 900 mm | Sorgho, mil, riz de bas-fond et irrigué (vallée du Niger), oignon, élevage |
| `ZAE2` | Zone cotonnière du Nord-Bénin | Alibori (Banikoara, Gogounou, Kandi, Ségbana), Borgou nord (Bembèrèkè, Kalalé, Sinendé), Atacora est (Kérou, Péhunco) | Unimodal, 900 à 1 100 mm | Coton, maïs, sorgho, arachide, soja |
| `ZAE3` | Zone vivrière du Sud-Borgou | Borgou sud (Parakou, N'Dali, Nikki, Pèrèrè, Tchaourou) | Unimodal, 1 000 à 1 200 mm | Igname, maïs, manioc, anacarde, soja |
| `ZAE4` | Zone Ouest-Atacora | Atacora ouest (Boukoumbé, Cobly, Matéri, Natitingou, Tanguiéta, Toucountouna, Kouandé), Donga nord (Copargo, Djougou, Ouaké) | Unimodal, 1 000 à 1 300 mm | Sorgho, mil, fonio, riz de bas-fond, igname, karité |
| `ZAE5` | Zone cotonnière du Centre-Bénin | Collines (toutes communes), Zou nord (Djidja), Donga sud (Bassila) | Transition, 1 100 à 1 200 mm | Coton, maïs, igname, manioc, anacarde |
| `ZAE6` | Zone des terres de barre | Atlantique, Ouémé nord, Plateau, Couffo, Mono nord, Zou sud (Abomey, Bohicon, Covè, Za-Kpota, Agbangnizoun) | Bimodal, 1 100 à 1 400 mm | Maïs, manioc, niébé, arachide, palmier à huile, ananas (Allada, Zè, Toffo), maraîchage |
| `ZAE7` | Zone de la dépression (Lama) | Zou sud (Zogbodomey, Zagnanado, Ouinhi), Couffo est (Lalo), Plateau ouest (Kétou, Adja-Ouèrè, en partie), Atlantique nord (Toffo, en partie) | Bimodal, 1 100 à 1 300 mm | Maïs, riz de bas-fond, manioc, maraîchage sur vertisols |
| `ZAE8` | Zone des pêcheries | Littoral (Cotonou), Ouémé lacustre (Sô-Ava, Aguégués, Dangbo, Sèmè-Kpodji, Porto-Novo), Mono côtier (Grand-Popo, Comè, Bopa), Ouidah | Bimodal, 1 200 à 1 500 mm | Pêche lagunaire, maraîchage périurbain, cocotier, manioc |

### 3.1 Calendrier climatique

Le pays est traversé par une transition entre deux régimes, autour du 8e parallèle (Collines, Bassila). Les dates ci-dessous sont indicatives et varient d'une année sur l'autre de deux à quatre semaines ; elles servent de valeur par défaut au moteur d'alertes tant que les prévisions saisonnières ne sont pas connectées.

**Sud (régime bimodal, ZAE 6 à 8 et sud de la ZAE 5) :**

| Saison | Période indicative | Usage agricole |
|---|---|---|
| Grande saison des pluies | mi-mars à mi-juillet | Première campagne de maïs, niébé, arachide, manioc ; semis principal |
| Petite saison sèche | mi-juillet à mi-septembre | Récolte de la première campagne, préparation des sols |
| Petite saison des pluies | mi-septembre à mi-novembre | Deuxième campagne de maïs (cycle court), maraîchage, niébé |
| Grande saison sèche | mi-novembre à mi-mars | Récoltes tardives, maraîchage irrigué, harmattan de décembre à février |

**Nord (régime unimodal, ZAE 1 à 4 et nord de la ZAE 5) :**

| Saison | Période indicative | Usage agricole |
|---|---|---|
| Saison des pluies | mai à octobre (avril à octobre en ZAE 4, juin à septembre en ZAE 1) | Campagne unique : coton, maïs, sorgho, mil, igname, riz, soja, arachide |
| Saison sèche | novembre à avril | Récoltes, commercialisation, maraîchage irrigué et de bas-fond, harmattan de décembre à février |

## 4. Cultures de référence

Le référentiel des cultures est chargé dès la phase 1 avec les espèces les plus représentées dans les statistiques nationales. Chaque culture possède un code court stable, une catégorie et des paramètres agronomiques par défaut. Les rendements moyens sont des ordres de grandeur issus des séries agrégées récentes du MAEP et de la FAO ; ils sont chargés avec le niveau `ESTIMATED` et doivent être remplacés par les valeurs officielles `MAEP_DSA` dès que la convention d'accès sera signée. Les périodes de semis et de récolte sont données pour le régime sud puis le régime nord lorsqu'ils diffèrent ; un tiret signifie que la culture n'est pas significative dans ce régime.

| Code | Nom français | Catégorie | Principales zones de production | Semis (sud / nord) | Récolte (sud / nord) | Rendement indicatif t/ha (`ESTIMATED`) | Unité de commercialisation courante |
|---|---|---|---|---|---|---|---|
| `MAI` | Maïs | Céréale | Toutes zones ; Atlantique, Zou, Collines, Borgou, Alibori | mars-avril et sept. / mai-juin | juil.-août et déc. / sept.-oct. | 1,2 à 1,5 | Sac de 100 kg ; bassine (env. 20 kg) au détail |
| `RIZ` | Riz | Céréale | Vallée du Niger (Malanville), bas-fonds des Collines, Ouémé, Mono, Atacora, Zou | avril-mai et sept. / juin-juil. ; contre-saison irriguée en janv. | août-sept. / oct.-nov. | 3,0 à 4,5 (irrigué), 1,5 à 2,5 (pluvial) | Sac de 80 kg (paddy), sac de 50 kg (usiné) |
| `SOR` | Sorgho | Céréale | Alibori, Atacora, Borgou, Donga | — / mai-juin | — / oct.-nov. | 0,9 à 1,2 | Sac de 100 kg |
| `MIL` | Mil | Céréale | Alibori (Karimama, Malanville), Atacora, Borgou nord | — / mai-juin | — / sept.-oct. | 0,7 à 1,0 | Sac de 100 kg |
| `MAN` | Manioc | Racine / tubercule | Zou, Collines, Ouémé, Plateau, Couffo, Mono, Atlantique | mars-mai et sept.-oct. / mai-juin | 9 à 18 mois après plantation | 12 à 16 | Bassine de tubercules ; sac de gari (env. 50 kg) |
| `IGN` | Igname | Racine / tubercule | Borgou, Donga, Collines, Atacora, Zou nord | déc.-févr. sur buttes / janv.-mars | août-sept. (précoce), nov.-janv. (tardive) | 10 à 14 | Tas ou centaine de tubercules ; sac de cossettes |
| `PAT` | Patate douce | Racine / tubercule | Ouémé, Mono, Atlantique, Borgou | mars-avril et sept. / juin-juil. | 3 à 4 mois après plantation | 5 à 8 | Bassine ; sac de 50 kg |
| `NIE` | Niébé | Légumineuse | Zou, Collines, Couffo, Alibori, Borgou | mars-avril et sept.-oct. / juin-juil. | juin-juil. et déc. / sept.-oct. | 0,6 à 0,9 | Sac de 100 kg ; boîte de tomate (env. 1 kg) au détail |
| `ARA` | Arachide | Oléagineux | Borgou, Alibori, Atacora, Zou, Couffo, Collines | mars-avril et sept. / mai-juin | juil. et déc. / sept.-oct. | 0,8 à 1,1 (en coque) | Sac de 100 kg (coque) ; bassine (décortiquée) |
| `SOJ` | Soja | Légumineuse | Borgou, Collines, Donga, Alibori, Zou nord | — / juin-juil. | — / oct.-nov. | 0,8 à 1,2 | Sac de 100 kg |
| `COT` | Coton | Rente | Alibori, Borgou, Atacora, Collines, Donga, Zou nord | — / mai-juin | — / nov.-janv. | 1,0 à 1,3 (coton-graine) | Kilogramme de coton-graine, prix garanti par campagne |
| `ANA` | Anacarde | Rente | Collines, Borgou, Donga, Zou nord, Atacora sud | Plantation en saison des pluies, production après 3 à 5 ans | févr.-mai (noix brute) | 0,4 à 0,6 (noix brute) | Kilogramme ou sac de 80 kg de noix brute |
| `ANN` | Ananas | Fruit | Atlantique (Allada, Zè, Toffo, Abomey-Calavi), Ouémé, Mono | Toute l'année, pics mars-mai / — | 12 à 18 mois après plantation | 40 à 60 | Fruit à l'unité ; pile ou plateau ; tonne à l'export |
| `PAL` | Palmier à huile | Oléagineux | Atlantique, Ouémé, Plateau, Mono, Couffo, Zou sud | Plantation en grande saison des pluies, production après 3 à 4 ans | Toute l'année, pic févr.-mai | 3 à 8 (régimes, selon matériel végétal) | Bidon de 25 l d'huile rouge ; régime au poids |
| `KAR` | Karité | Oléagineux | Atacora, Donga, Borgou, Alibori, Collines nord | Peuplements naturels, pas de semis | mai-août (ramassage des noix) | 0,1 à 0,3 (amandes, par ha de parc) | Bassine d'amandes ; kilogramme de beurre |
| `SES` | Sésame | Oléagineux | Borgou, Alibori, Atacora, Collines | — / juin-juil. | — / oct.-nov. | 0,3 à 0,5 | Sac de 50 kg |
| `TOM` | Tomate | Maraîchage | Ouémé (Sèmè-Kpodji, Adjohoun), Atlantique, Mono, Couffo, Collines ; contre-saison en Alibori | Toute l'année, pics mars et sept. / oct.-nov. en irrigué | 2 à 3 mois après repiquage | 8 à 15 | Panier ou cageot (env. 25 kg) ; bassine |
| `PIM` | Piment | Maraîchage | Ouémé, Plateau, Atlantique, Mono, Zou | mars-avril et sept. / mai-juin | 3 à 4 mois après repiquage, récoltes échelonnées | 3 à 6 | Bassine ; sac de 50 kg (séché) |
| `GOM` | Gombo | Maraîchage | Toutes zones, forte présence Zou, Couffo, Mono, Borgou | mars-avril et sept. / juin-juil. | 2 mois après semis, récoltes échelonnées | 4 à 8 | Bassine ; boîte de tomate au détail |
| `OIG` | Oignon | Maraîchage | Alibori (Malanville, Karimama), Atacora, Ouémé, Atlantique périurbain | oct.-déc. en contre-saison irriguée / oct.-nov. | févr.-avril | 15 à 25 | Sac de 100 kg (Malanville) ; bassine |
| `BAN` | Banane plantain | Fruit | Ouémé, Plateau, Atlantique, Mono, Zou sud, Collines sud | mars-mai / — | 10 à 14 mois après plantation, puis continu | 6 à 10 | Régime à l'unité ; tas de doigts |

Notes de modélisation :

- une culture est **annuelle**, **pérenne** ou **de cueillette** (attribut `cycle`) ; pour les cultures pérennes, la parcelle porte une date de plantation et un âge de mise en production plutôt qu'un semis par campagne ;
- l'unité de commercialisation est stockée avec un facteur de conversion indicatif vers le kilogramme (`ESTIMATED`), afin d'agréger les volumes de marché malgré l'hétérogénéité des unités locales ;
- les cultures secondaires (fonio, voandzou, cocotier, agrumes, mangue, papaye, cultures fourragères) seront ajoutées dans une version ultérieure du référentiel sans changement de schéma.

## 5. Campagnes agricoles

Une campagne agricole est l'unité temporelle de rattachement des déclarations de cultures, des rendements et des statistiques. Elle suit la convention nationale de la campagne cotonnière et des statistiques agricoles du MAEP.

- **Nommage** : `AAAA-AAAA` avec l'année de démarrage puis l'année de clôture, par exemple `2025-2026`. Le code est unique et sert de clé de partitionnement.
- **Bornes** : la campagne commence le 1er avril et se termine le 31 mars de l'année suivante. Ces dates englobent les deux saisons du sud et la saison unique du nord ; elles sont paramétrables par campagne pour absorber une décision ministérielle exceptionnelle.
- **Sous-saisons** : chaque campagne est découpée en sous-saisons codées `GS` (grande saison, avril à juillet), `PS` (petite saison, septembre à novembre) et `CS` (contre-saison sèche, décembre à mars). Dans le nord, seule la sous-saison `GS` est utilisée pour les cultures pluviales, avec une fenêtre étendue jusqu'en octobre ; `CS` sert au maraîchage irrigué. Une déclaration de culture référence obligatoirement une campagne et une sous-saison.
- **Cultures pérennes** : elles sont rattachées à la campagne pendant laquelle a lieu la récolte principale (par exemple la campagne `2025-2026` pour la récolte d'anacarde de février à mai 2026).
- **Statut** : une campagne est `PLANNED`, `OPEN` ou `CLOSED`. Une fois close, ses déclarations ne sont plus modifiables que par un administrateur national, avec justification tracée.
- **Phase 1** : le jeu de démonstration couvre trois campagnes, `2023-2024`, `2024-2025` (closes) et `2025-2026` (ouverte), afin de rendre les évolutions interannuelles visibles dans les tableaux de bord.

## 6. Stratégie de génération du jeu de données de démonstration

La phase 1 ne manipule aucune donnée personnelle réelle. Un générateur (`BAIS_SEED`) produit un jeu de données synthétique mais vraisemblable, suffisant pour dimensionner l'architecture, tester les performances de la carte et rendre les tableaux de bord parlants. Toutes les lignes produites portent le niveau `SYNTHETIC` et l'identifiant de source `BAIS_SEED` ; elles sont purgées avant toute mise en production.

### 6.1 Volumétrie cible

| Objet | Volume cible | Commentaire |
|---|---|---|
| Agriculteurs | environ 50 000 | Un agriculteur porte une exploitation ; les cas de co-exploitation sont hors phase 1 |
| Exploitations | environ 50 000 | Une par agriculteur |
| Parcelles | 100 000 à 130 000 | 1 à 4 parcelles par exploitation, distribution décroissante (environ 40 % à 1, 35 % à 2, 18 % à 3, 7 % à 4) |
| Déclarations de cultures | 250 000 à 350 000 | Une à trois cultures par parcelle et par campagne, sur trois campagnes |
| Agents de terrain | environ 600 | Rattachés aux ATDA, 5 à 12 par commune selon la ruralité |
| Relevés météo | environ 84 000 | 77 communes, 3 années, un relevé quotidien |

### 6.2 Reproductibilité

Le générateur utilise une graine aléatoire fixe, versionnée dans le dépôt (`SEED_VERSION` et `SEED_RANDOM` dans la configuration). Deux exécutions avec la même graine et la même version du générateur produisent exactement le même jeu de données, ce qui permet de rejouer les tests de charge, de comparer deux versions de l'interface sur les mêmes chiffres et de documenter une anomalie par son identifiant. Tout changement de règle de génération incrémente `SEED_VERSION`.

### 6.3 Distribution géographique

- Le nombre d'exploitations par commune est proportionnel à un poids composite : population rurale de la commune (`INSTAD_RGPH5`, part rurale estimée à partir du statut des arrondissements) multiplié par un coefficient d'intensité agricole propre à la ZAE (plus élevé pour les zones cotonnières et vivrières, plus faible pour la zone des pêcheries et le Littoral). Cotonou reçoit un volume minimal, correspondant au maraîchage périurbain.
- Les positions des exploitations sont tirées dans le polygone de la commune, avec une densité plus forte à proximité des localités OSM (`place=village`) et une exclusion des plans d'eau et des aires protégées connues (parc de la Pendjari, parc du W, forêts classées principales).
- Chaque parcelle est un polygone simple (4 à 8 sommets) généré autour de la position de l'exploitation, dans un rayon de 3 km, avec une superficie cohérente avec la taille déclarée.

### 6.4 Tailles d'exploitation et cultures

- La superficie totale d'une exploitation suit une loi log-normale de médiane 1,5 ha, avec une queue plafonnée à 25 ha ; les paramètres sont modulés par ZAE (médiane plus élevée dans les zones cotonnières du nord, plus faible dans les terres de barre densément peuplées).
- La superficie déclarée d'une parcelle est dérivée de sa géométrie avec un bruit de plus ou moins 15 %, afin que les règles de cohérence de la section 9 aient de la matière à détecter.
- Les cultures attribuées à une parcelle sont tirées dans la liste des cultures dominantes de la ZAE de la commune (section 3), avec les probabilités correspondant aux systèmes de production. Un coton en zone des pêcheries ou un ananas dans l'Alibori n'est jamais généré, sauf dans un lot volontairement incohérent de 0,5 % destiné à tester les alertes qualité.
- Les rendements déclarés sont tirés autour du rendement indicatif de la culture (section 4), avec une variance par campagne pour simuler une bonne et une mauvaise année.

### 6.5 Statuts de vérification

La répartition cible des niveaux de fiabilité sur les exploitations est de 55 % `DECLARED`, 30 % `AGENT_VERIFIED` et 15 % `FIELD_VERIFIED`. Une exploitation `FIELD_VERIFIED` possède au moins une parcelle avec géométrie relevée et une visite d'agent datée ; une exploitation `AGENT_VERIFIED` possède une visite mais ses parcelles restent des positions ponctuelles avec une surface déclarée. La répartition varie par commune pour refléter un déploiement progressif : quelques communes pilotes (par exemple Djougou, Allada, Kandi, Savalou, Adjohoun) dépassent 40 % de vérification terrain, les autres restent majoritairement déclaratives.

### 6.6 Identités fictives

- **Noms et prénoms** : tirés dans des listes de prénoms et de patronymes plausibles par aire linguistique, elles-mêmes affectées aux communes selon la répartition usuelle des langues : fon et aïzo (Atlantique, Zou, Littoral), adja et mina (Couffo, Mono), goun et yoruba-nago (Ouémé, Plateau), mahi et idaasha (Collines), bariba (Borgou, Alibori sud), dendi (Alibori nord, Donga), yom et lokpa (Donga), otamari, waama et biali (Atacora), peul (dispersé dans le nord). Chaque commune mélange plusieurs aires avec une dominante. Les listes sont constituées de prénoms et de noms fréquents, jamais de combinaisons copiées d'une personne identifiable.
- **Sexe et âge** : environ 40 % de femmes chefs d'exploitation, âge tiré entre 18 et 75 ans avec un mode autour de 42 ans.
- **Numéros de téléphone** : format béninois à dix chiffres en vigueur depuis la migration de novembre 2024, présenté comme `+229 01 XX XX XX XX`. Les huit chiffres après le préfixe `01` sont tirés dans des plages fictives et marqués comme non attribués ; le générateur garantit l'unicité et évite tout numéro figurant dans les fixtures de test des passerelles de notification.
- **NPI** : le numéro personnel d'identification n'est jamais réel. Le générateur produit une chaîne de dix chiffres factice, dont la clé de contrôle est volontairement invalide, et seulement pour une partie des agriculteurs (environ 35 %), afin de représenter le cas courant d'un producteur non encore enrôlé à l'ANIP. Le champ est stocké chiffré et affiché masqué, comme il le sera en production.
- **Localité** : chaque agriculteur est rattaché à un village ou quartier issu de la liste partielle seedée (section 2), ou à un village fictif nommé selon les toponymes de l'aire linguistique lorsque la commune n'a pas encore de liste.

### 6.7 Agents et coopératives

Environ 600 agents de terrain fictifs sont créés et rattachés aux ATDA par pôle de développement agricole. Chaque visite de vérification est signée par un agent de la commune concernée. Environ 800 coopératives et groupements sont générés, avec un rattachement de 30 % des agriculteurs, pour alimenter les vues de marché et d'agrégation de l'offre.

## 7. Données météorologiques

### 7.1 Source retenue en phase 1

Open-Meteo (`OPEN_METEO`) est retenu comme source unique de prévisions et d'historique météo en phase 1. Le service est accessible sans clé pour un usage non commercial et à volume raisonnable, ce qui convient à une plateforme publique en phase d'analyse et de prototypage ; le passage à l'offre payante ou à Météo-Bénin est prévu avant la mise en production.

- **Point de requête** : le centroïde de chaque commune (77 points). Les arrondissements seront ajoutés lorsque le volume d'appels et la finesse des alertes le justifieront.
- **Variables retenues** : température maximale et minimale journalières, précipitations cumulées journalières, évapotranspiration de référence (ET0, formule FAO Penman-Monteith fournie par le service), humidité du sol par couche lorsque le modèle la fournit (0 à 7 cm et 7 à 28 cm), vitesse maximale du vent, et probabilité de précipitations pour les prévisions.
- **Horizon** : prévisions à 7 jours réactualisées quotidiennement ; historique reconstitué sur les trois campagnes du jeu de démonstration à partir de l'archive ERA5 exposée par le même service.
- **Fréquence d'ingestion** : une collecte par jour à 05 h 00 heure de Cotonou pour les prévisions, une collecte hebdomadaire pour l'historique consolidé. Chaque relevé porte `source_date` (date de la prévision ou de l'observation) et la date d'ingestion.
- **Fiabilité** : les observations historiques sont chargées en `OFFICIAL` par analogie avec une source de référence externe, les prévisions en `ESTIMATED`.
- **Repli** : si le service est indisponible ou si l'environnement n'a pas d'accès réseau (développement, démonstration hors ligne, tests automatisés), l'ingestion se rabat sur des fixtures versionnées dans le dépôt, générées une fois à partir de vraies réponses du service et marquées `SYNTHETIC`. Le moteur d'alertes fonctionne à l'identique sur les deux jeux.

### 7.2 Indicateurs dérivés

À partir de ces variables, la plateforme calcule par commune et par jour un cumul de pluie sur 10 et 30 jours glissants, un bilan hydrique simplifié (pluie moins ET0), un compteur de jours secs consécutifs et un indicateur de démarrage de saison (première séquence de trois jours totalisant plus de 20 mm sans période sèche de plus de 7 jours dans les 30 jours suivants). Ces indicateurs sont marqués `ESTIMATED` et alimentent les alertes décrites dans le document 02.

## 8. Sources à connecter ultérieurement

Aucune des sources ci-dessous n'est connectée en phase 1. Elles sont documentées pour que les interfaces d'ingestion soient conçues dès maintenant avec le bon niveau d'abstraction.

| Source | Usage prévu dans BAIS | Format probable | Statut |
|---|---|---|---|
| MAEP / DSA (Direction de la Statistique Agricole) | Superficies, productions et rendements officiels par commune et par campagne ; calage des rendements indicatifs ; référentiel des prix de campagne | Tableurs ou exports CSV, éventuellement base de données interne ; convention d'échange à signer | Non connecté |
| INStaD — RGPH-5 et enquêtes agricoles | Population rurale et ménages agricoles par arrondissement ; structure des exploitations ; base d'extrapolation des indicateurs | Tableaux publiés (PDF, Excel), microdonnées anonymisées sur demande | Non connecté (agrégats publics utilisés pour la pondération du jeu synthétique) |
| ANIP (Agence Nationale d'Identification des Personnes) | Vérification d'identité de l'agriculteur par NPI, lutte contre les doublons, pré-remplissage de l'état civil | API REST sécurisée avec consentement de la personne ; accès soumis à convention et à l'avis de l'APDP | Non connecté |
| Copernicus Sentinel-2 | Indice de végétation (NDVI) par parcelle vérifiée, suivi de l'état des cultures, détection de parcelles non cultivées | Catalogue STAC public, API Process (images) et Statistical (NDVI par parcelle) du Copernicus Data Space Ecosystem : calcul côté Copernicus, aucun raster traité chez BAIS (ADR-0016) | Connecté pour la vue du ciel de la carte (source `COPERNICUS_S2`, fiabilité `ESTIMATED`) ; images soumises au compte CDSE |
| IGN Bénin (Institut Géographique National) | Référentiel géographique officiel : limites administratives certifiées, toponymie, hydrographie ; remplacement des géométries geoBoundaries | Shapefile ou GeoPackage, service WMS/WFS éventuel | Non connecté |
| Météo-Bénin (Agence Nationale de la Météorologie) | Observations des stations synoptiques, prévisions saisonnières, bulletins agrométéorologiques ; source souveraine remplaçant ou complétant Open-Meteo | Fichiers périodiques (CSV, bulletins PDF), API à négocier | Non connecté |

Pour chaque source, le connecteur devra produire des enregistrements portant l'identifiant de source correspondant, le niveau `OFFICIAL` lorsque la donnée est certifiée, et conserver la version du fichier ou de la réponse d'origine à des fins d'audit.

## 9. Règles de qualité

Les règles suivantes s'appliquent à toutes les données, synthétiques comme réelles. Elles sont exécutées à l'ingestion (rejet ou mise en quarantaine) et périodiquement sur le stock (signalement dans une file de contrôle qualité visible par les administrateurs de données).

### 9.1 Unicité et intégrité référentielle

- Un code de commune, de culture, de campagne ou de source est unique et immuable.
- Une parcelle appartient à exactement une exploitation ; une exploitation à exactement un agriculteur ; un agriculteur est rattaché à exactement une commune de résidence.
- Un NPI, lorsqu'il est renseigné, ne peut être associé qu'à un seul agriculteur ; toute collision est bloquante.
- Un numéro de téléphone ne peut être le numéro principal que d'un seul agriculteur ; il peut apparaître comme numéro secondaire (téléphone d'un proche) sur plusieurs fiches, avec signalement au-delà de trois.

### 9.2 Cohérence des superficies

- Lorsqu'une parcelle possède une géométrie relevée, la superficie déclarée est comparée à la superficie géodésique calculée. Un écart supérieur à 20 % ou à 0,25 ha (le plus grand des deux) génère un signalement ; un écart supérieur à 50 % bloque la promotion au niveau `FIELD_VERIFIED`.
- La somme des superficies des parcelles ne peut excéder la superficie totale déclarée de l'exploitation de plus de 10 %.
- Une parcelle doit être contenue dans la commune de rattachement de l'exploitation, ou dans une commune limitrophe ; toute autre situation est signalée.
- Deux géométries de parcelles se recouvrant à plus de 30 % de la plus petite des deux sont signalées comme conflit foncier potentiel.

### 9.3 Détection des doublons d'agriculteurs

Un score de similarité est calculé entre toute nouvelle fiche et les fiches existantes de la même commune et des communes limitrophes, à partir de trois critères : numéro de téléphone (identique ou identique à un chiffre près), nom et prénom (distance de Jaro-Winkler après normalisation des accents et de la casse, tolérance aux inversions nom/prénom), village ou quartier de résidence (identique). Deux critères sur trois concordants placent la fiche en quarantaine avec proposition de fusion à un agent ou à un administrateur ; trois critères concordants bloquent la création tant qu'un humain n'a pas tranché. La décision de fusion ou de non-fusion est tracée et sert à ajuster les seuils.

### 9.4 Cohérence agronomique

- Une culture déclarée hors de ses zones de production connues (section 4) est acceptée mais signalée, sans blocage, car les pratiques évoluent.
- Un rendement déclaré supérieur à trois fois le rendement indicatif de la culture, ou une date de récolte antérieure à la date de semis, est rejeté.
- Une déclaration de culture doit référencer une campagne ouverte, sauf saisie de rattrapage autorisée par un administrateur.

### 9.5 Fraîcheur

- Chaque objet porte une date de dernière mise à jour et une date de dernière vérification. Une exploitation non mise à jour depuis deux campagnes passe au statut `STALE` et sort des indicateurs de production courante, tout en restant dans le registre.
- Les relevés météo de plus de 48 heures ne sont plus utilisés pour les alertes ; une commune sans relevé récent est affichée comme telle sur la carte plutôt qu'avec une valeur périmée.
- Les géométries administratives et les référentiels externes portent leur version d'origine ; un contrôle mensuel compare la version chargée à la dernière version publiée par la source.

### 9.6 Indicateurs de qualité exposés

Le tableau de bord ministériel et l'espace des administrateurs de données exposent en permanence : la part d'enregistrements par niveau de fiabilité, le nombre de fiches en quarantaine, le taux d'écart superficie déclarée contre géométrie, le nombre de communes sans relevé météo récent et l'âge médian des données par commune. Ces indicateurs sont eux-mêmes des données de la plateforme, historisées, afin de rendre visible la progression de la qualité au fil du déploiement.
