# Module signalements — guide du module livré

Phase 0 de la feuille de route : le producteur signale un problème sur une parcelle, l'agent
vient constater, le ministère suit l'ensemble. Ce document couvre l'étape 1 (signalement et suite
donnée). La détection des foyers (étape 2, ADR-0015) et les demandes d'assistance (étape 3) y
seront ajoutées.

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
Colonne PostGIS `geography(Point, 4326)` avec index GiST, pour la détection de l'étape 2.

## 4. Photo

Réduite sur l'appareil (canevas, 1280 px au plus, WebP ou JPEG, moins de 380 000 caractères en
base64), ce qui retire déjà les métadonnées. Le serveur la réencode quand même en WebP avec sharp
(`src/modules/reports/photo.ts`) : orientation appliquée, aucune métadonnée conservée (EXIF,
position de l'appareil, modèle du téléphone). Stockée à part (`field_report_photo`), servie par
`/api/v1/reports/[id]/photo` à qui peut lire le signalement, jamais en cache partagé.

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
