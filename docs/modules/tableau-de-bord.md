# Tableau de bord national

Ce document décrit le tableau de bord livré à l'étape 7 : ce que voit chaque rôle, comment les chiffres sont produits et datés, ce que signifie chaque indicateur, comment le secret statistique est appliqué et jusqu'où il protège, et comment exploiter le module. La spécification écran par écran reste dans `docs/modules/pilotage-parcours-ux.md` ; les écrans décrits ci-dessous suivent cette spécification.

## Ce que voit chaque rôle

### Ministère (`/pilotage`, connexion par NPI et code WhatsApp)

- **Vue nationale** (`/pilotage`) : campagne affichée (par défaut la campagne ouverte, sinon la dernière close), date des agrégats, bandeau « Données de démonstration » tant que le registre est surtout synthétique ; six tuiles (producteurs, exploitations, superficie déclarée, superficie relevée et part des parcelles relevées, part vérifiée, production déclarée), chacune avec sa tendance contre la campagne précédente quand elle a un sens ; production par culture avec rendement indicatif et écart au rendement de référence ; comparaison des trois dernières campagnes pour les cinq cultures principales ; carte des communes ; résumé des alertes en cours ; trois chiffres de qualité.
- **Territoires** (`/pilotage/territoires`) : les 12 départements classés (exploitations, superficies déclarée et relevée, part vérifiée, production), ligne « Bénin » en pied ; descente vers les communes d'un département avec leur zone agro-écologique, le département en pied.
- **Fiche commune** (`/pilotage/communes/[code]`) : chiffres de la commune comparés aux moyennes départementale et nationale (« 1,3 fois la moyenne départementale »), cultures, couverture terrain (agents, visites des 90 derniers jours, dernière synchronisation), météo et alertes de l'étape 6.
- **Qualité des données** (`/pilotage/qualite`) : écarts entre superficie déclarée et relevée, ancienneté des exploitations déclarées non vérifiées, communes sans agent, agents sans synchronisation depuis 14 jours, doublons probables (un compte, jamais de noms), fraîcheur des sources.
- **Exports** : CSV « indicateurs » et « production par culture », fiche imprimable par la boîte de dialogue du navigateur.

### Agent de terrain et coopérative

Version réduite dans leur espace : tuiles et production par culture de leur périmètre, qualité (écarts et ancienneté) de leurs communes, exports CSV de leur périmètre. Pas de classement national, pas de comparaison à d'autres communes, agents désignés « Agent 1 », « Agent 2 ». Une commune hors périmètre répond comme une commune inconnue.

La coopérative obtient pour l'instant un périmètre vide : le registre ne relie pas encore les exploitations aux organisations. Ses chiffres sont à zéro, jamais ceux d'un autre périmètre.

## Chaîne de données

| Étape | Emplacement | Rôle |
|---|---|---|
| Vues matérialisées | migration `20260925060000_analytics_views` | `mv_crop_stats_by_commune` (commune × campagne × culture × statut de vérification) et `mv_farm_stats_by_commune` (commune × statut) ; index uniques exigés par le rafraîchissement concurrent |
| Lecture | `src/database/sql/dashboard.sql.ts`, `quality.sql.ts` | lignes communales des vues, comptes directs (producteurs, qualité), filtres assemblés par `Prisma.sql`, validés par Zod |
| Services | `src/modules/analytics/{dashboard,ranking,commune-profile,quality}.ts` | périmètre de l'acteur, sommes par département et pays, ratios, masquage, provenance |
| Contrat | `src/modules/analytics/dashboard-types.ts`, `quality-types.ts` | types de retour stables et commentés, lus par les pages |
| Rafraîchissement | `src/modules/analytics/refresh.ts`, `src/database/sql/analytics-refresh.sql.ts` | `REFRESH MATERIALIZED VIEW CONCURRENTLY`, table `analytics_refresh` |
| Export | `src/modules/analytics/{export,csv}.ts`, `GET /api/v1/analytics/export.csv` | CSV masqué, journalisé |

Les vues sont au grain commune : départements et pays sont des sommes calculées à la lecture (au plus 77 × 21 lignes par campagne). Les producteurs sont comptés en direct, parce qu'un producteur peut avoir des exploitations dans plusieurs communes : la somme des lignes le compterait plusieurs fois.

### Rafraîchissement

- Déclenché par la tâche planifiée d'envoi (toutes les 10 minutes, `POST /api/v1/monitoring/dispatch`) et à la fin de la tâche quotidienne. Jamais dans la requête de synchronisation : le pic du matin enverrait des dizaines de lots.
- Les vues ne sont rafraîchies que si c'est utile : jamais rafraîchies, écriture dans le registre depuis le dernier rafraîchissement (exploitations, producteurs, parcelles, cultures, récoltes, visites, commandes de synchronisation), ou dernier rafraîchissement de plus d'une heure.
- Un verrou consultatif PostgreSQL (clé `analytics` de `src/modules/monitoring/lock.ts`) empêche deux rafraîchissements simultanés ; le second répond « occupé » sans attendre. `CONCURRENTLY` laisse les lectures se poursuivre sur l'ancien contenu.
- Un échec est journalisé et rendu dans le résultat de la tâche (`analytics.reason = "failed"`) sans faire échouer l'envoi des alertes.
- Forcer à la main : `refreshAnalyticsIfStale({ force: true })`.

