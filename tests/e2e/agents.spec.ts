import { expect, test } from "@playwright/test";
import { signInAsMinistry } from "./helpers/ministry";
import { openAs } from "./helpers/sessions";

// Page « Agents » du pilotage (ADR-0013), en lecture seule : le ministère voit l'agent de
// démonstration, son périmètre et le formulaire d'ouverture ; un agent n'y entre pas. Les gestes
// (ouvrir, réaffecter, retirer) sont couverts par tests/integration/agent-management.test.ts.

test.describe("gestion des agents", () => {
  test("le ministère voit ses agents, leur périmètre et le formulaire d'ouverture", async ({
    page,
  }, testInfo) => {
    test.slow();
    await signInAsMinistry(page, testInfo, "/pilotage/agents");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Agents de terrain");

    const card = page.getByRole("listitem").filter({ hasText: "+229 01 90 00 00 01" });
    await expect(card).toBeVisible();
    await expect(card.getByRole("list", { name: /Périmètre de/ })).toContainText("Djougou");
    await expect(card.getByRole("button", { name: "Changer le périmètre" })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Ouvrir un compte d'agent" })).toBeVisible();
    await expect(page.getByLabel("NPI", { exact: true })).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Département" })).toBeVisible();

    const noHorizontalScroll = await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    );
    expect(noHorizontalScroll).toBe(true);
  });

  test("un agent n'a pas accès à la gestion des agents", async ({ page }, testInfo) => {
    await openAs(page, testInfo, "agent", "/pilotage/agents");
    await expect(page).toHaveURL(/\/acces-refuse$/);
  });
});
