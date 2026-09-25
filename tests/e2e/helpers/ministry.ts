import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect, type Page, type TestInfo } from "@playwright/test";
import { STATE_DIR } from "../clean-db";
import { msUntilNextStep, totp } from "./totp";

// Connexion à l'espace ministère pour les tests de bout en bout : un compte ADMIN_STATE jetable par
// profil (desktop, mobile), créé et doté de la double authentification une seule fois par le
// globalSetup (activation par l'interface, clé de saisie manuelle lue à l'écran), supprimé par le
// globalTeardown. Les tests ne font que répondre au défi TOTP avec la clé enregistrée.
// Réutilisable par tous les parcours du pilotage (alertes, règles, tableau de bord) ; les describe
// qui l'utilisent se déclarent en série pour ne pas consommer deux fois le même code.

export const MINISTRY_TEST_PASSWORD = "E2e-Bais-Ministere-2026!";

export function ministryEmailFor(projectName: string): string {
  return `e2e-ministere-${projectName}@e2e.bais.invalid`;
}

const secretFile = (project: string) => join(STATE_DIR, `totp-${project}.txt`);
// Dernier pas TOTP consommé pour le profil : better-auth peut refuser un code déjà utilisé.
const lastStepFile = (project: string) => join(STATE_DIR, `totp-${project}.last-step`);

const currentStep = () => Math.floor(Date.now() / 30_000);

async function submitInstitutionForm(page: Page, email: string) {
  await page.goto("/connexion/institution");
  await page.getByLabel("Adresse e-mail professionnelle").fill(email);
  await page.getByLabel("Mot de passe").fill(MINISTRY_TEST_PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => url.pathname !== "/connexion/institution", { timeout: 20_000 });
}

/**
 * Active la double authentification du compte de test d'un profil, par l'interface, et enregistre
 * la clé. Appelé une fois par profil depuis le globalSetup, dans un navigateur à part.
 */
export async function activateMinistryTwoFactor(baseURL: string, project: string) {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext({ baseURL })).newPage();
    await submitInstitutionForm(page, ministryEmailFor(project));
    await page.goto("/compte/securite?obligatoire=1");
    await page.getByLabel("Confirmez votre mot de passe").fill(MINISTRY_TEST_PASSWORD);
    await page.getByRole("button", { name: "Continuer" }).click();
    const manual = page.getByText("Saisie manuelle").locator("code");
    await expect(manual).toBeVisible({ timeout: 20_000 });
    const secret = ((await manual.textContent()) ?? "").trim();
    if (!/^[A-Z2-7]+=*$/.test(secret)) throw new Error(`Clé TOTP illisible : « ${secret} »`);
    await page.getByLabel("Chiffre 1 sur 6").fill(totp(secret));
    // Écran 3 : l'activation est confirmée quand le champ de code disparaît.
    await expect(page.getByRole("button", { name: "Activer" })).toBeHidden({ timeout: 20_000 });
    writeFileSync(secretFile(project), secret);
    writeFileSync(lastStepFile(project), String(currentStep()));
  } finally {
    await browser.close();
  }
}

async function answerChallenge(page: Page, project: string, secret: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const last = existsSync(lastStepFile(project))
      ? Number(readFileSync(lastStepFile(project), "utf8"))
      : -1;
    if (currentStep() <= last) await page.waitForTimeout(msUntilNextStep() + 300);
    await page.getByLabel("Chiffre 1 sur 6").fill(totp(secret));
    const accepted = await page
      .waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    writeFileSync(lastStepFile(project), String(currentStep()));
    if (accepted) return;
  }
  throw new Error("Défi TOTP refusé deux fois");
}

/**
 * Connecte la page au compte ministère de test du profil courant, double authentification
 * comprise, puis ouvre `path` (par défaut le centre de pilotage).
 */
export async function signInAsMinistry(page: Page, testInfo: TestInfo, path = "/pilotage") {
  const project = testInfo.project.name;
  if (!existsSync(secretFile(project))) {
    throw new Error(
      `Compte ministère de test sans double authentification pour « ${project} » : le globalSetup a échoué (voir sa sortie).`,
    );
  }
  const secret = readFileSync(secretFile(project), "utf8").trim();
  await submitInstitutionForm(page, ministryEmailFor(project));
  await expect(page).toHaveURL(/\/connexion\/institution\/verification/);
  await answerChallenge(page, project, secret);
  await page.goto(path);
  await expect(page).not.toHaveURL(/\/compte\/securite|\/connexion/);
}
