# ADR-0011 — Alertes par règles déclaratives versionnées, météo Open-Meteo avec repli

- Statut : acceptée
- Date : 2026-09-25
- Décideurs : Architecte, Backend/Data, Produit

## Contexte

Le monitoring (étape 6) doit prévenir producteurs, agents et ministère de risques agro-climatiques (poche de sécheresse, excès de pluie, chaleur, ravageurs) à l'échelle des 77 communes. Trois exigences dominent :

- **Explicabilité** : une alerte envoyée à un producteur ou présentée au ministère doit pouvoir être justifiée seuil par seuil ; une « boîte noire » serait inacceptable pour un service public.
- **Gouvernance** : les seuils actuels sont indicatifs (FAO, INRAB) et devront être ajustés avec l'ATDA sans redéploiement, avec traçabilité de chaque modification.
- **Disponibilité** : la démonstration et les zones sans réseau ne doivent pas dépendre d'un seul fournisseur météo, et une alerte ne doit jamais partir par message sur des données incertaines.

## Options étudiées

1. **Seuils codés en dur dans le code** — écarté : chaque ajustement exige un déploiement, aucune traçabilité métier.
2. **Modèle statistique ou apprentissage automatique** — écarté en V1 : pas de données historiques étiquetées d'épisodes au Bénin, explicabilité faible ; envisageable plus tard pour la prévision de rendement.
3. **Moteur de règles générique (Drools, json-rules-engine)** — écarté : dépendance lourde ou peu typée pour une douzaine de règles ; un petit langage maison validé par Zod suffit et reste lisible par un agronome.
4. **Règles déclaratives en JSON, validées par Zod, versionnées en base** — retenu.

Pour la météo : Open-Meteo (API publique sans clé, CC BY 4.0, analyse et prévisions par coordonnées, 77 communes en deux requêtes) plutôt qu'un fournisseur payant ; Météo-Bénin (stations) et CHIRPS (pluie satellitaire) restent des sources futures branchables par le même port.

## Décision

- **Langage de règles** (`src/modules/monitoring/rules`) : arbre `all` / `any` / `not` de conditions `{ indicator, op, value }` sur 18 indicateurs calculés (cumuls de pluie, jours secs consécutifs, bilan hydrique, températures, prévisions à 3 jours, zone, cultures et stades de la campagne ouverte). Un indicateur manquant rend la condition fausse, jamais une exception ; une fenêtre n'est calculée qu'avec 80 % de jours présents. L'évaluation produit une trace complète, restituée en phrases françaises dans chaque fiche d'alerte.
- **Versionnement** : une règle est une ligne `(code, version)` ; modifier un seuil crée une nouvelle version, l'ancienne reste consultable, l'action est auditée. Chaque évaluation (déclenchée ou non) est conservée avec sa trace et ses indicateurs.
- **Sobriété** : au plus une alerte active par catégorie et par commune ; une règle plus grave remplace l'alerte en cours ; délai de refroidissement par règle ; aucune alerte sur des données de plus de 48 heures.
- **Météo** : port `WeatherProvider` avec adaptateurs Open-Meteo et fixture ; ingestion quotidienne idempotente (`weather_observation`, clé commune × date × nature × source × émission) ; trois tentatives puis repli automatique sur la fixture, tracé dans `ingestion_run` et l'audit.
- **Fiabilité propagée** : toute donnée issue de la fixture est `SYNTHETIC` ; une alerte calculée dessus reste dans l'application et n'est jamais envoyée par WhatsApp ou SMS.
- **Diffusion** : destinataires figés à la création de l'alerte (in-app, WhatsApp si consentement, SMS, sinon relais par l'agent), silence nocturne sauf alerte critique, relance unique, accusés de lecture par l'application ou par webhook wapy.pro.
- **Démonstration** : hors production, quelques épisodes plausibles sont rejoués sur des séries synthétiques et évalués par le vrai moteur ; ils portent la source « Données de démonstration ».

## Conséquences

- Les seuils peuvent être ajustés par le ministère sans déploiement, avec simulation préalable sur les 30 derniers jours.
- La table `rule_evaluation` croît de règles × communes par jour (≈ 460 lignes) ; une rétention de 13 mois avec agrégats au-delà sera nécessaire.
- La précision est communale en V1 ; la cible « exploitation » attendra des données satellitaires par parcelle.
- Les seuils par défaut sont indicatifs et doivent être validés avec l'ATDA et l'INRAB avant activation réelle, idéalement après une période d'observation sans diffusion.
