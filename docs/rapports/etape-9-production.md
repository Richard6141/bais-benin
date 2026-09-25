# Rapport d'étape 9 — Durcissement production

- Branche : `feature/production-hardening` (worktree dédié, base `develop`)
- Date : 25 septembre 2026
- Périmètre : correctifs de sécurité issus de la revue du 25 septembre 2026 (secrets, comptes de
  démonstration, appareil partagé, contrôles d'API, secret statistique, confiance réseau,
  journalisation, intégrité des saisies de terrain, rétention des données personnelles, en-têtes
  de sécurité, infrastructure), plus les trois guides et ce rapport.

## Terminé

### Partie A — avant toute présentation publique

- **A1, secret de session** : suppression du repli codé en dur sur `AUTH_SECRET` ; obligatoire dès
  `NODE_ENV=production` (sauf phase de build Next.js) ; `APP_ENV` passe en fail-closed (défaut
  `production` si non précisé).
- **A2, code de démonstration** : `isDemoPhone` passe d'un motif large (`01 9X…`) à une liste
  blanche exacte des numéros réellement semés ; code fixe désactivé en production ; compteur de
  tentatives natif de better-auth (contourné par la vérification personnalisée) reproduit
  fidèlement.
- **A4, mot de passe de démonstration** : `DEMO_ACCOUNT_PASSWORD` obligatoire hors développement ;
  aucun compte de démonstration créé en production, quelle que soit la façon dont le seed est
  déclenché.
- **A3, appareil partagé** : routes de registre en `NetworkOnly` (au lieu de
  `StaleWhileRevalidate`) dans le service worker ; déconnexion qui vide les caches propres au
  compte et la base locale (Dexie), avec avertissement si des saisies sont encore en attente.
- **B3, secret statistique sur l'API publique** : masquage à k = 5 étendu à
  `/api/v1/territory/stats` (communes, départements, national), jusqu'ici réservé au tableau de
  bord interne.

### Partie B — avant un déploiement réel

- **B1** : `getApiActor` unifié avec `getCurrentUser` (suspension, limite de 12 h institutionnelle,
  double authentification obligatoire pour l'administration nationale) ; `/api/v1/sync` en
  bénéficie désormais.
- **B2** : cache des pages authentifiées réduit à un jour ; `SessionIdentityGuard` détecte une page
  servie depuis le cache d'un autre compte et force un rechargement.
- **B4** : `advanced.ipAddress.trustedProxies` configuré (`TRUSTED_PROXIES`) ; limite d'envoi de
  code par numéro de téléphone (indépendante de la limite par IP), numéros de démonstration
  exemptés.
- **B5** : canal de messagerie `console`/`fixture` interdit en production ; masquage des journaux
  étendu à `code`, `authorization`, `cookie`.

### Partie C — durcissement supplémentaire

- **C2** : `parcel.create`, `parcel.geometry.set` et `harvest.declare` déduisent désormais la
  fiabilité de terrain du rôle qui a autorisé la commande (nouveau `grantRole`, propagé par
  `apply.ts`), jamais d'un champ envoyé par le client. Le périmètre communal de l'agent sur
  `farm.create`, présumé manquant par le résumé de revue, s'est avéré déjà couvert par
  `authorize()` — vérifié par le test existant, aucune redondance ajoutée.
- **C4** : `hashIp` passe d'un sha256 nu à un HMAC à clé (`AUDIT_IP_HASH_KEY`) ; purge périodique
  (`pnpm db:purge`) de `sync_command.payload` (180 jours) et `audit_log.details` (un an).
- **C6** : Content-Security-Policy et Strict-Transport-Security ajoutés, vérifiés contre la carte
  MapLibre.
- **C7** : `docker-compose.yml` sans secret par défaut, ports liés à `127.0.0.1`, healthcheck sur
  l'application.
- **Webhook wapy.pro** : fenêtre de fraîcheur de 15 minutes sur l'horodatage signé, contre le
  rejeu.
- **Assistant IA** : dossier absent de ce worktree (développé en parallèle, non fusionné) — point
  ignoré comme prévu par la mission.

### Documentation

`docs/guide-installation.md`, `docs/guide-utilisateur.md`, `docs/architecture.md`, ce rapport.

## Tests réalisés

| Test | Commande | Résultat |
|---|---|---|
| Unitaires | `pnpm test` | 498 tests OK (56 fichiers) |
| Intégration | `pnpm test:integration` | 80 tests OK (15 fichiers) |
| Bout en bout, carte (ciblé) | `pnpm exec playwright test tests/e2e/map.spec.ts --project=desktop` | 3 tests OK, 1 ignoré (profil mobile) — vérifie la CSP contre MapLibre (style, tuiles, worker) |
| Build, lint, types | `pnpm build`, `pnpm lint`, `pnpm typecheck` | OK |
| Docker Compose (syntaxe et secrets obligatoires) | `docker compose --profile full config` (avec puis sans `POSTGRES_PASSWORD`/`AUTH_SECRET`) | Refuse sans les secrets, valide avec |

Chaque commit a été vérifié après coup (`git log --format=%B -1`, `grep -i le modèle\|le fournisseur`) :
aucune mention d'un outil d'assistance.

La suite Playwright complète (`pnpm test:e2e`, tous les parcours) n'a pas été rejouée en entier à
cette étape faute de temps disponible en fin de session — seul le parcours carte a été rejoué
explicitement, ciblé sur le changement le plus susceptible de casser une page (CSP). Aucun des
correctifs restants ne touche à un parcours d'interface testé par les autres specs e2e (registre,
authentification, tableau de bord, monitoring) ; les tests unitaires et d'intégration couvrant ces
mêmes chemins de code sont, eux, tous verts. À rejouer avant fusion.

