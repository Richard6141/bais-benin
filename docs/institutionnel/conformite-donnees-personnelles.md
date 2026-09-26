# BAIS : note de conformité à la protection des données à caractère personnel

**Destinataire :** Autorité de protection des données à caractère personnel (APDP).
**Responsable du traitement :** ministère de l'Agriculture, de l'Élevage et de la Pêche (MAEP), [à compléter : direction porteuse et adresse].
**Délégué à la protection des données :** [à compléter : nom et fonction, à désigner].
**Version :** septembre 2026.

Cette note accompagne le dossier de déclaration et de demande d'autorisation de la plateforme BAIS. Elle présente le cadre juridique, le registre des traitements, les mesures de sécurité, une analyse d'impact résumée et les formalités à accomplir.

Les points marqués [à compléter] demandent une décision ou une information du ministère.

## 1. Synthèse

BAIS est la plateforme agricole nationale du MAEP. Elle tient le registre des producteurs, de leurs exploitations et de leurs parcelles. Elle suit les cultures par satellite, diffuse des alertes et permet au ministère de joindre les producteurs.

Trois caractéristiques commandent le régime applicable :

1. **Le NPI.** Chaque utilisateur est identifié par son numéro personnel d'identification. Ce traitement relève de l'autorisation préalable (article 407, 2°).
2. **Les interconnexions prévues.** La vérification du NPI auprès de l'ANIP et la consultation du cadastre de l'ANDF par la plateforme X-Road BJ sont des interconnexions de fichiers (article 407, 5°).
3. **Les transferts hors du Bénin.** Les contours de parcelles sont envoyés au service européen Copernicus pour le suivi satellite. D'autres transferts dépendent de l'hébergement et des prestataires retenus (article 407, 6°, et article 391).

Le ministère sollicite donc une autorisation au titre de l'article 407. La déclaration de l'article 405 s'y ajoute, les autorités publiques ne pouvant en être exonérées (article 408).

## 2. Cadre juridique

Texte de référence : loi n° 2017-20 du 20 avril 2018 portant code du numérique en République du Bénin, livre V, modifiée par la loi n° 2020-35 du 6 janvier 2021.

Les articles ci-dessous ont été relevés dans l'édition de la loi n° 2017-20 publiée par l'APDP. Cette édition n'intègre pas les modifications de la loi n° 2020-35. [à compléter : vérifier sur le texte consolidé que les articles cités n'ont pas été modifiés.]

| Objet | Articles | Application à BAIS |
|---|---|---|
| Définitions (donnée personnelle, interconnexion, violation) | Art. 1er | Le NPI, le téléphone, le nom et la position des parcelles sont des données personnelles. Un contour de parcelle rattachable à un producteur l'est aussi. |
| Champ d'application | Art. 380 | Le livre V s'applique aux traitements mis en œuvre par l'État. |
| Principes de licéité, de finalité, de proportionnalité et de durée limitée | Art. 383 | Finalités fixées par traitement, données minimales, durées de conservation appliquées par une purge automatique. |
| Confidentialité, sécurité, sous-traitant | Art. 385, 386 | Mesures de la section 5. Contrat écrit avec chaque sous-traitant. |
| Consentement et ses exceptions | Art. 389, 390 | Le registre repose sur l'exécution d'une mission d'intérêt public (art. 389, 2°). Les messages WhatsApp et le palmarès public reposent sur le consentement, retirable à tout moment (art. 390). |
| Transferts vers un État tiers | Art. 391, 392 | Autorisation de l'Autorité avant tout transfert effectif. |
| Interconnexion de fichiers | Art. 393 | Branchements ANIP et ANDF : objectifs légaux, sans discrimination, avec mesures de sécurité appropriées. |
| Données sensibles | Art. 394 | BAIS ne collecte pas de données sensibles. Les signalements vétérinaires portent sur les animaux, pas sur les personnes. |
| Déclaration préalable | Art. 405, 408 | Déclaration obligatoire. L'autorité publique ne peut pas en être exonérée. |
| Autorisation préalable | Art. 407 | 2° numéro national d'identification ; 5° interconnexion ; 6° transfert vers un État tiers. Le 7° (traitements pouvant exclure d'une prestation) est à examiner pour le palmarès et les attestations. |
| Contenu du dossier | Art. 409 | Voir la section 8. |
| Traitements pour le compte de l'État par décret | Art. 411 | La liste de l'article 411 ne vise pas un registre agricole. Le régime de l'article 407 paraît applicable. [à compléter : à confirmer avec l'APDP.] |
| Délai de réponse | Art. 412 | 60 jours, prorogeables une fois de 30 jours. Sans réponse dans le délai, la réponse est réputée favorable. |
| Mode de dépôt | Art. 413 | Voie électronique ou postale. |
| Information des personnes | Art. 415, 416 | Information au plus tard lors de la collecte, y compris quand l'agent collecte pour le producteur. |
| Droits des personnes | Art. 418 à 423, 437 à 444 | Accès, portabilité, opposition, rectification et suppression. Réponse dans les 45 jours (art. 441). |
| Protection dès la conception, sécurité | Art. 424, 426 | Chiffrement, pseudonymisation, contrôle d'accès, tests réguliers. |
| Notification des violations | Art. 427 | Notification sans délai à l'Autorité et aux personnes concernées. |
| Analyse d'impact et consultation préalable | Art. 428, 429 | Traitement à grande échelle d'un identifiant national : analyse d'impact résumée en section 7. |
| Délégué à la protection des données | Art. 430 à 432 | Désignation obligatoire pour un organisme public. |
| Registre des activités de traitement | Art. 435 | Le registre de la section 4 en tient lieu. |
| Contrôle et sanctions | Art. 452 à 461 | Pas de sanction pécuniaire contre l'État (art. 454), mais injonctions, retrait d'autorisation et sanctions pénales individuelles. |

