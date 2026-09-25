import { expect, test, type Page } from "@playwright/test";
import { signInAsMinistry } from "./helpers/ministry";
import { openAs } from "./helpers/sessions";

// Assistant agricole (étape 8) avec l'adaptateur de démonstration (sans clé de modèle) : les
// réponses recopient des passages de fiches et portent la mention « démonstration ». Les
// conversations de la suite sont retirées par le nettoyage final. Peu de questions par test :
// l'assistant accepte 20 questions par heure et par utilisateur.

async function expectNoHorizontalScroll(page: Page) {
  const fits = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(fits).toBe(true);
}

const answerTo = (page: Page, question: string) =>
  page.getByRole("article", { name: `Réponse à : ${question}` });

test.describe("assistant, espace agricultrice", () => {
  test.setTimeout(90_000);

  test("pose une suggestion, lit la réponse sourcée, donne son avis et passe la main", async ({
    page,
  }, testInfo) => {
    await openAs(page, testInfo, "farmer");
    await page.getByRole("link", { name: /Poser une question à l'assistant/ }).click();
    await page.waitForURL(/\/agriculteur\/assistant$/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Poser une question");

    const suggestions = page.getByRole("list", { name: "Questions suggérées" }).getByRole("button");
    await expect(suggestions).toHaveCount(3);
    const question = (await suggestions.first().textContent())?.trim() ?? "";
    await suggestions.first().click();

    const answer = answerTo(page, question);
    await expect(answer).toBeVisible({ timeout: 30_000 });
    await expect(answer).toHaveAttribute("data-outcome", "ANSWERED");
    await expect(answer.getByText("Données de démonstration")).toBeVisible();
    await expect(answer.getByText(/^Confiance : /)).toBeVisible();
    // Sources repliées, puis dépliées : extraits cités mot pour mot.
    await answer.getByText(/sources? citées?$/).click();
    await expect(
      answer.getByRole("list", { name: "Sources citées" }).locator("blockquote").first(),
    ).toBeVisible();
    await expect(answer.getByRole("button", { name: "Écouter" })).toBeVisible();

    await answer.getByRole("button", { name: "Pas utile" }).click();
    await answer.getByLabel("Pas clair").check();
    await answer.getByRole("button", { name: "Envoyer" }).click();
    await expect(answer.getByText(/Merci, votre avis/)).toBeVisible();

    await answer.getByRole("button", { name: "Demander à mon agent" }).click();
    await expect(answer.getByRole("status").filter({ hasText: /agent|ATDA/ })).toBeVisible();
    await expectNoHorizontalScroll(page);
  });

  test("dit quand elle ne sait pas, sans sources, et limite la question à 500 caractères", async ({
    page,
  }, testInfo) => {
    await openAs(page, testInfo, "farmer", "/agriculteur/assistant");
    const field = page.getByLabel("Votre question");
    await field.fill("a".repeat(501));
    await expect(page.getByText("1 caractères de trop (500 au plus)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Envoyer" })).toBeDisabled();

    const question = "Qui a gagné la dernière coupe du monde de football ?";
    await field.fill(question);
    await page.getByRole("button", { name: "Envoyer" }).click();
    const answer = answerTo(page, question);
    await expect(answer).toBeVisible({ timeout: 30_000 });
    await expect(answer).not.toHaveAttribute("data-outcome", "ANSWERED");
    await expect(answer.getByText(/sources? citées?$/)).toHaveCount(0);
    await expect(
      answer.getByText(
        /Je ne dispose pas d'une information fiable|Je réponds seulement aux questions/,
      ),
    ).toBeVisible();
  });
});

test.describe("assistant, espace agent", () => {
  test.setTimeout(90_000);

  test("répond pour une exploitation de son périmètre et prépare un texte court", async ({
    page,
  }, testInfo) => {
    await openAs(page, testInfo, "agent", "/agent/exploitations");
    await page.locator('a[href^="/agent/exploitations/"]').first().click();
    await page.getByRole("link", { name: "Poser une question" }).click();
    await page.waitForURL(/\/agent\/assistant\?exploitation=BJ-/);
    const code = new URL(page.url()).searchParams.get("exploitation") ?? "";
    await expect(page.getByRole("combobox")).toContainText(code);

    const question = "Comment lutter contre la chenille légionnaire sur le maïs ?";
    await page.getByLabel("Votre question").fill(question);
    await page.getByRole("button", { name: "Envoyer" }).click();
    const answer = answerTo(page, question);
    await expect(answer).toBeVisible({ timeout: 30_000 });
    await expect(answer.getByText(`Pour l'exploitation ${code}`)).toBeVisible();
    // Le contexte envoyé ne contient jamais de téléphone.
    await expect(answer.getByText(/\+229/)).toHaveCount(0);
    if ((await answer.getAttribute("data-outcome")) === "ANSWERED") {
      await expect(answer.getByRole("button", { name: /Copier pour le producteur/ })).toBeVisible();
    }
    await expect(page.getByRole("heading", { name: "Demandes des producteurs" })).toBeVisible();

    await page.getByRole("link", { name: "Journal de mes communes" }).click();
    await page.waitForURL(/\/agent\/assistant\/journal/);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Journal de mes communes");
    await expectNoHorizontalScroll(page);
  });
});

test.describe("assistant, ministère", () => {
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120_000);

  test("affiche un indicateur sourcé, jamais un chiffre du modèle, et le journal", async ({
    page,
  }, testInfo) => {
    await signInAsMinistry(page, testInfo, "/pilotage/assistant");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Assistant d'analyse");

    const registry = "Combien d'exploitations sont enregistrées dans le registre ?";
    await page.getByLabel("Votre question").fill(registry);
    await page.getByRole("button", { name: "Envoyer" }).click();
    const block = answerTo(page, registry).getByRole("region", { name: /Registre national/ });
    await expect(block).toBeVisible({ timeout: 30_000 });
    await expect(block.getByText("Exploitations", { exact: true })).toBeVisible();
    await expect(block.getByText(/^Source : registre BAIS/).first()).toBeVisible();
    await expect(block.getByRole("link", { name: "Ouvrir dans le tableau de bord" })).toBeVisible();

    // Indicateurs du tableau de bord (étape 7) : pas encore branchés dans cette branche.
    const production = "Quelle est la production déclarée de maïs ?";
    await page.getByLabel("Votre question").fill(production);
    await page.getByRole("button", { name: "Envoyer" }).click();
    await expect(answerTo(page, production)).toBeVisible({ timeout: 30_000 });

    await page.getByRole("link", { name: "Journal des conversations" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Journal des conversations");
    await page.getByRole("link", { name: "Sans réponse fiable" }).click();
    await expect(page).toHaveURL(/issue=LOW_CONFIDENCE/);
  });
});

test.describe("assistant, accès", () => {
  test("un visiteur anonyme est renvoyé vers la connexion", async ({ page }) => {
    await page.goto("/agriculteur/assistant");
    await expect(page).toHaveURL(/\/connexion/);
  });

  test("une agricultrice n'accède ni à l'assistant du ministère ni au journal", async ({
    page,
  }, testInfo) => {
    await openAs(page, testInfo, "farmer");
    await page.goto("/pilotage/assistant/journal");
    await expect(page).toHaveURL(/\/acces-refuse/);
    const journal = await page.request.get("/api/v1/assistant/journal");
    expect(journal.status()).toBe(403);
  });
});
