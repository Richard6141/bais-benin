# Recherche — ANIP, NPI et services d'identité au Bénin

> Rédigé par : Expert intégration et conformité, à partir d'une recherche documentaire menée le 24 septembre 2026.
> Statut : version 1.0 — note de recherche. Toutes les pages citées ont été consultées le 2026-09-24. Lorsqu'une information n'est pas publique, le document le dit explicitement ; aucun point d'entrée d'API, format de champ ou chiffre n'a été inventé.

## 1. Objet et méthode

Le Numéro Personnel d'Identification (NPI) est opérationnel au Bénin et couvre la quasi-totalité de la population. La plateforme BAIS veut s'appuyer dessus pour identifier les producteurs de façon fiable et dédupliquer le registre. Cette note établit ce qui existe réellement (cadre légal, format, services exposés, conditions d'accès, usages tiers, identité numérique), puis en déduit ce que BAIS peut intégrer immédiatement, ce qui exige une convention ou une habilitation, et propose le contrat de l'adaptateur `IdentityVerificationProvider`.

Limite importante : les textes fondateurs (loi 2017-08, décret 2020-099) ne sont disponibles en ligne que sous forme de scans image, non extractibles. Leur contenu est donc rapporté à travers des sources secondaires officielles (présentation ANIP à la CEA-ONU, pages anip.bj, communiqués gouv.bj).

## 2. Cadre légal et institutions

### 2.1 ANIP et RNPP

L'Agence Nationale d'Identification des Personnes (ANIP) a été créée par la loi n° 2017-08 du 19 juin 2017 portant identification des personnes physiques en République du Bénin. Le dispositif est complété par le décret n° 2018-206 du 6 juin 2018 (organisation et fonctionnement de l'ANIP), le décret n° 2020-099 du 26 février 2020 relatif au NPI, le décret n° 2020-100 du 26 février 2020 portant mise en œuvre du Registre National des Personnes Physiques (RNPP) et l'arrêté n° 285/MISP/DC/SGM/ANIP/DGPR/DEI/SA du 18 mars 2021 sur les pièces d'identité sécurisées. Sources : documenthèque du Secrétariat général du gouvernement (https://sgg.gouv.bj/doc/loi-2017-08/ et https://sgg.gouv.bj/doc/decret-2020-099/), conditions générales d'utilisation des plateformes ANIP (https://anip.bj/cgu-apps-anip/), présentation « L'identité numérique et sa mise en œuvre – Le cas du Bénin » (https://www.uneca.org/sites/default/files/TCND/Edgar_Ayena.pdf).

Le RNPP est issu du Recensement Administratif à Vocation d'Identification de la Population (RAVIP, novembre 2017 à avril 2018). Selon la présentation ANIP citée, il comptait plus de 12 millions de personnes, soit environ 93 % de la population. La Banque mondiale indique qu'à fin mai 2025, 99 % de la population était inscrite biométriquement, 7,7 millions de personnes disposaient d'un NPI matérialisé et 6,1 millions de certificats gratuits avaient été délivrés, dans le cadre du programme régional WURI (273 millions USD, dont 45 millions pour le Bénin) (https://www.banquemondiale.org/fr/news/feature/2026/05/20/transforming-lives-in-benin-a-unique-identification-system).

Les règles d'enrôlement au RNPP ont été révisées par note d'instruction de l'ANIP du 5 mai 2026 : acte de naissance ou jugement supplétif obligatoire, dérogations pour les titulaires d'une carte LEPI, régime particulier des enfants jusqu'à 13 ans fixé par le décret n° 2025-679 du 29 octobre 2025 (https://lamarina.bj/index.php/2026/05/06/benin-lanip-fixe-les-nouvelles-regles-denrolement-au-registre-national-des-personnes-physiques/).

### 2.2 Le NPI : définition

D'après les extraits du décret RNPP repris dans la présentation ANIP à la CEA-ONU, un NPI est attribué à chaque personne inscrite au RNPP ; il est « unique, inintelligible et non répétitif », « attribué à vie », « exigé pour l'accomplissement d'actes de la vie civile déterminés par la loi et les règlements », « exigé pour accéder aux services publics » et « utilisé pour échanger les données entre services publics et parapublics ». Les résidents étrangers reçoivent un NPIR (numéro personnel d'identification des résidents), mentionné dans les conditions générales de MTN Bénin (https://www.mtn.bj/wp-content/uploads/2024/12/CONDITIONS-GENERALES-CARTE-SIM.pdf).

### 2.3 Titres associés

| Titre | Contenu et usage | Coût et validité | Source |
|---|---|---|---|
| Certificat du NPI (CNPI, aussi appelé fID ou carte « C'est Moi ») | Atteste le NPI ; délivré en ligne gratuitement depuis décembre 2021, financé par WURI | Gratuit | https://anip.bj/certificat-npi-fid/ ; https://www.gouv.bj/article/1593/ |
| Certificat d'Identification Personnelle (CIP) | « Se présente sous la forme d'une carte d'identité, porte la photo et le numéro d'Identification Personnelle du détenteur, ainsi que deux QR codes permettant d'en vérifier l'authenticité » ; remplace le certificat de possession d'état ; vaut carte d'électeur | 1 000 F CFA, deux ans | https://anip.bj/certificat-didentification-personnelle/ |
| Carte nationale d'identité biométrique (CNIB) | Exige acte de naissance sécurisé, CIP et photo ; renouvellement en ligne ouvert depuis le 21 septembre 2026, retrait physique | 6 000 F CFA, cinq ans | https://anip.bj/carte-didentite-biometrique/ ; https://www.osiris.sn/le-benin-numerise-le-renouvellement-de-la-carte-d-identite-biometrique.html |

## 3. Format du NPI

Aucune page officielle consultée (anip.bj, gouv.bj, sgg.gouv.bj) ne précise le nombre de chiffres du NPI ni l'existence d'une clé de contrôle. Le décret 2020-099, qui devrait le définir, n'est accessible que sous forme de scan.

La seule indication de format provient d'un site privé de démarches administratives, qui parle d'un « NPI unique à 13 chiffres » généré par algorithme lors de l'enrôlement RAVIP (https://enligneaubenin.com/certificat-numero-personnel-didentification/). Le qualificatif officiel « inintelligible » indique que le numéro ne porte aucune signification (pas de date de naissance, de sexe ni de lieu encodés), à la différence par exemple du NIR français. La structure interne et un éventuel chiffre de contrôle ne sont pas publics.

Conséquence pour BAIS : la longueur de 13 chiffres doit être traitée comme une hypothèse paramétrable, confirmée sur des NPI réels de producteurs volontaires avant d'être rendue bloquante en saisie. Aucune vérification de clé n'est possible en l'état. Le document 08 (section 6.6) doit être aligné : le générateur de données synthétiques produira des chaînes de 13 chiffres factices, jamais de 10, et l'hypothèse de clé invalide y devient sans objet tant que l'algorithme n'est pas connu.

## 4. Services de vérification exposés

### 4.1 Services citoyens de l'ANIP

Les conditions générales d'utilisation des plateformes ANIP (article 6) listent notamment deux services en ligne : la « recherche du numéro personnel d'identification (NPI) à partir du numéro de formulaire RAVIP ou d'informations nominatives » (https://eservices.anip.bj/retrouver-npi/, à partir du nom, des prénoms, du nom de la mère et de la date de naissance) et la « vérification de l'authenticité des documents émis par l'ANIP via la prise de photo, la sélection d'un fichier numérique ou le remplissage manuel d'un formulaire suivi d'un scan de QR code » (https://eservices.anip.bj/verifier-document/). Ces services sont destinés aux citoyens, accessibles par navigateur et par l'application « ANIP BJ » (Play Store, identifiant `bj.anip.eservice`). Le support est joignable au numéro vert 7054, par WhatsApp au 01 48 50 00 00 et à serviceclient@anip.bj.

Ces pages sont des applications monopages dont les appels réseau ne sont pas documentés. Elles ne constituent pas une API pour les tiers et leur automatisation serait contraire à leurs conditions d'utilisation.

### 4.2 QR code signé des titres

Selon la présentation ANIP à la CEA-ONU, le QR code du certificat fID contient « les informations nominatives et la photo du visage […] le tout encodé au format JWT signé par la PKI » et « donne accès aux clés publiques à travers l'infrastructure PKI ». Ce mécanisme permettrait une vérification hors ligne de l'authenticité d'un titre par un tiers disposant de la clé publique. Ni la spécification du JWT (claims, algorithme) ni l'adresse de publication des clés publiques n'ont été trouvées sur les pages consultées.

### 4.3 Plateforme nationale d'interopérabilité (X-Road BJ / UXP)

Le Bénin exploite une plateforme d'échange de données fondée sur UXP, produit de la société estonienne Cybernetica dérivé de X-Road, opérée par l'Agence des Systèmes d'Information et du Numérique (ASIN, créée par le décret n° 2022-324 du 1er juin 2022 par fusion de l'ADN, de l'ASSI, de l'ANSSI et de l'ABSU-CEP) (https://en.wikipedia.org/wiki/Information_Systems_and_Digital_Agency_(Benin)). Cybernetica annonçait plus de 30 institutions et plus de 100 e-services connectés en 2023 (https://cyber.ee/resources/news/benin-uxp/). En juin 2025, la plateforme comptait plus de 55 institutions, plus de 1 500 services dont plus de 300 entièrement numérisés et plus de 70 millions d'échanges, avec des banques, opérateurs télécoms et assureurs connectés, le RNPP servant de registre pivot (https://www.biometricupdate.com/202506/benin-shares-its-x-road-inspired-dpi-interoperability-experience-in-peer-learning-webinar). Le référentiel DPI Map classe « X-Road BJ » comme actif, gouverné par un comité national d'interopérabilité et ouvert aux secteurs public et privé (https://dpimap.org/benin/). La présentation ANIP confirme que « le système fID est interopérable avec les systèmes des prestataires de services au moyen de XROAD : identification et authentification des bénéficiaires ».

En pratique, le portail https://www.xroad.bj/ n'affiche qu'un écran de chargement, et le catalogue des services CatIS (https://catis.xroad.bj/, fiche ANIP https://catis.xroad.bj/institutions/IN00148, cadre d'interopérabilité https://catis.xroad.bj/assets/IA00002) n'a pas répondu dans les délais lors des consultations. Aucun portail développeurs, aucune documentation technique (descriptions de services, formats de messages, WSDL ou OpenAPI), aucune procédure publique d'adhésion pour un fournisseur privé n'a été trouvée. Les expressions « API NPI », « e-verification ANIP » ou « Plateforme Nationale d'Interopérabilité » n'apparaissent sur aucune page officielle.

## 5. Conditions d'accès et conformité

Le code du numérique (loi n° 2017-20 du 20 avril 2018, modifiée par la loi n° 2020-35 du 6 janvier 2021, texte consolidé : https://dataprotection.africa/wp-content/uploads/2022/09/Benin_DPA.pdf) organise deux régimes devant l'Autorité de Protection des Données à caractère Personnel (APDP) :

- **déclaration préalable** (article 405) pour tout traitement de données personnelles ;
- **autorisation préalable** (article 407) notamment pour « les traitements portant sur un numéro national d'identification ou tout autre identifiant de la même nature » (2°), les traitements comportant des données biométriques (3°), les traitements ayant pour objet une interconnexion de fichiers (5°) et les transferts de données vers un État tiers (6°).

Les articles 389 et 390 posent le principe du consentement de la personne concernée et l'article 393 encadre l'interconnexion de fichiers. La fiche pratique de mise en conformité de l'APDP précise que « l'autorisation n'exonère pas de la responsabilité à l'égard des tiers » et décrit les formulaires (https://archive.apdp.bj/wp-content/uploads/2021/11/Fiche.Pratique.Mise-en-conformite_Pt_OK_Validee.pdf). Le guichet en ligne est https://service.apdp.bj/ et le délai d'instruction rapporté est de l'ordre de deux mois (https://lanation.bj/numerique/protection-des-donnees-personnelles-au-benin-lapdp-propose-une-procedure-de-saisine-facile).

Conséquences directes pour BAIS :

1. **Stocker le NPI des producteurs est en soi un traitement soumis à autorisation APDP** (article 407, 2°), indépendamment de toute connexion à l'ANIP. Le dossier doit être préparé dès la phase 1.
2. Toute interrogation du RNPP est une interconnexion de fichiers (article 407, 5°) et requiert en plus une convention avec l'ANIP et le raccordement à X-Road BJ via l'ASIN. Aucun modèle de convention ni aucune grille tarifaire ANIP ou ASIN n'est publié.
3. Un hébergement hors du Bénin constitue un transfert vers un État tiers (article 407, 6°), à intégrer dans le choix d'infrastructure.

## 6. Usages existants du NPI par des tiers

| Secteur | Usage constaté | Source |
|---|---|---|
| Télécommunications (SIM) | Les conditions générales de MTN Bénin (décembre 2024) stipulent que « l'Opérateur en collaboration avec l'ANIP, procède à la vérification et à l'identification instantanée du NPI ou NPIR de l'abonné et de son identité ». C'est la preuve la plus nette d'une vérification en temps réel par un acteur privé. L'ARCEP a imposé la mise à jour des identifications (décision 2025-42 du 19 février 2025, désactivation des lignes non conformes au 30 avril 2025). | https://www.mtn.bj/wp-content/uploads/2024/12/CONDITIONS-GENERALES-CARTE-SIM.pdf ; https://lamarinabj.com/index.php/2025/02/20/ |
| Banque, mobile money, microfinance | Ouverture de comptes, mobile money et création d'entreprises citées par la Banque mondiale ; le système d'information des structures de microcrédit (par exemple CLCAM) exige le NPI. | https://www.banquemondiale.org/fr/news/feature/2026/05/20/ ; https://dpi.africa/fr/digitalisation-des-services-detat-civil-le-npi-pour-tous-en-un-seul-clic/ |
| Fiscalité | La DGI annonçait l'obtention de l'IFU en moins de 24 heures à partir du NPI ; la page est actuellement suspendue chez l'hébergeur, contenu non vérifiable. | https://finances.bj/communiques/dgi-obtenez-desormais-votre-ifu-en-moins-de-24h-avec-votre-numero-personnel-didentification-npi/ |
| Élections 2026 | La Liste Électorale Informatisée est extraite du RNPP par l'ANIP ; le CIP vaut carte d'électeur ; recherche du centre de vote par NPI via application et code USSD. | https://www.gouv.bj/article/3207/ ; https://beninwebtv.bj/presidentielle-du-12-avril-2026-au-benin-voici-comment-retrouver-son-centre-de-vote/ |
| Fonction publique, examens, ARCH | Des sources secondaires citent les concours, le BEPC et le BAC, les formations ARCH et le KYC bancaire comme exigeant le NPI ; aucun texte officiel ARCH ou du ministère de l'éducation n'a été trouvé pour le confirmer. | https://enligneaubenin.com/ |
| e-Visa | Plateforme destinée aux étrangers ; aucun lien avec le NPI. | https://dei.gouv.bj/article/1/Le-E-Visa-un-outil-de-pointe |
| Agriculture | Le Recensement National de l'Agriculture (2019) dénombre 915 423 exploitations. Les plateformes acteur-agricole.bj et agrizonecna.com sont des annuaires. Le Conseil des ministres du 2 septembre 2026 a lancé la phase pilote du « Programme de productivité agricole et de protection sociale des agriculteurs » (2 000 producteurs de maïs, environ 3 000 ha, assurance maladie pour six personnes par foyer) avec « une plateforme dédiée [qui] permettra l'identification et la géolocalisation de chaque producteur et de sa parcelle ». Aucun registre national des producteurs adossé au NPI n'est documenté publiquement. | https://www.gouv.bj/article/1643/ ; https://numerique.gouv.bj/publications/actualites/ ; https://beninwebtv.bj/ (Conseil des ministres du 2 septembre 2026) |

Le programme pilote de septembre 2026 est un point d'attention stratégique : sa « plateforme dédiée » pourrait devenir le registre national des producteurs de fait. BAIS doit se positionner en complément ou en socle de ce programme, pas en concurrent.

## 7. Identité numérique et authentification nationale

Un « Portail Identité numérique – Bénin » existe en environnement de test (https://test-identite-numerique.gouv.bj/) et en production (https://identite-numerique.bj/, dont le certificat TLS était invalide lors de la consultation). Il propose trois produits : eID (certificat sur la carte nationale d'identité), Virtual ID (signature à distance) et Mobile ID (authentification par téléphone), avec un support à support-idnumerique@gouv.bj. L'application « Mobile ID Bénin » (Play Store, identifiant `bj.gouv.mobileid`) permet de s'authentifier « sur les services en ligne du Gouvernement du Bénin et les applications web privées intégrées à la PKI nationale » ; l'ANIP est autorité d'enregistrement des certificats et le catalogue CatIS référence un service « Délivrance de certificats d'identité numérique (PKI) » (PS01333). DPI Map marque Mobile ID Bénin comme actif (mise à jour du 3 septembre 2025).

Le portail national des services publics dispose d'un espace citoyen (https://auth.service-public.bj/citizen/login) dont les services authentifiés requièrent le NPI. La doctrine présentée par l'ANIP arrime les services de confiance de niveau « faible » au CNPI et les niveaux « substantiel » et « élevé » aux cartes d'identité.

Aucune documentation OpenID Connect, OAuth 2.0 ou SAML, et aucune procédure d'enregistrement d'une application cliente (relying party) ne sont publiées. Les appellations « BJ Connect » ou « Bénin Connect » n'existent pas dans les résultats. Sèmè City est la cité du savoir et de l'innovation de Ouidah (https://semecity.bj/) et n'a aucun rapport avec l'identité numérique.

## 8. Conclusions pour BAIS

### 8.1 Intégrable maintenant, sans convention

- Un champ NPI facultatif saisi par le producteur ou l'agent, avec validation locale purement syntaxique (chiffres uniquement, longueur paramétrée à 13 par défaut, non bloquante tant que la longueur n'est pas confirmée), stocké chiffré et affiché masqué. Un champ NPIR de même nature pour les résidents étrangers.
- Des liens et un parcours d'aide vers les services citoyens de l'ANIP : retrouver son NPI, obtenir le CNPI gratuit, vérifier un document, numéro vert 7054.
- La capture du QR code du CIP ou du CNPI par l'agent de terrain, conservée comme pièce jointe, avec vérification manuelle par l'agent via l'application ANIP BJ. La vérification cryptographique automatique du JWT est impossible sans la clé publique de la PKI, non publiée.
- Le dépôt du dossier APDP (déclaration et demande d'autorisation au titre de l'article 407) dès la phase 1, puisque la seule conservation du NPI le requiert.

### 8.2 Nécessite une convention ou une habilitation

- Toute vérification en ligne d'un NPI contre le RNPP (existence, concordance nom, prénoms, date de naissance, sexe, photo) passe par X-Road BJ, donc par l'ASIN pour le raccordement et par l'ANIP pour le service, sur le modèle déjà appliqué aux opérateurs télécoms. Elle suppose une convention (non publiée), l'autorisation APDP préalable et, très probablement, une tarification.
- L'authentification des utilisateurs par Mobile ID ou la PKI nationale, à demander à support-idnumerique@gouv.bj, ainsi que l'usage du compte citoyen de service-public.bj.
- Tout hébergement ou traitement hors du Bénin.

### 8.3 Incertitudes restantes

- Structure exacte du NPI et existence d'une clé de contrôle (décret 2020-099 non lisible en ligne).
- Format du JWT des QR codes et modalité d'accès à la clé publique de la PKI.
- Existence et conditions d'un portail développeurs X-Road BJ ou CatIS pour le secteur privé (site inaccessible lors des consultations).
- Tarification ANIP et ASIN pour la consultation du RNPP.
- Statut de production réel de Mobile ID et protocoles supportés.
- Articulation entre BAIS et la plateforme dédiée du programme agricole lancé en septembre 2026.

## 9. Contrat de l'adaptateur `IdentityVerificationProvider`

Le port est conçu pour fonctionner dès aujourd'hui en mode local (validation syntaxique, pièce jointe QR) et pour accueillir, sans changement d'interface, un adaptateur X-Road BJ le jour où la convention est signée. Il est fidèle au fonctionnement décrit des services existants : recherche par NPI ou par données nominatives, réponse sous forme de concordances champ par champ plutôt que de restitution intégrale de l'état civil (minimisation), vérification d'un titre par son QR code signé. Les noms de champs côté ANIP n'étant pas publics, l'adaptateur réel devra traduire ces types vers le schéma effectif du service X-Road ; les types ci-dessous sont ceux de BAIS.

```ts
/**
 * Port d'identification des personnes (ANIP / RNPP).
 * Implémentations prévues :
 *  - LocalIdentityProvider    : validation syntaxique seule, aucun appel réseau (phase 1).
 *  - XRoadAnipIdentityProvider : consultation du RNPP via X-Road BJ (après convention ANIP/ASIN
 *                                et autorisation APDP).
 *  - FakeIdentityProvider     : réponses déterministes pour les tests et le jeu SYNTHETIC.
 */

/** Identifiant national : NPI (nationaux) ou NPIR (résidents étrangers). */
export type NationalIdKind = "NPI" | "NPIR";

export interface NationalId {
  kind: NationalIdKind;
  /** Chiffres uniquement, sans espace. Longueur attendue : IDENTITY_NPI_LENGTH (13 par défaut, à confirmer). */
  value: string;
}

/** Données nominatives minimales utilisées pour une recherche ou une concordance. */
export interface PersonAttributes {
  lastName: string;
  firstNames: string;
  /** ISO 8601, date seule (AAAA-MM-JJ). */
  birthDate?: string;
  sex?: "M" | "F";
  /** Nom de la mère : critère utilisé par le service citoyen « retrouver son NPI ». */
  motherLastName?: string;
  birthPlace?: string;
}

/** Résultat de la validation locale, sans appel réseau. */
export interface FormatValidation {
  valid: boolean;
  normalized?: string;
  reason?: "EMPTY" | "NON_DIGIT" | "BAD_LENGTH" | "CHECKSUM_UNAVAILABLE";
}

export type MatchLevel = "MATCH" | "PARTIAL" | "MISMATCH" | "NOT_COMPARED";

/** Concordance champ par champ : le service ne restitue pas l'état civil, il confirme ou infirme. */
export interface IdentityMatch {
  id: NationalId;
  exists: boolean;
  fields: {
    lastName: MatchLevel;
    firstNames: MatchLevel;
    birthDate: MatchLevel;
    sex: MatchLevel;
  };
  /** Score global 0 à 1 calculé par l'adaptateur à partir des concordances. */
  score: number;
  /** Photo renvoyée uniquement si le service et la convention l'autorisent (comparaison par l'agent). */
  photoJpegBase64?: string;
  provider: ProviderInfo;
}

/** Recherche du NPI à partir des données nominatives (équivalent du service citoyen « retrouver son NPI »). */
export interface IdentityLookupResult {
  candidates: Array<{
    id: NationalId;
    score: number;
    /** Attributs masqués partiellement (par exemple « K***** », « 19**-05-12 ») pour lever une ambiguïté sans divulguer. */
    maskedAttributes: Partial<PersonAttributes>;
  }>;
  provider: ProviderInfo;
}

/** Vérification d'un titre ANIP (CIP, CNPI/fID) par son QR code signé (JWT signé par la PKI nationale). */
export interface DocumentVerification {
  authentic: boolean;
  documentType: "CIP" | "CNPI" | "CNIB" | "UNKNOWN";
  id?: NationalId;
  expiresAt?: string;
  /** Attributs extraits du QR, exposés seulement si le titre est authentique. */
  attributes?: Partial<PersonAttributes>;
  /** "OFFLINE" si la signature a été vérifiée localement avec la clé publique PKI, "ONLINE" si via le service. */
  method: "OFFLINE" | "ONLINE" | "UNVERIFIED";
  provider: ProviderInfo;
}

export interface ProviderInfo {
  name: "LOCAL" | "XROAD_ANIP" | "FAKE";
  /** Identifiant de la transaction X-Road, à conserver pour l'audit et la facturation. */
  transactionId?: string;
  checkedAt: string;
}

/** Contexte obligatoire : consentement tracé et finalité déclarée à l'APDP. */
export interface VerificationContext {
  /** Utilisateur BAIS à l'origine de l'appel (agent, administrateur). */
  actorId: string;
  /** Preuve du consentement de la personne (identifiant de la trace signée ou horodatée). */
  consentRef: string;
  /** Finalité, alignée sur la déclaration APDP. */
  purpose: "ENROLMENT" | "DEDUPLICATION" | "FIELD_VERIFICATION" | "AUDIT";
  /** Numéro de dossier APDP autorisant le traitement. */
  apdpAuthorizationRef?: string;
}

export interface IdentityVerificationProvider {
  /** Toujours disponible, aucun appel réseau. */
  validateFormat(id: NationalId): FormatValidation;

  /** Capacités réelles de l'adaptateur, pour adapter l'interface (bouton grisé, mention « non connecté »). */
  capabilities(): {
    verify: boolean;
    lookup: boolean;
    verifyDocument: boolean;
    photo: boolean;
  };

  /** Concordance NPI + attributs contre le RNPP. Rejette IdentityVerificationError si non disponible. */
  verify(id: NationalId, attributes: PersonAttributes, ctx: VerificationContext): Promise<IdentityMatch>;

  /** Recherche de candidats à partir des attributs (jamais plus de N résultats, masqués). */
  lookup(attributes: PersonAttributes, ctx: VerificationContext): Promise<IdentityLookupResult>;

  /** Vérification d'un QR code de titre ANIP (contenu brut du QR). */
  verifyDocument(qrPayload: string, ctx: VerificationContext): Promise<DocumentVerification>;
}

export type IdentityErrorCode =
  | "PROVIDER_NOT_CONFIGURED"   // aucune convention : adaptateur local seul
  | "CAPABILITY_UNAVAILABLE"    // l'opération n'est pas couverte par la convention
  | "INVALID_FORMAT"            // NPI syntaxiquement invalide
  | "CONSENT_REQUIRED"          // consentRef absent ou invalide
  | "PURPOSE_NOT_AUTHORIZED"    // finalité hors autorisation APDP
  | "NOT_FOUND"                 // NPI inconnu du RNPP
  | "AMBIGUOUS"                 // trop de candidats pour une recherche nominative
  | "SIGNATURE_INVALID"         // QR code non signé par la PKI nationale ou altéré
  | "DOCUMENT_EXPIRED"
  | "RATE_LIMITED"              // quota de la convention atteint
  | "UPSTREAM_UNAVAILABLE"      // X-Road / service ANIP injoignable
  | "UPSTREAM_ERROR";           // erreur renvoyée par le service, message conservé pour l'audit

export class IdentityVerificationError extends Error {
  constructor(
    public readonly code: IdentityErrorCode,
    message: string,
    public readonly retryable: boolean = false,
    public readonly transactionId?: string,
  ) {
    super(message);
  }
}
```

Règles d'usage associées :

- chaque appel `verify`, `lookup` ou `verifyDocument` est journalisé (acteur, finalité, référence de consentement, identifiant de transaction, résultat sans les attributs) pour répondre aux obligations de l'APDP ;
- le NPI n'est jamais journalisé en clair et n'apparaît jamais dans une URL ;
- en mode `LOCAL`, `capabilities()` renvoie `verify: false, lookup: false, verifyDocument: false` et l'interface affiche « vérification ANIP non connectée » ; l'agriculteur reste au niveau de fiabilité `DECLARED` ou `AGENT_VERIFIED` ;
- une concordance `MATCH` sur nom, prénoms et date de naissance est la condition pour marquer l'identité `OFFICIAL` ; un `PARTIAL` déclenche une revue humaine ; un `MISMATCH` bloque et ouvre un signalement ;
- la constante `IDENTITY_NPI_LENGTH` est configurable et documentée comme hypothèse jusqu'à confirmation par l'ANIP.

## 10. Sources consultées (toutes le 2026-09-24)

Textes et institutions :

- https://sgg.gouv.bj/doc/loi-2017-08/ — loi n° 2017-08 portant identification des personnes physiques (scan)
- https://assemblee-nationale.bj/wp-content/uploads/2020/03/loi-2017-08-identification-des-personnes-physiques.pdf — même loi, PDF scanné
- https://sgg.gouv.bj/doc/decret-2020-099/ — décret n° 2020-099 relatif au NPI (scan)
- https://dataprotection.africa/wp-content/uploads/2022/09/Benin_DPA.pdf — loi n° 2017-20 portant code du numérique, texte consolidé
- https://en.wikipedia.org/wiki/Information_Systems_and_Digital_Agency_(Benin) — ASIN

ANIP et services citoyens :

- https://anip.bj/ ; https://anip.bj/certificat-npi-fid/ ; https://anip.bj/certificat-didentification-personnelle/ ; https://anip.bj/carte-didentite-biometrique/ ; https://anip.bj/cgu-apps-anip/
- https://eservices.anip.bj/retrouver-npi/ ; https://eservices.anip.bj/verifier-document/
- https://play.google.com/store/apps/details?id=bj.anip.eservice — application ANIP BJ
- https://www.gouv.bj/article/1593/ — CNPI gratuit (5 décembre 2021) ; https://www.gouv.bj/article/2984/ — plateforme e-services ANIP (14 février 2025) ; https://www.gouv.bj/article/2312/ — CNPI diaspora (20 juillet 2023) ; https://www.gouv.bj/article/3207/ — liste électorale 2026 (16 août 2025)
- https://www.uneca.org/sites/default/files/TCND/Edgar_Ayena.pdf — présentation ANIP « L'identité numérique et sa mise en œuvre – Le cas du Bénin »
- https://www.banquemondiale.org/fr/news/feature/2026/05/20/transforming-lives-in-benin-a-unique-identification-system
- https://lamarina.bj/index.php/2026/05/06/benin-lanip-fixe-les-nouvelles-regles-denrolement-au-registre-national-des-personnes-physiques/
- https://www.osiris.sn/le-benin-numerise-le-renouvellement-de-la-carte-d-identite-biometrique.html (21 septembre 2026)
- https://enligneaubenin.com/certificat-numero-personnel-didentification/ — site privé, seule mention des 13 chiffres
- https://dpi.africa/fr/digitalisation-des-services-detat-civil-le-npi-pour-tous-en-un-seul-clic/ (30 juin 2025)

Interopérabilité :

- https://www.xroad.bj/ ; https://catis.xroad.bj/ ; https://catis.xroad.bj/institutions/IN00148 ; https://catis.xroad.bj/publicservices/PS01333 ; https://catis.xroad.bj/assets/IA00002
- https://cyber.ee/resources/news/benin-uxp/ (1er juin 2023)
- https://www.biometricupdate.com/202506/benin-shares-its-x-road-inspired-dpi-interoperability-experience-in-peer-learning-webinar
- https://dpimap.org/benin/

Protection des données :

- https://archive.apdp.bj/wp-content/uploads/2021/11/Fiche.Pratique.Mise-en-conformite_Pt_OK_Validee.pdf
- https://service.apdp.bj/
- https://lanation.bj/numerique/protection-des-donnees-personnelles-au-benin-lapdp-propose-une-procedure-de-saisine-facile

Usages tiers :

- https://www.mtn.bj/wp-content/uploads/2024/12/CONDITIONS-GENERALES-CARTE-SIM.pdf
- https://lamarinabj.com/index.php/2025/02/20/ — décision ARCEP 2025-42
- https://finances.bj/communiques/dgi-obtenez-desormais-votre-ifu-en-moins-de-24h-avec-votre-numero-personnel-didentification-npi/ (page suspendue)
- https://beninwebtv.bj/presidentielle-du-12-avril-2026-au-benin-voici-comment-retrouver-son-centre-de-vote/
- https://dei.gouv.bj/article/1/Le-E-Visa-un-outil-de-pointe
- https://www.gouv.bj/article/1643/ — Recensement National de l'Agriculture
- https://numerique.gouv.bj/publications/actualites/ — e-agriculture au Bénin
- https://beninwebtv.bj/ — Conseil des ministres du 2 septembre 2026, programme de productivité agricole et de protection sociale

Identité numérique :

- https://test-identite-numerique.gouv.bj/ ; https://identite-numerique.bj/
- https://play.google.com/store/apps/details?id=bj.gouv.mobileid — Mobile ID Bénin
- https://auth.service-public.bj/citizen/login
- https://semecity.bj/ ; https://fr.wikipedia.org/wiki/Sèmè_City — non pertinent pour l'identité
