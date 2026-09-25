# Monitoring agricole et alertes — parcours écran par écran

- Étape : 6 (monitoring), préparation.
- Public : équipe front et back. Décisions techniques : docs/02 (module `monitoring`), docs/04 §7 (modèle), docs/09 (wapy.pro, Open-Meteo), ADR-0007 (wapy.pro canal de messagerie), ADR-0010 (authentification). Le moteur de règles est livré : `src/modules/monitoring/rules` (DSL, indicateurs, évaluation, six règles par défaut). Le format reprend docs/modules/registre-parcours-ux.md ; les règles transversales de docs/modules/authentification-parcours-ux.md §0 et du registre §0 s'appliquent sans être répétées.
- Statut : proposition, à valider avant implémentation.

## 0. Règles propres au monitoring

| Règle | Application |
|---|---|
| Une alerte dit quoi faire | Toute alerte porte un conseil pratique (`Rule.adviceFr`) affiché avant le détail technique. Pas d'alerte « pour information » sans action ; une règle sans conseil ne peut pas être activée. |
| Pas d'alarme inexplicable | Une alerte n'existe que par une règle versionnée dont chaque seuil est lisible. La fiche montre les indicateurs lus et les seuils (`explainTrace`), en phrases françaises. |
| Provenance et fiabilité visibles | Chaque valeur météo porte sa source (Open-Meteo, fixture de démonstration, station) et sa date ; les prévisions sont `ESTIMATED`. Une alerte calculée sur des données de repli le dit en tête. |
| Message court ≤ 160 caractères | SMS et notification WhatsApp utilisent `Rule.messageShort` rendu (commune et chiffres inclus), vérifié par test ; le lien vers la fiche est ajouté seulement s'il tient dans la limite. |
| Délai de refroidissement | Une même règle ne relance pas d'alerte sur la même commune avant `cooldownHours` ; une aggravation (sévérité supérieure) passe outre et remplace l'alerte en cours. |
| Accusé de lecture | L'ouverture de la fiche vaut lecture ; l'agriculteur peut aussi répondre « OK » sur WhatsApp. L'agent voit qui n'a pas lu et doit être appelé. |
| Sobriété | Au plus une alerte active par catégorie et par commune ; pas de notification entre 21 h et 6 h sauf `CRITICAL`. |

## 1. Personas

Adjoa (agricultrice, téléphone partagé, lit peu) pour A ; Sabi (agent de terrain) pour B ; Rachidatou (agent communal) consulte B ; Koffi (analyste du ministère, grand écran, thème sombre) pour C ; l'équipe d'exploitation pour D et E.

## 2. Parcours

Convention des tableaux identique au registre : **Champs**, **Automatique**, **Bouton**, **Erreurs**, **Hors ligne**, **Composants** (« à créer » quand nouveau).

### 2.A Agriculteur : mes alertes

| Écran | Objectif | Champs | Automatique | Bouton | Erreurs | Hors ligne | Composants |
|---|---|---|---|---|---|---|---|
| A1 Mes alertes | Voir ce qui me concerne | 0 | Alertes actives de la commune de ses exploitations, filtrées par ses cultures (`crop_in` de la règle) ; plus grave en tête ; badge « non lue ». Au-dessus : bande météo 7 jours. | Tap sur une alerte | « Aucune alerte en cours pour votre commune. » (`EmptyState`, ton rassurant) | Dernière liste en cache (Serwist, stratégie réseau d'abord) avec « mise à jour le … ». | `AlertCard` (c0), `SeverityBadge` (c0), `WeatherStrip` (c0), `EmptyState` |
| A2 Fiche d'alerte | Comprendre et agir | 0 | Titre, sévérité en mots et en couleur, **conseil en premier** (grand, 18 px), puis « Pourquoi cette alerte » (2 à 4 phrases issues de la trace), période, source et date des données. Lecture enregistrée à l'ouverture. | « J'ai compris » (56 px) | — | Lecture mise en file et envoyée au retour du réseau. | `Card`, `Alert`, `IndicatorExplanation` (c0), `SourceCaption`, `ReliabilityBadge`, `ListenButton` (à créer, repris de l'auth) |
| A3 Météo de ma commune | Anticiper | 0 | 7 jours : pluie prévue (barres), maximales et minimales, jours secs consécutifs ; cumul des 10 derniers jours comparé à la normale de la zone (profil climatique). | — | « Prévisions momentanément indisponibles : dernières données du … » | Cache de la dernière réponse. | `RainChart` (c0), `WeatherStrip` (c0), `StatTile`, `SourceCaption` |
| A4 Message reçu | Être prévenu hors de l'application | — | WhatsApp (wapy.pro) ou SMS : `messageShort` rendu + lien court vers A2 si la limite le permet ; réponse « OK » = accusé de lecture. | Lien vers A2 | — | Le message est lu hors application ; le lien ouvre la fiche en cache si déjà visitée. | — |

