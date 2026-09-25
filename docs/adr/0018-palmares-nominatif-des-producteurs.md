# ADR-0018 — Palmarès nominatif des producteurs, réservé au ministère

- Statut : acceptée
- Date : 2026-09-26
- Décideurs : Utilisateur (ministère), Sécurité, Backend/Data

## Contexte

L'État veut pouvoir récompenser ses meilleurs producteurs : « les 100 meilleurs producteurs de
coton en 2024 dans le Borgou ». Jusqu'ici la plateforme ne montre jamais de données individuelles
hors des espaces qui les concernent, et masque dans les agrégats tout groupe de moins de 5
exploitations (revue de sécurité, étape 9). Un classement nommé est par nature une exception à ce
masquage.

Constat en préparant la fonctionnalité : le registre de démonstration ne contenait aucune
déclaration de récolte ; production et palmarès auraient été vides.

## Décision

- Nouveau droit `ranking.read`, accordé au seul `ADMIN_STATE` (`ALL`), refusé à tous les autres
  rôles. Page `/pilotage/palmares` et export `/api/v1/analytics/producer-ranking.csv`.
- Grain : le producteur (toutes ses exploitations), pour une culture et une campagne ; filtres
  par département ou commune ; classement à la production totale ou au rendement à l'hectare
  (au moins 0,5 ha cultivé, pour qu'une micro-parcelle ne fausse pas le rendement). Égalités
  départagées par le code producteur, pour un rang stable. 500 producteurs au plus par requête.
- Par défaut, seules comptent les exploitations vérifiées (agent ou terrain) : la prime doit aller
  au meilleur producteur, pas au meilleur déclarant. Les non vérifiées ne s'ajoutent que sur
  demande explicite, et chaque ligne dit si elle est vérifiée.
- Campagne par défaut : la dernière close (récoltes complètes), pas la campagne en cours.
- Chaque consultation et chaque export sont journalisés (`analytics.ranking.read`,
  `analytics.ranking.export`) avec les critères utilisés.
- Le téléphone du producteur figure dans le classement, parce que le ministère a déjà le droit
  `farmer.contact.read` et doit pouvoir joindre les lauréats ; le NPI n'y figure pas (sa lecture
  reste un acte séparé et journalisé).
- Historique de démonstration : le seed génère désormais, en SQL et de façon déterministe, les
  récoltes des deux dernières campagnes closes (rendement type de la culture × aléa de la parcelle
  × savoir-faire du producteur, stable d'une année sur l'autre × effet commune-année).

## Suite prévue

Palmarès public : publication, par le ministère, des seuls lauréats ayant donné leur accord
(consentement recueilli par le producteur lui-même depuis son compte). Fera l'objet d'un complément
à cette ADR.

## Conséquences

- Les chiffres de production du pilotage (tableau de bord, territoires, fiches communes) ne sont
  plus vides sur le jeu de démonstration.
- Tout nouveau rôle devra se voir refuser `ranking.read` explicitement ; la matrice générée par les
  tests le vérifie pour les rôles existants.
