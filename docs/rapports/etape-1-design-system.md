# Rapport d'étape 1 — Design system

- Branche : `feature/design-system` (fusionnée dans `develop`)
- Date : 24 septembre 2026
- Périmètre : jetons de design formalisés, thème clair et sombre, ensemble de composants shadcn/ui personnalisés, composants métier, page de démonstration `/design-system`, revue d'accessibilité, documentation.

## Terminé

- **Jetons** (`src/styles/tokens.css`, `src/styles/tokens.ts`) : couleurs de marque et sémantiques (clair et sombre), échelles séquentielle et divergente pour les cartes et graphiques, couleurs fixes des cultures majeures, couleurs de fiabilité, tailles de contrôles (44 px tactile), ombres, rayons, durées et courbe de mouvement. Les mêmes valeurs sont exposées en TypeScript pour MapLibre et les graphiques.
- **Thème** : `next-themes`, thème clair par défaut, bascule dans l'en-tête, classe posée avant hydratation.
- **Composants shadcn/ui** (`src/components/ui`) : Button, Input, Label, Textarea, Select, Checkbox, Switch, RadioGroup, Form (react-hook-form + Zod), Card, Dialog, Sheet, DropdownMenu, Popover, Tooltip, Command, Table, Tabs, Badge, Alert, Skeleton, Separator. Badge et Alert portent les variantes produit (info, success, watch, warning, critical, offline).
- **Composants métier** : `StatTile` (valeur, tendance, source, fiabilité), `ReliabilityBadge` (six niveaux, texture + couleur), `ConfidenceMeter` (quatre niveaux, jauge accessible), `EmptyState`, `PageHeader`, `ThemeToggle`, `CropGlyph` (21 pictogrammes de cultures monochromes) et `Monogram`.
- **Page `/design-system`** : sept sections avec navigation ancrée (jetons, pictogrammes, boutons, formulaires avec un formulaire complet de déclaration de récolte validé par Zod, fenêtres et menus, alertes et états, indicateurs, tableau et onglets). Responsive de 360 px à 1440 px.
- **Accessibilité** : revue WCAG 2.2 AA complète (90 ratios mesurés) puis corrections : couleurs sémantiques redéfinies en thème sombre, `--watch` et `--input` assombris en clair, cibles tactiles de 44 px sous 768 px, cases et boutons radio à 20 px, boutons de fermeture des fenêtres à 36 px et libellés en français.
- **Documentation** : `docs/modules/design-system.md` (organisation, jetons, 24 fiches de composants, règles produit), `docs/rapports/revue-accessibilite-etape-1.md`.

## Tests réalisés

| Test | Commande | Résultat |
|---|---|---|
| Lint (frontières de couches comprises) | `pnpm lint` | OK |
| Types (avec génération des routes typées) | `pnpm typecheck` | OK |
| Unitaires et composants (env, bandeau hors-ligne, StatTile, ReliabilityBadge, ConfidenceMeter, Alert, CropGlyph, formulaire Zod, référentiels) | `pnpm test` | 64 tests OK |
| Build de production | `pnpm build` | OK (8 pages) |
| Bout en bout desktop + mobile (accueil, PWA, santé, design system : sections, modale, onglets, thème, validation, défilement) | `pnpm test:e2e` | 24 tests OK, 2 ignorés volontairement |
| Vérification manuelle | captures clair, sombre, mobile | OK |

## Résultat

OK.

## Captures

- [Design system, desktop, thème clair](captures/etape-1/design-system-desktop.png)
- [Design system, desktop, thème sombre](captures/etape-1/design-system-desktop-sombre.png)
- [Design system, mobile](captures/etape-1/design-system-mobile.png)
- [Accueil, thème sombre](captures/etape-1/accueil-sombre.png)

## Problèmes rencontrés et décisions

- Le générateur shadcn importe `cn` depuis un paquet inexistant et l'ajoute aux dépendances : corrigé (imports vers `@/lib/utils`, dépendance retirée). À surveiller à chaque ajout de composant.
- `FormField` de shadcn ne portait pas le type des valeurs transformées : ajout d'un troisième paramètre générique pour que les schémas Zod « chaîne saisie, nombre validé » compilent.
- jsdom n'implémente pas `ResizeObserver` ni la capture de pointeur utilisés par Radix : stubs dans `vitest.setup.ts`.
- Les routes typées de Next exigent une génération avant `tsc` : le script `typecheck` enchaîne `next typegen`.
- Deux valeurs proposées par la revue d'accessibilité ont été ajustées après calcul (`--watch` clair `#82540f`, `--input` sombre `#4d7989`) pour tenir le ratio sur tous les fonds.
- Les fins de ligne : `core.autocrlf` désactivé localement, `.gitattributes` impose LF.

## Améliorations possibles (non bloquantes, listées dans la revue)

Onglet inactif plus contrasté, anneau de focus renforcé, `scroll-padding-top` pour les ancres sous l'en-tête collant, `scope="col"` sur les en-têtes de tableau, `aria-current` sur la navigation de sections, pastille `ESTIMATED` plus sombre. Elles seront traitées avec les écrans qui les utilisent.

## Fichiers principaux

`src/styles/tokens.css`, `src/styles/tokens.ts`, `src/app/globals.css`, `src/app/layout.tsx`, `src/components/ui/*`, `src/components/data-display/*`, `src/components/feedback/*`, `src/components/layout/*`, `src/components/providers/theme-provider.tsx`, `src/features/design-system/*`, `src/app/(public)/design-system/page.tsx`, `tests/e2e/design-system.spec.ts`, `docs/modules/design-system.md`, `docs/rapports/revue-accessibilite-etape-1.md`.

## Commits

```
feat(ui): add shadcn component set with semantic alert and badge variants
feat(design-system): add theme switching, data tokens and product components
feat(design-system): add /design-system showcase page
feat(ui): add form primitives with accessible contrast and touch targets
docs(design-system): add component guide and step 1 report
```

## Prochaine étape

Étape 2 — Base de données : schéma Prisma (User, Role, Farmer, Farm, Parcel, Crop, Commune, Department, AgriculturalCampaign, DataSource), provenance et suppression logique sur chaque table, migrations PostGIS (colonnes géographiques, index GiST), seed des 12 départements et 77 communes avec géométries geoBoundaries, zones agro-écologiques, cultures ; tests migration, seed, relations. Branche `feature/database`.
