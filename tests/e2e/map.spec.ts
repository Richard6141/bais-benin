import { expect, test } from "@playwright/test";

test.describe("carte agricole", () => {
  test("charge la carte, les agrégats et la légende", async ({ page }, testInfo) => {
    await page.goto("/carte");
    await expect(page.getByRole("application", { name: "Carte agricole du Bénin" })).toBeVisible();
    await expect(page.getByText("Pour ces filtres")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Communes les plus représentées")).toBeVisible();
    // La carte a fini de charger fond et tuiles : le worker et les sources fonctionnent.
    await expect(page.locator('[data-map-idle="true"]')).toBeVisible({ timeout: 30_000 });
    // Sur téléphone, la légende est repliée pour laisser l'écran à la carte : on la déplie.
    if (testInfo.project.name === "mobile") {
      await page.getByRole("button", { name: "Légende" }).click();
    }
    // La légende affiche des classes calculées sur les valeurs réelles, puis la classe hors
    // échelle.
    const legendClasses = page.getByRole("list").filter({ hasText: "Sans donnée ou moins de 5" });
    await expect(legendClasses).toBeVisible();
    await expect(legendClasses.getByRole("listitem")).not.toHaveCount(1);
    // Une tuile communale répond avec le bon type MIME.
    const tile = await page.request.get("/api/tiles/communes/6/32/30.pbf");
    expect(tile.status()).toBe(200);
    expect(tile.headers()["content-type"]).toContain("vnd.mapbox-vector-tile");
  });

  test("les filtres se reflètent dans l'adresse et changent les totaux", async ({ page }) => {
    await page.goto("/carte");
    await expect(page.getByText("Pour ces filtres")).toBeVisible({ timeout: 15_000 });
    const before = await page.locator("dd").first().textContent();

    await page.getByLabel("Département").click();
    await page.getByRole("option", { name: "Donga" }).click();
    await expect(page).toHaveURL(/departementCode=BJ-DO/);
    await expect(page.getByText("Pour ces filtres")).toBeVisible({ timeout: 15_000 });
    await expect
      .poll(async () => page.locator("dd").first().textContent(), { timeout: 15_000 })
      .not.toBe(before);
  });

  test("l'API de statistiques renvoie les 77 communes avec provenance", async ({ request }) => {
    const response = await request.get("/api/v1/territory/stats?level=communes");
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.items).toHaveLength(77);
    expect(body.provenance.source).toBe("registre BAIS");
    const bad = await request.get("/api/v1/territory/stats?departementCode=XX");
    expect(bad.status()).toBe(400);
  });

  test("n'a pas de défilement horizontal sur mobile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "profil mobile uniquement");
    await page.goto("/carte");
    await expect(page.getByText("Pour ces filtres")).toBeVisible({ timeout: 15_000 });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});
