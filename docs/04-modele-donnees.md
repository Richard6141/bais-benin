# 04 — Modèle de données

> Rédigé par : Backend/Data, avec l'Architecte et la Sécurité.
> Le schéma Prisma définitif sera écrit en phase 2 à partir de ce document. Les fragments ci-dessous sont des esquisses de modélisation, pas du code livré.

## 1. Principes

1. **Provenance obligatoire.** Toute table métier porte les colonnes `source_id`, `source_date`, `reliability`. Le trio est regroupé dans un mixin conceptuel `Provenance` répété sur chaque modèle (Prisma n'a pas d'héritage ; on le matérialise par convention et on le vérifie par un test de schéma).
2. **Identifiants stables et générables hors-ligne.** Clés primaires `uuid` v7 générées côté client pour les entités créées sur le terrain (exploitation, parcelle, déclaration), côté serveur ailleurs. Les codes lisibles (`BJ-ATA-DJO-000123`) sont des attributs secondaires.
3. **Historisation.** Les entités du registre ne sont jamais supprimées physiquement (`archived_at`). Chaque modification sensible produit une ligne dans `audit_log` ; les changements de cultures et de production se font par campagne, ce qui donne l'historique naturellement.
4. **Minimisation des données personnelles.** Un agriculteur est décrit par le strict nécessaire. Le NPI n'est jamais stocké en clair : on garde un **haché salé** (recherche d'unicité) et un **chiffré** (restitution par un rôle habilité, clé hors base), plus la date de vérification.
5. **Géométrie en PostGIS.** Colonnes `geography(Point, 4326)` pour les localisations et `geography(Polygon, 4326)` pour les emprises. La superficie calculée (`ST_Area`) est stockée à côté de la superficie déclarée ; l'écart alimente la qualité des données.
6. **Séparation lecture / écriture pour les agrégats.** Le centre de pilotage lit des vues matérialisées, jamais les tables de détail.

## 2. Vue d'ensemble des entités

```
 Territoire                     Identité                       Registre
 ──────────                     ────────                       ────────
 Departement 1─n Commune        User 1─n Account               Farmer 1─n Farm 1─n Parcel
 Commune 1─n Arrondissement     User 1─n RoleAssignment        Farm n─1 Commune / Arrondissement / Village
 Arrondissement 1─n Village     RoleAssignment n─1 Scope       Farm 1─n FarmMembership (coopératives)
                                User 0..1 Farmer               Parcel 1─n CropSeason n─1 Crop, n─1 Season
                                User 0..1 AgentProfile         CropSeason 1─n ProductionDeclaration
                                User 0..1 BuyerProfile         Farm 1─n Verification
                                Organization (coop, acheteur)  Farm 1─n FarmEvent (historique)

 Monitoring                     Marché                         Transverse
 ──────────                     ──────                         ──────────
 WeatherObservation n─1 Commune Listing n─1 Farm, n─1 Crop     DataSource
 Rule 1─n RuleEvaluation        PurchaseRequest n─1 Organization AuditLog
 Alert n─1 Rule, n─1 Zone       Match n─1 Listing, n─1 Request  Notification
 AlertRecipient n─1 Alert       ─                               SyncCommand
 RasterLayer (futur)            Assistant                       Attachment
                                Conversation 1─n Message
                                Document 1─n DocumentChunk (pgvector)
```

## 3. Référentiels transverses

### DataSource
| Champ | Type | Note |
|---|---|---|
| id | text (PK) | code court : `MAEP_DSA`, `INSTAD`, `OSM`, `GEOBOUNDARIES`, `OPEN_METEO`, `ATDA_TERRAIN`, `BAIS_SEED` |
| name, organization, url, licence | text | |
| kind | enum | OFFICIAL, FIELD, PUBLIC_OPEN_DATA, SENSOR, MODEL, SYNTHETIC |