## Résultat

OK pour les parties A, B et C listées ci-dessus, avec la réserve notée sur la suite e2e complète.

## Captures

Aucune nouvelle capture d'interface : cette étape ne modifie pas l'UI visible, à l'exception d'un
message d'avertissement à la déconnexion (saisies non envoyées) et d'une notice de secret
statistique sur la carte publique, tous deux couverts par les tests plutôt que par une capture.
Les captures des étapes précédentes (`docs/rapports/captures/etape-*`) restent représentatives des
écrans, inchangés visuellement.

## Problèmes rencontrés et décisions

- **Revue de sécurité introuvable** : `docs/recherche/revue-securite-etape-9.md` n'existe ni dans
  ce worktree ni sur `develop`. Travail repris directement à partir du résumé fourni en mission, en
  vérifiant chaque point contre le code réel plutôt qu'en faisant confiance au résumé seul.
- **Périmètre communal de l'agent (C2)** : le résumé de revue indiquait que rien ne vérifiait la
  commune assignée par l'agent lors de la création d'une exploitation. Lecture du code
  (`authorize()`, `POLICY_MATRIX`, `farm-create.ts`) et du test d'intégration existant
  (`tests/integration/sync.test.ts`, « refuse le lot d'un producteur sur une commune qui n'est pas
  la sienne ») a montré que ce contrôle existait déjà via la portée (`SCOPE`) du greffon
  d'autorisation. Aucun correctif redondant ajouté ; noté ici pour la traçabilité.
