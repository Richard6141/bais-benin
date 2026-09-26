# Registre des traitements de données personnelles

- Responsable du traitement : ministère de l'Agriculture, de l'Élevage et de la Pêche (MAEP).
- Cadre : loi n° 2017-20 portant code du numérique en République du Bénin (protection des données à caractère personnel) ; autorité de contrôle : APDP.
- Version : 26 septembre 2026, établie avec la revue de sécurité des phases 0 à 2 (`docs/recherche/revue-securite-phases-0-2.md`, R3).
- Statut : proposition technique. Les bases légales et les durées sont des **valeurs par défaut** que le ministère valide ou ajuste avant la déclaration à l'APDP. Chaque durée appliquée par le code est une constante nommée ci-dessous ; la changer ne demande qu'une modification de cette constante.

## Principes communs

- **Minimisation** : le NPI est chiffré et jamais affiché en clair ; les agrégats publiés masquent tout groupe de moins de 5 exploitations ou demandes ; aucune donnée nominative n'est publique sans l'accord de la personne.
- **Accès** : matrice des droits par rôle et par périmètre (`docs/modules/authentification.md` §5) ; un agent ne voit que les exploitations qu'il a enregistrées (ADR-0014).
- **Purge** : `pnpm db:purge` (`src/modules/privacy/`) applique les durées ci-dessous ; à planifier une fois par mois. L'assistant a sa propre purge quotidienne.
- **Preuve du consentement** : date, méthode et version du texte accepté sont enregistrées avec chaque accord ; chaque changement est journalisé.
- **Droits des personnes** : accès, rectification (par l'agent de la commune), retrait des accords depuis « Mon compte ». L'export et l'effacement sur demande restent à outiller (revue de l'étape 9, C4).

## Traitements

