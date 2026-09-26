import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { TOURS, type TourRole, type TourStep } from "@/features/onboarding/steps";
import { openAs, type PhonePersona } from "./helpers/sessions";

// Parcours « Premiers pas » de chaque rôle (plan d'action, chantier A), joués de bout en bout avec
// les comptes de démonstration : l'accueil montre la carte, chaque étape ouvre son écran avec la
// bulle qui l'explique, la bulle mène à la suivante, et la carte se réduit une fois le tour fait.
// Lecture seule : aucune étape n'envoie de formulaire.
//
// Ces scénarios servent aussi à tourner la démonstration : BAIS_DEMO=1 les ralentit et les filme
// (vidéo dans test-results), par exemple :
//   BAIS_DEMO=1 pnpm exec playwright test premiers-pas --project=desktop

if (process.env.BAIS_DEMO === "1") {
  test.use({ video: "on", launchOptions: { slowMo: 700 } });
}

const SPACES: Record<TourRole, { persona: PhonePersona; home: string }> = {
  ministere: { persona: "ministry", home: "/pilotage" },
  agent: { persona: "agent", home: "/agent" },
  producteur: { persona: "farmer", home: "/agriculteur" },
};

/** La bulle de l'étape ouverte : son titre, puis le lien vers l'étape suivante. */
function bubble(page: Page) {
  return page.getByRole("region", { name: "Étape en cours" });
}

async function expectStep(page: Page, step: TourStep, index: number, total: number) {
  await expect(page).toHaveURL(new RegExp(`[?&]pas=${step.id}(&|$)`), { timeout: 20_000 });
  const current = bubble(page);
  await expect(current).toBeVisible();
  await expect(current.getByText(`Étape ${index + 1} sur ${total}`)).toBeVisible();
  await expect(current.getByRole("heading", { name: step.title })).toBeVisible();
}

async function walkTour(page: Page, testInfo: TestInfo, role: TourRole) {
  const steps = TOURS[role];
  const { persona, home } = SPACES[role];
  await openAs(page, testInfo, persona, home);

  // L'accueil montre la carte des premiers pas, rien encore de fait hors de l'accueil lui-même.
  const card = page.getByRole("region", { name: "Premiers pas" });
  await expect(card).toBeVisible();
  await expect(card.getByRole("progressbar")).toBeVisible();

  // Compte de démonstration : le bandeau propose le scénario suivant.
  await expect(page.getByRole("complementary", { name: "Démonstration" })).toBeVisible();

  // Première étape depuis la carte, puis de bulle en bulle.
  await card.getByRole("link", { name: new RegExp(`^${steps[0]!.title}`) }).click();
  for (const [index, step] of steps.entries()) {
    await expectStep(page, step, index, steps.length);
    const following = steps[index + 1];
    if (following) {
      await bubble(page)
        .getByRole("link", { name: `Étape suivante : ${following.title}` })
        .click();
    } else {
      await bubble(page).getByRole("button", { name: "Terminer le parcours" }).click();
      await expect(bubble(page)).toBeHidden();
    }
  }

  // Retour à l'accueil : le parcours est fait, la carte se réduit à une ligne.
  await page.goto(home);
  await expect(page.getByText(/Premiers pas terminés/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Recommencer le parcours" })).toBeVisible();
}

test.describe("premiers pas", () => {
  test.setTimeout(180_000);

  test("ministère : de la situation du jour à la fiche imprimable", async ({ page }, testInfo) => {
    await walkTour(page, testInfo, "ministere");
  });

  test("agent : de la préparation hors ligne à la synchronisation", async ({ page }, testInfo) => {
    await walkTour(page, testInfo, "agent");
  });

  test("producteur : de ses champs à son attestation", async ({ page }, testInfo) => {
    await walkTour(page, testInfo, "producteur");
  });

  test("la bulle se ferme sans perdre la progression", async ({ page }, testInfo) => {
    const steps = TOURS.producteur;
    await openAs(page, testInfo, "farmer", `${steps[1]!.href}?pas=${steps[1]!.id}`);
    await expectStep(page, steps[1]!, 1, steps.length);
    await bubble(page).getByRole("button", { name: "Fermer les premiers pas" }).click();
    await expect(bubble(page)).toBeHidden();
    await expect(page).not.toHaveURL(/pas=/);

    await page.goto("/agriculteur");
    const card = page.getByRole("region", { name: "Premiers pas" });
    await expect(
      card.getByRole("link", { name: new RegExp(`^${steps[1]!.title}, fait`) }),
    ).toBeVisible();
  });
});
