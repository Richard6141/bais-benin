# 10 — Conventions de développement

> Rédigé par : Architecte, Frontend, QA. S'applique à toute contribution.

## 1. Git

### Branches

| Branche | Rôle | Protection |
|---|---|---|
| `main` | versions étiquetées, déployables en production | PR obligatoire depuis `develop` ou `release/*`, CI verte, tag `vX.Y.Z` |
| `develop` | intégration continue | PR obligatoire, CI verte |
| `feature/<sujet>` | une fonctionnalité ou un module | créée depuis `develop`, supprimée après fusion |
| `fix/<sujet>` | correction | idem |
| `release/<version>` | stabilisation avant `main` | corrections uniquement |
| `docs/<sujet>` | documentation seule | |

Branches prévues : `feature/foundations`, `feature/authentication`, `feature/farm-management`, `feature/agri-map`, `feature/dashboard`, `feature/monitoring`, `feature/marketplace`, `feature/assistant`, `release/1.0`.

### Commits

Format Conventional Commits, sujet en anglais à l'impératif, corps en français ou en anglais selon le besoin, jamais de sujet vide de sens.

```
<type>(<portée>): <sujet>

<corps : pourquoi, pas quoi>
```

Types : `feat`, `fix`, `docs`, `refactor`, `test`, `perf`, `chore`, `ci`, `build`, `style`, `security`.
Portées : `auth`, `registry`, `map`, `monitoring`, `market`, `assistant`, `dashboard`, `sync`, `territory`, `design-system`, `db`, `api`, `pwa`, `infra`, `docs`.

Exemples acceptés :
- `feat(auth): add phone OTP sign-in with WhatsApp delivery`
- `feat(map): render commune choropleth from materialized stats`
- `fix(sync): reject replayed commands sharing an idempotency key`
- `security(authorization): enforce commune scope in farm repository queries`
- `docs(architecture): record decision on Prisma and PostGIS migrations`

Refusés par commitlint : `update`, `test`, `modification`, `wip`, `fix stuff`, sujets sans type ou de plus de 72 caractères.

### Pull requests

Titre au format du commit principal ; description : contexte, changements, captures pour l'UI, tests exécutés, points d'attention sécurité et hors-ligne. Une PR par fonctionnalité cohérente ; pas de PR de plus de 800 lignes modifiées sans justification.

## 2. Code

- TypeScript `strict`, `noUncheckedIndexedAccess`, pas de `any` (exception commentée), pas de `enum` TypeScript (unions littérales ou `as const`), Zod comme source des types de frontière.
- Imports absolus `@/` ; ordre : Node, dépendances, `@/lib`, `@/modules`, `@/services`, `@/features`, `@/components`, relatifs.
- Fonctions courtes, retour anticipé, `Result<T, E>` pour les erreurs attendues, exceptions pour les invariants violés.
- Composants React : fonction nommée exportée, props typées en `interface`, hooks en tête, pas de logique métier dans le JSX.
- Server Components par défaut ; `'use client'` uniquement quand un état, un effet ou une API navigateur l'exige.
- Toute Server Action : `requireActor()`, validation Zod, `authorize()`, appel du service, audit si sensible, retour typé.

## 3. Commentaires

Les commentaires expliquent une intention, une contrainte métier ou une décision non évidente. Ils sont écrits en français, par une personne, pour une personne.

Interdit :
```ts
// this function does something important
// loop over items
```

Attendu :
```ts
// Synchronisation différée des déclarations terrain lorsque la connexion revient.
// On rejoue les commandes dans l'ordre client pour préserver la causalité
// (une parcelle ne peut pas précéder son exploitation).
```

Pas de commentaire de fin de bloc, pas de code commenté, pas de commentaire paraphrasant le code. Les TODO portent un identifiant de ticket ou un nom : `// TODO(registry): gérer les parcelles à géométrie multiple`.

## 4. Nommage

- Vocabulaire métier en français dans le domaine et l'interface : `exploitation`, `parcelle`, `campagne`, `déclaration`. Les identifiants de code restent en anglais (`farm`, `parcel`, `season`) pour l'interopérabilité et la cohérence des bibliothèques ; le glossaire `docs/glossaire.md` fait la correspondance.
- Booléens en `is`, `has`, `can` ; fonctions en verbe ; collections au pluriel ; pas d'abréviations opaques (`nbExpl` → `farmCount`).
- Fichiers : kebab-case ; un composant par fichier, nom du fichier = nom du composant en kebab-case.

## 5. Tests

- Pyramide : unitaires (modules, utilitaires, composants) > intégration (API + PostGIS) > bout en bout (Playwright, un parcours par rôle et par module).
- Nommage : `décrit le comportement attendu en français` — `it('refuse la lecture d\'une exploitation hors de la commune de l\'agent')`.
- Données de test : fabriques déterministes (`tests/fixtures/`), jamais de dépendance à l'ordre d'exécution.
- Les tests de permissions sont générés à partir de la matrice et échouent si une cellule n'est pas couverte.
- Couverture minimale : 80 % sur `modules/`, 100 % sur `authorization/` et sur le moteur de règles.
- Aucun test ne doit appeler un service externe réel ; les adaptateurs `fixture` sont obligatoires.

## 6. Qualité continue

- `pnpm check` = lint + typecheck + tests unitaires ; exécuté par Husky avant chaque push.
- `pnpm test:integration` et `pnpm test:e2e` en CI sur chaque PR.
- Aucune fusion avec un avertissement ESLint ou une dépendance vulnérable de sévérité haute.
- Revue croisée obligatoire par au moins un autre « agent » (Sécurité pour tout ce qui touche l'accès et les données personnelles, UX pour tout écran).

## 7. Documentation

- `docs/` : documents de conception (numérotés), `docs/adr/` : décisions (numérotées, immuables une fois acceptées, remplacées par une nouvelle ADR), `docs/modules/` : un document par module (périmètre, modèle, API, politiques, tests).
- Le README reste court et renvoie vers `docs/`.
- Toute variable d'environnement nouvelle est ajoutée à `.env.example` avec une ligne d'explication.
