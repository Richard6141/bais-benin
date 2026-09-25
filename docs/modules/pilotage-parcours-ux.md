# Centre de pilotage — tableau de bord national, écran par écran

- Étape : 7 (tableau de bord du ministère), préparation.
- Public : équipe front et données. Références : docs/04 §11 (vues d'agrégats prévues), docs/06 §3 (périmètre, k-anonymat), docs/08 §1 (provenance, fiabilité), docs/modules/design-system.md §4.1 (chaque chiffre porte sa source). Format identique à registre-parcours-ux.md et monitoring-parcours-ux.md.
- Statut : proposition, à valider avant implémentation.

## 0. Règles propres au pilotage

| Règle | Application |
|---|---|
| Agrégats seulement | Aucune ligne individuelle (producteur, exploitation, parcelle) n'apparaît dans le tableau de bord ni dans ses exports. Une cellule qui résume moins de 5 exploitations affiche « moins de 5 » et n'est pas exportée en valeur (docs/06 §3, règle 4). |
| Chaque chiffre porte sa source | `StatTile` avec `source`, `sourceDate` et `reliability` ; tableaux et graphiques avec `SourceCaption` ; la fiabilité suit la part vérifiée (`reliabilityFromShare`, seuil 80 %). |
| Déclaré et mesuré côte à côte | Superficie déclarée et superficie mesurée (contours relevés) toujours affichées ensemble, avec l'écart ; jamais l'une à la place de l'autre. |
| Filtres dans l'adresse | Campagne, culture, département, commune, statut de vérification : paramètres d'URL, partageables et imprimables ; la même adresse donne la même vue. |
| Comparaison explicite | Toute tendance dit contre quoi elle compare (« contre 2024-2025 »), et n'apparaît que si les deux campagnes ont des données. |
| Accès | `requireRole("ADMIN_STATE")` (double authentification imposée) pour le tableau national. Agent et coopérative voient une version réduite à leur périmètre sur leur propre espace (§2.F), jamais le tableau national. |
| Lecture seule | Le tableau de bord n'écrit rien ; les actions (lever une alerte, gérer une règle) restent dans leurs écrans. |

## 1. Personas

| Persona | Besoin | Conséquence |
|---|---|---|
| Éric, analyste au ministère | Suivre la campagne, préparer une note au ministre, répondre à une question de la presse ou d'un bailleur | Chiffres sourcés et datés, export CSV, fiche imprimable, comparaison entre campagnes |
| Directrice de la statistique agricole (DSA) | Juger la qualité du registre avant de citer un chiffre | Onglet qualité : écarts, ancienneté, couverture des agents, fraîcheur |
| Directeur départemental (ATDA) | Voir son département par rapport aux autres | Classements, descente département → commune, carte |
| Agent de terrain, gestionnaire de coopérative | Situer son périmètre | Version réduite dans leur espace, sans classement national |

## 2. Écrans

Convention : **Contenu**, **Filtres**, **Automatique**, **Actions**, **États vides et erreurs**, **Composants** (existants, puis « à créer »).

### 2.A Vue nationale (`/pilotage`)

| Bloc | Contenu | Filtres | Automatique | Actions | États vides et erreurs | Composants |
|---|---|---|---|---|---|---|
| A1 En-tête | Titre, campagne affichée, date de la donnée la plus récente, bandeau « Données de démonstration » tant que le registre est synthétique | Campagne (défaut : campagne ouverte) | Campagne ouverte lue dans le référentiel | « Imprimer la fiche », « Exporter » | Aucune campagne ouverte : dernière campagne close | `PageHeader`, `Select`, `Alert` `info` |
| A2 Indicateurs clés | 6 tuiles : producteurs, exploitations, superficie déclarée, superficie mesurée (et part relevée), part vérifiée (agent + terrain), production déclarée (t) | Culture, département, statut | Tendance contre la campagne précédente ; fiabilité par tuile | Tap sur une tuile : ouvre l'onglet correspondant filtré | Moins de 5 exploitations : « moins de 5 » | `StatTile` (tendance), `ReliabilityBadge`, `SourceCaption` |
| A3 Production par culture | Tableau et barres horizontales : culture, superficie, production déclarée (t), rendement indicatif (t/ha) comparé au rendement de référence (`typicalYieldTPerHa`), part vérifiée | Campagne, département | Tri par production ; rendement = production déclarée ÷ superficie des parcelles déclarées pour cette culture ; écart au référentiel en % | Tap : filtre toute la page sur la culture | Culture sans déclaration de récolte : « récolte non déclarée » (pas de 0) | `Table`, `CropGlyph`, à créer : `BarList` (barres SVG maison, comme `RainChart`) |
| A4 Campagne contre campagne | Pour les 5 cultures principales : superficie et production des 3 dernières campagnes | Culture | Variation en % entre campagnes successives | — | Une seule campagne : bloc masqué avec une phrase | à créer : `CampaignComparison` (petits multiples en barres) |
| A5 Carte | Choroplèthe des communes (métrique au choix : exploitations, superficie, part vérifiée, production) | Métrique, culture, campagne | Réutilise `AgriMap` de l'étape 4 ; ajout de la métrique « production » | Tap commune : fiche commune (2.C) | — | `AgriMap` (étape 4), `MapLegend` |
| A6 Alertes en cours | Résumé de `getMonitoringOverview` : alertes par sévérité, communes, exploitations touchées, taux de lecture, fraîcheur | — | — | « Centre d'alertes » | Aucune alerte : phrase neutre | `StatTile`, `SeverityBadge`, lien vers `/pilotage/alertes` |
| A7 Qualité en un coup d'œil | 3 chiffres : écart médian déclaré/mesuré, exploitations déclarées non vérifiées depuis plus de 180 jours, communes sans agent actif | — | Couleur par seuil (vigilance, alerte) | « Voir la qualité des données » | — | `StatTile` |

### 2.B Territoires (`/pilotage/territoires`)

| Bloc | Contenu | Filtres | Automatique | Actions | États vides et erreurs | Composants |
|---|---|---|---|---|---|---|
| B1 Départements classés | Tableau des 12 départements : exploitations, superficie déclarée et mesurée, part vérifiée, production de la culture filtrée, rang | Campagne, culture, indicateur de tri | Tri par colonne, rang recalculé ; ligne « Bénin » en pied | Tap : communes du département (B2) | — | `Table` (tri accessible, `aria-sort`) |
| B2 Communes d'un département | Même tableau au grain commune, avec la ZAE | + département | Idem | Tap : fiche commune (2.C) | Commune sans exploitation : ligne grisée « aucune exploitation » | `Table`, `Badge` (ZAE) |

### 2.C Fiche commune (`/pilotage/territoires/[code]`)

| Bloc | Contenu | Automatique | Composants |
|---|---|---|---|
| C1 Chiffres | Tuiles de 2.A au grain commune ; population rurale (INStaD) et part de producteurs enregistrés | Comparaison au département et au pays (« 1,4 fois la moyenne départementale ») | `StatTile` |
| C2 Cultures | Tableau A3 au grain commune | — | `Table`, `CropGlyph` |
| C3 Couverture terrain | Agents affectés, visites des 90 derniers jours, part vérifiée, dernière synchronisation par agent (sans nom si périmètre non autorisé) | — | `StatTile`, `Table` |
| C4 Météo et alertes | `WeatherStrip`, `RainChart`, alertes actives de la commune | Réutilise l'étape 6 | `WeatherStrip`, `RainChart`, `AlertCard` compact |

### 2.D Qualité des données (`/pilotage/qualite`)

| Bloc | Contenu | Automatique | Actions | Composants |
|---|---|---|---|---|
| D1 Écarts déclaré / mesuré | Distribution des écarts (parcelles relevées) par tranche : < 10 %, 10-20 %, 20-50 %, > 50 % ; communes aux écarts médians les plus forts | Seuil de signalement 20 % (identique au registre, B3) | Export CSV des communes | à créer : `BarList` |
| D2 Ancienneté | Exploitations `DECLARED` par ancienneté depuis la déclaration (< 30 j, 30-180 j, > 180 j), par commune | — | Lien vers la file de vérification de la commune (pour un agent) | `Table` |
| D3 Couverture des agents | Communes sans agent actif, agents sans synchronisation depuis 14 jours (compte seulement), visites par agent sur 30 jours (distribution) | — | — | `Table`, `StatTile` |
| D4 Doublons probables | Nombre de paires producteur même nom + même commune + année de naissance proche | Compteur seulement, jamais les noms | — | `StatTile` |
| D5 Fraîcheur | Dernière synchronisation reçue, dernière ingestion météo, dernier rafraîchissement des agrégats | Bandeau si agrégats > 30 min ou météo > 48 h | — | `Alert` `watch` |

### 2.E Exports

| Export | Contenu | Règles |
|---|---|---|
| CSV « indicateurs » | Une ligne par territoire (pays, départements, communes) × culture, colonnes des tuiles + provenance (`source`, `generated_at`, `reliability`, `verified_share`) | UTF-8 avec BOM, séparateur `;`, décimales à la virgule (ouverture directe dans Excel en français) ; cellules < 5 exploitations vides avec colonne `masque_k=true` ; en-têtes en français |
| CSV « production par culture » | Tableau A3 pour la campagne filtrée | Idem |
| Fiche imprimable | Page `/pilotage/fiche?…` : en-tête avec filtres, 6 tuiles, tableau A3, carte statique (capture de la choroplèthe), alertes, provenance en pied | Feuille de style `@media print` (A4 portrait, noir et blanc lisible, pas de navigation) ; « Imprimer ou enregistrer en PDF » par la boîte de dialogue du navigateur : pas de moteur PDF côté serveur en phase 1 |

Chaque export est journalisé (`analytics.export`, filtres, nombre de lignes) : l'audit dit qui a sorti quelles données agrégées.

### 2.F Périmètre agent et coopérative

| Espace | Contenu | Différences |
|---|---|---|
| Agent (`/agent`, bloc existant enrichi) | Tuiles A2 pour ses communes, production par culture, qualité D1-D2 de ses communes | Pas de classement national ni de comparaison avec d'autres communes nommées ; exports CSV de son périmètre seulement |
| Coopérative (`/cooperative`) | Tuiles A2 et production par culture pour ses membres | Même seuil de 5 ; pas de carte nationale |

## 3. Ce qui existe déjà

| Élément | Où | Réutilisation |
|---|---|---|
| Agrégats commune, département, national : exploitations, producteurs, superficie déclarée, part vérifiée, cultures ; filtres culture, campagne, département, statut ; provenance | `src/modules/analytics/territory-stats.ts`, `src/database/sql/territory-stats.sql.ts`, `GET /api/v1/territory/stats` | Base de A2, A5, B1, B2 |
| Fiabilité à partir de la part vérifiée | `reliabilityFromShare`, `VERIFIED_SHARE_THRESHOLD` | Toutes les tuiles |
| Carte choroplèthe et filtres dans l'adresse | `src/features/agri-map` (étape 4) | A5, avec une métrique de plus |
| Vue d'ensemble des alertes, niveaux par commune, météo communale | `src/modules/monitoring` (étape 6) | A6, C4, D5 |
| Composants | `StatTile`, `ReliabilityBadge`, `SourceCaption`, `Table`, `Tabs`, `CropGlyph`, `RainChart`, `WeatherStrip`, `AlertCard`, `EmptyState` | Tous les écrans |
| Test ministère avec double authentification | `tests/e2e/helpers/ministry.ts` | Tous les parcours de bout en bout du pilotage |

## 4. Ce qui manque

| Manque | Proposition |
|---|---|
| Superficie mesurée, production, rendement | Étendre les requêtes d'agrégats : `SUM(parcel.computed_area_ha)` (parcelles relevées), `SUM(production_declaration.quantity_kg)` par culture et campagne, rendement = production ÷ superficie des parcelles portant la culture ; même filtre de périmètre que l'existant |
| Comparaison entre campagnes | Requête par campagne (3 dernières) groupée par culture ; mise en cache par campagne close (immuable) |
| Vues matérialisées (docs/04 §11) | Créer `mv_farm_stats_by_commune` et `mv_crop_stats_by_commune` (commune × culture × campagne : exploitations, ha déclarés, ha mesurés, production kg, part vérifiée) ; départements et pays agrégés à la lecture ; `REFRESH MATERIALIZED VIEW CONCURRENTLY` après chaque lot de synchronisation appliqué (débounce 5 min) et par le worker ; index unique (commune, culture, campagne) exigé par `CONCURRENTLY` |
| Indicateurs de qualité | Requêtes D1-D4 dans un module `analytics/quality.ts` ; `mv_data_quality` (commune) si les temps dépassent 300 ms sur le registre de 50 000 exploitations |
| Index | `production_declaration (parcel_crop_id, declared_on)` déjà partiel ; ajouter `parcel_crop (campaign_id, crop_id, parcel_id)`, `farm (verification_status, created_at)` pour D2, `farm_verification (agent_id, visited_at)` pour D3 |
| k-anonymat | Fonction pure `maskSmallCells(rows, k = 5)` appliquée dans le module, jamais dans l'interface ; testée |
| Exports | Route `GET /api/v1/analytics/export.csv?…` (même validation `statsFiltersSchema`), journalisée ; page `/pilotage/fiche` avec feuille d'impression |
| Composants | `BarList`, `CampaignComparison`, `SortableTable` (ou `Table` + en-têtes triables accessibles), `PrintLayout` |
| Population rurale | Source `INSTAD_RGPH5` non encore chargée : colonne masquée tant que le référentiel n'a pas la donnée |

## 5. Points à trancher

- Définition du « producteur » compté : titulaire d'au moins une exploitation active, ou toute fiche producteur ? (Proposition : titulaire d'au moins une exploitation non archivée.)
- Rendement indicatif : sur les seules parcelles relevées (plus juste, moins de couverture) ou sur toutes les parcelles déclarées ? Proposition : toutes, avec la part relevée affichée à côté.
- Seuil de k-anonymat : 5 exploitations (docs/06) ou 10 pour les exports publics futurs.
- Fréquence de rafraîchissement des vues : après chaque lot de synchronisation ou toutes les 5 minutes seulement (charge sur la base au pic du matin).
- Fiche imprimable en PDF côté serveur (Playwright) plus tard, ou impression navigateur suffisante pour la phase 1.
- Agents nommés dans la couverture terrain (C3) : visibles par le ministère seulement, ou comptes anonymisés partout.
