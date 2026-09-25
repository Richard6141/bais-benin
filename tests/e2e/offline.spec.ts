import { expect, test, type Page } from "@playwright/test";

// Mode hors ligne de l'espace agent (ADR-0005). Le service worker n'existe qu'en build de
// production (`pnpm build` puis `pnpm start`, ce que fait déjà playwright.config.ts) : en
// `next dev`, Serwist est désactivé par PwaProvider et ces parcours ne s'appliquent pas.
// Le compte utilisé est l'agent de démonstration (0190000001, code OTP_DEMO_CODE).

const DEMO_CODE = process.env.OTP_DEMO_CODE ?? "246810";

async function signInAsAgent(page: Page) {
  await page.goto("/connexion");
  await page.getByLabel("Votre numéro de téléphone").fill("0190000001");
  await page.getByRole("button", { name: "Recevoir mon code" }).click();
  await expect(page.getByText(/Code reçu au \+229/)).toBeVisible();
  await page.getByLabel("Chiffre 1 sur 6").fill(DEMO_CODE);
  await expect(page).toHaveURL(/\/agent$/);
}

// Attend que le service worker contrôle la page : sans cela, la première navigation hors ligne
// passerait encore par le réseau.
async function waitForServiceWorker(page: Page) {
  await page.waitForFunction(
    async () => {
      const registration = await navigator.serviceWorker?.ready;
      return Boolean(registration?.active) && Boolean(navigator.serviceWorker.controller);
    },
    undefined,
    { timeout: 30_000 },
  );
}

test.describe("espace agent hors ligne", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "Service worker piloté sous Chromium seulement",
  );

  test("une page déjà visitée s'ouvre sans réseau, une page inconnue mène au repli", async ({
    page,
    context,
  }) => {
    await signInAsAgent(page);
    await waitForServiceWorker(page);

    // Visite en ligne des deux pages à retrouver hors ligne.
    await page.goto("/agent/enregistrer");
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Enregistrer une exploitation",
    );
    await page.goto("/agent");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Bonjour");

    await context.setOffline(true);
    try {
      await page.goto("/agent/enregistrer");
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        "Enregistrer une exploitation",
      );

      await page.goto("/agent");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Bonjour");

      // Page jamais visitée : ni réseau ni cache, le service worker sert /hors-ligne.
      await page.goto("/agent/verification");
      await expect(page.getByRole("heading", { level: 1 })).toContainText(
        "pas disponible sans réseau",
      );
      await expect(page.getByRole("link", { name: "Retour à ma tournée" })).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test("les appels d'authentification et de synchronisation ne sont jamais servis depuis le cache", async ({
    page,
    context,
  }) => {
    await signInAsAgent(page);
    await waitForServiceWorker(page);
    await context.setOffline(true);
    try {
      const status = await page.evaluate(async () => {
        try {
          const response = await fetch("/api/v1/sync", {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-Device-Id": "e2e-offline" },
            body: JSON.stringify({ commands: [] }),
          });
          return response.status;
        } catch {
          return "network-error";
        }
      });
      expect(status).toBe("network-error");
    } finally {
      await context.setOffline(false);
    }
  });
});
