import { expect, test, type Page } from "@playwright/test";

// Parcours du registre (étape 5) contre le seed de démonstration : agent de Djougou
// (0190000001) et agricultrice rattachée à une exploitation de Djougou (0190000002),
// code OTP_DEMO_CODE (246810). Les saisies hors ligne passent par la base locale (Dexie)
// puis par la file de synchronisation : chaque test travaille dans son propre contexte
// de navigateur, donc avec une base locale vide.
const DEMO_CODE = process.env.OTP_DEMO_CODE ?? "246810";
const AGENT = "0190000001";
const FARMER = "0190000002";
const DJOUGOU_CODE = "BJ-DON-003";
// Tuile de zoom 8 couvrant Djougou (1,667 E ; 9,708 N).
const DJOUGOU_TILE = "/api/tiles/farms/8/129/121.pbf";

async function signInByPhone(page: Page, nationalDigits: string) {
  await page.goto("/connexion");
  await page.getByLabel("Votre numéro de téléphone").fill(nationalDigits);
  await page.getByRole("button", { name: "Recevoir mon code" }).click();
  await expect(page.getByText(/Code reçu au \+229/)).toBeVisible();
  await page.getByLabel("Chiffre 1 sur 6").fill(DEMO_CODE);
  await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 15_000 });
}

const syncChip = (page: Page) => page.locator("[data-sync-state]").first();

