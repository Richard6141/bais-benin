import { expect, test, type Page } from "@playwright/test";
import { signInAsMinistry } from "./helpers/ministry";
import { openAs } from "./helpers/sessions";

// Tableau de bord national (étape 7) : vue nationale, territoires, fiche commune, qualité,
// fiche imprimable et exports. Lecture seule : ces parcours n'écrivent rien en base. Le ministère,
// la coopérative, l'agent et l'agricultrice reprennent leur session enregistrée par le globalSetup
// (helpers/sessions.ts) : aucun code n'est demandé ici.

async function expectNoHorizontalScroll(page: Page) {
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(fits).toBe(true);
}

test.describe("tableau de bord national", () => {
  test.setTimeout(90_000);

  test("vue nationale : indicateurs, production, filtres dans l'adresse", async ({
    page,
  }, testInfo) => {
    await signInAsMinistry(page, testInfo, "/pilotage");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tableau de bord national");
    const nav = page.getByRole("navigation", { name: "Centre de pilotage" });
    await expect(nav.getByRole("link", { name: "Vue nationale" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.getByRole("link", { name: "Règles d'alerte" })).toBeVisible();

    const tiles = page.getByRole("region", { name: "Indicateurs clés" });
    for (const label of [
      "Producteurs",
      "Exploitations",
      "Superficie déclarée",
      "Superficie mesurée",
    ]) {
      await expect(tiles.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Production par culture" })).toBeVisible();
    // Barres de production, ou de superficie tant qu'aucune récolte n'est déclarée.
    await expect(
      page.getByRole("list", { name: /^(Production déclarée|Superficie cultivée) par culture$/ }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Alertes en cours" })).toBeVisible();

    await page.getByLabel("Département").first().click();
    await page.getByRole("option", { name: "Donga" }).click();
    await expect(page).toHaveURL(/departementCode=BJ-DO/);
    await expectNoHorizontalScroll(page);
  });

  test("territoires : tri accessible, descente département puis commune", async ({
    page,
  }, testInfo) => {
    await signInAsMinistry(page, testInfo, "/pilotage/territoires");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Départements");
    const table = page.getByRole("table");
    await expect(table.locator("tbody tr")).toHaveCount(12);
    await expect(table.locator("tfoot")).toContainText("Bénin");

    const header = table.getByRole("columnheader", { name: /Exploitations/ });
    await expect(header).toHaveAttribute("aria-sort", "descending");
    await header.getByRole("button").click();
    await expect(header).toHaveAttribute("aria-sort", "ascending");

    await table.getByRole("link", { name: "Donga" }).click();
    await expect(page).toHaveURL(/departementCode=BJ-DO/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Communes du département Donga",
    );
    await page.getByRole("table").getByRole("link", { name: "Djougou" }).click();
    await page.waitForURL(/\/pilotage\/communes\/BJ-[A-Z]{3}-\d{3}/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Djougou");
    for (const title of [
      "Chiffres de la commune",
      "Cultures",
      "Couverture terrain",
      "Météo et alertes",
    ]) {
      await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
    }
    await expectNoHorizontalScroll(page);
  });

  test("qualité des données, fiche imprimable et export CSV", async ({ page }, testInfo) => {
    await signInAsMinistry(page, testInfo, "/pilotage/qualite");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Qualité des données");
    await expect(page.getByRole("heading", { name: "Fraîcheur" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Écarts entre déclaré et mesuré" }),
    ).toBeVisible();
    await expect(page.getByRole("list", { name: "Parcelles par tranche d'écart" })).toBeVisible();

    await page.goto("/pilotage/fiche");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fiche de pilotage");
    await expect(page.getByText(/^Campagne \d{4}-\d{4} · /)).toBeVisible();
    const print = page.getByRole("button", { name: "Imprimer ou enregistrer en PDF" });
    await expect(print).toBeVisible();
    // À l'impression : ni navigation, ni en-tête, ni commandes.
    await page.emulateMedia({ media: "print" });
    await expect(print).toBeHidden();
    await expect(page.getByRole("navigation", { name: "Centre de pilotage" })).toBeHidden();
    await page.emulateMedia({ media: "screen" });

    const csv = await page.request.get("/api/v1/analytics/export.csv?kind=indicators");
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    const body = await csv.text();
    // BOM UTF-8 et séparateur « ; » : ouverture directe dans Excel en français.
    expect(body.charCodeAt(0)).toBe(0xfeff);
    expect(body.split("\n")[0]).toContain(";");
  });
});

test.describe("tableau de bord réduit, agent et coopérative", () => {
  test("l'agent lit les chiffres de sa commune, jamais ceux des autres", async ({
    page,
  }, testInfo) => {
    await openAs(page, testInfo, "agent");
    // Barre basse pleine sur téléphone : l'entrée passe par l'accueil.
    await page
      .getByRole("region", { name: "Raccourcis" })
      .getByRole("link", { name: /Tableau de bord/ })
      .click();
    await page.waitForURL(/\/agent\/tableau-de-bord/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Tableau de bord de mon périmètre",
    );
    await expect(page.getByText(/^Djougou · campagne/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Indicateurs clés" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Déclarations à vérifier" })).toBeVisible();
    // Aucun lien vers les écrans nationaux depuis les tuiles.
    await expect(
      page.getByRole("region", { name: "Indicateurs clés" }).getByRole("link"),
    ).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    const csv = await page.request.get("/api/v1/analytics/export.csv?kind=indicators");
    expect(csv.status()).toBe(200);
    const body = await csv.text();
    expect(body).toContain("Djougou");
    expect(body).not.toContain("Bassila");

    await page.goto("/pilotage/territoires");
    await expect(page).toHaveURL(/\/acces-refuse/);
  });

  test("la coopérative voit un état vide explicite", async ({ page }, testInfo) => {
    await openAs(page, testInfo, "cooperative");
    await expect(
      page.getByRole("heading", {
        name: "Votre organisation n'est pas encore rattachée à des exploitations",
      }),
    ).toBeVisible();
  });
});

test.describe("tableau de bord, accès", () => {
  test("un visiteur anonyme est renvoyé vers la connexion", async ({ page }) => {
    await page.goto("/pilotage/territoires");
    await expect(page).toHaveURL(/\/connexion/);
  });

  test("une agricultrice n'accède pas au tableau et n'exporte aucun territoire", async ({
    page,
  }, testInfo) => {
    await openAs(page, testInfo, "farmer");
    await page.goto("/pilotage/qualite");
    await expect(page).toHaveURL(/\/acces-refuse/);
    // L'export applique le périmètre : un rôle sans périmètre territorial reçoit un fichier sans
    // aucune commune, jamais les chiffres des autres (modules/analytics/scope.ts).
    const csv = await page.request.get("/api/v1/analytics/export.csv?kind=indicators");
    if (csv.status() === 200) {
      const body = await csv.text();
      expect(body).not.toContain("Djougou");
      expect(body).not.toContain("Donga");
    } else {
      expect([401, 403]).toContain(csv.status());
    }
  });
});
