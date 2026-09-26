# Module signalements — guide du module livré

Phase 0 de la feuille de route : le producteur signale un problème sur une parcelle, l'agent
vient constater, le ministère suit l'ensemble. Ce document couvre l'étape 1 (signalement et suite
donnée), l'étape 2 (détection des foyers, ADR-0015, section 8) et l'étape 3 (demandes
d'assistance, section 9). Les messages WhatsApp de suivi sont décrits dans
`docs/modules/suivi-et-palmares.md`.

## 1. Parcours

- **Producteur** (`/agriculteur/signaler`) : type de problème (ravageur, maladie des cultures,
  maladie animale, autre), exploitation et parcelle (listées depuis le registre, rien à saisir),
  culture touchée parmi celles de la parcelle pour la campagne en cours, quelques mots, photo
  facultative, position du téléphone facultative. `/agriculteur/signalements` montre ses
  signalements et la suite donnée.
- **Agent** (`/agent/signalements`) : signalements des exploitations qu'il a enregistrées
  (ADR-0014), « à visiter » d'abord. La fiche montre la photo, la position retenue et le
  producteur ; après la visite, l'agent confirme ou écarte, motif obligatoire pour écarter.
- **Ministère** (`/pilotage/signalements`) : tous les signalements du pays ; il statue sur ceux
  qu'aucun agent ne suit (exploitation enregistrée par son producteur, ADR-0013).

Un signalement isolé n'est jamais une alerte : il prévient l'agent de l'exploitation, rien de
plus.

## 2. Hors ligne

Le signalement est une commande de synchronisation (`fieldReport.create`, même modèle que les
autres, ADR-0005) : il entre dans la file de l'appareil et part tout de suite s'il y a du réseau,
sinon au retour du réseau. Sur les pages de l'espace agriculteur, un bandeau dit combien de
signalements attendent et relance l'envoi (`useSync`). Le formulaire lui-même demande que la page
ait été ouverte en ligne (les pages authentifiées ne sont pas mises en cache, B2).

## 3. Position

GPS du téléphone si le producteur l'a relevé (point hors du Bénin refusé), sinon centre de la
parcelle, sinon point de l'exploitation (`location_source` : `GPS`, `PARCEL`, `FARM`, `NONE`).
Colonne PostGIS `geography(Point, 4326)` avec index GiST, pour la détection de l'étape 2. Un point
GPS à plus de 30 km de l'exploitation est ignoré : le signalement est gardé, placé sur la parcelle
ou l'exploitation, pour qu'on ne puisse pas le déplacer vers une autre zone.

Date d'observation : refusée si elle est à plus d'un jour dans le futur ou de plus de 60 jours ;
une horloge d'appareil légèrement en avance est ramenée à l'heure du serveur. Au plus
20 signalements par compte et par 24 heures (`RATE_LIMITED` au-delà).

## 4. Photo

Réduite sur l'appareil (canevas, 1280 px au plus, WebP ou JPEG, moins de 380 000 caractères en
base64), ce qui retire déjà les métadonnées. Le serveur la réencode quand même en WebP avec sharp
(`src/modules/reports/photo.ts`) : JPEG ou WebP seulement (jamais SVG, TIFF ni PDF), 25 millions
de pixels au plus, orientation appliquée, aucune métadonnée conservée (EXIF, position de
l'appareil, modèle du téléphone). Stockée à part (`field_report_photo`), servie par
`/api/v1/reports/[id]/photo` à qui peut lire le signalement, jamais en cache (`no-store`, même
dans le navigateur). La photo telle qu'envoyée n'est pas recopiée dans le journal des commandes
(`sync_command.payload` ne garde que `{ contentType, omitted: true }`).

Le client coupe ses lots de synchronisation avant 1,8 Mo (`sync-client.ts`) pour ne jamais
dépasser le plafond de 2 Mo du serveur avec plusieurs photos.

**Limite** : les photos sont en base faute de stockage objet dans le projet. À déplacer vers un
stockage objet avant un déploiement à grande échelle.

## 5. Droits

| Action | ADMIN_STATE | AGENT_AGRICULTURE | FARMER | COOPERATIVE | BUYER |
|---|---|---|---|---|---|
| `report.create` | NONE | OWN | SELF | NONE | NONE |
| `report.read` | ALL | OWN | SELF | NONE | NONE |
| `report.review` | ALL | OWN | NONE | NONE | NONE |

`OWN` : exploitations enregistrées par l'agent (`farm.registeredById`, ADR-0014). Un signalement
hors de portée répond comme inexistant (404), en lecture comme en décision.

## 6. Fichiers

| Fichier | Rôle |
|---|---|
| `prisma/schema.prisma`, migration `20260926010000_field_reports` | Tables `field_report` et `field_report_photo` |
| `src/modules/sync/commands.ts`, `handlers/field-report-create.ts` | Commande et application |
| `src/modules/reports/` | Photo, lecture selon la portée, décision, exploitations signalables |
| `src/features/reports/` | Formulaire, compression, listes, fiche, décision, bandeau d'envoi |
| `src/app/api/v1/reports/[id]/photo/route.ts` | Photo authentifiée |
| `tests/integration/field-reports.test.ts` | Droits, position, photo sans EXIF, rejeu, lecture, décision |

## 7. Journal

`report.created` (détail : exploitation, type, présence d'une photo, appareil) et
`report.reviewed` (décision) dans `audit_log` ; événements `REPORT_SUBMITTED` et
`REPORT_REVIEWED` dans le fil d'activité de l'exploitation.

## 8. Détection des foyers (ADR-0015)

Un signalement isolé n'est jamais une alerte. Plusieurs signalements du même type, dans la même
zone, sur une période courte, lèvent une alerte « épidémie probable » par le moteur de règles
existant (ADR-0011), avec sa diffusion (producteurs de la commune, agents, relais oral).

- **Indicateur `report_cluster`** : pour une commune, le plus grand nombre de producteurs
  distincts dont une exploitation a signalé ce type de problème à moins du rayon d'un signalement
  de la commune, sur la durée qui se termine à la date de référence. Des producteurs et non des
  exploitations : un producteur déclare lui-même autant d'exploitations qu'il veut, il ne doit
  jamais lever seul une alerte (correction d'ADR-0015). Les signalements écartés ne comptent pas ;
  `confirmedOnly` restreint aux signalements confirmés. Calcul PostGIS
  (`src/database/sql/report-clusters.sql.ts`).
- **Règles par défaut** : `PEST_OUTBREAK`, `CROP_DISEASE_OUTBREAK`, `ANIMAL_DISEASE_OUTBREAK`,
  3 producteurs, 5 km, 7 jours, gravité « avertissement ». Catégories d'alerte `PEST`,
  `CROP_DISEASE`, `ANIMAL_DISEASE` (migration `20260926020000_alert_disease_categories`).
- **Réglages** : dans « Règles d'alerte », le ministère ajuste le nombre de producteurs (2 au
  moins), le rayon (1 à 50 km) et la durée (1 à 60 jours) ; chaque changement crée une version et
  se simule sur l'historique avant mise en service.
- **Délai** : évaluation quotidienne, et évaluation immédiate après chaque lot synchronisé qui
  apporte des signalements (`evaluateNewReports`, lancé après la réponse par `after()`), pour les
  communes voisines dans le plus grand rayon des règles actives. L'envoi des messages suit au
  prochain passage de la diffusion.
- **Météo** : une météo ancienne ne bloque jamais une règle qui ne lit que des signalements.
- **Provenance** : source `BAIS_SIGNALEMENTS`, fiabilité déclarative (vérifiée par un agent si
  la règle ne compte que des signalements confirmés).
- **Tests** : `tests/integration/outbreak-detection.test.ts` (une exploitation, trois exploitations
  d'un même producteur ou deux producteurs ne suffisent pas, le troisième producteur lève
  l'alerte, pas de doublon, simulation) ; tests unitaires des règles par défaut et de l'éditeur
  de seuils.

## 9. Solliciter l'État (demandes d'assistance)

Le producteur adresse une demande à l'État : conseil, intrants, litige, sinistre ou autre, pour
une de ses exploitations ou, s'il n'en a pas encore, pour sa commune. La demande arrive aux agents
de cette commune, qui la prennent en charge puis la résolvent ; le producteur suit chaque étape.

- **Parcours** : `/agriculteur/solliciter` (objet, exploitation ou commune, quelques mots) et
  `/agriculteur/demandes` (reçue, prise en charge par qui et quand, résolue avec la réponse de
  l'agent) ; `/agent/demandes` (à traiter, en cours, toutes), avec le contact du producteur,
  « Prendre en charge » et « Marquer résolue » (réponse obligatoire, que le producteur lira) ;
  `/pilotage/demandes` pour le ministère. Une demande simple peut être résolue sans passer par
  « en cours ».
- **Hors ligne** : commande `assistance.request` dans la file de l'appareil, comme un
  signalement. L'heure de la demande est celle de sa réception par le serveur : les délais ne
  peuvent pas être antidatés par l'appareil. Au plus 10 demandes par compte et par 24 heures,
  pour qu'un compte ne noie pas les agents d'une commune.
- **Exception à ADR-0014** (validée par le chef d'équipe) : les agents lisent et traitent les
  demandes de toute leur commune (`assistance.read` et `assistance.handle` en portée `SCOPE`), et
  pas seulement celles des exploitations qu'ils ont enregistrées. Raison : un producteur inscrit
  par lui-même n'a pas d'agent enregistreur, et sa demande doit arriver à quelqu'un. L'exception
  est limitée à ce qui sert à traiter la demande : objet, message, commune, nom et numéro du
  demandeur. L'exploitation n'est nommée que si l'agent peut déjà la lire (il l'a enregistrée) ;
  la fiche d'une exploitation qu'il n'a pas enregistrée reste inaccessible (ADR-0014 inchangée).
- **Ministère** : aucune lecture des demandes elles-mêmes. Il voit, par commune et sur 90 jours,
  le nombre de demandes par statut et les délais médians de prise en charge et de résolution
  (`analytics.read`), une commune de moins de 5 demandes étant masquée (k = 5, masquage
  complémentaire quand le total est affiché).
- **Droits** :

| Action | ADMIN_STATE | AGENT_AGRICULTURE | FARMER | COOPERATIVE | BUYER |
|---|---|---|---|---|---|
| `assistance.request` | NONE | NONE | SELF | NONE | NONE |
| `assistance.read` | NONE | SCOPE | SELF | NONE | NONE |
| `assistance.handle` | NONE | SCOPE | NONE | NONE | NONE |

- **Journal** : `assistance.requested`, `assistance.taken`, `assistance.resolved` dans
  `audit_log` ; événement `ASSISTANCE_REQUESTED` dans le fil de l'exploitation quand la demande en
  vise une.
- **Fichiers** : migration `20260926030000_assistance_requests`, `src/modules/assistance/`,
  `src/database/sql/assistance.sql.ts`, `src/modules/sync/handlers/assistance-request.ts`,
  `src/features/assistance/`, `tests/integration/assistance-requests.test.ts`.
- **Message WhatsApp** : le producteur est prévenu quand sa demande est prise en charge ou
  résolue, et quand son signalement est confirmé ou écarté, s'il a donné son accord
  (`docs/modules/suivi-et-palmares.md`).