## 3. Présentation de la plateforme

| Élément | Description |
|---|---|
| Finalité générale | Connaître les producteurs, leurs champs et leurs cultures pour orienter l'appui de l'État : alertes, conseil, statistiques, distinctions, preuve d'exploitation. |
| Personnes concernées | Producteurs agricoles ; agents de terrain ; agents du ministère ; responsables de coopératives et acheteurs, le cas échéant. |
| Volume | [à compléter : nombre de producteurs visé à trois ans]. Pour ordre de grandeur, le recensement national de l'agriculture de 2019 dénombre 915 423 exploitations. |
| Accès | Application web installable sur téléphone. Connexion par le NPI, le numéro de téléphone et un code à usage unique envoyé sur WhatsApp. |
| Hébergement | [à compléter : hébergeur, pays, centre de données]. |
| Sous-traitants | wapy.pro (envoi des codes et des messages WhatsApp) ; hébergeur ; fournisseur du modèle de langue de l'assistant, s'il est activé [à compléter pour chacun : raison sociale, pays d'hébergement, contrat]. |
| Services externes sans donnée personnelle | Copernicus Data Space Ecosystem reçoit des contours de parcelles, sans nom ni identifiant (voir traitement 11). NASA FIRMS et Open-Meteo reçoivent des emprises géographiques ou des coordonnées de communes, sans lien avec une personne. |

## 4. Registre des traitements

Les durées de conservation sont des propositions techniques. Chacune est appliquée par une purge automatique. Le ministère les valide ou les ajuste avant le dépôt.

Abréviations de base légale : **MIP**, mission d'intérêt public (art. 389, 2°) ; **C**, consentement (art. 389 et 390).

| N° | Traitement | Finalité | Base | Données | Destinataires | Transferts | Durée |
|---|---|---|---|---|---|---|---|
| 1 | Comptes et connexion | Identifier chaque utilisateur, sécuriser les sessions | MIP | NPI (chiffré), téléphone, nom, rôles, sessions, codes à usage unique | L'utilisateur ; les administrateurs pour l'attribution des rôles | wapy.pro (codes) | Compte actif ; code 5 minutes ; session 12 heures (institutions) ou 30 jours glissants (terrain) |
| 2 | Registre agricole | Connaître les producteurs, leurs exploitations, parcelles, cultures et récoltes | MIP | Identité et téléphone du producteur, commune, village, position et contour des parcelles, mode de faire-valoir, cultures, récoltes | Le producteur ; l'agent qui a enregistré l'exploitation ; le ministère ; les coopératives pour leurs membres | Aucun | Tant que l'exploitation est active, puis archivage [à compléter : durée d'archivage] |
| 3 | Synchronisation hors ligne | Recevoir sans doublon les saisies faites sans réseau | MIP | Contenu de chaque saisie | Aucun hors du service | Aucun | Contenu effacé après 180 jours ; la trace de la saisie reste |
| 4 | Signalements de terrain | Veille phytosanitaire et vétérinaire, détection des foyers | MIP | Type de problème, description, date, position, photo sans métadonnées, auteur | Le producteur ; son agent ; le ministère. Un foyer n'est diffusé qu'après confirmation par un agent, sans nommer personne. | Aucun | Photo 1 an ; signalement 3 ans |
| 5 | Demandes d'assistance | Répondre aux demandes des producteurs et suivre les délais | MIP, à la demande de la personne | Objet, description libre, commune, exploitation, nom et numéro du demandeur, réponse | Le producteur ; les agents de sa commune ; le ministère en agrégats masqués | Aucun | 3 ans après la résolution |
| 6 | Alertes et diffusion | Prévenir les producteurs d'un risque climatique ou sanitaire | MIP ; messages sur C | Commune, exploitations concernées, téléphone, statut de remise et de lecture | Producteurs concernés, agents de la commune, ministère | wapy.pro | [à compléter : durée de conservation des destinataires] |
| 7 | Messages de suivi | Prévenir le producteur de la réponse à sa demande ou à son signalement | C | Texte du message sans lien, numéro, statut | Le producteur | wapy.pro | 90 jours après l'envoi |
| 8 | Palmarès nominatif | Désigner les meilleurs producteurs pour les distinctions | MIP | Nom, commune, téléphone, production, surface, rendement | Le ministère seul ; chaque consultation et chaque export journalisés | Aucun | Calculé à la demande, rien n'est conservé à part |
| 9 | Palmarès public | Faire connaître les lauréats qui l'acceptent | C | Nom, commune, département, rang, production. Jamais de téléphone ni de NPI. | Tout public | Aucun | Jusqu'au retrait de l'accord ou du palmarès |
| 10 | Assistant agricole | Répondre aux questions techniques | MIP | Question (téléphones et NPI masqués avant envoi), commune, rôle | L'utilisateur | Fournisseur du modèle de langue s'il est hors du Bénin | Questions 90 jours ; conversations 12 mois |
| 11 | Suivi satellite des parcelles | Images de la carte, contrôle de la végétation, culture mesurée par parcelle | MIP | Contour et dates envoyés sans nom ni identifiant ; séries d'indices et culture mesurée rattachées à la parcelle | Le ministère ; l'agent et le producteur pour leurs parcelles | Copernicus Data Space Ecosystem, dans l'Union européenne | Images en cache 12 mois ; séries et culture mesurée [à compléter] |
| 12 | Journal d'audit | Tracer les accès et les actions sensibles | Obligation de sécurité (art. 426) | Action, acteur, date, résultat, adresse IP hachée, détail | Administrateurs habilités | Aucun | 5 ans ; détail effacé après 1 an |
| 13 | Groupes de producteurs | Retrouver et joindre un groupe issu du palmarès (lauréats, formation) | MIP ; messages sur C | Membres avec rang, production, surface, rendement ; texte des messages envoyés | Le ministère seul ; chaque ouverture, export et message journalisés | wapy.pro | [à compléter : durée, notamment pour les groupes archivés] |
| 14 | Attestations d'exploitation | Permettre au producteur de prouver ses champs et ses récoltes | MIP, à la demande de la personne | Titulaire, exploitation, commune, parcelles, cultures, récoltes, identité contrôlée ou non. Jamais le NPI. | Le producteur ; toute personne qui détient le numéro de l'attestation voit le nom du titulaire, l'exploitation, la commune et la surface | Aucun | [à compléter : durée] ; une attestation peut être retirée |
| 15 | Contacts avec les producteurs | Appeler ou écrire à un producteur depuis sa fiche ou son groupe | MIP ; messages sur C | Téléphone, trace du contact | Le ministère, l'agent | wapy.pro pour les messages | Selon les traitements 7 et 13 |