### Fraîcheur affichée

Chaque réponse porte `provenance.refreshedAt`, le plus ancien des deux derniers rafraîchissements : c'est la date des chiffres, affichée comme date de source. La page qualité affiche aussi la dernière synchronisation reçue et la dernière ingestion météo. Bandeau quand les agrégats ont plus de 30 minutes ou la météo plus de 48 heures.

## Définitions des indicateurs

| Indicateur | Définition |
|---|---|
| Exploitation | exploitation non archivée, comptée dans sa commune de rattachement. Avec une culture filtrée : exploitation qui porte cette culture dans la campagne |
| Producteur | titulaire d'au moins une exploitation non archivée du périmètre, compté une fois |
| Superficie déclarée | sans culture : somme des superficies déclarées des exploitations ; avec une culture : superficie déclarée de la culture (`parcel_crop.area_ha`) |
| Superficie relevée | somme des surfaces calculées depuis les contours GPS des parcelles relevées ; toujours affichée à côté de la superficie déclarée, jamais à sa place |
| Part des parcelles relevées | parcelles relevées ÷ parcelles du périmètre |
| Superficie relevée par culture | surface relevée des parcelles qui portent la culture ; une parcelle en association compte pour chacune de ses cultures, cette valeur ne s'additionne donc pas entre cultures et n'a pas de total |
| Part vérifiée | exploitations `AGENT_VERIFIED` ou `FIELD_VERIFIED` ÷ exploitations ; au-delà de 80 %, l'indicateur est marqué « vérifié sur le terrain », sinon « déclaré » |
| Production déclarée | somme des quantités de récolte déclarées, converties en kilogrammes par l'unité, affichée en tonnes ; « récolte non déclarée » quand aucune déclaration n'existe (jamais 0) |
| Rendement indicatif | production déclarée ÷ superficie déclarée des cultures qui ont au moins une récolte déclarée, en t/ha ; comparé au rendement de référence du référentiel des cultures |
| Tendance | variation en % contre la campagne précédente, affichée seulement quand les deux campagnes ont des données, toujours avec « contre AAAA-AAAA ». Sans culture filtrée, le nombre d'exploitations ne dépend pas de la campagne et n'a pas de tendance |
| Écart déclaré / relevé | \|relevé − déclaré\| ÷ déclaré par parcelle relevée ; seuil de signalement 20 %, comme dans le registre |
| Doublons probables | paires de producteurs de même commune, mêmes nom et prénom sans casse, années de naissance à un an près ou inconnues |

## Secret statistique

### Règle appliquée

- **k = 5** : toute ligne qui résume entre 1 et 4 exploitations est masquée avec toutes ses mesures (effectif, superficies, production, rendement, part vérifiée, fiabilité, producteurs). La part vérifiée est masquée aussi : 100 % sur 3 exploitations dirait que les trois sont vérifiées. Une ligne à zéro reste visible (« aucune exploitation »).
- **Masquage secondaire** : dans un groupe dont le total est affiché, si une seule ligne est masquée, la plus petite ligne visible non nulle l'est aussi ; sinon, le total moins les lignes visibles redonnerait la valeur cachée.
- **Où** : dans le module (`maskSmallCells`, `src/modules/analytics/k-anonymity.ts`), avant tout retour ; jamais dans l'interface. Les pages et les exports reçoivent des lignes déjà masquées (`masked: true`, valeurs `null`).

| Réponse | Masquage |
|---|---|
| Tuiles d'un périmètre (vue nationale, fiche commune, espace agent) | ligne seule |
| Production par culture | par culture, secondaire (total des cultures affiché) |
| Classement des territoires | par territoire, secondaire (ligne Bénin ou département en pied) |
| Comparaison entre campagnes | par culture et campagne |
| Qualité | commune masquée sous 5 parcelles relevées (écarts) ou 5 exploitations déclarées (ancienneté) |
| Export « indicateurs » | par territoire × culture ; secondaire entre départements d'une culture et entre communes d'un département quand le total est exporté (ministère) |

### Limites

Le masquage de cellule protège chaque réponse prise isolément. Il ne couvre pas entièrement les recoupements entre plusieurs réponses :

- **Différence entre deux filtres** : l'effectif d'une commune sans filtre et le même effectif filtré par statut (ou par culture) peuvent être tous deux visibles, et leur différence révéler un groupe de 1 à 4 exploitations (par exemple « 2 exploitations vérifiées »). Le masquage secondaire ne s'applique qu'à l'intérieur d'une même réponse.
- **Différence entre deux campagnes** : l'effectif d'une culture dans une commune sur deux campagnes consécutives dit combien d'exploitations l'ont ajoutée ou abandonnée.
- **Différence entre deux dates** : deux exports à quelques jours d'intervalle révèlent les exploitations enregistrées entre-temps.
- **Totaux non masqués** : les totaux nationaux et départementaux dépassent toujours 5 aujourd'hui ; un périmètre d'agent réduit à une commune peu peuplée s'appuie sur le masquage de ligne.

