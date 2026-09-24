# Rapport d'étape 4 — Cartographie agricole

- Branche : `feature/agri-map` (fusionnée dans `develop`)
- Date : 24 septembre 2026
- Périmètre : carte nationale MapLibre sur fond OpenStreetMap, tuiles vectorielles PostGIS des départements, communes et exploitations, agrégats territoriaux filtrables, tableau de bord carte, registre synthétique de démonstration.

## Terminé

- **Tuiles vectorielles** (`/api/tiles/{communes|departements|farms}/{z}/{x}/{y}.pbf`) produites par PostGIS (`ST_AsMVT`), simplifiées selon le zoom, filtrées sur l'index spatial, mises en cache (24 h pour les limites, 5 min pour les points).
- **Agrégats** (`/api/v1/territory/stats?level=…`) par commune, département et national, filtrables par culture, campagne, département et statut de vérification ; chaque réponse porte sa provenance (source, date, part vérifiée, fiabilité).
- **Carte `/carte`** : choroplèthe des 77 communes selon la métrique choisie (exploitations, superficie déclarée, part vérifiée) avec classes par quantiles et légende à bornes réelles ; contours des départements ; points d'exploitations colorés par statut à partir du zoom 9 pour les comptes habilités ; survol avec info-bulle ; clic → fiche de la commune ; panneau de lecture (totaux, provenance, dix premières communes) ; filtres dans l'URL (vue partageable) ; cadrage automatique sur le pays ; mobile sans défilement horizontal.
- **Registre synthétique** : 5 000 exploitations (50 000 possibles via `SEED_FARM_COUNT`), 9 595 parcelles géoréférencées, 30 020 cultures par campagne, générées de façon déterministe et chargées par le seed ; le maïs est désormais présent dans toutes les zones agro-écologiques (question type du ministère : « combien de producteurs de maïs à Djougou ? »).
- **Modules** : `territory/tiles`, `registry` (référentiels cultures et campagnes), `analytics` (agrégats), `lib/geo/tile-math`.
- **Documentation** : `docs/modules/carte.md`, spécification UX du registre pour l'étape 5 (`docs/modules/registre-parcours-ux.md`).

## Tests réalisés

| Test | Commande | Résultat |
|---|---|---|
| Unitaires (calcul de grille, classes de choroplèthe, agrégats simulés, existant) | `pnpm test` | 229 tests OK |
| Intégration (tuiles communes/départements/exploitations, agrégats avec fixtures, seed, territoire, authentification) | `pnpm test:integration` | 30 tests OK |
| Bout en bout desktop + mobile (carte chargée et peinte, filtres reflétés dans l'URL et totaux modifiés, API de statistiques, mobile sans débordement, plus l'existant) | `pnpm test:e2e` | 44 tests OK, 4 ignorés volontairement |
| Performance | `curl` | tuile communale 6 Ko en 37 ms, tuile d'exploitations 30 Ko en 10 ms, agrégat national en 12 ms |
| Build, lint, types | `pnpm build`, `pnpm lint`, `pnpm typecheck` | OK |
| Vérification manuelle | captures desktop, filtre maïs × Donga, mobile | OK |

## Résultat

OK.

## Captures

- [Carte nationale, exploitations par commune](captures/etape-4/carte-nationale-desktop.png)
- [Maïs dans la Donga, part vérifiée](captures/etape-4/carte-mais-donga-desktop.png)
- [Carte, mobile](captures/etape-4/carte-mobile.png)

## Problèmes rencontrés et décisions

- **Worker MapLibre sous Next.js** : le worker embarqué par la bibliothèque ne se charge pas avec le bundler de Next (« Worker failed to load »). Solution documentée par MapLibre : copier `maplibre-gl-worker.mjs` et `maplibre-gl-shared.mjs` dans `public/vendor` (script `scripts/copy-maplibre-worker.mjs`, lancé avant `dev` et `build`) et déclarer l'URL par `setWorkerUrl`.
- **Peinture des communes** : les agrégats arrivaient parfois avant la fin du chargement de la carte ; la peinture attend désormais un état « prête » et un attribut `data-map-idle` expose la fin du rendu aux tests.
- **Captures WebGL** : une capture pleine page redimensionne la fenêtre et vide le tampon WebGL ; les écrans cartographiques sont capturés à la taille de la fenêtre.
- **Tests d'intégration et registre chargé** : les suites d'agrégats raisonnent sur des comptes exacts ; elles mettent le registre synthétique de côté (archivage repéré) le temps de la suite, et les suites s'exécutent en séquence sur la base partagée.
- **Fond de carte tiers** : OpenFreeMap (sans clé) pour la démonstration ; `NEXT_PUBLIC_MAP_STYLE_URL` permet un style auto-hébergé pour un déploiement souverain.

## Reste à faire (suivi)

- Restriction des points d'exploitations au périmètre de l'agent (étape 5, avec le registre).
- Couche des alertes (étape 6), couches raster satellites, agrégation par arrondissement.
- Style de fond auto-hébergé (étape 9).

## Commits

```
feat(map): add vector tile production and territory statistics
feat(map): load a deterministic synthetic registry for demonstration
feat(map): add the national agricultural map with filters and commune panel
test(map): cover tiles, statistics, map page and seeded registry
docs(map): document the map module and add the step 4 report
```

## Prochaine étape

Étape 5 — Registre national agricole : espace agriculteur (exploitation, superficie, localisation, cultures, historique), espace agent de terrain avec enregistrement hors ligne (Dexie, file d'attente, synchronisation idempotente, conflits), tracé de parcelle, déclaration de récolte, file de vérification. Branche `feature/farm-registry`. Spécification écran par écran déjà disponible dans `docs/modules/registre-parcours-ux.md`.

## Guide de test

```bash
git checkout develop && pnpm install
pnpm db:migrate && SEED_FARM_RESET=1 pnpm db:seed     # recharge le registre synthétique (≈ 1 min)
pnpm dev
```

1. http://localhost:3000/carte : les communes sont colorées, la légende donne les bornes ; survolez une commune, cliquez-la pour sa fiche.
2. Filtre Culture « Maïs » + Département « Donga » : Bassila, Djougou, Ouaké, Copargo apparaissent, l'adresse contient `cropCode=MAIZE&departementCode=BJ-DO`.
3. Changez « Couleur des communes » pour « Part vérifiée » : les classes passent en pourcentages.
4. Connectez-vous (agent `01 90 00 00 01`, code `246810`), revenez sur `/carte`, zoomez sur Djougou (zoom ≥ 9), activez « Exploitations » : les points apparaissent, colorés par statut.
5. API : `curl "http://localhost:3000/api/v1/territory/stats?level=national"` et `curl -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/tiles/communes/6/32/30.pbf`.