Le fil d'activité en direct du centre de veille n'affiche aucun nom : un type de fait, une commune, une heure.

## 5. Mesures de sécurité

### En place

- **NPI.** Haché par HMAC-SHA-256 pour la recherche d'unicité. Chiffré par AES-256-GCM, avec une clé gardée hors de la base, pour sa restitution. Jamais écrit dans les journaux ni dans les exports. Jamais affiché en clair.
- **Connexion.** NPI, numéro de téléphone et code à six chiffres valable 5 minutes, 5 essais au plus. Nombre d'envois limité par adresse IP et par numéro. Le premier écran ne révèle jamais si un NPI est connu.
- **Droits d'accès.** Matrice des droits par rôle et par périmètre territorial, appliquée dans les requêtes à la base. Un agent ne lit que les exploitations qu'il a lui-même enregistrées. Le classement nominatif est réservé au ministère.
- **Masquage des petits effectifs.** Tout chiffre publié qui porte sur moins de 5 exploitations est masqué.
- **Journal d'audit.** Table en ajout seul : connexions, attributions de rôle, créations et vérifications d'exploitations, lectures nominatives du palmarès et des groupes, exports, messages, attestations, modifications de règles.
- **Messages sortants.** Accord du producteur vérifié à l'envoi ; aucun message de suivi ni de groupe entre 21 heures et 6 heures ; aucun lien ni adresse dans les messages de groupe, pour empêcher la diffusion d'un lien frauduleux depuis le numéro officiel.
- **Photos.** Réencodées à la réception, sans métadonnées ni position cachée.
- **Transport.** Chiffrement TLS de bout en bout.
- **Purge.** Les durées de la section 4 sont appliquées par des tâches planifiées.
- **Données de démonstration.** Aucune personne réelle. Aucun message n'est envoyé à une fiche de démonstration.

