# Revue de sécurité des phases 0 à 2

- Date : 26 septembre 2026.
- Portée : ce que les phases 0 à 2 ont ajouté depuis la revue de l'étape 9 (develop `d62e312`) :
  - signalements de terrain et détection des foyers (ADR-0015) ;
  - demandes d'assistance « Solliciter l'État » ;
  - messages WhatsApp de suivi au producteur ;
  - palmarès public (complément d'ADR-0018) ;
  - vue du ciel Copernicus (ADR-0016) : tuiles, image d'ensemble, contrôle des parcelles.
- Méthode : chaque constat a été vérifié dans le code. Les constats simples sont **corrigés sur la branche `fix/security-review-phase-0-2`**, avec un test pour chacun. Les autres forment la liste « À traiter ».
- Axes :
  - contrôle d'accès de chaque route, action serveur et page (IDOR, ADR-0014) ;
  - abus par un compte ordinaire (alertes, quotas, saturation des agents) ;
  - validation des entrées ;
  - données personnelles (photos, positions, conservation, APDP) ;
  - cache du service worker et du navigateur ;
  - coût des appels externes (Copernicus, wapy.pro) ;
  - erreurs renvoyées.

Gravité : Critique, Élevée, Moyenne, Faible. Comme pour l'étape 9, chaque constat dit s'il bloque une **présentation** au ministère ou seulement un **déploiement réel**.

## Synthèse

Aucune fuite de données par exploitation ou par parcelle, aucun IDOR : chaque page nouvelle exige son rôle, chaque lecture passe par `authorize` ou `scopeFilter`, les routes API par `getApiActor` (B1). Le palmarès public ne sert que des producteurs consentants, sans téléphone ni NPI.

Les failles relèvent de l'abus par un compte ordinaire, que l'inscription libre (NPI au bon format et code WhatsApp) rend peu coûteux :
- un seul producteur levait une alerte d'épidémie diffusée à toute une commune ;
- un seul compte pouvait vider le quota Copernicus du mois ;
- rien ne plafonnait les signalements ni les demandes.

S'y ajoutent deux copies de données personnelles sans nécessité : la photo brute dans le journal des commandes, et des pages nominatives dans le cache de l'appareil.

## Corrigé sur cette branche

### P1 — Élevée (présentation) : un seul producteur lève une alerte d'épidémie diffusée à toute une commune
- Emplacements :
  - `src/database/sql/report-clusters.sql.ts` : comptait `COUNT(DISTINCT farm_id)` ;
  - `handlers/farm-create.ts` : un producteur crée ses exploitations dans n'importe quelle commune (`farm.create` `SELF`) ;
  - `handlers/field-report-create.ts` : point GPS accepté n'importe où au Bénin.
- Scénario : un producteur déclare trois exploitations, envoie trois signalements de ravageurs et lève une alerte « épidémie probable » (gravité avertissement). Elle part par WhatsApp à tous les producteurs consentants de la commune et consomme le quota wapy.pro. Le point GPS pouvait en plus déplacer le foyer vers une autre zone. ADR-0015 affirmait le contraire.
- Correction :
  - comptage des **producteurs distincts** (`farm.farmer_id`) ; un producteur ne peut pas créer d'autre fiche producteur ;
  - point GPS à plus de 30 km de l'exploitation ignoré (le signalement est placé sur la parcelle ou l'exploitation) ;
  - libellés et messages en « producteurs » ;
  - ADR-0015 corrigée.
- Test : `outbreak-detection.test.ts`. Trois exploitations d'un même producteur ne lèvent rien ; trois producteurs, si.

### P2 — Élevée (déploiement) : un seul compte vide le quota Copernicus du mois — **atténué**
- Emplacement : `src/app/api/satellite/[layer]/[period]/[...tile]/route.ts`. Seule une session était exigée pour les tuiles détaillées ; chaque tuile absente du cache réserve une unité du plafond mensuel partagé (9 000).
- Scénario : un compte parcourt les quelque 422 000 adresses de tuiles distinctes (2 couches × 13 périodes × zooms 9 à 13). En moins d'une heure, la carte détaillée répond 429 pour tout le pays jusqu'au mois suivant, et le contrôle quotidien des parcelles s'arrête.
- Correction livrée : plafond par compte de 1 000 tuiles par heure et 3 000 par jour. Un compte seul ne vide plus le quota en une journée. Le reste est en R2.

