# ADR-0024 : Groupes de producteurs formés depuis le palmarès

- Statut : acceptée
- Date : 2026-09-26
- Décideurs : chef d'équipe, Sécurité, Backend/Data

## Contexte

Le palmarès (ADR-0018) classe les producteurs d'une culture, pour une campagne et une zone. Le
ministère veut en tirer un groupe durable, par exemple « les 100 meilleurs producteurs de coton du
Borgou, campagne 2024-2025 », pour le retrouver plus tard, l'exporter, voir le champ de chaque
membre et lui écrire sur WhatsApp (invitation, formation, remise de prix). Le palmarès, lui, est
recalculé à chaque consultation et bouge avec les déclarations et les vérifications.

## Options étudiées

1. **Garder seulement les critères et recalculer la liste à chaque ouverture** : la liste change
   d'une visite à l'autre, et un message envoyé ne dit plus à qui il a été adressé.
2. **Photographier les membres à la formation, liste calculée par le serveur** : retenu.

## Décision

- **Droit** : `ranking.read`, ministère seulement. Pas de droit nouveau : un groupe ne montre rien
  de plus que le palmarès dont il vient. Pages `/pilotage/groupes` et `/pilotage/groupes/[id]`,
  entrée « Groupes » du pilotage, formation depuis `/pilotage/palmares`, export
  `/api/v1/analytics/producer-groups/[id]/members.csv`.
- **Formation** : le navigateur n'envoie que les critères et le nom. Le serveur relance le palmarès
  avec ces critères et enregistre les membres (`producer_group`, `producer_group_member`) avec leur
  rang, leur production, leur surface, leur rendement et leur vérification à cette date. Une liste
  de producteurs reçue du navigateur n'est jamais prise en compte.
- **Lecture** : la commune du producteur, son accord WhatsApp en cours et la parcelle à ouvrir sur
  la carte (`/carte?parcelle=<id>` : parcelle de la culture et de la campagne du groupe, avec
  contour de préférence) sont lus au moment de l'ouverture.
- **Journal** : `group.created`, `group.read` (chaque ouverture de la liste nominative, avec le
  nombre de lignes), `group.exported`, `group.messaged`, `group.archived`.
- **Message WhatsApp** : 500 caractères au plus, nettoyé (caractères invisibles, espaces), signé
  « BAIS, ministère de l'Agriculture ». Ni lien ni adresse e-mail : un compte compromis ne doit
  pas pouvoir envoyer un lien à des centaines de producteurs depuis le numéro officiel (même règle
  que la revue de sécurité R5). Le même texte n'est pas renvoyé au même groupe dans les 10 minutes
  (double clic). `producer_group_message` garde le texte, l'auteur et le nombre de destinataires.
- **File d'envoi** : une notification `GROUP_MESSAGE` par membre consentant, dans la file des
  messages de suivi. Cette file n'admet qu'un message par couple (type, sujet) et le sujet est un
  UUID : le sujet de chaque destinataire est l'UUID v5 du producteur dans l'espace de noms du
  message. Pas de table de plus, et l'état d'envoi de chaque message se retrouve par calcul.
  Garde-fous inchangés : accord revérifié à l'envoi, silence de 21 h à 6 h, fiches de
  démonstration (`SYNTHETIC`) jamais envoyées, 20 messages par passage, le reste par la tâche
  planifiée (toutes les 10 minutes, après les alertes).
- **Archivage** : le groupe reste consultable, ne reçoit plus de message et passe dans la liste
  des groupes archivés. Ses membres sont gardés : ils disent à qui les messages sont partis.

## Conséquences

- Un groupe est une photographie : une récolte déclarée ou vérifiée après sa formation ne le
  change pas. Pour une liste à jour, on forme un nouveau groupe.
- Un message à 500 destinataires met plusieurs heures à partir en entier. À revoir si les groupes
  deviennent un canal courant.
- Des données nominatives restent en base tant que le groupe existe, archivé compris : durée de
  conservation à inscrire au registre des traitements (APDP) et purge des groupes archivés anciens
  à décider.
- Figurer dans un groupe ne demande pas d'accord particulier (usage interne du ministère, comme le
  palmarès) ; recevoir un message demande l'accord WhatsApp du producteur.