### Mixin Provenance (répété sur chaque table métier)
| Champ | Type | Note |
|---|---|---|
| source_id | FK DataSource | obligatoire |
| source_date | timestamptz | date de la donnée (pas de l'insertion) |
| reliability | enum Reliability | DECLARED, AGENT_VERIFIED, FIELD_VERIFIED, OFFICIAL, ESTIMATED, SYNTHETIC |
| created_at, updated_at, archived_at | timestamptz | |
| created_by, updated_by | FK User (nullable pour les imports) | |

## 4. Territoire (`territory`)

| Table | Champs principaux |
|---|---|
| departement | id, code (`BJ-AL`…), name, chef_lieu, geom (MultiPolygon), centroid |
| commune | id, code, departement_id, name, geom, centroid, population_rurale_estimee, zae_id |
| arrondissement | id, code, commune_id, name, geom (nullable) |
| village | id, code, arrondissement_id, name, centroid (nullable) |
| agro_ecological_zone (zae) | id, code, name, rainfall_regime (BIMODAL, UNIMODAL), description |

Index : GiST sur toutes les géométries ; index B-tree sur les codes ; recherche plein texte `pg_trgm` sur les noms (saisie avec fautes fréquentes).

## 5. Identité et accès (`identity`, `authorization`)

### User
| Champ | Type | Note |
|---|---|---|
| id | uuid | |
| phone_e164 | text unique nullable | `+22901XXXXXXXX` ; identifiant principal des agriculteurs et agents |
| email | citext unique nullable | institutions |
| password_hash | text nullable | Argon2id, uniquement pour les comptes institutionnels |
| display_name | text | |
| preferred_locale | text | `fr` par défaut ; `fon`, `yo`, `bba`, `ddn` prévus |
| status | enum | PENDING, ACTIVE, SUSPENDED, DELETED |
| npi_hash | bytea nullable | HMAC-SHA256 du NPI avec clé serveur ; unique |
| npi_encrypted | bytea nullable | AES-256-GCM, clé dans le gestionnaire de secrets |
| npi_verified_at, npi_verification_provider | timestamptz, text | renseignés par le port `IdentityVerificationProvider` |
| last_login_at, mfa_enabled | | |

### Account (Auth.js) — comptes de fournisseurs externes (OIDC futur ANIP, Google pour institutions si autorisé).

### OtpChallenge
id, user_id nullable, phone_e164, code_hash, channel (WHATSAPP, SMS, EMAIL), expires_at, attempts, consumed_at. Purge automatique après 24 h.

### Role (enum)
`FARMER`, `FIELD_AGENT`, `AGENT_SUPERVISOR`, `COOPERATIVE_MANAGER`, `BUYER`, `COMMUNE_ADMIN`, `MINISTRY_ANALYST`, `MINISTRY_ADMIN`, `PLATFORM_ADMIN`.

### RoleAssignment
| Champ | Note |
|---|---|
| user_id, role | |
| scope_type | enum : NATIONAL, DEPARTEMENT, COMMUNE, ARRONDISSEMENT, ORGANIZATION, SELF |
| scope_id | uuid nullable (id du territoire ou de l'organisation) |
| granted_by, granted_at, revoked_at | traçabilité |

Un utilisateur peut cumuler plusieurs affectations (un agent sur deux communes). La politique d'accès calcule l'union des périmètres.

### Organization
id, kind (COOPERATIVE, UNION, BUYER_COMPANY, NGO, BANK), name, registration_number, commune_id, contact, verified_at, Provenance.

### AgentProfile
user_id, matricule, structure (ATDA pôle, commune), assigned_communes (via RoleAssignment), device_ids (pour la synchro).

### BuyerProfile
user_id, organization_id, interests (crops[]), preferred_zones.

## 6. Registre national (`registry`)

### Farmer
| Champ | Type | Note |
|---|---|---|
| id | uuid | |
| user_id | FK User nullable | un agriculteur peut exister sans compte (créé par un agent) |
| code | text unique | `BJ-F-000000123` |
| first_name, last_name | text | |
| gender | enum M, F, UNSPECIFIED | |
| birth_year | int nullable | année seulement (minimisation) |
| phone_e164 | text nullable | peut différer du compte (téléphone d'un proche) |
| village_id, commune_id | FK | commune dénormalisée pour les filtres |
| household_size | int nullable | |
| literacy_hint | enum nullable | NONE, BASIC, FULL — sert à adapter l'interface, jamais affiché ailleurs |
| Provenance | | |

### Farm (exploitation)
| Champ | Type | Note |
|---|---|---|
| id | uuid (client) | |
| code | text unique | `BJ-ATA-DJO-000123` (département, commune, séquence) |
| farmer_id | FK | exploitant principal |
| name | text nullable | |
| location | geography(Point) | siège ou centre de l'exploitation |
| commune_id, arrondissement_id, village_id | FK | dérivés de la géométrie, confirmés par l'agent |
| declared_area_ha | numeric(10,3) | somme déclarée |
| computed_area_ha | numeric(10,3) | somme des `ST_Area` des parcelles |
| tenure | enum | OWNED, RENTED, FAMILY, SHARED, UNKNOWN |
| main_activity | enum | CROPS, MIXED, LIVESTOCK_DOMINANT |
| verification_status | enum | DECLARED, AGENT_VERIFIED, FIELD_VERIFIED, DISPUTED |
| verified_at, verified_by | | |
| registered_by_agent_id | FK User nullable | |
| version | int | verrou optimiste pour la synchronisation |
| Provenance | | |

### Parcel (parcelle)
id (client), farm_id, code, geom geography(Polygon) nullable, centroid geography(Point), declared_area_ha, computed_area_ha, soil_type enum nullable, irrigation enum (NONE, MANUAL, DRIP, FLOOD), slope_hint, capture_method enum (GPS_WALK, MAP_DRAW, DECLARED_ONLY), gps_accuracy_m, version, Provenance.

### Crop (culture — référentiel)
id, code (`MAIZE`, `CASSAVA`…), name_fr, category enum, unit enum (KG, T, BAG_100KG, BUNCH), typical_yield_t_ha numeric nullable, sowing_windows jsonb (par régime pluviométrique), Provenance.

### Season (campagne agricole)
id, code (`2025-2026`), starts_on, ends_on, sub_season enum (MAIN_RAINY, SHORT_RAINY, DRY, ANNUAL), status (PLANNED, OPEN, CLOSED).

### CropSeason (culture × parcelle × campagne)
| Champ | Note |
|---|---|
| id (client), parcel_id, crop_id, season_id | unique (parcel, crop, season, sub_season) |
| area_ha | part de la parcelle consacrée |
| sowing_date, expected_harvest_date | |
| variety, seed_source, inputs_used (jsonb) | |
| stage | enum : PLANNED, SOWN, GROWING, HARVESTED, FAILED |
| Provenance | |

### ProductionDeclaration
id (client), crop_season_id, declared_quantity, unit, quantity_kg (normalisé), declared_on, declared_by (farmer ou agent), price_hint_fcfa_per_kg nullable, losses_pct nullable, loss_cause enum nullable, Provenance.

### Verification
id, farm_id, parcel_id nullable, kind (DESK_REVIEW, FIELD_VISIT, REMOTE_SENSING), outcome (CONFIRMED, CORRECTED, REJECTED), notes, evidence_attachment_ids, visited_at, agent_id, gps_point, Provenance.

### FarmMembership
farm_id, organization_id, role_in_org, joined_at, left_at.

### FarmEvent (historique lisible)
id, farm_id, kind (CREATED, UPDATED, VERIFIED, PARCEL_ADDED, CROP_DECLARED, HARVEST_DECLARED, ALERT_RECEIVED, LISTING_PUBLISHED…), payload jsonb, actor_id, occurred_at. Alimenté par les événements de domaine, sert de fil d'activité.

## 7. Monitoring (`monitoring`)

### WeatherObservation
id, commune_id, observed_on (date), kind (FORECAST, OBSERVED, REANALYSIS), temp_max_c, temp_min_c, precipitation_mm, et0_mm, soil_moisture_pct nullable, wind_kmh, Provenance (`OPEN_METEO`). Unique (commune, date, kind, source). Partitionnement mensuel prévu.

### Rule
| Champ | Note |
|---|---|
| id, code (`WATER_STRESS_V1`), name, description | |
| severity | enum : INFO, WATCH, WARNING, CRITICAL |
| category | enum : WATER_STRESS, FLOOD, HEAT, PEST, MARKET, ADMIN |
| definition | jsonb validé par Zod : arbre de conditions `all` / `any` sur des indicateurs (`temp_max_avg_3d`, `rain_sum_10d`, `crop_stage_in`, `zae_in`) avec opérateurs |
| target | enum : COMMUNE, FARM |
| cooldown_hours | évite les doublons |
| enabled, version, Provenance | |

Exemple de définition (illustratif) :
```json
{
  "all": [
    { "indicator": "temp_max_avg_3d", "op": ">=", "value": 36 },
    { "indicator": "rain_sum_10d", "op": "<", "value": 5 },
    { "indicator": "crop_stage_in", "value": ["SOWN", "GROWING"] }
  ]
}
```

### RuleEvaluation
id, rule_id, evaluated_at, commune_id, indicators_snapshot jsonb, matched bool, alert_id nullable. Conserve la trace de pourquoi une alerte a été (ou non) levée.

### Alert
id, rule_id, severity, category, title, message_fr, message_short (SMS 160 car.), scope_type, scope_id (commune…), affected_farm_count, affected_area_ha, starts_at, ends_at nullable, status (ACTIVE, RESOLVED, EXPIRED, CANCELLED), Provenance.

### AlertRecipient
alert_id, farm_id, user_id nullable, channel, sent_at, delivered_at, acknowledged_at, action_taken enum nullable.

### RasterLayer (futur)
id, code (`NDVI_S2`), acquired_on, tile_url_template, bbox, Provenance. Permet d'ajouter des couches satellites sans migration.

## 8. Marché (`market`)

### Listing (offre de récolte)
id (client), farm_id, crop_id, season_id, quantity_kg, available_from, available_until, price_fcfa_per_kg nullable, negotiable bool, quality_grade, storage_location (Point), commune_id, status (DRAFT, PUBLISHED, RESERVED, SOLD, EXPIRED), verified_farm bool (dénormalisé), Provenance.

### PurchaseRequest (demande d'achat)
id, organization_id, crop_id, quantity_kg, target_zone_type, target_zone_id, deadline, price_max_fcfa_per_kg nullable, status.

### Match
id, listing_id, purchase_request_id, proposed_by, status (PROPOSED, ACCEPTED, DECLINED, COMPLETED), messages via Notification.

## 9. Assistant (`assistant`)

### Document
id, title, source_id, publisher (INRAB, MAEP, FAO…), language, crop_ids[], topics[], published_on, url, checksum, Provenance.

### DocumentChunk
id, document_id, ordinal, content, embedding vector(1024), token_count. Index HNSW.

### Conversation, Message
conversation : id, user_id, context (farm_id nullable, commune_id nullable), started_at.
message : id, conversation_id, role (USER, ASSISTANT, SYSTEM), content, citations jsonb (`[{document_id, chunk_id, quote}]`), confidence enum (HIGH, MEDIUM, LOW, INSUFFICIENT), confidence_score numeric, model, latency_ms, tokens_in, tokens_out.

## 10. Transverse

### AuditLog (append-only)
id, occurred_at, actor_id, actor_role, action (`farm.update`, `user.role.grant`, `npi.reveal`…), resource_type, resource_id, before jsonb nullable, after jsonb nullable, ip_hash, user_agent, correlation_id. Aucune mise à jour ni suppression (droits Postgres révoqués sur UPDATE/DELETE pour le rôle applicatif).

### SyncCommand
id, idempotency_key unique, device_id, user_id, command_type, payload jsonb, client_created_at, received_at, applied_at, outcome (APPLIED, DUPLICATE, REJECTED, CONFLICT), error jsonb.

### Notification
id, user_id, channel, template_code, payload jsonb, status (QUEUED, SENT, DELIVERED, FAILED), provider (`wapy`, `sms`, `email`, `inapp`), provider_message_id, sent_at.

### Attachment
id, owner_type, owner_id, kind (PHOTO, DOCUMENT, AUDIO), storage_key, mime, size, sha256, captured_at, gps_point nullable.

## 11. Vues matérialisées pour le pilotage (`analytics`)

| Vue | Grain | Contenu |
|---|---|---|
| mv_farm_stats_by_commune | commune × campagne | nb exploitations, nb agriculteurs, ha déclarés, ha calculés, part vérifiée |
| mv_crop_stats_by_commune | commune × culture × campagne | nb exploitations, ha, production kg, rendement moyen, part vérifiée |
| mv_crop_stats_by_departement | département × culture × campagne | idem agrégé |
| mv_alerts_active | zone × gravité | nb alertes, exploitations et ha touchés |
| mv_data_quality | commune | fraîcheur médiane, écart superficie déclarée/calculée, doublons suspects |
| mv_production_timeseries | campagne × culture (national) | séries pour les graphiques d'évolution |

Rafraîchissement `CONCURRENTLY`, déclenché après chaque lot de synchronisation appliqué et par le worker toutes les 5 minutes.

## 12. Sécurité au niveau base

- Deux rôles Postgres : `bais_app` (DML restreint, pas de DDL, pas de DELETE sur audit) et `bais_migrator`.
- Politiques RLS activées sur `farmer`, `farm`, `parcel`, `production_declaration` en défense en profondeur : la session applicative pose `SET LOCAL app.scope_communes` et `app.user_id` ; les politiques filtrent en plus du moteur applicatif.
- Colonnes chiffrées : `npi_encrypted` uniquement ; clé fournie par variable d'environnement en V1, KMS en production.

## 13. Esquisse Prisma (extrait, à finaliser en phase 2)

```prisma
model Farm {
  id                 String   @id @default(uuid(7)) @db.Uuid
  code               String   @unique
  farmerId           String   @map("farmer_id") @db.Uuid
  farmer             Farmer   @relation(fields: [farmerId], references: [id])
  name               String?
  location           Unsupported("geography(Point, 4326)")
  communeId          String   @map("commune_id")
  commune            Commune  @relation(fields: [communeId], references: [id])
  declaredAreaHa     Decimal  @map("declared_area_ha") @db.Decimal(10, 3)
  computedAreaHa     Decimal? @map("computed_area_ha") @db.Decimal(10, 3)
  verificationStatus VerificationStatus @default(DECLARED) @map("verification_status")
  version            Int      @default(1)

  // Provenance
  sourceId    String      @map("source_id")
  source      DataSource  @relation(fields: [sourceId], references: [id])
  sourceDate  DateTime    @map("source_date")
  reliability Reliability
  createdAt   DateTime    @default(now()) @map("created_at")
  updatedAt   DateTime    @updatedAt @map("updated_at")
  archivedAt  DateTime?   @map("archived_at")

  parcels Parcel[]
  @@index([communeId, verificationStatus])
  @@map("farm")
}
```

Les colonnes `Unsupported` sont créées et indexées par une migration SQL écrite à la main dans `src/database/migrations/`, exécutée par `prisma migrate` (migrations personnalisées).

## 14. Volumes cibles et performance

| Table | V1 (démo) | Cible nationale | Stratégie |
|---|---|---|---|
| farm | 50 000 | 1,5 million | index composites commune × statut, pagination par curseur |
| parcel | 120 000 | 4 millions | GiST, tuiles vectorielles précalculées par zoom |
| crop_season | 250 000 | 10 millions par an | partition par season_id |
| weather_observation | 77 communes × 365 × 2 | idem, croît linéairement | partition mensuelle, rétention 5 ans |
| audit_log | croissance continue | | partition mensuelle, archivage froid |