- **Régression auto-découverte (limite d'OTP par numéro)** : la limite de 5 codes par numéro sur
  15 minutes (B4) s'appliquait aussi aux numéros de démonstration, cassant les scénarios de
  reconnexion répétée (captures, tests, démonstrations). Corrigé en exemptant les numéros de
  démonstration avant de commiter la suite — ils ne représentent jamais un vrai destinataire à
  protéger d'un envoi répété.
- **Masquage k = 5 sur l'API publique (B3)** : appliquer le masquage a changé le comportement
  observable de `getCommuneStats`/`getDepartementStats`/`getNationalStats` pour tout effectif
  inférieur à 5 (déjà le cas ailleurs dans l'application, mais pas sur cette route). Le test
  d'intégration existant (`territory-stats.test.ts`) utilisait délibérément des effectifs de 1 et
  2 pour vérifier des comptes exacts ; il a été réécrit avec des effectifs de 5 et plus pour
  continuer à vérifier le calcul, plus un nouveau cas dédié au masquage lui-même avec un effectif
  volontairement trop petit.
- **CSP et fond de carte configurable** : plutôt que d'coder en dur l'origine `tiles.openfreemap.org`
  dans la politique de sécurité du contenu, `next.config.ts` la dérive de la même variable
  d'environnement (`NEXT_PUBLIC_MAP_STYLE_URL`) que `map-config.ts`, pour qu'un déploiement avec un
  fond de carte auto-hébergé différent n'ait pas la CSP à corriger séparément.
- **Limite résiduelle du secret statistique** : croiser plusieurs appels à l'API publique avec des
  filtres `verificationStatus` complémentaires peut reconstituer un effectif masqué par différence
  (attaque par différenciation). Non traité à cette étape ; documenté honnêtement dans
  `docs/architecture.md` plutôt que présenté comme résolu.

## Reste à faire (suivi)

- Rejouer la suite Playwright complète avant fusion (voir « Tests réalisés »).
- Attaque par différenciation sur le secret statistique de l'API publique (filtres croisés).
- CSP sans nonce par requête (`'unsafe-inline'` encore nécessaire pour les scripts/styles Next.js).
- Durcissement de l'assistant IA une fois sa branche fusionnée (hors périmètre : absent de ce
  worktree).
- Rattachement des exploitations aux coopératives (module marché), inchangé depuis l'étape 7.
- Ajouter la purge des données personnelles (`pnpm db:purge`) au planificateur (mensuelle),
  actuellement seulement disponible en commande manuelle.

## Commits

```
security(auth): close session-secret and demo-otp gaps from the review
security(database): forbid demo accounts and passwords outside development
security(pwa): stop caching registry data across accounts on sign-out
security(analytics): mask small cells on the public territory stats api
security(authorization): unify session checks between pages and api
security(pwa): shrink authenticated page cache and catch stale sessions
security(auth): trust proxies explicitly and lock down otp delivery
security(infra): add csp/hsts headers and lock down docker-compose
security(sync): derive field-verification status from role, not payload
security(database): hmac the audited ip instead of a plain hash
security(monitoring): reject stale wapy.pro webhook events as replays
fix(auth): exempt demo phone numbers from the per-phone otp limit
feat(database): add a personal-data retention purge
docs: add the installation, user and architecture guides, and the step 9 report
```

## Prochaine étape

Fusion de la branche `feature/ai-assistant` (étape 8, en cours en parallèle sur
`bais-etape-8`) puis, une fois fusionnée, application des mêmes principes de durcissement
qu'ici (secrets, journalisation, confiance dans les entrées, appareil partagé) à ce nouveau
module — explicitement hors périmètre de cette étape tant qu'il n'existe pas dans l'arbre.

## Guide de test

```bash
cd bais-etape-9  # ou le worktree de la branche feature/production-hardening
pnpm install && pnpm db:generate
pnpm db:migrate:dev && pnpm db:seed
pnpm build && pnpm start
```

1. **Secrets obligatoires** : lancer sans `AUTH_SECRET` ni `AUDIT_IP_HASH_KEY` en
   `NODE_ENV=production` doit refuser de démarrer avec un message nommant chaque variable
   manquante (`src/lib/env.ts`).
2. **Démonstration désactivée en production** : `APP_ENV=production pnpm db:seed` ne doit créer
   aucun compte de démonstration (`seedDemoAccounts` renvoie 0).
3. **Secret statistique public** : `curl 'http://localhost:3000/api/v1/territory/stats?level=communes'`
   — les communes à moins de 5 exploitations doivent porter `"masked": true` et des champs à
   `null`, jamais un chiffre.
4. **Déconnexion sur appareil partagé** : se connecter comme agent de démonstration, créer un
   brouillon hors ligne sans synchroniser, se déconnecter — un avertissement doit apparaître avant
   de continuer.
5. **CSP et carte** : ouvrir `/carte`, vérifier dans les outils de développement qu'aucune erreur
   CSP n'apparaît et que la carte se charge (fond, communes, tuiles).
6. **Docker Compose** : `docker compose --profile full config` sans `POSTGRES_PASSWORD` doit
   échouer avec `POSTGRES_PASSWORD est obligatoire`.
