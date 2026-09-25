import { expect, test, type TestInfo } from "@playwright/test";
import { signInAsMinistry } from "./helpers/ministry";

// Gouvernance des règles d'alerte (monitoring-parcours-ux §2.C4-C6) avec le compte ministère de
// démonstration, partagé par les deux profils (session du globalSetup, voir helpers/ministry.ts).
// Chaque exécution travaille sur sa propre règle pour ne jamais créer de versions concurrentes :
// les deux profils tournent en parallèle, et avec --repeat-each les répétitions d'un même profil
// aussi (deux workers). Le couple (profil, répétition) choisit une règle distincte parmi les six
// (jusqu'à trois répétitions). Deux éditions simultanées d'une même règle sont refusées par le
// contrôle de version (CONFLICT) : c'est voulu, et ce test ne doit pas les provoquer. Les versions
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

interface EditedRule {
  code: string;
  name: string;
  /** Libellé du seuil modifié, et valeur de référence (différente de la valeur par défaut). */
  threshold: string;
  value: string;
  /** Règle critique : la désactivation demande une confirmation explicite. */
  critical?: boolean;
}

const RULES: EditedRule[] = [
  {
    code: "HEAVY_RAIN_FORECAST",
    name: "Fortes pluies prévues",
    threshold: "Pluie prévue sur les 3 prochains jours",
    value: "70",
  },
  {
    code: "PEST_FALL_ARMYWORM",
    name: "Conditions favorables à la chenille légionnaire",
    threshold: "Cumul de pluie sur 7 jours",
    value: "12",
  },
  {
    code: "FLOOD_RISK",
    name: "Excès de pluie, risque d'inondation",
    threshold: "Cumul de pluie sur 3 jours",
    value: "110",
  },
  {
    code: "HEAT_MAIZE_FLOWERING",
    name: "Vague de chaleur sur maïs en croissance",
    threshold: "Température maximale la plus haute sur 3 jours",
    value: "37",
  },
  {
    code: "WATER_STRESS_EARLY",
    name: "Poche de sécheresse après semis",
    threshold: "Jours secs consécutifs",
    value: "12",
  },
  {
    code: "WATER_STRESS_SEVERE",
    name: "Stress hydrique sévère",
    threshold: "Jours secs consécutifs",
    value: "18",
    critical: true,
  },
];

/** Règle propre au couple (profil, répétition) : ordinateur 0, 2, 4 ; mobile 1, 3, 5. */
function ruleFor(testInfo: TestInfo): EditedRule {
  const project = testInfo.project.name === "mobile" ? 1 : 0;
  return RULES[(testInfo.repeatEachIndex * 2 + project) % RULES.length]!;
}

test.describe("gouvernance des règles d'alerte", () => {
  // Les deux parcours touchent la même règle : ils s'enchaînent au lieu de se croiser.
  test.describe.configure({ mode: "serial" });
  // Simulation sur 30 jours et 77 communes, puis enregistrement : parcours long.
  test.setTimeout(180_000);

  test("liste les six règles, désactive puis réactive une règle", async ({ page }, testInfo) => {
    const rule = ruleFor(testInfo);
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
    if (rule.critical) await dialog.getByRole("checkbox").check();
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
    const rule = ruleFor(testInfo);
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
    // Nouvelle valeur toujours différente de la valeur en place : le test reste valable s'il est
    // rejoué avant le nettoyage de fin de suite (--repeat-each), la version précédente ayant déjà
    // pris la valeur de référence.
    const current = Number((await threshold.inputValue()).replace(",", "."));
    const target = String(
      current === Number(rule.value) ? Number(rule.value) + 5 : Number(rule.value),
    );
    await threshold.fill("-5");
    await expect(page.getByText(/hors des limites/)).toBeVisible();
    await expect(
      page.getByRole("button", { name: `Enregistrer la version ${version + 1}` }),
    ).toBeDisabled();
    await threshold.fill(target);
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
    await expect(page.getByLabel(rule.threshold, { exact: true })).toHaveValue(target);
    const versions = page.getByRole("table").filter({ hasText: "Créée le" });
    await expect(versions.getByRole("row")).toHaveCount(version + 2);
    await expect(page.getByText("Nouvelle version").first()).toBeVisible();
  });
});
