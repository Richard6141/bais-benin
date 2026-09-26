# Suivi du producteur sur WhatsApp et palmarès public — guide du module livré

Suite de la phase 0. Le producteur est prévenu sur WhatsApp quand l'État répond à sa demande ou à
son signalement (section 1). Le palmarès public est décrit en section 2.

## 1. Messages de suivi sur WhatsApp

### Quand un message part

| Événement | Message (extrait) |
|---|---|
| Demande d'assistance prise en charge | « votre demande (intrants) du 24/09 est prise en charge par un agent de votre commune » |
| Demande d'assistance résolue | « … est résolue. Réponse de l'agent : « … » » |
| Signalement confirmé | « un agent a confirmé votre signalement (ravageur) du 24/09. Il compte pour la surveillance de votre zone… » |
| Signalement écarté | « … a été écarté après vérification. Motif : « … ». Si le problème continue, signalez-le de nouveau… » |

Le message nomme l'objet et la date, jamais l'agent (ni nom ni numéro) : le détail reste dans
l'espace du producteur. La réponse ou le motif de l'agent est cité sur une ligne, tronqué à
280 caractères. Textes : `src/modules/notifications/messages.ts`.

Le destinataire est le producteur concerné : l'auteur de la demande, ou le producteur de
l'exploitation signalée (même quand c'est l'agent qui a déposé le signalement). Un compte
qu'aucune fiche producteur ne relie n'est pas prévenu, faute de consentement enregistrable.

### Accord du producteur

Rien ne part sans accord WhatsApp en cours (`channel_consent`, canal `WHATSAPP`), vérifié au
moment de l'envoi : un accord retiré entre-temps arrête aussi les messages déjà en file. Jusqu'ici
seul le jeu de démonstration créait des accords ; le producteur donne ou retire désormais le sien
depuis **Mon compte → Mes accords** (droit `consent.manage`, portée `SELF`). Le numéro du compte
a été vérifié par un code WhatsApp à la connexion : l'accord est enregistré avec la méthode `OTP`.
Chaque changement est journalisé (`consent.whatsapp.granted`, `consent.whatsapp.revoked`). Le même
accord couvre les alertes de la commune.

### Envoi

- **File** : table `farmer_notification`, un message par événement (clé unique type + demande ou
  signalement). Le message est écrit dans la transaction qui change le statut : pas de message pour
  un changement refusé, pas de changement sans message.
- **Tout de suite** : l'action de l'agent (ou du ministère) envoie le message juste après sa
  réponse (`after()`), sans la retarder ni la faire échouer.
- **En reprise** : la tâche planifiée `/api/v1/monitoring/dispatch` (toutes les 10 minutes) envoie
  les messages en attente, après les alertes et seulement si le quota du fournisseur n'est pas
  atteint (20 messages de suivi au plus par passage).
- **Garde-fous** (mêmes règles que les alertes, `src/modules/notifications/policy.ts`) : silence
  de 21 h à 6 h (heure de Porto-Novo), trois essais au plus avec délai croissant, abandon si le
  numéro n'est pas sur WhatsApp, arrêt au quota. Aucun envoi pour une fiche de démonstration
  (fiabilité `SYNTHETIC`).
- **Jamais deux fois** : chaque ligne est réservée avant l'envoi, et la clé d'idempotence
  `farmer-notification-<id>` couvre un arrêt en plein envoi.
- **Numéro** : celui du compte (vérifié par code WhatsApp), sinon celui de la fiche producteur.

### Fichiers

| Fichier | Rôle |
|---|---|
| migration `20260926100000_farmer_follow_up_messages` | Table `farmer_notification` |
| `src/modules/notifications/` | Textes, règles d'envoi, file, accord WhatsApp |
| `src/modules/assistance/handle.ts`, `src/modules/reports/review.ts` | Mise en file avec le changement de statut |
| `src/features/account/` | Carte « Mes accords » de la page Mon compte |
| `tests/integration/farmer-notifications.test.ts` | Accord, envoi, pas de doublon, retrait, motif |

## 2. Palmarès public (complément d'ADR-0018)

### Parcours

- **Producteur** : Mon compte → Mes accords → « Palmarès public ». Il y lit ce qui sera publié
  (nom, commune, rang, production ; jamais le téléphone) et la date de son accord ; il le donne
  ou le retire d'un bouton.
- **Ministère** (`/pilotage/palmares`) : le classement nominatif indique, pour chaque producteur,
  si son accord est donné. Sous le classement, « Publier ce palmarès » reprend les critères
  affichés (culture, campagne, territoire, mesure, vérification) et le nombre de lauréats voulu
  (1 à 100). La liste « Palmarès publiés » permet de retirer un palmarès.
- **Public** (`/palmares`, lien « Palmarès » de l'en-tête) : palmarès publiés, trois premiers
  lauréats de chacun ; `/palmares/[id]` donne la liste complète.

### Règles

- Seuls les producteurs dont l'accord est en cours sont publiés, pris dans l'ordre du classement
  complet : le rang publié est leur vrai rang. Un rang absent est celui d'un producteur qui n'a
  pas donné son accord, jamais nommé.
- La publication est un instantané : nom, commune, département, rang, production et surface
  recopiés. Aucun téléphone, NPI ou code producteur.
- Retirer son accord supprime ses lignes de tous les palmarès publiés, dans la même transaction.
  La lecture publique ne sert en plus que les lauréats dont l'accord est en cours.
- Un palmarès retiré par le ministère quitte la page publique ; le ministère le voit toujours,
  avec la date du retrait.
- Journal : `consent.ranking.granted`, `consent.ranking.revoked`, `analytics.ranking.published`,
  `analytics.ranking.withdrawn`.

### Droits

| Action | ADMIN_STATE | AGENT_AGRICULTURE | FARMER | COOPERATIVE | BUYER |
|---|---|---|---|---|---|
| `ranking.read` | ALL | NONE | NONE | NONE | NONE |
| `ranking.publish` | ALL | NONE | NONE | NONE | NONE |
| `consent.manage` | NONE | NONE | SELF | NONE | NONE |

La page publique ne demande aucun droit : elle ne sert que ce que les producteurs ont accepté de
rendre public.

### Fichiers

| Fichier | Rôle |
|---|---|
| migration `20260926110000_public_rankings` | Tables `ranking_consent`, `published_ranking`, `published_ranking_entry` |
| `src/database/sql/producer-ranking.sql.ts` | Accord de chaque producteur, filtre « consentants seulement » |
| `src/modules/public-ranking/` | Accord, publication, retrait, lecture publique |
| `src/features/dashboard/ranking-publication*.ts(x)` | Publication et retrait sur `/pilotage/palmares` |
| `src/app/(public)/palmares/`, `src/features/public-ranking/` | Pages publiques |
| `tests/integration/public-ranking.test.ts` | Droits, consentants seulement, rang conservé, retraits |
