import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.APP_URL ?? "http://localhost:3000";
const isCI = Boolean(process.env.CI);

// Les parcours tournent contre le build de production : c'est ce que verront
// les utilisateurs, service worker compris. Deux profils : desktop et mobile
// d'entrée de gamme, car l'agent de terrain est l'utilisateur de référence.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  // Deux navigateurs en parallèle : au-delà, le serveur et la base se disputent la mémoire
  // du poste et les délais deviennent des faux négatifs.
  workers: 2,
  reporter: isCI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    locale: "fr-BJ",
    timezoneId: "Africa/Porto-Novo",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "pnpm start",
    url: baseURL,
    reuseExistingServer: !isCI,
    timeout: 120_000,
  },
});