Ce que ces différences révèlent reste un effectif ou une surface agrégés, jamais une identité : aucune ligne individuelle ne sort du tableau de bord. Mais combinées à une connaissance locale (le seul producteur de riz d'un village), elles peuvent suffire à reconnaître quelqu'un. Pour aller plus loin :

1. limiter les combinaisons de filtres au grain commune (statut et culture ensemble seulement au niveau département) ;
2. arrondir aléatoirement les effectifs à 5 près dans les exports publics, ou relever k à 10 pour ces exports (point encore ouvert, pilotage-parcours-ux §5) ;
3. détecter les séries de requêtes voisines dans le journal d'audit (un même utilisateur qui fait varier un seul filtre sur une petite commune) ;
4. à terme, publier les exports ouverts avec un mécanisme de confidentialité différentielle (bruit calibré), au prix d'une précision moindre sur les petites communes.

## Exports

- `GET /api/v1/analytics/export.csv?kind=indicators|production` avec les mêmes filtres que les pages (`campaignCode`, `cropCode`, `departementCode`, `communeCode`, `verificationStatus`) ; session requise, périmètre de l'acteur.
- Format : UTF-8 avec BOM, séparateur « ; », virgule décimale, fins de ligne CRLF, en-têtes en français : ouverture directe dans Excel réglé en français. Un texte qui commence par `=`, `+`, `-` ou `@` est préfixé d'une apostrophe pour ne jamais être lu comme une formule.
- Cellules masquées vides, colonne `masque_k` à `true` ; provenance sur chaque ligne (`source`, `genere_le`, `fiabilite`, `part_verifiee`).
- « Indicateurs » : une ligne par territoire × culture (pays, départements, communes au ministère ; communes du périmètre seulement pour un agent). « Production par culture » : le tableau de la vue nationale pour la campagne filtrée.
- Chaque export est journalisé (`analytics.export` : type, filtres, nombre de lignes) : l'audit dit qui a sorti quelles données agrégées.

## Performances

Mesures sur la base de démonstration (5 000 exploitations, 9 628 parcelles, 30 284 cultures de parcelle, 77 communes) ; estimation à 50 000 exploitations par extrapolation linéaire, à confirmer en recette.

| Opération | 5 000 exploitations | Estimé 50 000 |
|---|---|---|
| Rafraîchissement `mv_farm_stats_by_commune` | 46 ms | ≈ 0,5 s |
| Rafraîchissement `mv_crop_stats_by_commune` (4 513 lignes) | 216 ms | ≈ 2 s |
| Tuiles nationales | 64 ms | ≈ 0,3 s (le compte direct des producteurs domine) |
| Tuiles filtrées (culture et département) | 11 ms | < 0,1 s |
| Production par culture | 20 ms | < 0,1 s (vue au grain commune, indépendante du nombre d'exploitations) |
| Comparaison entre campagnes | 40 ms | < 0,1 s |
| Classement des départements | 35 ms | ≈ 0,3 s |
| Fiche commune | 19 ms | < 0,1 s |
| Qualité des données | 69 ms | ≈ 0,7 s (écarts, médiane et doublons en direct) |
| Export CSV | 17 à 26 ms | < 0,2 s |

Les lectures des vues ne dépendent que du nombre de communes, de cultures et de campagnes ; ce qui grandit avec le registre, ce sont les comptes directs (producteurs, qualité) et le rafraîchissement. Au-delà de 300 ms mesurées en recette pour la qualité, une vue `mv_data_quality` au grain commune est prévue (pilotage-parcours-ux §4).

## Limites connues

- Données de démonstration : 99,9 % du registre est synthétique, et aucune récolte n'est encore déclarée en local ; production et rendement s'affichent « non déclarés » jusqu'aux premières déclarations.
- Coopérative : périmètre vide tant que le registre ne relie pas les exploitations aux organisations.
- Population rurale : non chargée (source INStaD à intégrer) ; la part de producteurs enregistrés reste vide.
- Rendement indicatif : calculé sur les seules cultures qui ont une récolte déclarée ; tant que les déclarations sont rares, il est très sensible aux premières saisies.
- Rafraîchissement toutes les 10 minutes au plus : un chiffre peut avoir jusqu'à 10 minutes de retard sur le registre (la date affichée le dit).
- Protection contre les recoupements entre requêtes : partielle, voir « Secret statistique ».

## Vérifier

```bash
pnpm test -- src/modules/analytics
pnpm test:integration -- tests/integration/dashboard.test.ts   # vues contre comptes directs, masquage, export, verrou
pnpm build && pnpm test:e2e                                     # parcours du ministère
```

Rafraîchir les vues à la main en développement, par exemple après un seed :

```ts
import { refreshAnalyticsIfStale } from "@/modules/analytics";
await refreshAnalyticsIfStale({ force: true });
```
