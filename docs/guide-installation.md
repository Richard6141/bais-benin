# Guide d'installation

Ce guide couvre : les prérequis, le démarrage local pas à pas, chaque variable d'environnement,
le déploiement Docker complet, le déploiement Vercel, la configuration des intégrations externes
(wapy.pro, Open-Meteo, assistant), les vérifications post-installation et le dépannage. Chaque
commande et chaque variable a été vérifiée dans le code réel (`package.json`, `src/lib/env.ts`,
`docker-compose.yml`, `vercel.json`) au moment de la rédaction.

## 1. Prérequis

| Outil | Version | Vérification |
|---|---|---|
| Node.js | ≥ 22.12 | `node -v` (contrainte `engines` de `package.json`) |
| pnpm | 10.34.5 (via corepack) | `pnpm -v` |
| Docker + Docker Compose | récent | `docker compose version` — nécessaire pour la base locale, même en développement pur (l'application ne fournit pas de PostgreSQL) |
| PostgreSQL | 16 avec PostGIS 3.4 | fourni par `docker/db` (image construite localement) |

Activer pnpm si nécessaire : `corepack enable`.

## 2. Démarrage local, pas à pas

```bash
git clone <dépôt> bais && cd bais
cp .env.example .env
```

Renseigner au minimum dans `.env` (voir le détail de chaque variable en section 3) :
`DATABASE_URL`, `POSTGRES_USER`/`POSTGRES_PASSWORD`/`POSTGRES_DB`/`POSTGRES_PORT`,
`APP_ENV=development`, `AUTH_SECRET`, `NPI_ENCRYPTION_KEY`, `NPI_HASH_KEY`, `AUDIT_IP_HASH_KEY`,
et `OTP_DEMO_CODE` pour utiliser les comptes de démonstration. Sans `NPI_ENCRYPTION_KEY` et
`NPI_HASH_KEY`, aucune connexion n'est possible : le premier écran de connexion chiffre le NPI
saisi avec ces clés (ADR-0012).

```bash
pnpm install                 # installe aussi les hooks husky (script "prepare")
pnpm db:up                   # démarre uniquement le service "db" du docker-compose
pnpm db:generate             # génère le client Prisma (src/generated/prisma)
pnpm db:migrate:dev          # applique les migrations en développement
pnpm db:seed                 # charge référentiels + comptes et registre de démonstration
pnpm dev                     # http://localhost:3000
```

Comptes de démonstration créés par le seed (jamais en `APP_ENV=production`, voir section 3). Tous
se connectent sur `/connexion` comme n'importe quel compte : NPI, numéro relié, puis code.

| Compte | NPI | Numéro | Code |
|---|---|---|---|
| Agent de terrain (Djougou) | `1000000000001` | `01 90 00 00 01` | `OTP_DEMO_CODE` |
| Agricultrice (Djougou) | `1000000000002` | `01 90 00 00 02` | `OTP_DEMO_CODE` |
| Ministère (ADMIN_STATE) | `1000000000003` | `01 90 00 00 03` | `OTP_DEMO_CODE` |
| Coopérative | `1000000000004` | `01 90 00 00 04` | `OTP_DEMO_CODE` |
| Acheteur | `1000000000005` | `01 90 00 00 05` | `OTP_DEMO_CODE` |

`OTP_DEMO_CODE` est vide dans `.env.example` : y mettre six chiffres de son choix (la CI et les
tests de bout en bout utilisent `246810`). Une fois renseigné, la liste de ces comptes s'affiche
sous le formulaire hors production, avec un bouton « Utiliser » qui remplit le NPI et le numéro ;
aucun message n'est envoyé à ces numéros fictifs et le code de démonstration est accepté. Tant
qu'il est vide, la liste n'apparaît pas et ces numéros reçoivent un code ordinaire par le canal
configuré (écrit dans les journaux du serveur avec `console`). Le seed ne crée plus de mot de
passe et supprime, à sa relance, les identifiants par mot de passe hérités d'une base antérieure.

### Recevoir de vrais codes WhatsApp en local

Par défaut (`MESSAGING_PRIMARY_CHANNEL=console`), le code d'un numéro réel est écrit en clair dans
les journaux du serveur, rien n'est envoyé. Pour le recevoir sur WhatsApp par wapy.pro, mettre
dans `.env` :

```bash
MESSAGING_PRIMARY_CHANNEL=wapy
WAPY_API_KEY=<clé de la passerelle wapy.pro>
```

puis relancer `pnpm dev`. `.env` est ignoré par git : la clé n'y est jamais versionnée, et ne
doit apparaître ni dans `.env.example`, ni dans un commit, ni dans une capture. Se connecter
ensuite avec son propre numéro et un NPI de 13 chiffres. Avec
`IDENTITY_VERIFICATION_PROVIDER=anip-local`, seule la forme du NPI est contrôlée : le compte créé
garde ce NPI, en attente de vérification, et ce NPI ne pourra plus servir à un autre compte de la
même base. Garder `OTP_DEMO_CODE` renseigné pour que les numéros de démonstration ne partent pas
vers la passerelle. Quotas de wapy.pro : 2 codes par heure et par destinataire, 60 messages par
heure, 500 par jour ; l'application ajoute sa propre limite de 5 codes par 15 minutes et par
numéro.

### Commandes utiles

```bash
pnpm test               # tests unitaires (vitest, projet "unit")
pnpm test:integration   # tests d'intégration (nécessite la base : pnpm db:up)
pnpm test:e2e           # Playwright, construit et démarre l'app lui-même
pnpm lint               # eslint (inclut eslint-plugin-boundaries)
pnpm typecheck          # next typegen && tsc --noEmit
pnpm check              # lint + typecheck + test
pnpm db:studio          # explorateur de données Prisma
pnpm db:purge           # purge/anonymisation des données personnelles au-delà de leur délai (voir docs/architecture.md §7)
pnpm admin:compte --npi <NPI> --telephone <01XXXXXXXX> --role <rôle> [--commune <code> | --departement <code>] [--nom "<nom>"]
                        # ouvre un compte d'agent, du ministère, d'une coopérative ou d'un acheteur (ADR-0013)
```

La connexion ne crée que des comptes d'agriculteur. Pour essayer un autre rôle avec votre propre
NPI et votre WhatsApp, ouvrez d'abord le compte, par exemple
`pnpm admin:compte --npi <votre NPI> --telephone <votre numéro> --role ADMIN_STATE --nom "Votre nom"`,
puis connectez-vous sur `/connexion`. Un agent a besoin d'une portée : `--commune BJ-DON-003`.

## 3. Variables d'environnement, une par une

Toutes sont validées au démarrage par `src/lib/env.ts` (Zod) : une variable obligatoire absente
fait échouer le démarrage avec un message explicite plutôt qu'une panne silencieuse plus tard.

### Application

| Variable | Obligatoire | Détail |
|---|---|---|
| `NODE_ENV` | non (défaut `development`) | `development` \| `test` \| `production`. Positionné à `production` par `next build`/`next start`, y compris pour une démonstration locale. |
| `APP_ENV` | **fail-closed : défaut `production` si absent** | `development` \| `test` \| `demo` \| `staging` \| `production`. Distingue le déploiement réel des environnements où les comptes et le code de démonstration sont admis. À fixer explicitement à `development` en local (voir `.env.example`) — une variable oubliée en déploiement se comporte comme de la production, jamais l'inverse. |
| `APP_URL` | non (défaut `http://localhost:3000`) | URL publique de l'application (callbacks, liens dans les messages). |
| `LOG_LEVEL` | non (défaut `info`) | `trace` \| `debug` \| `info` \| `warn` \| `error` \| `fatal`. |

### Base de données

| Variable | Obligatoire | Détail |
|---|---|---|
| `DATABASE_URL` | non au moment du build (image Docker sans base), vérifiée au premier usage | `postgresql://utilisateur:motdepasse@hote:port/base?schema=public` |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | `POSTGRES_PASSWORD` **obligatoire** pour `docker-compose.yml` (plus de repli par défaut) | Utilisées uniquement par Docker Compose pour construire `DATABASE_URL` du conteneur `app` et configurer le conteneur `db`. |

### Authentification (voir aussi docs/architecture.md §6, sécurité)

| Variable | Obligatoire | Détail |
|---|---|---|
| `AUTH_SECRET` | **oui dès `NODE_ENV=production`** (sauf pendant la phase de build Next.js) | Signature des sessions better-auth, 32 caractères minimum : `openssl rand -base64 48`. En développement sans valeur, un secret éphémère est généré par process (les sessions ne survivent pas à un redémarrage). |
| `OTP_DEMO_CODE` | non, **interdit en production** | Code fixe à 6 chiffres pour les numéros de démonstration (liste exacte dans `src/lib/auth/demo-accounts.ts`, contrôlée par `isDemoPhone` dans `src/lib/auth/phone.ts`). Renseigné, il affiche aussi la liste des comptes de démonstration sous le formulaire de connexion (hors production). |
| `TRUSTED_PROXIES` | non | Adresses IP ou plages CIDR du ou des relais inverses de confiance placés devant l'application, séparées par des virgules. Sans elle, l'en-tête `X-Forwarded-For` n'est pas crédité (voir `advanced.ipAddress` dans `src/lib/auth/auth.ts`) : la limite de débit par IP et le journal d'audit utiliseraient une adresse indistincte derrière un relais non déclaré. |

### Messagerie (codes à usage unique, alertes)

| Variable | Obligatoire | Détail |
|---|---|---|
| `MESSAGING_PRIMARY_CHANNEL` | non (défaut `console`), **doit valoir `wapy` en production** | `console` (journalise en clair, développement uniquement) \| `wapy` (envoi réel sur WhatsApp, y compris en local, voir section 2) \| `fixture` (tests, messages en mémoire). |
| `WAPY_API_URL` | non (défaut `https://wapy.pro`) | Base de la passerelle HTTP wapy.pro. |
| `WAPY_API_KEY` | **oui si `MESSAGING_PRIMARY_CHANNEL=wapy`** | Clé de la passerelle d'envoi WhatsApp (voir section 5). |
| `WAPY_WEBHOOK_SECRET` | non (le webhook répond 503 sans elle) | Secret HMAC du webhook entrant `/api/v1/webhooks/wapy`. |

### Monitoring météo

| Variable | Obligatoire | Détail |
|---|---|---|
| `WEATHER_PROVIDER` | non (défaut `open-meteo`) | `open-meteo` (réseau, sans clé) \| `fixture` (démonstration hors réseau). |
| `OPEN_METEO_BASE_URL` | non (défaut `https://api.open-meteo.com`) | |
| `CRON_SECRET` | obligatoire en production | Partagé avec le déclencheur planifié (`/api/v1/monitoring/ingest`, `/api/v1/monitoring/dispatch`, `docker/scheduler`, `vercel.json`). |

### NPI (ANIP)

| Variable | Obligatoire | Détail |
|---|---|---|
| `NPI_ENCRYPTION_KEY`, `NPI_HASH_KEY` | **oui pour toute connexion**, développement compris | Deux clés **distinctes** de 32 octets en base64 : `openssl rand -base64 32` chacune. Chiffrement AES-256-GCM et index HMAC du NPI, lié au compte à la connexion (ADR-0012). Sans elles, le premier écran de connexion échoue et le seed crée les comptes de démonstration sans NPI. |
| `NPI_LENGTH` | non (défaut 13) | |
| `IDENTITY_VERIFICATION_PROVIDER` | non (défaut `anip-local`) | `anip-local` (contrôle de forme) \| `anip-xroad` (convention ANIP via X-Road BJ). |
| `ANIP_XROAD_SECURITY_SERVER_URL`, `ANIP_XROAD_CLIENT_ID`, `ANIP_XROAD_SERVICE_ID` | oui si `anip-xroad` | |

### Journal d'audit

| Variable | Obligatoire | Détail |
|---|---|---|
| `AUDIT_IP_HASH_KEY` | **oui en production** | Clé du HMAC qui remplace un hachage simple de l'adresse IP journalisée (32 octets en base64). Sans clé, une IPv4 (32 bits) se retrouverait par table précalculée. En développement, une clé éphémère par process est générée si absente. |

### Données de démonstration et cartographie

| Variable | Obligatoire | Détail |
|---|---|---|
| `SEED_FARM_COUNT` | non (défaut 5000) | Nombre d'exploitations synthétiques (50000 pour le jeu complet). |
| `NEXT_PUBLIC_MAP_STYLE_URL` | non (défaut le style OpenFreeMap public) | Fond de carte MapLibre ; auto-hébergeable. Le même style alimente la CSP (`next.config.ts`, `mapTileOrigin`). |

## 4. Déploiement Docker complet

```bash
cp .env.example .env      # renseigner toutes les variables de production, voir section 3
docker compose --profile full up -d --build
```

Le profil `full` construit et démarre trois services (le service `db` seul, sans profil, sert le
développement local) :

- `db` — PostgreSQL + PostGIS, port lié à `127.0.0.1` par défaut (`DB_BIND_HOST` pour changer) ;
- `app` — image Next.js standalone non-root, port lié à `127.0.0.1:3000` par défaut
  (`APP_BIND_HOST`), healthcheck sur `GET /api/health` ;
- `scheduler` — cron BusyBox minimal qui appelle `/api/v1/monitoring/ingest` (quotidien, 5 h
  Porto-Novo) et `/api/v1/monitoring/dispatch` (toutes les 10 minutes) avec `CRON_SECRET`.

Un déploiement réel place un reverse proxy TLS devant `app` (nginx, Caddy, load balancer
managé) ; c'est lui qui écoute sur l'interface publique et transmet `X-Forwarded-For` —
renseigner alors `TRUSTED_PROXIES` avec son adresse. `POSTGRES_PASSWORD`, `AUTH_SECRET`,
`AUDIT_IP_HASH_KEY` et `CRON_SECRET` sont exigés au démarrage (`${VAR:?message}` dans
`docker-compose.yml`) : le déploiement s'arrête avec un message clair plutôt que de démarrer avec
un secret par défaut connu de tous.

Migrations en production : `docker compose --profile full exec app pnpm db:migrate` (ou une
étape dédiée du pipeline de déploiement, avant de basculer le trafic).

## 5. Déploiement Vercel

`vercel.json` déclare deux tâches planifiées (équivalent du service `scheduler` de Docker) :

```json
{
  "crons": [
    { "path": "/api/v1/monitoring/ingest", "schedule": "0 4 * * *" },
    { "path": "/api/v1/monitoring/dispatch", "schedule": "*/10 * * * *" }
  ]
}
```

1. Provisionner une base PostgreSQL avec PostGIS (intégration Marketplace : Neon, Supabase) et
   renseigner `DATABASE_URL`.
2. Renseigner toutes les variables de la section 3 dans les paramètres du projet Vercel
   (Production et Preview séparément — ne jamais réutiliser un `AUTH_SECRET`/`AUDIT_IP_HASH_KEY`
   de développement).
3. Vercel transmet déjà une adresse cliente fiable dans ses propres en-têtes ; vérifier si
   `TRUSTED_PROXIES` doit être renseigné selon la configuration réseau retenue.
4. `pnpm db:migrate` avant la première mise en production (étape de build ou commande manuelle
   contre `DATABASE_URL` de production).

## 6. Configuration des intégrations externes

### wapy.pro (WhatsApp)

1. Créer un compte développeur sur wapy.pro, activer la passerelle d'envoi, récupérer la clé
   d'API → `WAPY_API_KEY`.
2. Enregistrer le webhook entrant : `POST /pont/v1/webhook` avec
   `{ "url": "https://<domaine>/api/v1/webhooks/wapy" }` ; le `secret` renvoyé va dans
   `WAPY_WEBHOOK_SECRET`.
3. `MESSAGING_PRIMARY_CHANNEL=wapy`. En production, `lib/env.ts` refuse toute autre valeur.

Détails du contrat webhook (événements `remise`/`reponse`, fenêtre de fraîcheur de 15 minutes
contre le rejeu) : `docs/09-integrations-externes.md` et
`src/modules/monitoring/delivery/webhook.ts`.

### Open-Meteo (météo)

Aucune configuration : API publique sans clé. `WEATHER_PROVIDER=fixture` bascule sur des séries
déterministes par zone agro-écologique pour une démonstration hors réseau.

### Assistant IA

Aucun module assistant n'est présent dans ce dépôt à la date de cette étape (développé en
parallèle sur une autre branche). Se référer à sa propre documentation lorsqu'il sera fusionné.

