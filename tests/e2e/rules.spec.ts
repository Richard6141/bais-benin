import { expect, test } from "@playwright/test";
import { signInAsMinistry } from "./helpers/ministry";

// Gouvernance des règles d'alerte (monitoring-parcours-ux §2.C4-C6) avec le compte ministère
// jetable du profil (double authentification activée par l'interface, voir helpers/ministry.ts).
// Chaque profil travaille sur sa propre règle pour ne pas créer de versions concurrentes :
// « Fortes pluies prévues » sur ordinateur, « chenille légionnaire » sur mobile. Les versions
// créées ici et les activations modifiées sont annulées par le nettoyage d'après-suite
// (scripts/e2e-clean.ts, étape « règles »).

const DEFAULT_RULE_NAMES = [
  "Poche de sécheresse après semis",
  "Stress hydrique sévère",
  "Excès de pluie, risque d'inondation",
  "Vague de chaleur sur maïs en croissance",
  "Fortes pluies prévues",
  "Conditions favorables à la chenille légionnaire",
];

const RULE_BY_PROJECT: Record<
  string,
  { code: string; name: string; threshold: string; value: string }
> = {
  desktop: {
    code: "HEAVY_RAIN_FORECAST",
    name: "Fortes pluies prévues",
    threshold: "Pluie prévue sur les 3 prochains jours",
    value: "70",
  },
  mobile: {
    code: "PEST_FALL_ARMYWORM",
    name: "Conditions favorables à la chenille légionnaire",
    threshold: "Cumul de pluie sur 7 jours",
    value: "12",
  },
};

test.describe("gouvernance des règles d'alerte", () => {
  // Les deux parcours touchent la même règle du profil : ils s'enchaînent au lieu de se croiser.
  test.describe.configure({ mode: "serial" });
  // Simulation sur 30 jours et 77 communes, puis enregistrement : parcours long.
  test.setTimeout(180_000);

  test("liste les six règles, désactive puis réactive une règle", async ({ page }, testInfo) => {
    const rule = RULE_BY_PROJECT[testInfo.project.name] ?? RULE_BY_PROJECT.desktop!;
    await signInAsMinistry(page, testInfo, "/pilotage/regles");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Règles d'alerte");
    for (const name of DEFAULT_RULE_NAMES) {
      await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    }
    await expect(page.getByRole("link", { name: "Centre d'alertes" })).toBeVisible();

    const toggle = page.getByRole("switch", { name: `Désactiver la règle ${rule.name}` });
    await toggle.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading")).toContainText(rule.name);
    await dialog.getByLabel(/Motif/).fill("Vérification de bout en bout");
    await dialog.getByRole("button", { name: "Désactiver" }).click();
    await expect(dialog).toBeHidden();
    const reactivate = page.getByRole("switch", { name: `Activer la règle ${rule.name}` });
    await expect(reactivate).not.toBeChecked();
    await reactivate.click();
    await expect(
      page.getByRole("switch", { name: `Désactiver la règle ${rule.name}` }),
    ).toBeChecked();
  });

  test("modifie un seuil, simule sur 30 jours et enregistre une nouvelle version", async ({
    page,
  }, testInfo) => {
    const rule = RULE_BY_PROJECT[testInfo.project.name] ?? RULE_BY_PROJECT.desktop!;
    await signInAsMinistry(page, testInfo, "/pilotage/regles");
    await page.getByRole("link", { name: rule.name, exact: true }).click();
    await page.waitForURL(new RegExp(`/pilotage/regles/${rule.code}$`));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(rule.name);
    await expect(page.getByText("Conditions actuelles")).toBeVisible();

    const eyebrow = await page
      .getByText(new RegExp(`^Règle ${rule.code} · version \\d+$`))
      .textContent();
    const version = Number(eyebrow?.match(/version (\d+)$/)?.[1]);
    expect(version).toBeGreaterThanOrEqual(1);

    // Aperçu du message court : commune au nom le plus long et compteur sur 160.
    await expect(page.getByText(/^Aperçu pour /)).toBeVisible();
    await expect(page.getByText(/^\d+ \/ 160 caractères$/)).toBeVisible();

    const threshold = page.getByLabel(rule.threshold, { exact: true });
    await threshold.fill("-5");
    await expect(page.getByText(/hors des limites/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Enregistrer la version ${version + 1}` }),
    ).toBeDisabled();
    await threshold.fill(rule.value);
    await expect(page.getByText(/hors des limites/)).toBeHidden();

    await page.getByRole("button", { name: "Simuler sur 30 jours" }).click();
    await expect(
      page.getByRole("heading", { name: /^Simulation de la version modifiée/ }),
    ).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.getByText("Alertes qui auraient été levées")).toBeVisible();
    await expect(page.getByText(/Aucune alerte créée, aucun message envoyé\./)).toBeVisible();

    await page.getByLabel("Motif de la modification").fill("Parcours de bout en bout");
    await page.getByRole("button", { name: `Enregistrer la version ${version + 1}` }).click();
    await expect(page.getByText(`Version ${version + 1} enregistrée et activée.`)).toBeVisible({
      timeout: 30_000,
    });

    await page.reload();
    await expect(page.getByText(`Règle ${rule.code} · version ${version + 1}`)).toBeVisible();
    await expect(page.getByLabel(rule.threshold, { exact: true })).toHaveValue(rule.value);
    const versions = page.getByRole("table").filter({ hasText: "Créée le" });
    await expect(versions.getByRole("row")).toHaveCount(version + 2);
    await expect(page.getByText("Nouvelle version").first()).toBeVisible();
  });
});