### P3 — Moyenne : la photo brute d'un signalement, métadonnées comprises, conservée 180 jours
- Emplacement : `src/modules/sync/apply.ts`. La charge utile était recopiée telle quelle dans `sync_command.payload`, photo en base64 comprise. Elle y restait jusqu'à la purge de 180 jours, et à jamais pour une commande refusée.
- Portée : on garantissait « aucune métadonnée conservée ». Or une photo envoyée par un autre client que le nôtre gardait EXIF, position du téléphone et modèle, et pesait jusqu'à 300 Ko par signalement.
- Correction : `src/modules/sync/stored-payload.ts` ne garde que `{ contentType, omitted: true }`. Seule la version réencodée sans métadonnées est conservée.
- Test : `field-reports.test.ts`.

### P4 — Moyenne : pages nominatives du ministère et du compte gardées 7 jours sur l'appareil, même après déconnexion
- Emplacement : `src/app/sw.ts`. La règle « autres pages » mettait en cache 7 jours `/pilotage/*` et `/compte`. S'y trouvent :
  - la fiche d'un signalement avec le nom du producteur ;
  - le palmarès nominatif avec les téléphones ;
  - les accords.

  Le cache `bais-pages` n'était pas vidé à la déconnexion.
- Scénario : sur un poste partagé, hors réseau, le compte suivant rouvre ces pages depuis le cache.
- Correction :
  - `NetworkOnly` pour les espaces authentifiés sans mode hors ligne (`/pilotage`, `/compte`, `/commune`, `/cooperative`, `/acheteur`) ;
  - `bais-pages` ajouté aux caches vidés à la déconnexion et par `SessionIdentityGuard` ;
  - statut `[200]` seulement mis en cache (reste de B2 : le statut 0 couvre les redirections opaques).

### P5 — Moyenne : aucun plafond de signalements ni de demandes par compte
- Emplacements : `handlers/field-report-create.ts`, `handlers/assistance-request.ts`. Le limiteur de la synchronisation autorise 60 lots de 50 commandes par tranche de 5 minutes.
- Scénario : un compte dépose des milliers de demandes dans la file des agents d'une commune (au besoin en choisissant une autre commune que la sienne), fausse les délais du tableau du ministère, et relance l'évaluation des foyers à chaque lot.
- Correction : 20 signalements et 10 demandes par compte et par 24 heures (`RATE_LIMITED`).
- Tests : `field-reports.test.ts`, `assistance-requests.test.ts`.

### P6 — Moyenne : image d'ensemble publique bloquée pour tout le pays par un seul script
- Emplacement : route des images satellite. Sans relais de confiance (`TRUSTED_PROXIES` vide, cas documenté), tous les visiteurs partageaient la clé `satellite-overview:sans-relais`, limitée à 60 demandes par 5 minutes.
- Correction : pas de compteur commun quand l'adresse est inconnue. Le coût reste borné : 26 images au plus, gardées en base, jamais recalculées par des demandes répétées.

### P7 — Faible : date d'observation d'un signalement non bornée
- Correction : refus au-delà d'un jour dans le futur ou de 60 jours en arrière ; une horloge légèrement en avance est ramenée à l'heure du serveur.
- Test : `field-reports.test.ts`.

### P8 — Faible : le serveur décodait tout format d'image, jusqu'à 40 millions de pixels
- Emplacement : `src/modules/reports/photo.ts`. sharp décode aussi SVG, TIFF ou PDF.
- Correction : JPEG ou WebP seulement, vérifié sur l'en-tête avant décodage, et 25 millions de pixels au plus.

### P9 — Faible : photo d'un signalement gardée une heure par le navigateur
- Emplacement : `/api/v1/reports/[id]/photo` (`private, max-age=3600`).
- Correction : `private, no-store`, pour qu'un téléphone partagé ne la resserve pas au compte suivant.

### P10 — Faible : couche satellite `constructor`, `__proto__`, `toString` acceptée
- Scénario : `LAYERS["constructor"]` n'est pas vide. La demande passe la validation, occupe le limiteur, puis provoque une erreur 500 avec trace dans les journaux.
- Correction : `Object.hasOwn`.
- Test : `satellite-route.test.ts`.

### P11 — Faible : messages de suivi WhatsApp conservés sans limite
- Emplacement : `farmer_notification`. Le texte cite la réponse de l'agent au producteur.
- Correction : suppression 90 jours après traitement, dans la purge de conservation (`purgeFarmerNotifications`) ; un message en attente n'est jamais supprimé.
- Test : `privacy-retention.test.ts`.

