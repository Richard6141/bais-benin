import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier";
import boundaries from "eslint-plugin-boundaries";

// Les frontières entre couches sont décrites dans docs/02-architecture.md (§3).
// Le domaine (modules/) ne doit jamais dépendre de Next, de React ni de l'UI :
// c'est ce qui garantit qu'il pourra être extrait vers un service séparé.
const layers = [
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
            allow("app", [
              "features",
              "components",
              "modules",
              "services",
              "lib",
              "types",
              "styles",
            ]),
            allow("features", [
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
            allow("services", ["services", "lib", "types"]),
            allow("database", ["database", "lib", "types", "generated"]),
            allow("lib", ["lib", "types"]),
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
    "next-env.d.ts",
  ]),
]);
