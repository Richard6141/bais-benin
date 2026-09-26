import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import boundaries from "eslint-plugin-boundaries";

// Les frontières entre couches sont décrites dans docs/02-architecture.md (§3).
// Le domaine (modules/) ne doit jamais dépendre de Next, de React ni de l'UI :
// c'est ce qui garantit qu'il pourra être extrait vers un service séparé.
const layers = [
  // Points de câblage : ils assemblent bibliothèques, adaptateurs et modules (auth, conteneur).
  // Fichiers de câblage : ils assemblent le domaine, les adaptateurs et la base. Le seed en fait
  // partie quand il déclenche des services du domaine (règles, ingestion météo).
  {
    type: "wiring",
    pattern: [
      "src/lib/auth/auth.ts",
      "src/lib/auth/npi-sign-in.ts",
      "src/lib/container.ts",
      "src/database/seed/index.ts",
      "src/database/seed/steps/monitoring.seed.ts",
      "src/database/seed/steps/assistant.seed.ts",
      "src/database/seed/steps/satellite.seed.ts",
    ],
    mode: "file",
  },
  { type: "app", pattern: "src/app/**" },
  { type: "features", pattern: "src/features/*", capture: ["feature"] },
  { type: "components", pattern: "src/components/**" },
  { type: "modules", pattern: "src/modules/*", capture: ["module"] },
  { type: "services", pattern: "src/services/**" },
  { type: "database", pattern: "src/database/**" },
  { type: "lib", pattern: "src/lib/**" },
  { type: "types", pattern: "src/types/**" },
  { type: "styles", pattern: "src/styles/**" },
  { type: "generated", pattern: "src/generated/**" },
];

const allow = (from, targets) => ({
  from: { element: { type: from } },
  allow: [{ to: { element: { type: targets } } }],
});

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  prettier,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: { boundaries },
    settings: {
      "boundaries/elements": layers,
      "boundaries/ignore": ["**/*.test.*", "**/__tests__/**"],
    },
    rules: {
      "boundaries/dependencies": [
        "error",
        {
          default: "disallow",
          policies: [
            allow("wiring", [
              "wiring",
              "modules",
              "services",
              "database",
              "lib",
              "types",
              "generated",
            ]),
            allow("app", [
              "wiring",
              "features",
              "components",
              "modules",
              "services",
              "lib",
              "types",
              "styles",
            ]),
            allow("features", [
              "wiring",
              "features",
              "components",
              "modules",
              "services",
              "lib",
              "types",
              "styles",
            ]),
            allow("components", ["components", "lib", "types", "styles"]),
            allow("modules", ["modules", "services", "database", "lib", "types", "generated"]),
            // styles : les jetons de couleur des données (classes NDVI) sont aussi envoyés dans les
            // scripts de rendu de l'imagerie satellite, pour une seule définition avec la légende.
            allow("services", ["services", "lib", "types", "styles"]),
            allow("database", ["database", "lib", "types", "styles", "generated"]),
            // lib/auth et lib/container câblent les adaptateurs : ils peuvent voir services et database.
            allow("lib", ["lib", "types", "services", "database", "generated"]),
            // Le socle hors-ligne (lib/offline) partage les contrats du domaine (schémas de
            // commandes, forme du référentiel) : en types seulement, jamais en valeurs.
            {
              from: { element: { type: "lib" } },
              allow: [{ to: { element: { type: "modules" } }, importKind: "type" }],
            },
            allow("types", ["types"]),
          ],
        },
      ],
      "boundaries/no-unknown-files": "off",
    },
  },
  {
    files: ["src/modules/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["next", "next/*", "react", "react-dom", "react/*"],
              message: "Le domaine ne dépend ni de Next ni de React.",
            },
            {
              group: ["@/features/*", "@/components/*", "@/app/*"],
              message: "Le domaine ne dépend pas de l'interface.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "src/generated/**",
    "public/vendor/**",
    "next-env.d.ts",
  ]),
]);
