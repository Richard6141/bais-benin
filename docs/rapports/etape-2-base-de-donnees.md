# Rapport d'étape 2 — Base de données

- Branche : `feature/database` (fusionnée dans `develop`)
- Date : 24 septembre 2026
- Périmètre : schéma Prisma du modèle agricole, migration PostGIS, seed des référentiels et du territoire, requêtes spatiales, générateur de données synthétiques, fixtures météo.

## Terminé

- **Schéma Prisma** (`prisma/schema.prisma`) : `DataSource`, `AgroEcologicalZone`, `Departement`, `Commune`, `Crop`, `AgriculturalCampaign`, `User`, `RoleAssignment` (rôles `ADMIN_STATE`, `AGENT_AGRICULTURE`, `FARMER`, `COOPERATIVE`, `BUYER` avec périmètre), `Farmer`, `Farm`, `Parcel`, `ParcelCrop`. Sur chaque table métier : `source_id`, `source_date`, `reliability`, `created_at`, `updated_at`, `archived_at` (suppression logique). NPI prévu haché + chiffré, jamais en clair.
- **Migration** `20260924181338_agricultural_data_model` : douze tables, colonnes `geography` PostGIS, index GiST sur les géométries, index trigrammes pour la recherche tolérante, index partiels sur les lignes actives.
- **Seed idempotent** (`pnpm db:seed`) : 7 sources, 8 zones agro-écologiques, 12 départements, 77 communes avec géométries geoBoundaries (CC BY 4.0, libellés officiels, codes stables `BJ-<DEP>-<NNN>`, alias de recherche), 21 cultures avec calendrier et couleur, 4 campagnes avec statut calculé.
- **Cohérence territoriale** : les géométries des départements sont l'union de leurs communes (ADR-0009), après constat que les couches ADM1 et ADM2 de geoBoundaries divergent jusqu'à 44 %.
- **Requêtes spatiales typées** (`src/database/sql/territory.sql.ts`) et module `territory` : commune d'un point GPS, géométries simplifiées, recherche tolérante, contrôle de cohérence.
- **Générateur de registre synthétique** (`src/database/seed/generators`, session parallèle) : exploitations, parcelles et cultures déterministes selon docs/08 §6 ; sera exécuté à l'étape 5.
- **Fixtures météo par zone** (`src/services/weather/fixture`, session parallèle) : profils climatiques mensuels, générateur journalier déterministe, scénarios de sécheresse, canicule, crue ; serviront au moteur de règles (étape 6).
- **Documentation** : `docs/modules/database.md`, ADR-0009.

## Tests réalisés

| Test | Commande | Résultat |
|---|---|---|
| Migration sur base locale | `pnpm db:migrate` | OK (2 migrations) |
| Génération du client | `pnpm db:generate` | OK |
| Seed | `pnpm db:seed` | OK, volumes conformes |
| Intégration (extensions, volumes, idempotence, validité des géométries, surface totale, contenance commune/département, point GPS Parakou et Cotonou, point en mer, recherche « djou » et alias « Sèmè-Podji », provenance, statuts de campagne, contraintes relationnelles) | `pnpm test:integration` | 13 tests OK |
| Unitaires (codes de communes, référentiels, générateur sur 5 000 exploitations, fixtures météo, composants) | `pnpm test` | 101 tests OK |
| Lint et types | `pnpm lint`, `pnpm typecheck` | OK |
| Vérification manuelle | `psql` : 12 départements avec surfaces (Alibori 26 210 km², Littoral 79 km²…), total 115 600 km² | OK |

## Résultat

OK.

## Problèmes rencontrés et décisions

- **geoBoundaries** : `shapeISO` manquant pour le Couffo dans les deux fichiers ; les codes ISO sont désormais dérivés du libellé officiel. Les couches ADM1 et ADM2 ne s'emboîtent pas : géométrie départementale dérivée de l'union communale (ADR-0009).
- **Campagne courante** : nous sommes en septembre 2026, la campagne ouverte est 2026-2027 ; le seed charge 2024-2025 à 2027-2028.
- **Prisma et JSON** : les tuples en lecture seule du référentiel ne sont pas acceptés comme `InputJsonValue` ; clonage explicite dans le seed.
- **Mémoire** : les workers Vitest plantaient (poste avec Docker, serveur de développement et plusieurs sessions) ; limitation à deux workers, comme pour le build.
- **Next.js 16** génère des fichiers d'instructions pour outils d'assistance au code quand il en détecte un : supprimés et exclus localement, jamais versionnés.
- Le dossier `docs/recherche/` (ANIP, portails officiels, authentification) reste hors dépôt jusqu'à exploitation à l'étape 3.

## Améliorations possibles

- Charger les arrondissements (546) depuis OSM pour affiner le rattachement des villages.
- Remplacer le rattachement commune → zone agro-écologique par département par une intersection avec des contours de zones.
- Population rurale par commune (INStaD RGPH-5) pour pondérer le dataset au lieu de poids indicatifs.

## Fichiers principaux

`prisma/schema.prisma`, `src/database/migrations/20260924181338_agricultural_data_model/migration.sql`, `src/database/seed/**`, `src/database/sql/territory.sql.ts`, `src/modules/territory/*`, `src/services/weather/fixture/*`, `tests/integration/territory.test.ts`, `docs/modules/database.md`, `docs/adr/0009-*.md`.

## Commits

```
feat(database): implement agricultural data model
feat(database): seed reference data and territory geometries
feat(database): add deterministic synthetic registry generator
test(database): cover seed volumes, geometry validity, gps lookup and relations
style(ui): remove decorative gradient from the landing hero
docs(database): document schema conventions and derived department geometries
feat(monitoring): add synthetic weather fixtures by agro-ecological zone
chore(foundation): cap vitest workers to keep the suite stable on small hosts
docs(database): add step 2 report
```

## Prochaine étape

Étape 3 — Authentification et autorisations : connexion par téléphone + code à usage unique (WhatsApp via wapy.pro, repli SMS/e-mail), comptes institutionnels par e-mail + mot de passe + MFA, sessions sécurisées, moteur de permissions par rôle et périmètre, préparation ANIP/NPI (haché, chiffré, adaptateur de vérification), tests d'accès par rôle. Formulaires courts, guidés, multi-étapes, avec récupération automatique en un clic (consigne utilisateur). Branche `feature/authentication`.
