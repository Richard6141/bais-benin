# Demande d'accès au service de vérification du NPI par X-Road BJ

Lettre type du ministre de l'Agriculture, de l'Élevage et de la Pêche, ou de son secrétaire général, au directeur général de l'Agence nationale d'identification des personnes (ANIP), avec copie à l'Agence des systèmes d'information et du numérique (ASIN). La fiche technique est jointe en annexe.

Les passages entre crochets sont à compléter avant signature.

---

RÉPUBLIQUE DU BÉNIN

MINISTÈRE DE L'AGRICULTURE, DE L'ÉLEVAGE ET DE LA PÊCHE

[Cabinet du Ministre ou Secrétariat général du Ministère]

N° [à compléter] /MAEP/[à compléter]

Cotonou, le [date]

**Le Ministre de l'Agriculture, de l'Élevage et de la Pêche**

à

**[Madame / Monsieur] le Directeur général de l'Agence nationale d'identification des personnes (ANIP)**
Cadjehoun, Cotonou

**Copie :** [Madame / Monsieur] le Directeur général de l'Agence des systèmes d'information et du numérique (ASIN)

**Objet :** demande d'accès au service de vérification du numéro personnel d'identification (NPI) par la plateforme nationale d'interopérabilité X-Road BJ.

**Pièce jointe :** fiche technique de la demande.

[Madame / Monsieur] le Directeur général,

Le ministère de l'Agriculture, de l'Élevage et de la Pêche met en place BAIS, la plateforme agricole nationale. BAIS tient le registre des producteurs agricoles, de leurs exploitations et de leurs parcelles. Elle permet à l'État de mieux cibler son appui : alertes climatiques et sanitaires, conseil, intrants, distinctions des meilleurs producteurs et attestations d'exploitation utiles au crédit.

Chaque producteur y est identifié par son numéro personnel d'identification. Le NPI garantit qu'un producteur n'est enregistré qu'une fois et que l'appui de l'État va à la bonne personne.

Aujourd'hui, la plateforme contrôle seulement la forme du NPI saisi. Elle ne peut pas s'assurer qu'il existe et qu'il appartient bien à la personne qui le présente. C'est pourquoi j'ai l'honneur de solliciter l'accès de BAIS au service de vérification du NPI de l'ANIP, par la plateforme X-Road BJ.

Le besoin est limité à une vérification de concordance. BAIS transmet le NPI et quelques éléments d'identité déclarés par la personne. Le service répond pour chacun s'il concorde ou non. BAIS ne demande ni la restitution de l'état civil, ni la photographie, ni les données biométriques.

Le traitement fait l'objet d'une demande d'autorisation auprès de l'Autorité de protection des données à caractère personnel, conformément à l'article 407 du code du numérique. Chaque interrogation sera journalisée, avec sa finalité et son auteur. Le NPI est conservé chiffré dans BAIS et n'est jamais affiché en clair.

La plateforme est prête à être raccordée. Je vous propose qu'une réunion technique réunisse nos équipes et celles de l'ASIN, afin d'arrêter les modalités de la convention : service concerné, format des échanges, volumes, sécurité et, le cas échéant, conditions financières.

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
| Membre X-Road BJ | [à compléter : le MAEP est-il déjà membre de X-Road BJ ? identifiant de membre et de sous-système] |
| Serveur de sécurité | [à compléter : serveur de sécurité existant du MAEP, ou à installer avec l'appui de l'ASIN] |

### 2. Fournisseur et service demandé

| Élément | Valeur |
|---|---|
| Fournisseur | Agence nationale d'identification des personnes (ANIP), fiche CatIS IN00148, code « ANIP-PRESIDENCE » |
| Service | Vérification de concordance d'un NPI avec des éléments d'identité [à compléter : identifiant CatIS et nom exact du service] |
| Opérations souhaitées | 1. Existence du NPI. 2. Concordance du nom, des prénoms et de l'année ou de la date de naissance. 3. Si le service le permet, concordance du numéro de téléphone déclaré. |
| Opérations non demandées | Restitution de l'état civil, photographie, données biométriques, recherche d'un NPI à partir du nom |

### 3. Données échangées

**Requête envoyée par BAIS :**

