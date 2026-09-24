# 01 — Vision produit

> Rédigé par : Product Manager, avec relecture Architecte, UX et Sécurité.
> Statut : version 1.0 — phase 1 (analyse). Aucune ligne de code applicatif n'a été écrite à ce stade.

## 1. Le problème que nous résolvons

L'État béninois ne dispose pas aujourd'hui d'une vue consolidée, à jour et géolocalisée de son agriculture. Les données existent, mais elles sont dispersées : fiches papier des agents des ATDA (Agences Territoriales de Développement Agricole), enquêtes ponctuelles de l'INStaD, registres de coopératives, tableurs des directions départementales. Quand une question simple arrive — « combien de producteurs de maïs dans la commune de Djougou, sur quelle superficie, et lesquels sont exposés à un déficit hydrique ce mois-ci ? » — la réponse demande des semaines, et elle est souvent approximative.

Les conséquences sont concrètes : intrants distribués au mauvais endroit, alertes climatiques qui n'atteignent pas les producteurs, subventions difficiles à cibler, acheteurs qui ne trouvent pas l'offre, banques qui ne prêtent pas faute d'historique.

## 2. La proposition

Une infrastructure numérique nationale, pensée comme un **registre + un système nerveux** :

- **Le registre** : chaque agriculteur, chaque exploitation, chaque parcelle et chaque culture a une identité stable, une localisation et un historique de campagnes, avec un statut de vérification et une traçabilité de la source de chaque donnée.
- **Le système nerveux** : le registre alimente une carte agricole, un moteur d'alertes (météo, risques), un marché, un assistant et un centre de pilotage pour l'État. Chaque nouvelle donnée terrain remonte dans les indicateurs nationaux en quelques minutes, pas en quelques mois.

Nom de travail : **Bénin Agricultural Intelligence System (BAIS)**. Nom de code du dépôt : `bais`. Le nom de marque final relève du Ministère ; trois pistes sont proposées dans le document 07.

## 3. Principes directeurs

1. **Le terrain d'abord.** L'agent de terrain avec un smartphone d'entrée de gamme et une connexion 2G intermittente est notre utilisateur de référence. Si l'application ne marche pas pour lui, elle ne marche pas.
2. **Une donnée sans source n'existe pas.** Chaque fait porte sa provenance, sa date et son niveau de fiabilité. Le tableau de bord ministériel affiche toujours la part de données vérifiées.
3. **Souveraineté et minimisation.** Les données personnelles sont minimisées, chiffrées au repos, cloisonnées par rôle et par territoire. Le NPI (numéro personnel d'identification, ANIP) est prévu mais jamais exigé, et jamais affiché en clair.
4. **Ouvert à l'écosystème, dépendant de personne.** Intégrations externes (ANIP, météo, wapy.pro, IA) derrière des interfaces ; l'application fonctionne sans aucune d'elles.
5. **Institutionnel, pas administratif.** Le produit doit inspirer confiance et modernité : la lisibilité d'un service public nordique, la densité maîtrisée d'un centre de contrôle.

## 4. Les utilisateurs et leurs espaces

| Espace | Utilisateur type | Ce qu'il vient faire | Contrainte dominante |
|---|---|---|---|
| **Agriculteur** | Producteur, parfois peu lettré, téléphone souvent partagé, langue fon, yoruba, bariba ou dendi à l'oral | Voir son exploitation, déclarer une récolte, recevoir alertes et conseils, publier une offre | Simplicité extrême, icônes, audio, très faible débit, notifications WhatsApp ou SMS |
| **Agent agricole terrain** | Conseiller ATDA ou agent communal, smartphone Android, 40 à 200 exploitations en portefeuille | Enregistrer et vérifier des exploitations, relever des parcelles au GPS, saisir des observations, planifier ses visites | Hors-ligne complet, saisie rapide, synchronisation fiable |
| **Coopérative** | Gestionnaire d'une coopérative ou d'une union | Suivre ses membres, agréger les volumes, répondre à des appels d'achat groupés | Vue agrégée, exports, multi-membres |
| **Acheteur** | Transformateur, grossiste, exportateur, programme de cantines scolaires | Trouver une offre par produit, zone et volume, émettre une demande d'achat, contacter | Recherche, carte, confiance (statut vérifié) |
| **Administration communale** | Maire, service agricole communal | Vue de sa commune : exploitations, cultures, alertes, agents actifs | Lecture, exports, périmètre strictement communal |
| **Ministère (MAEP)** | Analystes de la DSA, cabinet, directions techniques | Piloter : indicateurs nationaux, comparaisons territoriales, alertes, tendances, décisions d'intervention | Fiabilité des chiffres, filtrage territorial, descente jusqu'à la commune |
| **Partenaires** (phase ultérieure) | Institutions financières, PTF, chercheurs | Accès à des agrégats ou à des données consenties via API | Consentement, anonymisation, API documentée |

## 5. Périmètre fonctionnel

### 5.1 Ce que la version challenge livre (V1)

- **M1 Identité et accès** : inscription et connexion par téléphone + code à usage unique (canal WhatsApp via wapy.pro ou SMS, repli e-mail), comptes institutionnels par e-mail et mot de passe, rôles et périmètres territoriaux, journal d'audit, préparation ANIP (champ NPI chiffré, fournisseur d'identité externe abstrait).
- **M2 Registre national** : agriculteurs, exploitations, parcelles (géométrie), cultures, campagnes, déclarations de production, workflow de vérification (déclaré, vérifié par agent, vérifié sur le terrain), historique complet, saisie hors-ligne pour l'agent.
- **M3 Carte agricole** : MapLibre + fond OSM, couches parcelles, exploitations et communes, filtres culture, zone, statut et campagne, agrégation par commune avec choroplèthes, statistiques de l'emprise visible, emplacement prévu pour couches satellites (NDVI) et raster.
- **M4 Monitoring** : ingestion météo (Open-Meteo, sans clé), moteur de règles déclaratif à seuils composables, génération d'alertes par zone et par exploitation, diffusion multicanal, historique et accusé de réception.
- **M5 Assistant IA** : chat contextuel (exploitation, météo, alertes), recherche documentaire sur un corpus de fiches techniques avec citations, niveau de confiance affiché systématiquement, refus explicite hors périmètre documenté.
- **M6 Marché** : offres de récolte, recherche multicritères, demandes d'achat, mise en relation, badge « exploitation vérifiée ».
- **M7 Centre de pilotage État** : indicateurs nationaux, carte de synthèse, alertes en cours, séries temporelles par campagne, comparaisons départementales, qualité des données, exports.

