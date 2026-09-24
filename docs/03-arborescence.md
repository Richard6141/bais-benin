# 03 — Arborescence du projet

> Rédigé par : Architecte logiciel et Frontend. Cette arborescence est la référence ; toute création de dossier hors de ce plan doit être justifiée dans une ADR ou une PR.

```
bais/
├── .github/
│   └── workflows/
│       ├── ci.yml                     # lint, typecheck, tests unitaires + intégration, build
│       └── e2e.yml                    # Playwright sur PR vers develop/main
├── .husky/                            # pre-commit (lint-staged), commit-msg (commitlint)
├── docker/
│   ├── Dockerfile                     # image Next standalone
│   ├── Dockerfile.worker              # tâches planifiées (météo, règles, agrégats)
│   └── db/init/                       # extensions postgis, pgvector, rôles
├── docker-compose.yml                 # app + worker + db (+ tiles)
├── docs/                              # cette documentation, ADR, guides
├── public/
│   ├── icons/                         # icônes PWA, favicon
│   ├── manifest.webmanifest
│   └── fonts/                         # polices auto-hébergées
├── prisma/                            # ⚠ conservé ici car Prisma l'attend ; le contenu métier vit dans src/database
│   └── schema.prisma
├── src/
│   ├── app/                           # ROUTAGE UNIQUEMENT
│   │   ├── (public)/                  # accueil, à propos, données ouvertes
│   │   ├── (auth)/                    # connexion, otp, invitation
│   │   ├── (farmer)/agriculteur/      # espace agriculteur
│   │   ├── (agent)/agent/             # espace agent terrain (PWA offline)
│   │   ├── (cooperative)/cooperative/
│   │   ├── (buyer)/marche/
│   │   ├── (commune)/commune/
│   │   ├── (ministry)/pilotage/       # centre de pilotage
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/
│   │   │   ├── v1/                    # REST versionnée : sync, registry, geo, alerts, market
│   │   │   ├── tiles/                 # tuiles vectorielles {z}/{x}/{y}
│   │   │   └── cron/                  # points d'entrée des tâches planifiées (protégés)
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   └── sw.ts                      # service worker Serwist
│   │
│   ├── components/                    # UI PARTAGÉE, sans logique métier
│   │   ├── ui/                        # shadcn/ui (généré, personnalisé via tokens)
│   │   ├── layout/                    # AppShell, Sidebar, TopBar, PageHeader, OfflineBanner
│   │   ├── data-display/              # StatTile, Sparkline, DataTable, ReliabilityBadge, SourceCaption
│   │   ├── map/                       # MapCanvas, LayerSwitcher, Legend, DrawParcelControl
│   │   ├── forms/                     # champs composés (PhoneField, GeoPointField, AreaField)
│   │   └── feedback/                  # EmptyState, ErrorState, LoadingSkeleton, ConfidenceMeter
│   │
│   ├── features/                      # TRANCHES UI PAR CAS D'USAGE
│   │   ├── auth/                      # formulaires connexion/otp, hooks session
│   │   ├── farm-registration/         # assistant d'enregistrement multi-étapes (agent)
│   │   ├── farm-profile/              # fiche exploitation, historique
│   │   ├── parcel-drawing/            # tracé GPS / dessin sur carte
│   │   ├── harvest-declaration/
│   │   ├── verification/              # file de vérification agent
│   │   ├── agri-map/                  # carte agricole, filtres, panneau stats
│   │   ├── alerts/                    # liste, détail, accusé de réception
│   │   ├── weather/                   # widget météo locale
│   │   ├── assistant/                 # chat, citations, niveau de confiance
│   │   ├── marketplace/               # offres, recherche, demandes
│   │   ├── cooperative-members/
│   │   ├── commune-overview/
│   │   ├── ministry-dashboard/        # tuiles, cartes, séries, qualité des données
│   │   └── offline-sync/              # indicateur, file d'attente, conflits
│   │
│   ├── modules/                       # DOMAINE — indépendant de Next et de React
│   │   ├── identity/
│   │   │   ├── schemas.ts             # Zod : inscription, otp, rôles
│   │   │   ├── types.ts
│   │   │   ├── service.ts             # cas d'usage
│   │   │   ├── repository.ts          # Prisma
│   │   │   ├── policies.ts            # qui peut quoi sur les comptes
│   │   │   ├── events.ts
│   │   │   └── __tests__/
│   │   ├── territory/
│   │   ├── registry/
│   │   │   ├── farmer/  farm/  parcel/  crop/  season/  declaration/  verification/
│   │   │   └── index.ts
│   │   ├── monitoring/
│   │   │   ├── rules/                 # moteur : définitions, évaluateur, DSL Zod
│   │   │   ├── weather/
│   │   │   └── alerts/
│   │   ├── market/
│   │   ├── assistant/
│   │   │   ├── retrieval/             # découpage, embeddings, recherche pgvector
│   │   │   ├── confidence/            # scoring et seuils
│   │   │   └── prompts/
│   │   ├── analytics/
│   │   ├── sync/
│   │   ├── audit/
│   │   ├── notifications/
│   │   └── authorization/             # moteur can(), périmètres, contexte d'accès
│   │
│   ├── services/                      # PORTS ET ADAPTATEURS EXTERNES
│   │   ├── ports/                     # interfaces : IdentityVerificationProvider, WeatherProvider,
│   │   │                              #   MessagingChannel, LlmProvider, EmbeddingProvider, GeocodingProvider
│   │   ├── weather/open-meteo/
│   │   ├── weather/fixture/           # données météo réalistes pour démo et tests
│   │   ├── messaging/wapy/            # WhatsApp via wapy.pro
│   │   ├── messaging/sms/             # adaptateur générique (à brancher)
│   │   ├── messaging/email/
│   │   ├── messaging/console/         # dev : affiche le message dans les logs
│   │   ├── identity/anip-stub/        # simulateur ANIP, même contrat que le futur adaptateur réel
│   │   ├── identity/wapy-stub/        # réservé : si wapy.pro expose un jour un OIDC
│   │   ├── ai/gateway/                # AI SDK via passerelle (le modèle par défaut)
│   │   ├── ai/fixture/                # réponses déterministes pour tests
│   │   └── geo/                       # géocodage inverse OSM (Nominatim), simplification
│   │
│   ├── database/
│   │   ├── migrations/                # SQL : PostGIS, index GiST, vues matérialisées, RLS
│   │   ├── seed/
│   │   │   ├── territory/             # 12 départements, 77 communes (géométries simplifiées)
│   │   │   ├── crops.ts               # cultures béninoises, calendrier cultural
│   │   │   ├── seasons.ts
│   │   │   ├── farms.generator.ts     # génération déterministe (graine fixe) d'exploitations
│   │   │   ├── rules.ts               # règles de monitoring par défaut
│   │   │   ├── corpus/                # fiches techniques pour l'assistant
│   │   │   └── index.ts
│   │   ├── client.ts                  # instance Prisma + extensions
│   │   └── sql/                       # requêtes spatiales typées
│   │
│   ├── lib/
│   │   ├── env.ts                     # validation des variables d'environnement
│   │   ├── auth/                      # config Auth.js, session, helpers serveur
│   │   ├── container.ts               # câblage ports → adaptateurs
│   │   ├── result.ts                  # type Result<T, E>
│   │   ├── errors.ts                  # erreurs métier, Problem Details
│   │   ├── logger.ts
│   │   ├── crypto/                    # chiffrement champ (NPI), hachage
│   │   ├── i18n/                      # fr par défaut, clés prêtes pour fon/yoruba
│   │   ├── offline/                   # Dexie schema, outbox, hooks de synchro
│   │   ├── geo/                       # utilitaires GeoJSON, surface, centroïde
│   │   └── format/                    # nombres, dates, unités (ha, t, FCFA)
│   │
│   ├── types/                         # types globaux, augmentations (next-auth, env)
│   └── styles/                        # tokens design (CSS variables), thèmes
│
├── tests/
│   ├── e2e/                           # Playwright : parcours par rôle
│   ├── integration/                   # API + base PostGIS réelle
│   ├── fixtures/
│   └── helpers/
├── scripts/                           # import géométries, génération dataset, checks
├── .env.example
├── .editorconfig
├── .gitignore
├── commitlint.config.ts
├── eslint.config.mjs
├── next.config.ts
├── package.json
├── playwright.config.ts
├── postcss.config.mjs
├── tsconfig.json
├── vitest.config.ts
└── README.md
```

## Règles d'organisation

1. **Un fichier, une responsabilité.** Au-delà de 300 lignes, on découpe. Les composants de page ne dépassent pas 150 lignes ; la logique va dans des hooks ou dans le module.
2. **Tests co-localisés** pour les modules (`__tests__/`), tests de composants à côté des composants (`*.test.tsx`), tests d'intégration et de bout en bout dans `tests/`.
3. **Nommage** : dossiers en kebab-case, composants React en PascalCase, fonctions et variables en camelCase, tables et colonnes en snake_case (via `@map`), énumérations en SCREAMING_SNAKE_CASE. Vocabulaire métier en français dans le domaine et l'UI (`exploitation`, `parcelle`), anglais pour l'outillage technique (`repository`, `service`).
4. **Chaque module exporte un `index.ts`** qui définit sa surface publique ; les imports profonds entre modules sont interdits par ESLint.
5. **Aucun secret dans le dépôt** ; `.env.example` documente chaque variable.