## 7. Vérifications post-installation

```bash
curl -s http://localhost:3000/api/health | jq
# { "status": "ok", "checkedAt": "...", "database": { "status": "up", ... } }
```

- Se connecter avec un compte de démonstration (section 2) et vérifier la redirection vers
  l'espace correspondant à son rôle.
- `/carte` doit afficher le fond de carte et les communes (vérifie la CSP et le fond MapLibre).
- `pnpm check` (lint + typecheck + tests unitaires) et `pnpm test:integration` doivent être verts.
- En Docker : `docker compose --profile full ps` — le service `app` doit passer `healthy`.

## 8. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `Configuration invalide : - AUTH_SECRET : obligatoire dès que NODE_ENV=production` | `.env` incomplet en environnement de production/démo | Renseigner la variable manquante (le message nomme chaque champ en cause) |
| `Configuration invalide : - AUDIT_IP_HASH_KEY : obligatoire en production` | idem | `openssl rand -base64 32` |
| Connexion refusée à la base | `pnpm db:up` non lancé, ou port déjà occupé | Vérifier `docker compose ps`, changer `POSTGRES_PORT` si `5432` est pris |
| OTP jamais reçu en développement | `MESSAGING_PRIMARY_CHANNEL=console` (par défaut) | Le code est écrit dans les journaux du serveur, pas envoyé réellement ; pour un envoi WhatsApp réel, voir section 2 |
| Le premier écran de connexion échoue, journaux du serveur : `NPI_ENCRYPTION_KEY et NPI_HASH_KEY sont nécessaires à la connexion` | Clés NPI absentes de `.env` | Les générer (`openssl rand -base64 32`, deux fois), relancer le serveur, puis relancer `pnpm db:seed` pour lier les NPI de démonstration |
| « Ce NPI et ce numéro ne sont pas reliés au même compte » après un code valide | Le numéro est lié à un autre NPI, ou le NPI saisi appartient déjà à un autre compte | Reprendre le couple exact du tableau de la section 2 ; pour un compte de test, utiliser un NPI encore libre |
| `Trop de codes envoyés pour ce numéro` en boucle sur un numéro de test | Limite de 5 codes/15 min par numéro (`otp-phone-rate-limit.ts`) — les numéros de démonstration en sont exemptés | Attendre la fenêtre, ou vider la ligne `otp-phone:<numéro>` de la table `auth_rate_limit` |
| Webhook wapy.pro répond 503 | `WAPY_WEBHOOK_SECRET` absent | Le renseigner (section 6) |
| Carte blanche sur `/carte` en production | CSP trop stricte pour une origine de tuiles personnalisée | Vérifier que `NEXT_PUBLIC_MAP_STYLE_URL` correspond à l'origine réellement utilisée : `next.config.ts` en dérive la CSP automatiquement |
| `docker compose --profile full up` s'arrête avec `POSTGRES_PASSWORD est obligatoire` | Variable non renseignée dans `.env` (plus de repli par défaut, C7) | La renseigner |
