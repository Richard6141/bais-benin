import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect, type Page, type TestInfo } from "@playwright/test";
import { STATE_DIR } from "../clean-db";

// Sessions téléphone partagées. L'envoi de code est limité à 30 par 15 minutes et par adresse IP
// (limite voulue en production) : une connexion par OTP dans chaque test dépassait ce plafond sur
// la suite complète. Le globalSetup connecte donc une seule fois, par profil, l'agent et
// l'agricultrice de démonstration et enregistre leur état de navigateur ; les tests qui ne portent
// pas sur la connexion elle-même repartent de cet état. La vraie connexion par OTP reste testée
// dans authentication.spec.ts. Aucun test utilisant ces sessions ne doit se déconnecter : la
// déconnexion révoque la session côté serveur et casserait les tests suivants du profil.

const DEMO_CODE = process.env.OTP_DEMO_CODE ?? "246810";

export const PHONE_ACCOUNTS = {
  agent: { digits: "0190000001", home: "/agent" },
  farmer: { digits: "0190000002", home: "/agriculteur" },
} as const;

export type PhonePersona = keyof typeof PHONE_ACCOUNTS;

export const sessionFile = (project: string, persona: string) =>
  join(STATE_DIR, `session-${persona}-${project}.json`);

/** Connexion par OTP dans un navigateur à part, puis enregistrement de l'état. Pour le globalSetup. */
export async function savePhoneSession(baseURL: string, project: string, persona: PhonePersona) {
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ baseURL });
    const page = await context.newPage();
    await page.goto("/connexion");
    await page.getByLabel("Votre numéro de téléphone").fill(PHONE_ACCOUNTS[persona].digits);
    await page.getByRole("button", { name: "Recevoir mon code" }).click();
    await expect(page.getByText(/Code reçu au \+229/)).toBeVisible();
    await page.getByLabel("Chiffre 1 sur 6").fill(DEMO_CODE);
    await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 15_000 });
    await context.storageState({ path: sessionFile(project, persona) });
  } finally {
    await browser.close();
  }
}

/**
 * Reprend la session enregistrée du profil courant et ouvre `path` (par défaut l'accueil de
 * l'espace, là où arrive une connexion réelle). Remplace une connexion par OTP.
 */
export async function openAs(
  page: Page,
  testInfo: TestInfo,
  persona: PhonePersona,
  path: string = PHONE_ACCOUNTS[persona].home,
) {
  const file = sessionFile(testInfo.project.name, persona);
  if (!existsSync(file)) {
    throw new Error(
      `Session ${persona} absente pour « ${testInfo.project.name} » : le globalSetup a échoué (voir sa sortie).`,
    );
  }
  const state = JSON.parse(readFileSync(file, "utf8")) as {
    cookies: Parameters<ReturnType<Page["context"]>["addCookies"]>[0];
  };
  await page.context().addCookies(state.cookies);
  await page.goto(path);
  await expect(page).not.toHaveURL(/\/connexion/);
}
