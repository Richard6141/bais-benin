# Demande d'accès au cadastre national et aux plans fonciers ruraux par X-Road BJ

Lettre type du ministre de l'Agriculture, de l'Élevage et de la Pêche, ou de son secrétaire général, au directeur général de l'Agence nationale du domaine et du foncier (ANDF), avec copie à l'Agence des systèmes d'information et du numérique (ASIN). La fiche technique est jointe en annexe.

Les passages entre crochets sont à compléter avant signature.

---

RÉPUBLIQUE DU BÉNIN

MINISTÈRE DE L'AGRICULTURE, DE L'ÉLEVAGE ET DE LA PÊCHE

[Cabinet du Ministre ou Secrétariat général du Ministère]

N° [à compléter] /MAEP/[à compléter]

Cotonou, le [date]

**Le Ministre de l'Agriculture, de l'Élevage et de la Pêche**

à

**[Madame / Monsieur] le Directeur général de l'Agence nationale du domaine et du foncier (ANDF)**
01 BP 8966 Cotonou

**Copie :**
- [Madame / Monsieur] le Directeur général de l'Agence des systèmes d'information et du numérique (ASIN) ;
- [Madame / Monsieur] le Ministre de l'Économie et des Finances, autorité de tutelle de l'ANDF [à compléter : à conserver ou non selon l'usage].

**Objet :** demande d'accès aux données du cadastre national et des plans fonciers ruraux par la plateforme nationale d'interopérabilité X-Road BJ.

**Pièce jointe :** fiche technique de la demande.

[Madame / Monsieur] le Directeur général,

Le ministère de l'Agriculture, de l'Élevage et de la Pêche met en place BAIS, la plateforme agricole nationale. BAIS tient le registre des producteurs agricoles, identifiés par leur numéro personnel d'identification, et de leurs parcelles, dont le contour est relevé au GPS ou à partir des images satellite.

La plateforme connaît donc l'emplacement de chaque champ enregistré et la personne qui l'exploite. Elle ne sait pas à quel titre cette personne l'occupe. Le producteur déclare seulement s'il est propriétaire, locataire, exploitant sur une terre familiale ou en métayage.

Rapprocher chaque parcelle agricole de sa situation foncière servirait trois objectifs :
- sécuriser le producteur, en mentionnant sur son attestation d'exploitation le titre foncier ou le certificat foncier rural qui fonde ses droits ;
- prévenir les conflits : BAIS repère déjà les contours de champs qui se chevauchent, et le cadastre permettrait de distinguer l'erreur de relevé du litige ;
- faciliter l'accès au crédit, les banques exigeant une preuve de la maîtrise foncière.

J'ai l'honneur de solliciter, à cette fin, l'accès de BAIS aux services du cadastre national de l'ANDF par la plateforme X-Road BJ, ainsi qu'aux emprises des plans fonciers ruraux.

Le besoin est limité. Pour une parcelle agricole donnée, BAIS souhaite savoir si elle recoupe une parcelle cadastrée ou inscrite à un plan foncier rural, et sous quel type de document. BAIS ne demande pas l'identité des titulaires. Si l'ANDF le permet, une simple concordance entre le NPI du producteur et celui du titulaire suffirait.

Le traitement fait l'objet d'une demande d'autorisation auprès de l'Autorité de protection des données à caractère personnel, au titre de l'interconnexion de fichiers. Chaque interrogation sera journalisée. Les informations foncières ne seront visibles que du producteur concerné, de son agent et du ministère.

Je vous propose qu'une réunion technique réunisse nos équipes et celles de l'ASIN, afin d'arrêter les modalités d'une convention.

Pour le suivi de ce dossier, mes services ont désigné :
- point focal administratif : [nom, fonction, téléphone, adresse électronique] ;
- point focal technique : [nom, fonction, téléphone, adresse électronique] ;
- délégué à la protection des données : [nom, fonction, adresse électronique].

Je vous prie d'agréer, [Madame / Monsieur] le Directeur général, l'expression de ma considération distinguée.

[Signature]

[Nom et qualité du signataire]

---

## Annexe. Fiche technique

### 1. Demandeur

| Élément | Valeur |
|---|---|
| Institution | Ministère de l'Agriculture, de l'Élevage et de la Pêche (MAEP) |
| Système d'information | BAIS, plateforme agricole nationale |
| Membre X-Road BJ | [à compléter : identifiant de membre et de sous-système du MAEP] |

### 2. Fournisseur et services demandés

Fournisseur : Agence nationale du domaine et du foncier (ANDF), fiche CatIS IN00025. Système « Cadastre national du Bénin », fiche CatIS IS00016.

| N° | Service | Mode | Usage dans BAIS |
|---|---|---|---|
| 1 | Situation foncière d'une emprise : pour un contour de parcelle agricole, liste des parcelles cadastrées ou inscrites à un plan foncier rural qu'il recoupe | Interrogation à la demande, par X-Road | Fiche de la parcelle, attestation d'exploitation, instruction d'un chevauchement |
| 2 | Concordance du titulaire : le NPI du producteur correspond-il au titulaire du document foncier ? | Interrogation à la demande, par X-Road | Mention « droits fonciers confirmés » sur l'attestation |
| 3 | Emprises des plans fonciers ruraux et des parcelles cadastrées, sans données nominatives | Couche cartographique, mise à jour périodique | Couche réservée au ministère sur la carte |

[à compléter : identifiants CatIS des services correspondants. Le catalogue mentionne notamment « Extrait de plan cadastral d'une parcelle » et « Situation géographique », à confirmer avec l'ANDF.]

### 3. Données échangées

**Service 1. Requête de BAIS :** le contour de la parcelle agricole, en coordonnées géographiques (WGS 84), et la finalité de l'appel. Aucune donnée nominative.

**Service 1. Réponse attendue :**

| Donnée | Remarque |
|---|---|
| Identifiant de la parcelle cadastrale ou de l'inscription au plan foncier rural | |
| Type de document : titre foncier, certificat foncier rural, inscription au plan foncier rural, procédure en cours | |
| Surface de recouvrement, ou contour de la parcelle cadastrale | Pour mesurer l'écart avec le relevé agricole |
| Date de la dernière mise à jour | |

**Service 2. Requête de BAIS :** l'identifiant foncier obtenu au service 1 et le NPI du producteur.

**Service 2. Réponse attendue :** concordant, non concordant ou non vérifiable. Aucune restitution de l'identité du titulaire.

**Service 3 :** fichier cartographique des emprises (format à convenir), sans nom ni identifiant de personne.

### 4. Finalités

- Informer le producteur et l'agent de la situation foncière d'une parcelle.
- Mentionner sur l'attestation d'exploitation le document foncier existant.
- Instruire les chevauchements de contours détectés par BAIS.
- Produire des statistiques agrégées sur le mode de faire-valoir des terres agricoles, par commune.

Ces finalités excluent tout usage fiscal, toute décision sur les droits fonciers eux-mêmes et toute communication à des tiers.

### 5. Volumes

| Élément | Estimation |
|---|---|
| Parcelles relevées dans BAIS | [à compléter : nombre à la date de la demande] |
| Phase pilote | [à compléter : communes pilotes, de préférence dotées d'un plan foncier rural] |
| Appels du service 1 | Un par parcelle relevée ou modifiée, plus les contrôles |
| Appels du service 2 | À la demande du producteur, pour son attestation |
| Service 3 | Une mise à jour par [à compléter : mois ou trimestre] |

### 6. Sécurité

- Échanges par le serveur de sécurité X-Road : messages signés et horodatés, canal chiffré, authentification mutuelle.
- NPI conservé haché et chiffré dans BAIS. Jamais affiché ni écrit dans les journaux.
- Informations foncières visibles du producteur concerné, de l'agent qui a enregistré l'exploitation et du ministère seulement. Jamais publiées.
- Chaque appel journalisé : auteur, finalité, identifiant de transaction, résultat.
- Conservation du journal d'audit : 5 ans.
- Autorisation APDP demandée au titre de l'article 407, 5°, du code du numérique (interconnexion de fichiers).

### 7. État de préparation de BAIS

- Chaque parcelle porte son contour, sa méthode de relevé, sa précision et son auteur.
- Les chevauchements entre parcelles sont déjà détectés et signalés sur la fiche de la parcelle.
- Le mode de faire-valoir déclaré est enregistré : propriétaire, locataire, terre familiale, métayage ou inconnu.
- Le branchement au cadastre reste à écrire. Il sera développé dès réception du schéma d'échange de l'ANDF.

### 8. Interlocuteurs

| Rôle | MAEP | ANDF | ASIN |
|---|---|---|---|
| Administratif | [à compléter] | [à compléter] | [à compléter] |
| Technique | [à compléter] | [à compléter] | [à compléter] |
| Protection des données | [à compléter] | [à compléter] | Sans objet |

Coordonnées publiées de l'ANDF : 01 BP 8966 Cotonou, immeuble AÏSSI, face à l'église Sainte Rita ; téléphone +229 21 32 67 71 et (+229) 01 97 43 42 93 ; andf@finances.bj.

### 9. Références

- Loi n° 2013-01 du 14 août 2013 portant code foncier et domanial en République du Bénin, modifiée et complétée par la loi n° 2017-15 du 10 août 2017. L'ANDF est créée par l'article 416 de ce code.
- Décret portant mise en place de la plateforme nationale d'interopérabilité, adopté en Conseil des ministres le 18 mars 2020 [à compléter : numéro du décret].
- Décret n° 2022-324 du 1er juin 2022 portant création de l'ASIN.
- Loi n° 2017-20 du 20 avril 2018 portant code du numérique, modifiée par la loi n° 2020-35 du 6 janvier 2021 : articles 393 (interconnexion) et 407 (autorisation préalable).
- Catalogue CatIS de X-Road BJ : fiche ANDF https://catis.xroad.bj/institutions/IN00025 ; système « Cadastre national du Bénin » https://catis.xroad.bj/systems/IS00016/DD
