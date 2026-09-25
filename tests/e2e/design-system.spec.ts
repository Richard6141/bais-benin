import { expect, test } from "@playwright/test";

const sectionIds = [
  "jetons",
  "pictogrammes",
  "boutons",
  "formulaires",
  "superpositions",
  "retours",
  "donnees",
  "tableau-de-bord",
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
    await expect(page.locator("section#donnees").getByRole("table")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Parcelles" })).toBeVisible();
    await expect(page.getByRole("alert").first()).toBeVisible();
    await expect(page.locator("[data-reliability]")).toHaveCount(11);
    await expect(page.locator("[data-confidence]")).toHaveCount(4);
    await expect(page.locator("section#pictogrammes svg[role='img']")).toHaveCount(3 + 21 * 2);
  });

  test("montre les composants du tableau de bord et le secret statistique", async ({ page }) => {
    await page.goto("/design-system#tableau-de-bord");
    const section = page.locator("section#tableau-de-bord");
    await expect(
      section.getByRole("list", { name: "Production déclarée par culture (démonstration)" }),
    ).toBeVisible();
    const table = section.getByRole("table");
    const header = table.getByRole("columnheader", { name: /Exploitations/ });
    await expect(header).toHaveAttribute("aria-sort", "descending");
    await header.getByRole("button").click();
    await expect(header).toHaveAttribute("aria-sort", "ascending");
    // La ligne masquée reste en bas et sans rang, quel que soit le sens du tri.
    await expect(table.locator("tbody tr").last()).toContainText("Ouaké");
    await expect(
      section.getByRole("button", { name: /moins de 5\. Secret statistique/ }).first(),
    ).toBeVisible();
    await expect(
      section.getByRole("button", { name: "Imprimer ou enregistrer en PDF" }),
    ).toBeVisible();
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