### 2.B Agent : alertes de mes communes

| Écran | Objectif | Champs | Automatique | Bouton | Erreurs | Hors ligne | Composants |
|---|---|---|---|---|---|---|---|
| B1 Alertes de mes communes | Prioriser la journée | 0 : filtres commune, sévérité (`Tabs` : « Actives », « Récentes ») | Alertes des communes du périmètre (`scopeFilter`), triées par sévérité puis nombre d'exploitations touchées ; compteur « non lues par les producteurs ». | Tap sur une alerte | « Aucune alerte active dans vos communes. » | Liste en cache, rafraîchie à la synchronisation. | `Tabs`, `AlertCard` (c0), `Badge`, `SyncStatusChip` |
| B2 Exploitations concernées | Savoir qui appeler ou visiter | 0 | Exploitations touchées (commune + culture + stade de la règle), avec statut du message (envoyé, remis, lu, échec), téléphone, village, distance ; en tête : producteurs **sans téléphone** ou **message en échec**. | « Appeler » (lien `tel:`) ou « Marquer relayé » | « 12 producteurs n'ont pas de téléphone : prévenez-les lors de votre tournée. » | Liste en cache ; « Marquer relayé » passe par l'outbox (`alert.relay`, à ajouter au contrat de sync). | `Table` ou liste de `Card`, `Badge` (statut d'envoi), `Sheet` bas ; à créer : `DeliveryStatusBadge` |
| B3 Relais | Tracer le relais oral | 1 : mode (appel, visite, réunion de groupement) + note courte facultative | Date, agent, position GPS si visite. | « Enregistrer le relais » | — | Outbox. | `RadioGroup`, `Textarea` |

### 2.C Ministère : centre d'alertes national

| Écran | Objectif | Champs | Automatique | Bouton | Erreurs | Hors ligne | Composants |
|---|---|---|---|---|---|---|---|
| C1 Centre d'alertes | Vue nationale | 0 : filtres sévérité, catégorie, département, période | Carte des communes colorées par la sévérité maximale active (couche MapLibre sur les tuiles communes) ; à droite, liste filtrable ; en tête : `StatTile` communes en alerte, exploitations touchées, taux de lecture, fraîcheur des données météo. | Tap commune ou ligne | Données météo de plus de 48 h : bandeau `Alert` `watch` « Données météo anciennes, alertes suspendues pour les communes concernées ». | En ligne seulement. | `AgriMap` (étape 4), `StatTile`, `Table`, `SeverityBadge` (c0), `Alert` |
| C2 Fiche d'alerte (ministère) | Auditer | 0 | Règle et version, indicateurs lus et seuils (trace complète, `IndicatorExplanation`), période, exploitations et surface touchées, diffusion par canal (envoyés, remis, lus, échecs), relais agents, historique de l'alerte (création, aggravation, levée). | « Lever l'alerte » (avec motif) | « Un motif est nécessaire pour lever une alerte. » | — | `Card`, `Table`, `IndicatorExplanation` (c0), `RainChart` (c0) ; à créer : `DeliveryFunnel` |
| C3 Historique | Relire les épisodes | 0 : période, commune, règle | Alertes passées et évaluations (`RuleEvaluation`), comparaison d'une campagne à l'autre. | Export CSV | — | — | `Table`, `Select`, `StatTile` avec tendance |
| C4 Règles | Gouverner les règles | 0 | Liste : code, nom, sévérité, catégorie, version, active, déclenchements sur 30 jours. | Interrupteur « Active » par règle | Désactiver une règle `CRITICAL` demande confirmation et motif. | — | `Table`, `Switch`, `Dialog` |
| C5 Modifier une règle | Ajuster un seuil | 3 au plus par groupe : seuils numériques de la définition (formulaire généré depuis l'arbre), textes (message, message court avec compteur 160, conseil), refroidissement | Toute modification crée une **nouvelle version** (`FOO_V2`), l'ancienne reste consultable ; entrée d'audit `rule.updated` avec diff. Aperçu du message rendu sur une commune réelle. | « Enregistrer la version 2 » | Message court > 160 caractères ; seuil hors bornes physiques (pluie < 0, température > 55 °C). | — | `Form` (Zod : `ruleSchema`), `Input`, `Textarea` ; à créer : `RuleDefinitionEditor`, `MessagePreview` |
| C6 Simulation | Mesurer l'effet d'un seuil | 1 : période (30 jours par défaut) | Rejoue la règle (version en cours ou brouillon) jour par jour sur les observations stockées de chaque commune : nombre d'alertes qui auraient été levées, communes, exploitations touchées, comparaison avec la version active. Rien n'est diffusé. | « Simuler » | « Données insuffisantes pour 14 communes (plus de 20 % de jours manquants). » | — | `Table`, `RainChart`, `StatTile` ; à créer : `SimulationResult` |

### 2.D Diffusion

| Étape | Règle | Détail |
|---|---|---|
| Destinataires | Exploitations de la commune de l'alerte, restreintes aux cultures et stades de la règle quand elle en porte ; agents du périmètre ; ministère (in-app). | Calcul au moment de la création, figé dans `AlertRecipient`. |
| Canaux | In-app toujours ; WhatsApp via wapy.pro si le producteur a un numéro et un consentement WhatsApp ; SMS en repli si WhatsApp échoue (`RECIPIENT_UNKNOWN`) et consentement SMS ; sinon « à relayer » par l'agent (B2). | Le port `MessagingChannel` choisit l'adaptateur ; la clé d'idempotence est `alert-<alertId>-<recipientId>-<canal>`. |
| Statuts | `PENDING` → `SENT` → `DELIVERED` → `READ` ; ou `FAILED` (motif) ; `RELAYED` quand un agent a prévenu oralement. | `DELIVERED` et `READ` viennent du webhook wapy.pro (signature `X-Wapy-Signature`) ou de l'ouverture de la fiche. |
| Relance | Une relance unique après 24 h si non lu et sévérité ≥ `WARNING`, par le canal suivant ; jamais pour `INFO`. | Respecte les quotas wapy.pro (intervalle 3 s, 60 par heure, 500 par jour) : au-delà, envoi étalé et bascule SMS ; le quota restant est affiché en C1. |
| Silence | 21 h à 6 h : envoi différé au matin, sauf `CRITICAL`. | Heure de Porto-Novo. |

### 2.E Ingestion météo

| Étape | Règle | Détail |
|---|---|---|
| Tâche quotidienne | Route `POST /api/v1/monitoring/ingest` appelée par cron (05 h 00, heure de Porto-Novo), protégée par `CRON_SECRET` ; idempotente par (commune, date, nature, source). | Open-Meteo par centroïde communal : observations J−1 (archive) et prévisions J+1 à J+7. |
| Évaluation | Après ingestion, évaluation des règles actives pour chaque commune ; une `RuleEvaluation` par couple (règle, commune), déclenchée ou non, avec la trace. | Cultures et stades de la campagne ouverte lus dans le registre (`crop_in`, `crop_stage_in`). |
| Fraîcheur | Date de dernière ingestion réussie affichée en C1, A3 et sur chaque fiche ; au-delà de 48 h, les règles ne déclenchent plus d'alerte (évaluation marquée « données anciennes »). | Indicateur `observed_days_missing_30d` exposé. |
| Repli | Open-Meteo injoignable : bascule sur la fixture (`WEATHER_PROVIDER=fixture` ou repli automatique après 3 échecs), provenance `BAIS_SEED`, fiabilité `SYNTHETIC`, bandeau visible « Données de démonstration » ; aucune alerte diffusée hors application sur des données de repli. | Journalisé (`monitoring.ingest.fallback`). |

## 3. Composants

| Composant | État | Rôle |
|---|---|---|
| `Card`, `Alert`, `Badge`, `Table`, `Tabs`, `Switch`, `Dialog`, `Form`, `StatTile`, `SourceCaption`, `ReliabilityBadge`, `EmptyState`, `SyncStatusChip`, `AgriMap` | Existants | Voir docs/modules/design-system.md |
| `SeverityBadge`, `AlertCard`, `WeatherStrip`, `RainChart`, `IndicatorExplanation` | En préparation (c0) | Sévérité en mot + couleur ; carte d'alerte avec conseil ; bande 7 jours ; barres de pluie ; phrases de la trace |
| `ListenButton` | À créer | Lecture audio du titre et du conseil (espace agriculteur) |
| `DeliveryStatusBadge`, `DeliveryFunnel` | À créer | Statut d'envoi par destinataire ; entonnoir envoyés → remis → lus |
| `RuleDefinitionEditor`, `MessagePreview`, `SimulationResult` | À créer | Seuils éditables générés depuis l'arbre, aperçu rendu avec compteur 160, résultats de simulation |

## 4. Modèle de données

Reprend docs/04 §7. Le schéma actuel (`prisma/schema.prisma`) ne contient encore aucune table de monitoring, de notification ni de consentement.

| Table | Colonnes (en plus de docs/04 et de la provenance) | Remarques |
|---|---|---|
| `weather_observation` | `commune_id`, `observed_on`, `kind` (OBSERVED, FORECAST, REANALYSIS), `issued_at` (émission de la prévision), `temp_max_c`, `temp_min_c`, `precipitation_mm`, `et0_mm`, `relative_humidity_pct`, `wind_kmh`, `soil_moisture_pct` | Unique (commune, date, kind, source, issued_at::date) ; index (commune, observed_on) ; partition mensuelle plus tard |
| `rule` | `code`, `version`, `name`, `description`, `severity`, `category`, `target`, `definition` jsonb, `message_fr`, `message_short`, `advice_fr`, `cooldown_hours`, `enabled`, `supersedes_id`, `created_by_id` | Unique (code, version) ; une seule version `enabled` par code |
| `rule_evaluation` | `rule_id`, `commune_id`, `reference_date`, `evaluated_at`, `matched`, `indicators_snapshot` jsonb, `trace` jsonb, `missing` text[], `data_stale` bool, `simulation_id` nullable, `alert_id` nullable | Les simulations écrivent avec `simulation_id` et ne créent jamais d'alerte |
| `alert` | colonnes docs/04 + `rule_version`, `advice_fr`, `commune_id`, `data_source_id`, `raised_by_evaluation_id`, `superseded_by_id`, `resolved_reason`, `resolved_by_id` | Index (commune, status), (status, severity) |
| `alert_recipient` | `alert_id`, `farm_id` nullable, `user_id` nullable, `phone_e164` nullable, `channel` (IN_APP, WHATSAPP, SMS, RELAY), `status` (PENDING, SENT, DELIVERED, READ, FAILED, RELAYED), `provider_message_id`, `failure_reason`, `attempts`, `next_attempt_at`, `sent_at`, `delivered_at`, `acknowledged_at`, `relayed_by_id`, `relay_mode` | Unique (alert, farm, user, channel) ; index (status, next_attempt_at) pour la relance |
| **`channel_consent`** (nouvelle) | `farmer_id` ou `user_id`, `channel` (WHATSAPP, SMS), `granted`, `granted_at`, `revoked_at`, `method` (AGENT_FORM, OTP, WHATSAPP_REPLY), `evidence` (référence transmise à wapy.pro dans `consentement`) | Exigée par wapy.pro et par l'APDP ; recueillie à l'enrôlement (A2 du registre) et à la première connexion |
| **`simulation_run`** (nouvelle) | `rule_id` ou `draft_definition` jsonb, `from`, `to`, `requested_by_id`, `status`, `summary` jsonb | Trace des simulations C6 |
| **`ingestion_run`** (nouvelle) | `started_at`, `finished_at`, `provider` (OPEN_METEO, FIXTURE), `status`, `communes_ok`, `communes_failed`, `error` | Alimente la fraîcheur (C1, A3) et le repli (E) |

## 5. API et droits

| Route | Méthode | Rôle | Action (`policies.matrix.ts`) |
|---|---|---|---|
| `/api/v1/alerts` | GET | Tous (filtré par périmètre : SELF → communes de ses exploitations) | `alert.read` (existe) |
| `/api/v1/alerts/[id]` | GET | Idem, 404 hors périmètre | `alert.read` |
| `/api/v1/alerts/[id]/ack` | POST | Destinataire | `alert.acknowledge` (à ajouter : FARMER SELF, AGENT SCOPE, COOPERATIVE SCOPE) |
| `/api/v1/alerts/[id]/relay` | POST | Agent | `alert.relay` (à ajouter : AGENT SCOPE) |
| `/api/v1/alerts/[id]/resolve` | POST | Ministère | `alert.resolve` (à ajouter : ADMIN_STATE ALL) |
| `/api/v1/weather?commune=` | GET | Tous | public (données agrégées, cache court) |
| `/api/v1/monitoring/ingest` | POST | Cron, en-tête `Authorization: Bearer CRON_SECRET` | hors session, secret comparé en temps constant |
| `/api/v1/rules` | GET, POST | Ministère | `rule.manage` (existe : ADMIN_STATE ALL) |
| `/api/v1/rules/[code]` | GET, PATCH (nouvelle version), POST `/toggle` | Ministère | `rule.manage` |
| `/api/v1/rules/simulate` | POST | Ministère | `rule.simulate` (à ajouter : ADMIN_STATE ALL ; lecture seule, isolé de `rule.manage` pour un rôle d'analyste futur) |
| `/api/v1/webhooks/wapy` | POST | wapy.pro, signature HMAC | hors session |

Audit à ajouter (`AuditAction`) : `alert.raised`, `alert.acknowledged`, `alert.relayed`, `alert.resolved`, `rule.created`, `rule.updated`, `rule.toggled`, `rule.simulated`, `monitoring.ingest.fallback`.

## 6. Points à trancher

1. **Stade FLOWERING** : absent de `CropStage` ; la règle de chaleur vise `GROWING`. L'ajouter (déclaré par l'agent ou déduit du calendrier) rendrait l'alerte plus juste.
2. **Évaluation par commune ou par exploitation** : la cible `FARM` (docs/04) exigerait des données météo par point ; proposition : commune en V1, exploitation quand les données satellites arriveront.
3. **Alertes de masse et quotas wapy.pro** (500 envois par jour) : négocier un quota, ou passer par l'API WhatsApp Business pour les alertes (ADR-0007 le permet).
4. **Seuils** : les six règles sont indicatives ; atelier de validation avec l'ATDA et l'INRAB, et période d'observation silencieuse (évaluation sans diffusion) avant activation.
5. **Langues nationales** : messages et audio en fon, yoruba, bariba, dendi ; `Rule` porterait alors des messages par langue (`messages` jsonb) plutôt que trois colonnes françaises.
6. **Rétention** : `rule_evaluation` croît vite (règles × communes × jours) ; proposition : 13 mois en ligne, agrégats au-delà.
7. **Consentement** : recueillir WhatsApp et SMS séparément à l'enrôlement (case unique « être prévenu par message » ou deux cases) ; impact sur le parcours A2 du registre.