### Écarts connus, à corriger avant la mise en service

| Écart | Risque | Mesure prévue |
|---|---|---|
| Le couple NPI et numéro n'est pas encore vérifié auprès de l'ANIP | Une personne qui connaît le NPI d'une autre peut occuper son compte | Branchement X-Road ; d'ici là, contrôle du NPI par l'administration avant tout rôle professionnel |
| Les saisies gardées sur le téléphone de l'agent ne sont pas chiffrées | Lecture des données en cas de perte du téléphone | Chiffrement local par une clé liée à la session ; effacement après 30 jours sans connexion |
| Pas de politique d'accès au niveau des lignes dans la base | Une faille applicative exposerait des lignes hors périmètre | Politiques d'accès sur les tables personnelles |
| Pas d'écran d'information au premier accès | Information incomplète des personnes (art. 415) | Écran d'information et mention remise par l'agent lors de l'enrôlement |
| Export et effacement sur demande non outillés | Délai de 45 jours difficile à tenir (art. 441) | Procédure manuelle tracée, puis outil dédié |
| Pas de confirmation renforcée pour les actes les plus sensibles | Un téléphone compromis donne accès au compte du ministère | Nouveau code demandé pour révéler un NPI ou attribuer un rôle |
| Pas d'écran d'administration des comptes | Ouverture des comptes par une commande sur le serveur | Écran réservé au ministère, journalisé |
| Test d'intrusion non réalisé | Failles non détectées | Test externe avant la mise en service |

## 6. Droits des personnes

| Droit | Comment l'exercer |
|---|---|
| Information | À l'enrôlement par l'agent, et dans l'application [à compléter : texte d'information à valider] |
| Accès | L'espace producteur montre ses champs, cultures, récoltes, alertes, demandes et signalements |
| Rectification | Par l'agent de la commune |
| Retrait du consentement | « Mon compte », rubrique des accords : messages WhatsApp, palmarès public |
| Opposition, suppression, portabilité | Demande écrite au délégué à la protection des données [à compléter : adresse de contact] ; réponse dans les 45 jours |
| Réclamation | Auprès de l'APDP (art. 448) |

## 7. Analyse d'impact résumée

L'analyse est requise au titre de l'article 428 : traitement à grande échelle portant sur un identifiant national, avec localisation des parcelles.

**Nécessité et proportionnalité.** Le NPI est le seul moyen fiable d'éviter les doublons et d'attribuer une aide à la bonne personne. La position des parcelles est l'objet même du registre. Aucune donnée sensible n'est collectée. L'année de naissance remplace la date de naissance. Aucune pièce d'identité n'est stockée.

