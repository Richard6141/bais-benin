import { expect, test, type Page } from "@playwright/test";

// Parcours du monitoring (étape 6) contre les alertes de démonstration du seed : Djougou (stress
// hydrique), Adjohoun (inondation), Malanville (chaleur), Savalou (fortes pluies), Bohicon
// (chenille). Le compte ministère n'a pas de double authentification enregistrée dans le seed :
// on vérifie que le centre d'alertes reste protégé, pas son contenu.
const DEMO_CODE = process.env.OTP_DEMO_CODE ?? "246810";
const DEMO_PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD ?? "Demo-Bais-2026!";

async function signInByPhone(page: Page, nationalDigits: string) {
  await page.goto("/connexion");
  await page.getByLabel("Votre numéro de téléphone").fill(nationalDigits);
  await page.getByRole("button", { name: "Recevoir mon code" }).click();
  await expect(page.getByText(/Code reçu au \+229/)).toBeVisible();
  await page.getByLabel("Chiffre 1 sur 6").fill(DEMO_CODE);
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 15_000 });
}

test.describe("monitoring, espace agricultrice", () => {
  test("voit l'alerte de Djougou, ouvre la fiche, lit le conseil et confirme", async ({ page }) => {
    await signInByPhone(page, "0190000002");
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

  test("consulte la météo de sa commune", async ({ page }) => {
    await signInByPhone(page, "0190000002");
    await page.goto("/agriculteur/meteo");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Djougou");
    await expect(page.getByText("Pluie des 10 derniers jours")).toBeVisible();
    await expect(page.getByRole("img", { name: /Cumul de pluie sur/ })).toBeVisible();
  });
});

test.describe("monitoring, espace agent", () => {
  test("liste les alertes de sa commune et ouvre la fiche avec les exploitations", async ({
    page,
  }) => {
    await signInByPhone(page, "0190000001");
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
    const noHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(noHorizontalScroll).toBe(true);
  });

  test("la navigation de l'espace agent mène aux alertes", async ({ page }) => {
    await signInByPhone(page, "0190000001");
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
  test("le centre d'alertes exige la double authentification", async ({ page }) => {
    await page.goto("/connexion/institution");
    await page.getByLabel("Adresse e-mail professionnelle").fill("ministere@bais.demo");
    await page.getByLabel("Mot de passe").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 15_000 });
    await page.goto("/pilotage/alertes");
    await expect(page).toHaveURL(/\/compte\/securite\?obligatoire=1$/, { timeout: 15_000 });
  });

  test("un visiteur anonyme est renvoyé vers la connexion", async ({ page }) => {
    await page.goto("/pilotage/alertes");
    await expect(page).toHaveURL(/\/connexion\?suite=%2Fpilotage%2Falertes$/);
  });
});
