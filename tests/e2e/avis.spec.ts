import { expect, test } from "@playwright/test";
import { openAs } from "./helpers/sessions";

// Avis des testeurs (chantier J), de bout en bout : une agricultrice donne son avis depuis le menu
// « Plus » de son espace (onglets sur ordinateur, barre basse sur téléphone), reçoit l'accusé de
// réception et revient à sa page ; le ministère retrouve l'avis dans /pilotage/avis. Le message
// porte le nom du profil pour que les deux profils ne se confondent pas.

test("une agricultrice donne son avis, le ministère le retrouve", async ({ page }, testInfo) => {
  const message = `Parcours de bout en bout sur ${testInfo.project.name} : la carte tarde à charger`;
  await openAs(page, testInfo, "farmer", "/agriculteur");

  await page
    .getByRole("navigation", { name: "Espace producteur" })
    .getByRole("button", { name: "Plus" })
    .click();
  // Ordinateur : un élément du menu déroulant. Téléphone : un bouton de la feuille du bas.
  await page
    .getByRole("menuitem", { name: "Donner mon avis" })
    .or(
      page
        .getByRole("dialog", { name: "Toutes les rubriques" })
        .getByRole("button", { name: "Donner mon avis" }),
    )
    .click();

  const dialog = page.getByRole("dialog", { name: "Donner mon avis" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "C'est difficile à comprendre" }).click();
  await dialog.getByRole("button", { name: "3 sur 5" }).click();
  await dialog.getByLabel("Votre message").fill(message);
  await dialog.getByRole("button", { name: "Envoyer" }).click();

  const thanks = page.getByRole("dialog", { name: "Merci, votre avis est bien reçu" });
  await expect(thanks).toBeVisible({ timeout: 20_000 });
  await thanks.getByRole("button", { name: "Revenir à la page" }).click();
  await expect(thanks).toBeHidden();
  await expect(page).toHaveURL(/\/agriculteur$/);

  await openAs(page, testInfo, "ministry", "/pilotage/avis?role=FARMER");
  const item = page.getByRole("listitem").filter({ hasText: message });
  await expect(item).toBeVisible();
  await expect(item.getByText("C'est difficile à comprendre")).toBeVisible();
  await expect(item.getByText("Note 3 sur 5")).toBeVisible();
});