| Risque | Vraisemblance | Gravité | Mesures | Risque résiduel |
|---|---|---|---|---|
| Accès d'un agent ou d'un tiers à des producteurs hors de son périmètre | Moyenne | Importante | Droits par rôle et par périmètre, restriction de l'agent à ses enregistrements, journal d'audit | Faible, après les politiques d'accès en base |
| Usurpation d'identité par le NPI | Moyenne | Importante | Code WhatsApp à chaque connexion, statut « en attente de vérification », contrôle par l'administration | Moyen, jusqu'au branchement ANIP |
| Pression foncière ou démarchage à partir des contours | Faible | Importante | Contours détaillés réservés au producteur, à son agent et au ministère | Faible |
| Message frauduleux envoyé depuis le numéro officiel | Faible | Importante | Aucun lien dans les messages, journal des envois, anti-doublon | Faible |
| Perte ou vol du téléphone d'un agent | Moyenne | Modérée | Déconnexion à distance depuis « Mon compte » ; chiffrement local à ajouter | Moyen, puis faible |
| Fuite chez un sous-traitant ou transfert hors du Bénin | Faible | Modérée | Contours sans identité vers Copernicus ; masquage des téléphones et NPI avant l'assistant ; contrats de traitement | Faible, après signature des contrats |
| Décision défavorable fondée sur une erreur du satellite | Moyenne | Modérée | « À vérifier » déclenche une visite, jamais une sanction ; palmarès fondé par défaut sur les exploitations vérifiées par un agent | Faible |
| Divulgation d'une attestation au-delà de son destinataire | Faible | Faible | Numéro aléatoire non devinable ; pas de NPI ; retrait possible | Faible |

**Conclusion.** Les risques résiduels sont acceptables une fois corrigés les écarts de la section 5. Le risque d'usurpation par le NPI restera moyen jusqu'à la vérification auprès de l'ANIP. [à compléter : décision du délégué à la protection des données sur l'opportunité d'une consultation préalable de l'APDP au titre de l'article 429.]

## 8. Formalités à accomplir

| N° | Formalité | Fondement | Porteur | État |
|---|---|---|---|---|
| 1 | Désigner le délégué à la protection des données du MAEP pour BAIS | Art. 430 | Ministère | [à compléter] |
| 2 | Valider les finalités, les bases légales et les durées de la section 4 | Art. 383 | Ministère | [à compléter] |
| 3 | Signer un contrat de traitement avec chaque sous-traitant (wapy.pro, hébergeur, modèle de langue) | Art. 386 | Ministère | [à compléter] |
| 4 | Déposer la déclaration et la demande d'autorisation (NPI, interconnexions ANIP et ANDF, transferts) | Art. 405, 407, 409, 413 | Ministère | Dossier prêt, à signer |
| 5 | Demander l'autorisation des transferts vers Copernicus (Union européenne) et, le cas échéant, vers l'hébergeur et le fournisseur du modèle de langue | Art. 391 | Ministère | Inclus dans le dépôt 4 |
| 6 | Joindre l'analyse d'impact | Art. 428 | Délégué | Section 7 |
| 7 | Rédiger la procédure de notification des violations | Art. 427 | Délégué et équipe technique | [à compléter] |
| 8 | Valider le texte d'information des producteurs | Art. 415 | Ministère | [à compléter] |
| 9 | Corriger les écarts de la section 5 | Art. 424, 426 | Équipe technique | En cours |
| 10 | Conventions avec l'ANIP et l'ANDF, après l'autorisation | Art. 393 | Ministère | Demandes prêtes |

**Contenu du dossier au titre de l'article 409.** Identité du responsable, finalités, interconnexions, catégories de données, destinataires, durées, service chargé des droits, mesures de sécurité, sous-traitants et transferts : ces éléments figurent aux sections 3 à 6.

**Dépôt.** Guichet en ligne de l'APDP : https://service.apdp.bj/. [à compléter : formulaire applicable et frais éventuels, non publiés en ligne à la date de rédaction.]

## Sources

- Loi n° 2017-20 du 20 avril 2018 portant code du numérique en République du Bénin, édition APDP : https://dataprotection.africa/wp-content/uploads/2022/09/Benin_DPA.pdf
- Loi n° 2020-35 du 6 janvier 2021 modifiant la loi n° 2017-20 : https://sgg.gouv.bj/doc/loi-2020-35/
- Guichet en ligne de l'APDP : https://service.apdp.bj/
- Recensement national de l'agriculture : https://www.gouv.bj/article/1643/
