import { expect, test, type Page } from "@playwright/test";

// Ces parcours reposent sur le seed de démonstration : code OTP_DEMO_CODE (246810)
// pour les numéros 01 9X XX XX XX et DEMO_ACCOUNT_PASSWORD pour les comptes institutionnels.
const DEMO_CODE = process.env.OTP_DEMO_CODE ?? "246810";
const DEMO_PASSWORD = process.env.DEMO_ACCOUNT_PASSWORD ?? "Demo-Bais-2026!";

async function signInByPhone(page: Page, nationalDigits: string) {
  await page.goto("/connexion");
  await page.getByLabel("Votre numéro de téléphone").fill(nationalDigits);
  await page.getByRole("button", { name: "Recevoir mon code" }).click();
  await expect(page.getByText(/Code reçu au \+229/)).toBeVisible();
  await page.getByLabel("Chiffre 1 sur 6").fill(DEMO_CODE);
  // La vérification et la redirection sont asynchrones : on attend d'avoir quitté la connexion.
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 15_000 });
}

test.describe("connexion par téléphone", () => {
  test("une agricultrice se connecte en deux écrans et arrive sur son espace", async ({ page }) => {
    await signInByPhone(page, "0190000002");
    await expect(page).toHaveURL(/\/agriculteur$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Déclarer ma récolte" })).toBeVisible();
    await expect(page.getByText("Agriculteur", { exact: true })).toBeVisible();
  });

  test("un agent arrive sur l'espace agent puis se voit refuser le pilotage", async ({ page }) => {
    await signInByPhone(page, "0190000001");
    await expect(page).toHaveURL(/\/agent$/);
    await page.goto("/pilotage");
    await expect(page).toHaveURL(/\/acces-refuse$/);
    await expect(page.getByText("Cet espace n'est pas accessible avec votre compte")).toBeVisible();
  });

  test("refuse un numéro incomplet et un mauvais code", async ({ page }) => {
    await page.goto("/connexion");
    const submit = page.getByRole("button", { name: "Recevoir mon code" });
    await page.getByLabel("Votre numéro de téléphone").fill("0190");
    await expect(submit).toBeDisabled();
    await page.getByLabel("Votre numéro de téléphone").fill("0190000002");
    await submit.click();
    await page.getByLabel("Chiffre 1 sur 6").fill("000000");
    await expect(page.getByText(/Ce code n'est pas valable/)).toBeVisible();
  });
});

test.describe("connexion institutionnelle", () => {
  test("le ministère doit activer la double authentification avant le pilotage", async ({
    page,
  }) => {
    await page.goto("/connexion/institution");
    await page.getByLabel("Adresse e-mail professionnelle").fill("ministere@bais.demo");
    await page.getByLabel("Mot de passe").fill(DEMO_PASSWORD);
    await page.getByRole("button", { name: "Se connecter" }).click();
    // Deux redirections serveur successives (pilotage puis sécurité) : on laisse le temps au mobile.
    await expect(page).toHaveURL(/\/compte\/securite\?obligatoire=1$/, { timeout: 15_000 });
    await expect(page.getByText("Étape obligatoire pour votre rôle")).toBeVisible();
  });

  test("un mauvais mot de passe donne un message neutre", async ({ page }) => {
    await page.goto("/connexion/institution");
    await page.getByLabel("Adresse e-mail professionnelle").fill("ministere@bais.demo");
    await page.getByLabel("Mot de passe").fill("mauvais-mot-de-passe");
    await page.getByRole("button", { name: "Se connecter" }).click();
    await expect(page.getByText("Identifiants incorrects ou compte inactif.")).toBeVisible();
  });
});

test.describe("protection des espaces", () => {
  test("un visiteur anonyme est renvoyé vers la connexion avec le chemin demandé", async ({
    page,
  }) => {
    await page.goto("/agent");
    await expect(page).toHaveURL(/\/connexion\?suite=%2Fagent$/);
  });

  test("la page compte affiche le NPI masqué après enregistrement", async ({ page }, testInfo) => {
    // Un seul profil enregistre le NPI : les deux profils en parallèle se disputeraient le même compte.
    test.skip(testInfo.project.name !== "desktop", "profil desktop uniquement");
    await signInByPhone(page, "0190000002");
    await page.goto("/compte");
    const npiField = page.getByLabel("Numéro personnel d'identification (NPI)");
    if (await npiField.isVisible()) {
      await npiField.fill("1122334455667");
      await page.getByLabel("Nom de famille").fill("Démonstration");
      await page.getByRole("button", { name: "Enregistrer mon NPI" }).click();
      // Après l'enregistrement, la page se met à jour et remplace le formulaire (et son message
      // de succès) par le NPI masqué : c'est lui qu'on attend.
      await expect(page.getByText("•••• •••• •••6 7")).toBeVisible({ timeout: 15_000 });
    }
    await page.reload();
    await expect(page.getByText("•••• •••• •••6 7")).toBeVisible();
    await expect(page.getByText("En attente de vérification ANIP")).toBeVisible();
  });
});