| Donnée | Obligatoire | Remarque |
|---|---|---|
| NPI | Oui | Jamais transmis dans une adresse web ni écrit dans les journaux |
| Nom | Oui | Tel que déclaré par la personne |
| Prénoms | Oui | Tel que déclarés |
| Date ou année de naissance | Non | BAIS ne conserve que l'année de naissance |
| Numéro de téléphone | Non | Seulement si le service le vérifie |
| Finalité | Oui | Enrôlement, dédoublonnage, vérification sur le terrain ou contrôle |
| Référence de l'autorisation APDP | Oui | [à compléter à réception] |

**Réponse attendue de l'ANIP :**

| Donnée | Remarque |
|---|---|
| NPI existant ou inconnu | |
| Concordance par élément : concordant, partiellement concordant, non concordant, non comparé | Pas de restitution des valeurs |
| Identifiant de la transaction X-Road | Conservé pour l'audit |

### 4. Finalités

| Finalité | Moment de l'appel |
|---|---|
| Enrôlement | Quand un agent enregistre un nouveau producteur |
| Première connexion | Quand un producteur crée son compte avec son NPI et son numéro |
| Dédoublonnage | Quand deux comptes présentent le même NPI |
| Contrôle | Avant l'ouverture d'un compte professionnel (agent, ministère) |

Effet prévu dans BAIS : une concordance complète fait passer l'identité de « en attente de vérification » à « vérifiée par l'ANIP ». Une concordance partielle déclenche une revue humaine. Une non-concordance bloque le compte et ouvre un signalement.

### 5. Volumes

| Élément | Estimation |
|---|---|
| Phase pilote | [à compléter : nombre de producteurs et communes pilotes] |
| Régime courant | Au plus un appel par enrôlement et par première connexion, plus les contrôles |
| Volume annuel | [à compléter] |
| Pointe journalière | [à compléter] |
| Ordre de grandeur national | 915 423 exploitations au recensement national de l'agriculture de 2019 |

### 6. Sécurité

- Échanges par le serveur de sécurité X-Road : messages signés et horodatés, canal chiffré, authentification mutuelle des membres.
- NPI conservé haché (HMAC-SHA-256) et chiffré (AES-256-GCM, clé hors de la base). Jamais affiché, jamais écrit dans les journaux.
- Chaque appel journalisé : auteur, finalité, référence du consentement, identifiant de transaction, résultat, sans les éléments d'identité.
- Accès au service réservé au serveur de BAIS. Aucun appel depuis le téléphone d'un agent.
- Nombre d'appels limité par utilisateur et par jour, mis en place avec le branchement.
- Conservation du journal d'audit : 5 ans.
- Autorisation APDP demandée au titre de l'article 407 du code du numérique (numéro national d'identification et interconnexion).

### 7. État de préparation de BAIS

- Le branchement est prévu dans le code. Un adaptateur X-Road BJ attend l'adresse du serveur de sécurité, les identifiants du client et du service, et le schéma d'échange fixé par la convention.
- En attendant, BAIS contrôle seulement la forme du NPI. L'identité reste « en attente de vérification », et ce statut est visible.
- Les échanges pourront être testés sur un environnement de recette de l'ANIP, si elle en dispose.

### 8. Interlocuteurs

| Rôle | MAEP | ANIP | ASIN |
|---|---|---|---|
| Administratif | [à compléter] | [à compléter] | [à compléter] |
| Technique | [à compléter] | [à compléter] | [à compléter] |
| Protection des données | [à compléter] | [à compléter] | Sans objet |

Coordonnées publiées de l'ANIP : Cadjehoun, Bénin ; téléphone +229 21 60 23 23 ; secrétariat (+229) 01 41 29 29 35 ; contact@anip.bj.

### 9. Références

- Loi n° 2017-08 du 19 juin 2017 portant identification des personnes physiques en République du Bénin.
- Décret n° 2020-099 du 26 février 2020 relatif au NPI, et décret n° 2020-100 du 26 février 2020 portant mise en œuvre du registre national des personnes physiques.
- Décret portant mise en place de la plateforme nationale d'interopérabilité, adopté en Conseil des ministres le 18 mars 2020 [à compléter : numéro du décret].
- Décret n° 2022-324 du 1er juin 2022 portant création de l'ASIN.
- Loi n° 2017-20 du 20 avril 2018 portant code du numérique, modifiée par la loi n° 2020-35 du 6 janvier 2021 : articles 393 (interconnexion) et 407 (autorisation préalable).
- Catalogue CatIS de X-Road BJ, fiche ANIP : https://catis.xroad.bj/institutions/IN00148