// Premier lancement : le référentiel et les exploitations du périmètre sont téléchargés dans la
// base locale du contexte courant. Indispensable avant tout parcours hors ligne.
async function downloadOfflineData(page: Page) {
  await page.goto("/agent/premier-lancement");
  await page.getByRole("button", { name: "Télécharger" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Terminé" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByTestId("offline-cache-state")).toContainText("1 commune");
}

// Saisie manuelle d'une position dans LocationPicker (repli sans GPS), puis validation.
async function enterManualPosition(page: Page, lat: string, lng: string) {
  await page.getByRole("button", { name: "Saisir la position à la main" }).click();
  await page.getByLabel("Latitude").fill(lat);
  await page.getByLabel("Longitude").fill(lng);
  await page.getByRole("button", { name: "Utiliser ces coordonnées" }).click();
}

// Attend que la file locale soit vide et que la puce revienne « À jour ».
async function waitForSync(page: Page) {
  const chip = syncChip(page);
  // La puce de l'en-tête porte son propre bouton ; l'écran A7 en affiche une seconde.
  const syncNow = chip.getByRole("button", { name: "Synchroniser maintenant" });
  if (await syncNow.isEnabled()) await syncNow.click();
  await expect(chip).toHaveAttribute("data-sync-state", "UP_TO_DATE", { timeout: 30_000 });
  await expect(chip).toContainText("À jour");
}

test.describe("espace agent", () => {
  test("accueil, liste des exploitations, recherche et fiche", async ({ page }) => {
    await signInByPhone(page, AGENT);
    await expect(page).toHaveURL(/\/agent$/);
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Bonjour");
    const figures = page.getByRole("region", { name: "Chiffres de votre périmètre" });
    await expect(figures.getByText("Exploitations", { exact: true })).toBeVisible();
    await expect(figures.getByText("À vérifier", { exact: true })).toBeVisible();
    await expect(figures.getByText("Vérifiées sur le terrain", { exact: true })).toBeVisible();
    await expect(syncChip(page)).toContainText("À jour");

    await page.goto("/agent/exploitations");
    const links = page.locator('a[href^="/agent/exploitations/"]');
    await expect(links.first()).toBeVisible();
    await expect(links.first().getByText(/Djougou/)).toBeVisible();

    // La recherche par nom ne garde que les producteurs correspondants.
    const firstName = (await links.first().locator("span").first().textContent())?.trim() ?? "";
    const needle = firstName.split(" ")[0] ?? firstName;
    await page.getByLabel("Rechercher").fill(needle);
    await page.getByRole("button", { name: "Rechercher" }).click();
    await expect(page).toHaveURL(/q=/);
    const results = page.locator('a[href^="/agent/exploitations/"]');
    await expect(results.first()).toBeVisible();
    for (const text of await results.allTextContents()) {
      expect(text.toLowerCase()).toContain(needle.toLowerCase());
    }

    await results.first().click();
    await page.waitForURL(/\/agent\/exploitations\/[0-9a-f-]{36}$/);
    for (const name of [/^Résumé$/, /^Parcelles/, /^Historique$/, /^Activité$/]) {
      await expect(page.getByRole("tab", { name })).toBeVisible();
    }
    await page.getByRole("tab", { name: /^Parcelles/ }).click();
    await expect(page.getByRole("tabpanel")).toBeVisible();
  });

  test("premier lancement : le périmètre est téléchargé pour le hors-ligne", async ({ page }) => {
    await signInByPhone(page, AGENT);
    await downloadOfflineData(page);
    await expect(page.getByRole("button", { name: "Mettre à jour" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Commencer" })).toBeVisible();
  });

  test("enregistrement hors ligne puis synchronisation", async ({ page, context }) => {
    test.slow();
    await signInByPhone(page, AGENT);
    await downloadOfflineData(page);

    // La page est ouverte en ligne (le service worker n'est pas encore garanti en test), puis
    // le réseau est coupé avant la première saisie : tout le parcours doit tenir sur le cache.
    await page.goto("/agent/enregistrer");
    await expect(page.getByRole("heading", { name: "Quel producteur ?" })).toBeVisible();
    await context.setOffline(true);
    await expect(syncChip(page)).toHaveAttribute("data-sync-state", "OFFLINE");

    const stamp = Date.now().toString(36).toUpperCase();
    const lastName = `Testhors${stamp}`;

    // A1 : nouveau producteur.
    await page.getByRole("button", { name: "Nouveau producteur" }).click();
    await page.getByLabel("Prénom").fill("Adjoa");
    await page.getByLabel("Nom", { exact: true }).fill(lastName);
    await page.getByRole("button", { name: "Femme" }).click();
    await page.getByRole("button", { name: "Continuer" }).click();

    // A2 : position saisie à la main, commune déduite sur l'appareil.
    await expect(
      page.getByRole("heading", { name: "Où se trouve l'exploitation ?" }),
    ).toBeVisible();
    await enterManualPosition(page, "9,70", "1,67");
    await expect(page.getByText("Djougou (Donga)")).toBeVisible();
    await expect(page.getByText("Depuis votre position")).toBeVisible();
    await page.getByRole("button", { name: "Continuer" }).click();

    // A3 : superficie et faire-valoir.
    await expect(page.getByRole("heading", { name: "Quelle taille ?" })).toBeVisible();
    await page.getByLabel("Superficie totale").fill("2,5");
    await page.getByRole("button", { name: "Terre familiale" }).click();
    await page.getByRole("button", { name: "Continuer" }).click();

    // A4 : sans parcelle pour l'instant.
    await expect(page.getByRole("heading", { name: "Les parcelles" })).toBeVisible();
    await page.getByRole("button", { name: "Sans parcelle pour l'instant" }).click();

    // A5 : une culture proposée pour la zone.
    await expect(page.getByRole("heading", { name: "Quelles cultures ?" })).toBeVisible();
    await page.getByRole("group").first().getByRole("button").first().click();
    await page.getByRole("button", { name: "Continuer" }).click();

    // A6 : consentement puis enregistrement local.
    await expect(page.getByRole("heading", { name: "Vérifiez et enregistrez" })).toBeVisible();
    await expect(page.getByText(`Adjoa ${lastName}`)).toBeVisible();
    await page.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Enregistrer" }).click();

    // A7 : code provisoire et file en attente.
    await expect(page.getByText("Exploitation enregistrée sur cet appareil")).toBeVisible();
    await expect(page.getByText(new RegExp(`${DJOUGOU_CODE}-L[0-9A-F]{6}`))).toBeVisible();
    await expect(syncChip(page)).toContainText(/à envoyer/);

    // Retour du réseau : la file part seule, puis le producteur apparaît côté serveur.
    await context.setOffline(false);
    await waitForSync(page);

    // La liste est rendue par le serveur : sous charge (suite complète en parallèle), on recharge
    // jusqu'à voir le producteur, dans une limite de 20 s.
    await expect(async () => {
      await page.goto(`/agent/exploitations?q=${encodeURIComponent(lastName)}`);
      await expect(page.getByText(`Adjoa ${lastName}`).first()).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 20_000 });

    await page.goto("/agent/synchronisation");
    await expect(page.getByText("Nouvelle exploitation").first()).toBeVisible();
    await expect(page.getByText("Enregistrée", { exact: true }).first()).toBeVisible();
  });

  test("visite de vérification : l'exploitation passe en vérifiée sur le terrain", async ({
    page,
  }, testInfo) => {
    // Une seule visite par exécution : deux profils en parallèle se disputeraient la même fiche.
    test.skip(testInfo.project.name !== "desktop", "profil desktop uniquement");
    test.slow();
    await signInByPhone(page, AGENT);
    await page.goto("/agent/verification");
    const first = page.locator('a[href^="/agent/verification/"]').first();
    await expect(first).toBeVisible();
    await first.click();
    await page.waitForURL(/\/agent\/verification\/[0-9a-f-]{36}$/);
    const farmId = page.url().split("/").pop() ?? "";

    await page.getByRole("button", { name: "Oui, identité confirmée" }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await enterManualPosition(page, "9,70", "1,67");
    await page.getByRole("button", { name: "Continuer" }).click();
    await page
      .getByRole("group", { name: "Issue de la visite" })
      .getByRole("button", { name: /^Confirmée/ })
      .click();
    await page.getByRole("button", { name: "Valider la visite" }).click();
    await expect(page.getByText("Visite enregistrée")).toBeVisible();

    await waitForSync(page);
    await page.goto(`/agent/exploitations/${farmId}`);
    await expect(page.getByText("Vérifiée sur le terrain").first()).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("espace agricultrice", () => {
  test("déclare une récolte en trois questions et la retrouve dans l'historique", async ({
    page,
  }) => {
    await signInByPhone(page, FARMER);
    await expect(page).toHaveURL(/\/agriculteur$/);
    // Le seed rattache l'agricultrice de démonstration à une exploitation de Djougou.
    await expect(page.getByText("Mon exploitation", { exact: true })).toBeVisible();

    await page.getByRole("link", { name: "Déclarer ma récolte" }).click();
    await page.waitForURL(/\/agriculteur\/recolte$/);
    await expect(
      page.getByRole("heading", { name: "Quelle culture avez-vous récoltée ?" }),
    ).toBeVisible();
    await page.getByRole("group").first().getByRole("button").first().click();
    await page.getByRole("button", { name: "C'est celle-ci" }).click();

    await expect(page.getByRole("heading", { name: /^Combien de/ })).toBeVisible();
    await page.getByLabel("Quantité récoltée").fill("8");
    await page.getByRole("button", { name: "Continuer" }).click();

    await page.getByRole("button", { name: "Enregistrer ma récolte" }).click();
    await expect(page.getByText("Merci, votre récolte est enregistrée.")).toBeVisible({
      timeout: 15_000,
    });

    await page.goto("/agriculteur/historique");
    await expect(page.getByText("Récolte déclarée").first()).toBeVisible();
  });
});

test.describe("périmètre des données", () => {
  test("les points d'exploitations et la liste sont réservés aux comptes connectés", async ({
    request,
  }) => {
    const anonymousTile = await request.get(DJOUGOU_TILE);
    expect(anonymousTile.status()).toBe(204);
    const anonymousList = await request.get("/api/v1/registry/farms");
    expect(anonymousList.status()).toBe(401);
  });

  test("un agent ne voit que les exploitations de sa commune", async ({ page }) => {
    await signInByPhone(page, AGENT);
    const response = await page.request.get("/api/v1/registry/farms?limit=200");
    expect(response.status()).toBe(200);
    const body = (await response.json()) as { items: Array<{ commune: { code: string } }> };
    expect(body.items.length).toBeGreaterThan(0);
    for (const item of body.items) expect(item.commune.code).toBe(DJOUGOU_CODE);
    const tile = await page.request.get(DJOUGOU_TILE);
    expect([200, 204]).toContain(tile.status());
  });
});
