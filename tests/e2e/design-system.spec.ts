import { expect, test } from "@playwright/test";

const sectionIds = [
  "jetons",
  "pictogrammes",
  "boutons",
  "formulaires",
  "superpositions",
  "retours",
  "donnees",
];

test.describe("page design system", () => {
  test("présente toutes les sections et les composants attendus", async ({ page }) => {
    await page.goto("/design-system");
    await expect(page.getByRole("heading", { level: 1, name: "Design system" })).toBeVisible();

    for (const id of sectionIds) {
      await expect(page.locator(`section#${id}`)).toBeVisible();
    }

    await expect(page.getByRole("button", { name: "Enregistrer" }).first()).toBeVisible();
    await expect(page.getByLabel("Nom de l'exploitation")).toBeVisible();
    await expect(page.getByRole("table")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Parcelles" })).toBeVisible();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.locator("[data-reliability]")).toHaveCount(11);
    await expect(page.locator("[data-confidence]")).toHaveCount(4);
    await expect(page.locator("section#pictogrammes svg[role='img']")).toHaveCount(3 + 21 * 2);
  });

  test("ouvre et ferme la modale de confirmation", async ({ page }) => {
    await page.goto("/design-system");
    await page.getByRole("button", { name: "Archiver l'exploitation" }).click();
    const dialog = page.getByRole("dialog", { name: "Archiver cette exploitation ?" });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Annuler" }).click();
    await expect(dialog).toBeHidden();
  });

  test("change d'onglet au clic", async ({ page }) => {
    await page.goto("/design-system");
    await page.getByRole("tab", { name: "Cultures" }).click();
    await expect(page.getByText("Maïs et niébé")).toBeVisible();
  });

  test("bascule le thème sombre", async ({ page }) => {
    await page.goto("/design-system");
    await page.getByRole("button", { name: "Passer au thème sombre" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("button", { name: "Passer au thème clair" }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("valide le formulaire de démonstration", async ({ page }) => {
    await page.goto("/design-system");
    await page.getByRole("button", { name: "Enregistrer la déclaration" }).click();
    await expect(page.getByText("Choisissez une culture")).toBeVisible();
  });

  test("n'a pas de défilement horizontal sur mobile", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "mobile", "profil mobile uniquement");
    await page.goto("/design-system");
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
    );
    expect(overflow).toBe(false);
  });
});
