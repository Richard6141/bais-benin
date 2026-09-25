import { expect, test } from "@playwright/test";

test.describe("page d'accueil", () => {
  test("affiche le nom de la plateforme et les six espaces", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Bénin Agricultural Intelligence System/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(
      "Connaître chaque exploitation",
    );
    await expect(
      page.locator("footer").getByText("Bénin Agricultural Intelligence System"),
    ).toBeVisible();

    const spaces = page.locator("#espaces li");
    await expect(spaces).toHaveCount(6);
  });

  test("indique l'état de la base de données", async ({ page }) => {
    await page.goto("/");
    const status = page.locator("#etat-plateforme");
    await expect(status.getByText("Base de données")).toBeVisible();
    await expect(status.getByText("Opérationnel").first()).toBeVisible();
  });

  test("n'a pas de défilement horizontal sur mobile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "profil mobile uniquement");
    await page.goto("/");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});

test.describe("PWA", () => {
  test("expose un manifeste valide", async ({ request }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.ok()).toBeTruthy();
    const manifest = await response.json();
    expect(manifest.name).toBe("Bénin Agricultural Intelligence System");
    expect(manifest.display).toBe("standalone");
  });

  test("sert le service worker", async ({ request }) => {
    const response = await request.get("/serwist/sw.js");
    expect(response.ok()).toBeTruthy();
    expect(response.headers()["content-type"]).toContain("javascript");
  });

  test("sert la page de repli hors connexion", async ({ page }) => {
    await page.goto("/hors-ligne");
    await expect(page.getByRole("heading", { name: /pas disponible sans réseau/ })).toBeVisible();
  });
});

test.describe("sonde de santé", () => {
  test("répond avec l'état de la base", async ({ request }) => {
    const response = await request.get("/api/health");
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
    expect(body.database.status).toBe("up");
  });
});