### 1. Comptes et connexion
- Finalité : identifier chaque utilisateur par son NPI et un code envoyé sur WhatsApp ; sécuriser les sessions.
- Base légale : mission de service public (accès aux services agricoles de l'État).
- Données : NPI (chiffré, index HMAC), numéro de téléphone, nom, rôles, sessions, codes à usage unique.
- Destinataires : l'utilisateur ; les administrateurs pour l'attribution des rôles ; la révélation d'un NPI est journalisée.
- Transferts : envoi des codes par wapy.pro (hébergement à confirmer auprès du prestataire ; contrat de traitement à signer).
- Durée : compte actif ; codes à usage unique de quelques minutes ; sessions de 12 h (institutions) ou 30 jours glissants (terrain).

### 2. Registre agricole
- Finalité : connaître les producteurs, leurs exploitations, parcelles, cultures et récoltes, pour orienter l'appui de l'État.
- Base légale : mission de service public.
- Données : identité et téléphone du producteur, commune et village, position et contour des parcelles, cultures, récoltes déclarées ou vérifiées.
- Destinataires : le producteur ; l'agent qui a enregistré l'exploitation ; le ministère ; les coopératives pour leurs membres ; les agrégats masqués pour les autres.
- Transferts : aucun (voir 11 pour les contours envoyés à Copernicus).
- Durée : tant que l'exploitation est active, puis archivage ; durée d'archivage à fixer par le ministère.

### 3. Synchronisation hors ligne
- Finalité : recevoir les saisies faites sans réseau, sans doublon.
- Données : charge utile de chaque commande. La photo d'un signalement n'y est jamais recopiée.
- Durée : charge utile effacée après **180 jours** (`SYNC_PAYLOAD_RETENTION_DAYS`) ; la trace de la commande reste.

### 4. Signalements de terrain
- Finalité : veille phytosanitaire et vétérinaire ; détection des foyers (ADR-0015).
- Base légale : mission d'intérêt public (protection des cultures et du cheptel).
- Données : type de problème, description, date d'observation, position (GPS du téléphone, parcelle ou exploitation), photo réencodée sans métadonnées, auteur du signalement.
- Destinataires : le producteur de l'exploitation ; l'agent qui l'a enregistrée ; le ministère. Un foyer n'est diffusé aux producteurs de la commune qu'après la confirmation d'un signalement par un agent ; la diffusion ne nomme personne.
- Transferts : aucun.
- Durée : photo **1 an** après le dépôt (`FIELD_REPORT_PHOTO_RETENTION_DAYS`) ; signalement **3 ans** (`FIELD_REPORT_RETENTION_DAYS`).

### 5. Demandes d'assistance « Solliciter l'État »
- Finalité : répondre aux demandes des producteurs (conseil, intrants, litige, sinistre) et suivre les délais de réponse par commune.
- Base légale : mission de service public, à la demande de la personne.
- Données : objet, description libre (un litige peut mentionner des tiers), commune, exploitation, nom et numéro du demandeur, réponse de l'agent.
- Destinataires : le producteur ; les agents de sa commune (exception documentée à ADR-0014) ; le ministère ne voit que des agrégats masqués.
- Transferts : aucun (voir 7 pour le message de suivi).
- Durée : **3 ans après la résolution** (`ASSISTANCE_RETENTION_DAYS`) ; une demande ouverte n'expire pas.

### 6. Alertes et leur diffusion
- Finalité : prévenir les producteurs d'un risque climatique ou sanitaire dans leur commune.
- Base légale : mission d'intérêt public ; messages WhatsApp et SMS sur **consentement** du producteur.
- Données : commune, exploitations concernées, numéro de téléphone, statut de remise et de lecture, relais oral par l'agent.
- Destinataires : producteurs concernés, agents de la commune, ministère.
- Transferts : wapy.pro (WhatsApp).
- Durée : à fixer par le ministère (les destinataires d'une alerte gardent aujourd'hui le numéro sans limite ; revue de l'étape 9, C4).

### 7. Messages de suivi WhatsApp
- Finalité : prévenir le producteur quand l'État répond à sa demande ou à son signalement.
- Base légale : **consentement** (« Messages WhatsApp », texte versionné `whatsapp-2026-09-26`).
- Données : texte du message (objet, date, réponse ou motif de l'agent, sans lien ni adresse), numéro, statut d'envoi.
- Destinataires : le producteur.
- Transferts : wapy.pro.
- Durée : **90 jours** après l'envoi, l'échec ou l'abandon (`FARMER_NOTIFICATION_RETENTION_DAYS`).

### 8. Palmarès nominatif (ministère)
- Finalité : désigner les meilleurs producteurs pour les distinctions et les primes (ADR-0018).
- Base légale : mission de service public.
- Données : nom, commune, téléphone, production, surface et rendement par campagne.
- Destinataires : le ministère seulement ; chaque consultation et chaque export sont journalisés.
- Durée : calculé à la demande, rien n'est conservé en dehors du registre agricole.

### 9. Palmarès public
- Finalité : faire connaître les meilleurs producteurs qui l'acceptent.
- Base légale : **consentement** (« Palmarès public », texte versionné `palmares-2026-09-26`).
- Données publiées : nom, commune, département, rang, production (et rendement pour un classement au rendement). Jamais de téléphone, de NPI ou de code producteur.
- Destinataires : tout public.
- Durée : **jusqu'au retrait de l'accord ou du palmarès**. Le retrait de l'accord supprime les lignes du producteur, et le retrait du palmarès ses lauréats, dans la même transaction ; `purgeWithdrawnRankingEntries` couvre les palmarès retirés auparavant. La page publique est en cache de 2 minutes au plus.

### 10. Assistant agricole
- Finalité : répondre aux questions techniques des producteurs et des agents à partir des fiches du corpus.
- Base légale : mission de service public.
- Données : question (téléphones, NPI et adresses masqués avant tout envoi et toute écriture), commune, rôle ; jamais le nom ni le code d'exploitation.
- Transferts : fournisseur du modèle de langue s'il est hors du Bénin (autorisation APDP ; un hébergement national est préférable).
- Durée : texte des questions **90 jours**, conversations **12 mois** (purge quotidienne de l'assistant).

### 11. Vue du ciel (Copernicus)
- Finalité : images Sentinel-2 de la carte et contrôle de la végétation des parcelles déclarées.
- Base légale : mission de service public.
- Données : contour des parcelles et dates envoyés au service Copernicus Data Space, sans nom, code ni identité. Rattachable à un producteur par le registre, donc donnée personnelle.
- Transferts : Copernicus Data Space Ecosystem, **infrastructure dans l'Union européenne** : à déclarer à l'APDP.
- Durée : images en cache limitées à la fenêtre proposée (12 derniers mois et 60 derniers jours ; `purgeSatelliteTilesOutsideWindow`) ; verdicts de végétation à fixer avec le registre agricole.

### 12. Journal d'audit
- Finalité : traçabilité des accès et des actions sensibles.
- Base légale : obligation de sécurité du responsable du traitement.
- Données : action, acteur, horodatage, résultat, adresse IP hachée par HMAC, détail libre.
- Destinataires : administrateurs habilités (`audit.read`).
- Durée : entrée **5 ans** (docs/06 §6) ; détail libre effacé après **365 jours** (`AUDIT_DETAILS_RETENTION_DAYS`).

## Reste à faire avant la déclaration

- Faire valider par le ministère les bases légales et les durées ci-dessus, et fixer celles marquées « à fixer » (archivage du registre, diffusion des alertes, verdicts de végétation).
- Contrats de traitement avec wapy.pro, l'hébergeur et le fournisseur du modèle de langue ; hébergement de wapy.pro à confirmer.
- Autorisation des transferts hors du Bénin (Copernicus, modèle de langue le cas échéant).
- Outiller l'export et l'effacement sur demande (revue de l'étape 9, C4).
- Analyse d'impact (AIPD) avec l'APDP (docs/06 §8).
