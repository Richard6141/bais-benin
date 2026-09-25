# Carte agricole

Ce document décrit la carte livrée à l'étape 4 : ce qu'elle montre, d'où viennent les données et comment l'étendre.

## Ce que voit l'utilisateur

- Page publique `/carte` : fond de carte OpenStreetMap (style OpenFreeMap « positron »), les 77 communes colorées selon une métrique (nombre d'exploitations, superficie déclarée ou part vérifiée), les contours des douze départements, et, à partir du zoom 9 pour les comptes habilités, les exploitations en points colorés par statut de vérification.
- Filtres : culture, campagne, département, métrique. Ils vivent dans l'adresse (`/carte?cropCode=MAIZE&departementCode=BJ-DO&metric=verifiedShare`), donc une vue se partage par lien.
- Panneau de lecture : totaux pour les filtres courants avec leur provenance (source, date, part vérifiée), les dix communes les plus représentées, et la fiche de la commune cliquée (exploitations, agriculteurs, hectares, part vérifiée, cultures présentes).
- Légende : bornes réelles des classes (quantiles calculés sur les valeurs présentes), jamais des libellés génériques.
- Mobile : la carte occupe au moins 60 % de l'écran, le panneau passe dessous ; pas de défilement horizontal.

## Architecture

| Couche | Emplacement | Rôle |
|---|---|---|
| Tuiles vectorielles | `src/database/sql/tiles.sql.ts` | `ST_AsMVT` par couche (`communes`, `departements`, `farms`), simplification en mètres selon le zoom, filtre sur l'index spatial |
| Calcul de grille | `src/lib/geo/tile-math.ts` | conversion tuile ↔ emprise, tolérance de simplification |
| Agrégats | `src/database/sql/territory-stats.sql.ts`, `src/modules/analytics` | comptes par commune, département et national, filtres validés par Zod, provenance |
| Routes | `src/app/api/tiles/[layer]/[z]/[x]/[y]/route.ts`, `src/app/api/v1/territory/stats/route.ts` | validation des paramètres, en-têtes de cache (24 h pour les limites, 5 min pour les points et agrégats) |
| Interface | `src/features/agri-map/*` | `AgriMap` (état et URL), `MapCanvas` (MapLibre, chargé côté client uniquement), filtres, légende, panneau |
| Page | `src/app/(public)/carte/page.tsx` | référentiels pour les filtres, droit de voir les points |

Principe de peinture : les tuiles ne contiennent que la géométrie et les codes. Les valeurs viennent des agrégats et sont posées par `setFeatureState` sur chaque commune. Changer de filtre ne recharge donc jamais les tuiles, seulement un JSON de 77 lignes.

## Données de démonstration

Le seed charge un registre synthétique déterministe (`src/database/seed/steps/farms.seed.ts`, générateur dans `src/database/seed/generators`) : 5 000 exploitations par défaut (`SEED_FARM_COUNT=50000` pour le jeu complet), réparties par commune selon la surface et l'intensité de la zone agro-écologique, avec parcelles géoréférencées et cultures par campagne. Tout est marqué `SYNTHETIC` / `BAIS_SEED`.

## Sécurité et confidentialité

- Les agrégats communaux sont publics : aucun identifiant personnel n'y figure.
- Les points d'exploitations ne sont servis qu'à un compte connecté, dans son périmètre : un agent ne reçoit que les points de ses communes, le ministère tout le territoire, un visiteur anonyme une tuile vide (`204`). La tuile elle-même ne contient que le code, le statut et la commune.
- Le fond de carte est servi par un tiers (OpenFreeMap). Pour un déploiement souverain, `NEXT_PUBLIC_MAP_STYLE_URL` pointe vers un style auto-hébergé (extrait OSM du Bénin, tuiles PMTiles ou serveur Martin).

## Vérifier

```bash
pnpm db:seed                                  # charge le registre synthétique si absent
pnpm test:integration                         # tuiles, agrégats
pnpm dev                                      # puis http://localhost:3000/carte
curl -o /dev/null -w "%{http_code} %{size_download}\n" http://localhost:3000/api/tiles/communes/6/32/30.pbf
curl "http://localhost:3000/api/v1/territory/stats?level=national"
pnpm exec playwright test tests/e2e/map.spec.ts
```

## Évolutions prévues

Couche des alertes (étape 6), couches raster satellites (`RasterLayer`), agrégation par arrondissement, restriction des points par périmètre, style de fond auto-hébergé.
