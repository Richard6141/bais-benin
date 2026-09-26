# 06 — Sécurité, permissions et protection des données

> Rédigé par : Expert cybersécurité, avec l'Architecte et Backend/Data.
> Référentiels visés : OWASP ASVS 4.0 niveau 2, WCAG 2.2 AA pour l'accessibilité, loi béninoise n° 2017-20 portant code du numérique (protection des données à caractère personnel, APDP) comme cadre juridique.

## 1. Modèle de menaces (résumé)

| Actif | Menace | Impact | Contrôle principal |
|---|---|---|---|
| Données personnelles des agriculteurs (nom, téléphone, localisation) | Accès hors périmètre, fuite, scraping | Atteinte à la vie privée, usage frauduleux (démarchage, pression foncière) | RBAC + périmètre territorial, limitation de débit, audit, RLS |
| NPI | Vol d'identifiant national | Usurpation d'identité | Jamais en clair, haché + chiffré, accès journalisé et réservé |
| Emprises de parcelles | Exposition foncière | Conflits de terres | Précision dégradée hors des rôles habilités, pas de téléchargement massif |
| Comptes institutionnels (ministère) | Compromission (dont celle du compte WhatsApp relié), élévation de privilèges | Manipulation des indicateurs nationaux | NPI et code WhatsApp à chaque connexion, rôle attribué après vérification du NPI, sessions courtes, séparation des rôles, audit |
| Synchronisation hors-ligne | Rejeu, injection de lots falsifiés | Corruption du registre | Idempotence, signature du lot par la session, validation Zod, politique d'accès par commande |
| Moteur d'alertes | Fausse alerte massive | Panique, perte de confiance | Règles versionnées, validation humaine pour CRITICAL, cooldown |
| Assistant IA | Injection de prompt, fuite de contexte | Mauvais conseils, exfiltration | Contexte limité au périmètre de l'utilisateur, citations obligatoires, pas d'outil d'écriture |
| Plateforme | Injection SQL, XSS, CSRF, SSRF | Compromission | Prisma paramétré, CSP stricte, Server Actions avec jeton d'origine, allowlist des hôtes sortants |

## 2. Authentification

- **Tous les rôles** (ADR-0012, qui remplace en partie l'ADR-0010) : un seul parcours sur `/connexion`. Premier écran : le NPI et le numéro de téléphone qui y est relié ; second écran : un code à usage unique (6 chiffres, 5 minutes, 5 tentatives) envoyé sur WhatsApp par wapy.pro, console en développement. Aucun mot de passe, aucune application TOTP : le NPI identifie la personne, le code prouve la possession du téléphone relié, à chaque connexion. Le NPI est lié au compte à la première connexion, en attente de vérification par l'ANIP (`PENDING`) ; un numéro connu doit présenter le NPI qui lui est lié, et un NPI déjà lié à un compte ne peut pas en créer un autre. Ces refus n'interviennent qu'après un code valide.
- **Rôles institutionnels** (ministère, coopérative, acheteur) : attribués par un administrateur à un compte identifié par son NPI, après vérification du NPI et du numéro de la personne. La gouvernance des règles d'alerte exige un compte dont le NPI est lié.
- **Risques acceptés** (ADR-0012) : tant que l'ANIP ne vérifie pas le couple NPI et numéro, une personne qui connaît le NPI d'une autre et se connecte la première avec son propre numéro l'occupe ; le statut `PENDING` reste visible et l'adaptateur X-Road tranchera les conflits. Un compte WhatsApp compromis compromet le compte BAIS, ministère compris.
- **Sessions** : sessions better-auth en base, révocables ; durée 12 h pour les institutions, 30 jours glissants pour agriculteurs et agents (contrainte de terrain). Une session n'est reconnue que pour un compte dont le NPI est lié.
- **Appareils agents** : identifiant d'appareil lié au compte pour la synchronisation ; un superviseur peut révoquer un appareil perdu.
- **Fournisseurs externes** : better-auth accepte un fournisseur OIDC générique (greffon `genericOAuth`). Le jour où l'ANIP (ou un autre fournisseur d'identité national) expose un OIDC, il s'ajoute par configuration.

## 3. Autorisation : RBAC + périmètre territorial

Le rôle dit *ce que* l'on peut faire ; le périmètre dit *sur quoi*. Les deux sont évalués ensemble par le moteur `authorization` :

```
can(actor, action, resource) → Allowed | Denied(reason)
actor = { userId, roles: [{ role, scopeType, scopeId }], organizationIds }
```

### Matrice de référence (extrait)

| Ressource / action | FARMER | FIELD_AGENT | COOPERATIVE_MANAGER | BUYER | COMMUNE_ADMIN | MINISTRY_ANALYST | MINISTRY_ADMIN |
|---|---|---|---|---|---|---|---|
| Farm.read détail | la sienne | communes affectées | membres de l'organisation | champs publics des offres uniquement | sa commune | toutes | toutes |
| Farm.create / update | la sienne (champs limités) | communes affectées | non | non | non | non | non |
| Farm.verify | non | communes affectées | non | non | non | non | non |
| Parcel.geom précise | la sienne | communes affectées | non | non | centroïde seulement | centroïde et agrégats | complet |
| Farmer.phone | le sien | communes affectées | membres (si consentement) | non (relais via Match) | non | non | oui, journalisé |
| NPI.reveal | non | non | non | non | non | non | oui, justification, journalisé (confirmation par code WhatsApp à la volée prévue, ADR-0012) |
| Analytics agrégés | sa commune (publics) | ses communes | son organisation | zones publiques | sa commune | national | national |
| Alert.create manuelle | non | sa zone (WATCH max) | non | non | sa commune | non | national |
| Rule.manage | non | non | non | non | non | non | oui |
| Listing.create | la sienne | pour ses exploitations | pour ses membres | non | non | non | non |
| PurchaseRequest.create | non | non | oui | oui | non | non | non |
| User.role.grant | non | non | non | non | agents de sa commune (proposition) | non | oui |

