import { expect, test } from "@playwright/test";
import { signInAsMinistry } from "./helpers/ministry";
import { openAs } from "./helpers/sessions";

// Parcours du monitoring (étape 6) contre les alertes de démonstration du seed : Djougou (stress
// hydrique), Adjohoun (inondation), Malanville (chaleur), Savalou (fortes pluies), Bohicon
// (chenille). Chaque rôle reprend sa session enregistrée par le globalSetup (helpers/sessions.ts),
// ministère compris : aucun code n'est demandé ici.

test.describe("monitoring, espace agricultrice", () => {
  test("voit l'alerte de Djougou, ouvre la fiche, lit le conseil et confirme", async ({
    page,
  }, testInfo) => {
    await openAs(page, testInfo, "farmer");
    await expect(page.getByRole("link", { name: /^Alertes :/ })).toBeVisible();

    await page.goto("/agriculteur/alertes");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Djougou");
    await expect(page.getByRole("list", { name: "Météo jour par jour" })).toBeVisible();
    const alerts = page.getByRole("list", { name: "Alertes en cours" });
    await expect(alerts.getByText("Djougou").first()).toBeVisible();

    await alerts.getByRole("link").first().click();
    await page.waitForURL(/\/agriculteur\/alertes\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Que faire ?")).toBeVisible();
    await expect(page.getByRole("region", { name: "Pourquoi cette alerte ?" })).toBeVisible();
    await page.getByRole("button", { name: "J'ai compris" }).click();
    await expect(page.getByText("Merci, c'est noté.")).toBeVisible();

    const noHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(noHorizontalScroll).toBe(true);
  });

  test("consulte la météo de sa commune", async ({ page }, testInfo) => {
    await openAs(page, testInfo, "farmer");
    await page.goto("/agriculteur/meteo");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Djougou");
    await expect(page.getByText("Pluie des 10 derniers jours")).toBeVisible();
    await expect(page.getByRole("img", { name: /Cumul de pluie sur/ })).toBeVisible();
  });
});

test.describe("monitoring, espace agent", () => {
  test("liste les alertes de sa commune et ouvre la fiche avec les exploitations", async ({
    page,
  }, testInfo) => {
    await openAs(page, testInfo, "agent");
    await page.goto("/agent/alertes");
    await expect(page.getByRole("tab", { name: /Actives/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Récentes/ })).toBeVisible();
    const list = page.getByRole("tabpanel").getByRole("list", { name: "Alertes" });
    await expect(list.getByText("Djougou").first()).toBeVisible();

    await list.getByRole("link").first().click();
    await page.waitForURL(/\/agent\/alertes\/[0-9a-f-]{36}$/);
    await expect(page.getByText("Diffusion", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: /Exploitations concernées/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "J'ai prévenu" }).first()).toBeVisible();
    // Résumé chiffré puis liste paginée par 20 : les 109 exploitations ne s'affichent pas d'un bloc.
    await expect(page.getByRole("definition").first()).toBeVisible();
    const farmsList = page.getByRole("list", { name: "Liste des exploitations concernées" });
    const before = await farmsList.getByRole("listitem").count();
    expect(before).toBeLessThanOrEqual(20);
    const more = page.getByRole("link", { name: "Afficher la suite" });
    if (await more.isVisible()) {
      await more.click();
      await expect(page).toHaveURL(/page=2/);
      await expect.poll(() => farmsList.getByRole("listitem").count()).toBeGreaterThan(before);
    }
    const noHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(noHorizontalScroll).toBe(true);
  });

  test("la navigation de l'espace agent mène aux alertes", async ({ page }, testInfo) => {
    await openAs(page, testInfo, "agent");
    await page
      .getByRole("navigation", { name: "Espace agent" })
      .getByRole("link", { name: "Alertes" })
      .filter({ visible: true })
      .first()
      .click();
    await expect(page).toHaveURL(/\/agent\/alertes$/);
  });
});

test.describe("monitoring, ministère", () => {
  test("le centre d'alertes est refusé à un agent de terrain", async ({ page }, testInfo) => {
    // Réservé au rôle ADMIN_STATE : un autre rôle connecté aboutit au refus d'accès, jamais à la
    // vue nationale des alertes.
    await openAs(page, testInfo, "agent", "/pilotage/alertes");
    await expect(page).toHaveURL(/\/acces-refuse$/);
  });

  test("un visiteur anonyme est renvoyé vers la connexion", async ({ page }) => {
    await page.goto("/pilotage/alertes");
    await expect(page).toHaveURL(/\/connexion\?suite=%2Fpilotage%2Falertes$/);
  });
});

test.describe("monitoring, centre d'alertes du ministère", () => {
  // Session du compte ministère de démonstration (helpers/ministry.ts). Lecture seule : les deux
  // parcours peuvent tourner en parallèle.
  test("affiche les communes en alerte, la carte, la liste et les filtres", async ({
    page,
  }, testInfo) => {
    test.slow();
    await signInAsMinistry(page, testInfo, "/pilotage/alertes");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Centre d'alertes");
    await expect(page.getByText("5 communes en alerte")).toBeVisible();
    await expect(page.locator('[data-map-idle="true"]')).toBeVisible({ timeout: 30_000 });
    const list = page.getByRole("list", { name: "Alertes actives" });
    await expect(list.getByRole("link")).toHaveCount(5);

    await page.getByLabel("Sévérité").click();
    await page.getByRole("option", { name: "Vigilance" }).click();
    await expect(page).toHaveURL(/severite=WATCH/);
    await expect(list.getByRole("link")).toHaveCount(2);

    const noHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(noHorizontalScroll).toBe(true);
  });

  test("ouvre la fiche d'audit d'une alerte", async ({ page }, testInfo) => {
    test.slow();
    await signInAsMinistry(page, testInfo, "/pilotage/alertes");
    await page.getByRole("list", { name: "Alertes actives" }).getByRole("link").first().click();
    await page.waitForURL(/\/pilotage\/alertes\/[0-9a-f-]{36}$/);
    await expect(page.getByRole("region", { name: "Conditions de la règle" })).toBeVisible();
    await expect(page.getByText(/Règle [A-Z0-9_]+, version \d+/)).toBeVisible();
    await expect(page.getByText("Indicateurs lus")).toBeVisible();
    await expect(page.getByText("Diffusion", { exact: true })).toBeVisible();
  });
});
