import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Deux projets : les tests unitaires (domaine, utilitaires, composants) tournent
// en jsdom sans base ; les tests d'intégration exigent une base PostGIS réelle
// (docker compose up -d db) et sont lancés séparément.
export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    globals: true,
    passWithNoTests: true,
    // Deux workers suffisent et évitent d'épuiser la mémoire sur un poste qui fait aussi
    // tourner Docker et le serveur de développement (même logique que le build Next).
    maxWorkers: 2,
    coverage: {
      provider: "v8",
      include: ["src/modules/**", "src/lib/**", "src/services/**"],
      exclude: ["**/*.test.*", "**/__tests__/**", "src/generated/**"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/**/*.test.{ts,tsx}", "src/**/__tests__/**/*.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          // Une seule base partagée : les fichiers s'enchaînent pour ne pas se marcher dessus.
          fileParallelism: false,
          setupFiles: ["./tests/integration/setup.ts"],
          include: ["tests/integration/**/*.test.ts"],
          testTimeout: 30_000,
        },
      },
    ],
  },
});