### 5.2 Ce qui est préparé mais non livré (V2 et au-delà)

Connexion API ANIP, imagerie satellite (Sentinel-2 via Copernicus), notation de crédit agricole pour institutions financières, API partenaires OAuth2 avec consentement, USSD pour téléphones basiques, restitution vocale en langues nationales, ingestion INStaD et MAEP, module subventions et intrants.

## 6. Questions nationales et réponses produit

| Question de l'État | Où est la réponse | Données mobilisées |
|---|---|---|
| Combien d'agriculteurs produisent du maïs dans une commune ? | Dashboard État, filtre commune × culture ; carte | Exploitation, Parcelle, CultureCampagne, Commune |
| Quelle superficie est cultivée ? | Même vue, avec part vérifiée et part déclarée | Parcelle.superficie (géométrie ou déclarée), fiabilité |
| Quelle quantité est produite ? | Dashboard, série par campagne | DeclarationProduction, Campagne |
| Quelles zones sont exposées aux risques climatiques ? | Carte, couche alertes ; module monitoring | ObservationMeteo, Alerte, règles |
| Quels producteurs ont besoin d'accompagnement ? | Liste priorisée par agent et par commune | Alertes actives × rendement historique × statut |
| Où intervenir rapidement ? | Centre de pilotage, tri par gravité et population touchée | Alerte.gravite × nombre d'exploitations touchées |

## 7. Indicateurs de succès

- Un agent enregistre une exploitation complète (identité, localisation, deux parcelles, trois cultures) en moins de quatre minutes, hors-ligne, et la synchronisation réussit au retour du réseau sans intervention.
- Le dashboard répond à toute question du tableau ci-dessus en moins d'une seconde sur 50 000 exploitations simulées.
- Score Lighthouse mobile supérieur ou égal à 90 sur l'espace agriculteur ; premier rendu utile en moins de deux secondes en 3G lente.
- 100 % des chiffres affichés au ministère sont accompagnés de leur part vérifiée et de leur date de fraîcheur.
- Aucune donnée personnelle accessible hors périmètre d'un rôle (vérifié par tests de permissions automatisés).

## 8. Hors périmètre explicite

Paiement en ligne, logistique de transport, comptabilité des coopératives, cadastre foncier officiel (nous stockons une emprise déclarée, pas un titre de propriété).

## 9. Risques produit et parades

| Risque | Parade |
|---|---|
| Données fictives perçues comme réelles | Bandeau « données de démonstration » et champ source sur chaque enregistrement |
| Adoption faible côté agriculteurs | L'agent saisit pour eux au départ ; l'agriculteur reçoit via WhatsApp ; interface agriculteur ultra-simplifiée |
| Sensibilité des données personnelles et foncières | Minimisation, chiffrement, RBAC et périmètre territorial, audit, pas de NPI en clair |
| Dérive de l'IA (hallucination) | RAG avec citations obligatoires, niveau de confiance, refus hors corpus, jamais de chiffre officiel produit par le modèle |
| Complexité technique du hors-ligne | Architecture outbox simple, idempotence serveur, résolution de conflits explicite, tests dédiés |