### Règles d'implémentation

1. **Toute** Server Action et route API commence par `const actor = await requireActor()` puis `authorize(actor, action, resource)`. Un lint interdit d'appeler un repository depuis une action sans passage par le service du module.
2. Les repositories reçoivent un `AccessContext` et appliquent le filtre de périmètre **dans la requête SQL** (pas en mémoire après lecture).
3. **RLS PostgreSQL** en défense en profondeur sur les tables personnelles : même une faille applicative ne renverrait pas des lignes hors périmètre.
4. Les listes d'agrégats renvoient des compteurs, jamais des identifiants personnels, en dessous d'un seuil de 5 exploitations par cellule (k-anonymat minimal) pour les rôles non habilités.
5. Les tests de permissions sont générés à partir de la matrice (fichier `policies.matrix.ts`) : chaque cellule produit au moins un test « autorisé » et un test « refusé ».

## 4. Protection des données personnelles

- **Minimisation** : année de naissance plutôt que date, pas d'adresse postale, pas de pièce d'identité stockée, photo de l'exploitation autorisée mais pas de photo de personne par défaut.
- **NPI** : haché avec HMAC-SHA-256 et clé serveur (unicité, rapprochement) ; chiffré AES-256-GCM avec clé dédiée hors base (restitution) ; jamais dans les logs ni dans les exports ; chaque révélation journalisée avec justification.
- **Chiffrement** : TLS 1.3 en transit ; chiffrement au repos du volume base et des sauvegardes ; secrets dans le gestionnaire de l'hébergeur ou dans un coffre (Vault, SOPS) — jamais dans le dépôt.
- **Consentement et information** : écran d'information au premier accès de l'agriculteur (finalités, droits) ; consentement spécifique pour le partage du contact avec un acheteur ou une institution financière ; registre des traitements, avec les bases légales, les transferts et les durées de conservation appliquées par la purge, dans `docs/recherche/registre-des-traitements.md`.
- **Droits des personnes** : export de ses données, rectification via l'agent, suppression logique avec anonymisation différée (le registre statistique conserve l'exploitation sans identité).
- **Données hors-ligne sur l'appareil** : IndexedDB chiffrée applicativement avec une clé dérivée de la session ; purge automatique après 30 jours sans connexion ; effacement à distance à la révocation de l'appareil.
- **Localisation** : précision complète réservée aux rôles habilités ; les vues publiques et partenaires arrondissent au centroïde de village ou à une grille de 1 km.

## 5. Sécurité applicative

- Validation Zod de **toute** entrée (formulaires, routes, lots de synchronisation, webhooks, variables d'environnement).
- En-têtes : CSP stricte avec nonces (autorisant les tuiles OSM et les sources déclarées), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (géolocalisation autorisée uniquement sur l'espace agent).
- Protection CSRF native des Server Actions (vérification d'origine) et jeton pour les routes REST utilisées par la PWA.
- Limitation de débit par IP et par compte sur l'OTP, la connexion, la recherche marché et l'assistant ; anti-automatisation sur l'inscription.
- Requêtes SQL uniquement via Prisma ou `$queryRaw` avec paramètres liés ; aucune concaténation.
- Téléversements : types autorisés, taille maximale, réécriture des images, stockage hors du système de fichiers de l'app.
- Dépendances : `npm audit` et Renovate en CI, verrouillage des versions, SBOM générée au build.
- Assistant IA : le modèle ne reçoit que des données du périmètre de l'utilisateur, n'a aucun outil d'écriture, ses sorties sont rendues comme texte (pas de HTML), les documents du corpus sont nettoyés à l'ingestion.

## 6. Journalisation et audit

- **Logs techniques** : structurés (JSON), niveau par environnement, identifiant de corrélation propagé du client au SQL, sans donnée personnelle (téléphones et NPI masqués par un filtre de sortie).
- **Journal d'audit** : table append-only, alimentée pour : connexions et échecs, attribution ou retrait de rôle, création, modification, vérification et archivage d'exploitations, révélation de contact ou de NPI, création ou annulation d'alerte, modification de règle, export de données, changement de configuration.
- **Consultation** : écran d'audit pour `MINISTRY_ADMIN` et `PLATFORM_ADMIN`, filtrable par acteur, ressource, période ; export signé.
- **Conservation** : 5 ans pour l'audit, 90 jours pour les logs techniques.
- **Alerting sécurité** : seuils sur les échecs de connexion, les refus d'autorisation répétés, les lots de synchronisation rejetés, les révélations de NPI.

## 7. Sécurité de l'infrastructure

- Image Docker non root, système de fichiers en lecture seule, secrets injectés au démarrage.
- Base accessible uniquement depuis le réseau applicatif ; rôle applicatif sans DDL ; sauvegardes chiffrées quotidiennes, test de restauration mensuel.
- CI : analyse statique (ESLint sécurité, `tsc`), tests de permissions, scan des dépendances, scan de l'image.
- Environnements séparés (dev, recette, production) avec jeux de données distincts ; les données de démonstration ne contiennent aucune personne réelle.

## 8. Ce qui reste à faire avant une mise en production réelle

Analyse d'impact relative à la protection des données (AIPD) avec l'APDP, test d'intrusion externe, hébergement sur un cloud souverain ou national, contrat de traitement avec chaque prestataire (wapy.pro, hébergeur, fournisseur IA), procédure de réponse à incident, formation des agents à la confidentialité.
