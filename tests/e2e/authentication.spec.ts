import { expect, test, type Page } from "@playwright/test";
import { PHONE_ACCOUNTS, openAs } from "./helpers/sessions";

// Connexion unique pour tous les rôles (ADR-0012) : NPI et numéro relié, puis code reçu sur
// WhatsApp. Ces parcours reposent sur les comptes de démonstration du seed, qui acceptent le code
// OTP_DEMO_CODE (246810) sans envoi de message. Chaque demande de code compte dans la limite de
// 30 envois par 15 minutes et par adresse IP, partagée avec le globalSetup : seuls les tests qui
// portent sur la connexion elle-même en demandent un, les autres reprennent une session
// enregistrée (helpers/sessions.ts).
const DEMO_CODE = process.env.OTP_DEMO_CODE ?? "246810";

async function fillIdentity(page: Page, npi: string, digits: string) {
  await page.goto("/connexion");
  await page.getByLabel("Votre NPI", { exact: true }).fill(npi);
  await page.getByLabel("Votre téléphone").fill(digits);
  await page.getByRole("button", { name: "Recevoir mon code sur WhatsApp" }).click();
}

async function requestCode(page: Page, npi: string, digits: string) {
  await fillIdentity(page, npi, digits);
  await expect(page.getByText(/Code reçu sur WhatsApp au \+229/)).toBeVisible();
}

async function signIn(page: Page, account: { npi: string; digits: string }) {
  await requestCode(page, account.npi, account.digits);
  await page.getByLabel("Chiffre 1 sur 6").fill(DEMO_CODE);
  // Vérification puis passage par /apres-connexion, asynchrones : on attend l'espace du rôle.
  await page.waitForURL((url) => !/^\/(connexion|apres-connexion)/.test(url.pathname), {
    timeout: 15_000,
  });
}

test.describe("connexion par NPI et code WhatsApp", () => {
  test("une agricultrice se connecte en deux écrans et arrive sur son espace", async ({ page }) => {
    await signIn(page, PHONE_ACCOUNTS.farmer);
    await expect(page).toHaveURL(/\/agriculteur$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "Déclarer ma récolte" })).toBeVisible();
    // La barre marine de l'en-tête dit dans quel espace on se trouve.
    await expect(page.getByText("Espace agriculteur", { exact: true })).toBeVisible();
  });

  test("un agent arrive sur l'espace agent puis se voit refuser le pilotage", async ({ page }) => {
    await signIn(page, PHONE_ACCOUNTS.agent);
    await expect(page).toHaveURL(/\/agent$/);
    await page.goto("/pilotage");
    await expect(page).toHaveURL(/\/acces-refuse$/);
    await expect(page.getByText("Cet espace n'est pas accessible avec votre compte")).toBeVisible();
  });

  test("le ministère se connecte par le même formulaire, sans second facteur", async ({ page }) => {
    // Plus d'e-mail, de mot de passe ni de défi TOTP : le code WhatsApp mène droit au pilotage.
    await signIn(page, PHONE_ACCOUNTS.ministry);
    await expect(page).toHaveURL(/\/pilotage$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tableau de bord national");
  });

  test("refuse un NPI mal formé puis un mauvais code, par des messages neutres", async ({
    page,
  }) => {
    const farmer = PHONE_ACCOUNTS.farmer;
    // Contrôle de forme avant tout envoi : le premier écran reste affiché, aucun code ne part.
    await fillIdentity(page, "123", farmer.digits);
    await expect(page.getByText(/Le NPI doit comporter 13 chiffres \(3 saisis\)/)).toBeVisible();
    await expect(page.getByLabel("Votre NPI", { exact: true })).toBeVisible();

    await page.getByLabel("Votre NPI", { exact: true }).fill(farmer.npi);
    await page.getByRole("button", { name: "Recevoir mon code sur WhatsApp" }).click();
    await expect(page.getByText(/Code reçu sur WhatsApp au \+229/)).toBeVisible();
    await page.getByLabel("Chiffre 1 sur 6").fill("000000");
    await expect(page.getByText(/Ce code n'est pas valable/)).toBeVisible();
  });

  test("refuse un NPI qui n'est pas celui relié au numéro, une fois le code vérifié", async ({
    page,
  }) => {
    // Numéro de l'agricultrice, NPI d'un autre : le refus n'intervient qu'après un code correct,
    // pour ne rien apprendre d'un NPI à qui ne détient pas le téléphone.
    await requestCode(page, "1000000000009", PHONE_ACCOUNTS.farmer.digits);
    await page.getByLabel("Chiffre 1 sur 6").fill(DEMO_CODE);
    await expect(page.getByText(/ne sont pas reliés au même compte/)).toBeVisible();
    await expect(page).toHaveURL(/\/connexion$/);
    // Aucune session ouverte : l'espace de l'agricultrice renvoie toujours à la connexion.
    await page.goto("/agriculteur");
    await expect(page).toHaveURL(/\/connexion\?suite=%2Fagriculteur$/);
  });

  test("hors production, un compte de démonstration remplit les deux champs", async ({ page }) => {
    // Aucun envoi de code ici : on vérifie seulement le remplissage.
    await page.goto("/connexion");
    const panel = page.getByRole("region", { name: "Comptes de démonstration" });
    await panel.getByRole("button", { name: "Utiliser le compte Ministère" }).click();
    await expect(page.getByLabel("Votre NPI", { exact: true })).toHaveValue(
      PHONE_ACCOUNTS.ministry.npi,
    );
    // Le numéro est affiché groupé par deux chiffres : on compare les seuls chiffres.
    const phone = page.getByLabel("Votre téléphone");
    await expect
      .poll(async () => (await phone.inputValue()).replace(/\D/g, ""))
      .toBe(PHONE_ACCOUNTS.ministry.digits);
  });
});

test.describe("anciennes adresses de connexion", () => {
  test("la connexion institutionnelle et son défi renvoient à la connexion unique", async ({
    page,
  }) => {
    await page.goto("/connexion/institution");
    await expect(page).toHaveURL(/\/connexion$/);
    await expect(page.getByLabel("Votre NPI", { exact: true })).toBeVisible();
    await page.goto("/connexion/institution/verification");
    await expect(page).toHaveURL(/\/connexion$/);
  });
});

test.describe("protection des espaces", () => {
  test("un visiteur anonyme est renvoyé vers la connexion avec le chemin demandé", async ({
    page,
  }) => {
    await page.goto("/agent");
    await expect(page).toHaveURL(/\/connexion\?suite=%2Fagent$/);
  });

  test("la page compte affiche le NPI masqué, sans formulaire de saisie", async ({
    page,
  }, testInfo) => {
    // Le NPI est lié à la connexion (ADR-0012) : plus rien à saisir sur la page compte.
    await openAs(page, testInfo, "farmer", "/compte");
    await expect(page.getByText("•••• •••• •••0 2")).toBeVisible();
    await expect(page.getByText("En attente de vérification ANIP")).toBeVisible();
    await expect(page.getByLabel("Numéro personnel d'identification (NPI)")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Enregistrer mon NPI" })).toHaveCount(0);
    // L'ancienne page d'activation de la double authentification renvoie au compte.
    await page.goto("/compte/securite");
    await expect(page).toHaveURL(/\/compte$/);
  });
});
