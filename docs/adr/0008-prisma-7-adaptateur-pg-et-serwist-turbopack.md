# ADR-0008 — Prisma 7 avec adaptateur `pg`, configuration hors schéma, et Serwist en mode Turbopack

- Statut : acceptée
- Date : 2026-09-24
- Décideurs : Backend/Data, DevOps, Frontend

## Contexte

Au moment de l'initialisation (étape 0), les versions stables sont Next.js 16.3 (Turbopack par défaut, y compris pour `next build`) et Prisma 7.10. Ces deux versions changent des conventions que la documentation de phase 1 supposait encore :

- Prisma 7 supprime le moteur de requêtes natif : le client s'appuie sur un adaptateur de pilote (`@prisma/adapter-pg` avec `pg`), le générateur devient `prisma-client` avec un dossier de sortie explicite, et l'URL de connexion sort du schéma pour vivre dans `prisma.config.ts`.
- Le greffon `@serwist/next` repose sur Webpack ; avec Turbopack il faut `@serwist/turbopack`, qui compile le service worker à la demande via une route (`/serwist/sw.js`) plutôt qu'en écrivant un fichier dans `public/`.

## Décision

- **Prisma** : générateur `prisma-client` vers `src/generated/prisma` (ignoré par Git, régénéré en CI et au build Docker) ; client instancié une seule fois par processus avec un `Pool` `pg` de 10 connexions ; `prisma.config.ts` porte le chemin des migrations (`src/database/migrations`, conformément à l'arborescence) et la commande de seed.
- **Service worker** : `@serwist/turbopack` avec `createSerwistRoute` dans `src/app/serwist/[path]/route.ts`, source `src/app/sw.ts`, fournisseur React désactivé en développement pour éviter les pages périmées pendant l'itération.
- **Base locale** : image dérivée de `postgis/postgis:16-3.4` avec le paquet `postgresql-16-pgvector`, pour n'exploiter qu'une seule base. Le port hôte est paramétrable (`POSTGRES_PORT`) car un PostgreSQL local occupe souvent 5432 sur les postes de développement.

## Conséquences

- Aucune dépendance au moteur binaire de Prisma : image Docker plus légère, démarrage plus rapide sur Vercel.
- Les requêtes spatiales passent par `$queryRaw` avec validation Zod du résultat (ADR-0002 inchangée).
- Si Serwist publie un mode Turbopack différent, seul le fichier de route et le fournisseur changent ; le service worker (`sw.ts`) reste identique.