## À traiter

### R1 — Moyenne (bloque un déploiement réel) : trois comptes coordonnés lèvent encore une alerte diffusée
- Après P1, il faut trois producteurs distincts. Mais un compte s'ouvre avec un NPI au bon format et un numéro WhatsApp : le NPI reste `PENDING` tant que l'ANIP n'est pas branchée (ADR-0012). Trois cartes SIM suffisent à lever une alerte « épidémie probable » diffusée par WhatsApp à une commune entière, sur des signalements que personne n'a vus.
- Décision attendue du ministère :
  - soit l'alerte fondée sur des signalements reste en application (agents, espace du producteur) et ne part par WhatsApp qu'après la confirmation, par un agent, d'au moins un signalement du foyer ;
  - soit on ne compte que les signalements d'exploitations vérifiées ou de comptes au NPI vérifié.

  La première garde la rapidité de détection ; la seconde attend l'ANIP.

### R2 — Élevée (déploiement) : quota Copernicus, reste du P2 (session « vue du ciel ») — **corrigé**

Correction livrée, détaillée dans `docs/modules/vue-du-ciel.md` (« Garde-fous du compte CDSE ») :

- plafond par compte sur les seules tuiles à calculer (400 par mois), le plafond sur toutes les demandes ne servant plus qu'à protéger la base ;
- tuiles détaillées réservées aux agents et au ministère ;
- aucune réservation hors du contour réel du pays ;
- trois parts étanches (images, statistiques, propositions) ;
- échecs gardés une heure ;
- limite de 250 requêtes par minute ;
- plafond de 9 000 unités de traitement par mois ;
- réponses illisibles converties en échec du fournisseur ; le lot quotidien s'arrête après cinq échecs d'affilée au lieu de réserver dans le vide.

Tests :

- `tests/integration/satellite.test.ts` : parts sous concurrence, unités, minute, échec gardé ;
- `src/modules/satellite/__tests__/imagery.test.ts` : hors contour, plafond par compte, échec, limite par minute ;
- `src/services/remote-sensing/__tests__/cdse.test.ts` : réponses illisibles.

Constat d'origine :
- Plafonner par compte les seules tuiles **absentes du cache** et par mois, plutôt que toutes les demandes. Il faut pour cela un point d'accroche dans `imagery.ts`, juste avant `reserveProcessingRequest`.
- Réserver les tuiles détaillées aux agents et au ministère, ou à leur territoire (décision produit).
- Ne pas réserver d'unité pour une tuile hors du contour du pays. `isDetailTileInBenin` ne teste que le rectangle, dont plus de la moitié est hors du Bénin. Le contour existe déjà (`countryOutline()`).
- Séparer les plafonds images et statistiques dans `reserveProcessingRequest`. Aujourd'hui les tuiles peuvent consommer la part du contrôle quotidien des parcelles, contrairement au commentaire de `/api/v1/satellite/vegetation-checks`.
- Garder en cache un échec Copernicus (environ 1 h), sinon chaque nouvel essai réserve une unité.
- Ajouter un limiteur global sous le plafond Copernicus de 300 requêtes par minute.
- Plafonner aussi les unités de traitement (10 000 PU par mois, ADR-0016). Elles sont comptées, jamais comparées.
- Convertir en `RemoteSensingProviderError` les erreurs de lecture de `cdse.ts` (réponse JSON invalide, schéma STAC ou statistiques inattendus). Aujourd'hui : erreur 500 après réservation d'une unité, et arrêt de tout le lot du contrôle quotidien.

### R3 — Moyenne (déploiement) : conservation et registre des traitements (APDP)
- `field_report` (description, position GPS précise), `field_report_photo`, `assistance_request` (un litige peut décrire des tiers) et `published_ranking_entry` sont conservés sans limite. Il faut une durée par table, décidée avec le ministère (par exemple 2 ans pour les signalements, 1 an après résolution pour les demandes), puis la purge.
- `satellite_tile` : cache d'images jamais purgé (anciens mois, ancienne version du cache).
- Registre des traitements et déclaration APDP à compléter :
  - signalements avec photo et position ;
  - demandes d'assistance ;
  - messages WhatsApp (transfert vers wapy.pro) ;
  - palmarès public ;
  - envoi de la géométrie des parcelles à Copernicus (infrastructure dans l'Union européenne), sans identité mais rattachable à un producteur.
- Photos en base : à déplacer vers un stockage objet (déjà noté par ADR-0015).

### R4 — Faible : une demande sans exploitation peut viser n'importe quelle commune
- Le producteur choisit la commune : sa demande et son numéro arrivent aux agents d'une commune qui n'est pas la sienne. C'est son choix, et le volume est désormais plafonné (P5). On pourrait restreindre à la commune de sa fiche producteur quand elle existe.

### R5 — Faible : la réponse de l'agent part telle quelle sur WhatsApp
- Le message cite la réponse ou le motif de l'agent : un lien y part depuis le numéro officiel. Un compte d'agent compromis pourrait s'en servir pour de l'hameçonnage. Option : retirer les adresses web de la citation.

### R6 — Faible : sous-cases de moins de 5 dans les statistiques des demandes
- Une commune affichée (au moins 5 demandes) montre sa répartition par statut (par exemple « 1 en attente ») et des délais médians calculés sur peu de demandes résolues. Le risque de réidentification est faible, mais on pourrait masquer les sous-cases sous 5.

### R7 — Faible : preuve du consentement sans version du texte
- `channel_consent` et `ranking_consent` gardent la date et la méthode, pas la formulation acceptée. Pour l'APDP, il faudrait enregistrer une version du texte de chaque accord.

### R8 — Faible : pages publiques du palmarès lues en base à chaque visite
- `/palmares` est `force-dynamic` et sans cache. On pourrait revalider toutes les 5 minutes et invalider à chaque publication, retrait ou changement d'accord, pour que le retrait d'un accord reste immédiat.

## Vérifié, conforme

- **Pages et actions** :
  - chaque page nouvelle exige son rôle (`requireRole`) ;
  - les actions serveur (décision sur un signalement, prise en charge, résolution, accords, publication) repassent par le service, qui vérifie le droit : `report.review`, `assistance.handle`, `consent.manage` sur son propre compte, `ranking.publish`.
- **Signalements** :
  - lecture par `scopeFilter` (`report.read`, ADR-0014 pour l'agent) ;
  - photo servie seulement à qui peut lire le signalement, 404 sinon ;
  - identifiant validé en UUID ;
  - commande de synchronisation autorisée sur l'exploitation réelle (`report.create`) ;
  - parcelle contrôlée dans l'exploitation ;
  - SQL de regroupement paramétré.
- **Demandes** :
  - l'exception à ADR-0014 est limitée à ce qui sert à répondre ; la fiche d'une exploitation non enregistrée reste fermée ;
  - le ministère ne lit que des agrégats masqués (k = 5, masquage complémentaire) ;
  - l'heure de la demande est celle du serveur ;
  - prise en charge et résolution gardées par le statut lu (pas de double traitement).
- **Suivi WhatsApp** :
  - message écrit dans la transaction du changement de statut ;
  - consentement vérifié au moment de l'envoi ;
  - silence de nuit, trois essais, arrêt au quota ;
  - aucun envoi pour une fiche de démonstration ;
  - ligne réservée avant l'envoi et clé d'idempotence stable ;
  - le texte ne nomme jamais l'agent.
- **Palmarès public** :
  - accord donné et retiré par le producteur seul ;
  - retrait immédiat (lignes supprimées, et lecture publique filtrée sur l'accord en cours) ;
  - aucun téléphone, NPI ou code producteur publié ;
  - rang vrai du classement complet ;
  - publication et retrait réservés au ministère et journalisés.
- **Vue du ciel** :
  - aucune donnée par parcelle hors de `farm.read` (le contrôle de végétation suit ADR-0014) ;
  - tuiles XYZ à l'échelle du pays, sans point d'accès centré sur une parcelle ;
  - période en liste blanche, zoom de 9 à 13, tuiles hors emprise renvoyées sans appel ;
  - réservation du quota atomique (une instruction SQL) et demandes simultanées regroupées ;
  - scripts d'évaluation constants, adresses Copernicus venant de l'environnement (pas de SSRF) ;
  - jeton et secret jamais journalisés ni renvoyés ; messages d'erreur fixes ;
  - tâche planifiée fermée sans `CRON_SECRET`.

## Ordre proposé

1. Avant une présentation publique : cette branche (P1 à P11). R1 à décider, puisque les alertes WhatsApp partent réellement dès que `WAPY_API_KEY` est posée.
2. Avant un déploiement réel : R2 (session « vue du ciel »), R1, R3, puis R4 à R8.
