import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, expect, type Page, type TestInfo } from "@playwright/test";
import { demoAccount } from "@/lib/auth/demo-accounts";
import { STATE_DIR } from "../clean-db";

// Sessions partagées. L'envoi de code est limité à 30 par 15 minutes et par adresse IP (limite
// voulue en production) : une connexion complète (NPI, numéro puis code) dans chaque test
// dépassait ce plafond sur la suite complète. Le globalSetup connecte donc une seule fois, par
// profil, chacun des comptes de démonstration ci-dessous et enregistre leur état de navigateur ;
// les tests qui ne portent pas sur la connexion elle-même repartent de cet état. La vraie
// connexion reste testée dans authentication.spec.ts. Aucun test utilisant ces sessions ne doit
// se déconnecter : la déconnexion révoque la session côté serveur et casserait les tests suivants
// du profil.

const DEMO_CODE = process.env.OTP_DEMO_CODE ?? "246810";

// NPI et numéro viennent de la liste des comptes de démonstration semés (lib/auth/demo-accounts),
// seule source de vérité ; `home` est l'accueil de l'espace, là où arrive une connexion réelle.
function persona(key: string, home: string) {
  const account = demoAccount(key);
  return { npi: account.npi, digits: account.phoneDigits, home };
}

export const PHONE_ACCOUNTS = {
  agent: persona("agent-djougou", "/agent"),
  farmer: persona("agricultrice-djougou", "/agriculteur"),
  // Le ministère se connecte comme tout le monde depuis ADR-0012 : plus de compte jetable ni de
  // double authentification par application, le compte semé sert à tous les profils.
  ministry: persona("ministere", "/pilotage"),
  cooperative: persona("cooperative", "/cooperative"),
};

export type PhonePersona = keyof typeof PHONE_ACCOUNTS;

export const sessionFile = (project: string, persona: string) =>
  join(STATE_DIR, `session-${persona}-${project}.json`);

/**
 * Connexion complète (NPI et numéro, puis code de démonstration) dans un navigateur à part, puis
 * enregistrement de l'état. Pour le globalSetup.
 */
export async function savePhoneSession(baseURL: string, project: string, persona: PhonePersona) {
  const account = PHONE_ACCOUNTS[persona];
  const browser = await chromium.launch();
  try {
    // Deux tentatives, délais larges : hors du contexte d'un test, expect() attend 5 s par
    // défaut, trop court pour la première compilation d'une route sur un serveur de développement.
    for (let attempt = 1; ; attempt += 1) {
      const context = await browser.newContext({ baseURL });
      try {
        const page = await context.newPage();
        await page.goto("/connexion");
        await page.getByLabel("Votre NPI", { exact: true }).fill(account.npi);
        await page.getByLabel("Votre téléphone", { exact: true }).fill(account.digits);
        await page.getByRole("button", { name: "Recevoir mon code sur WhatsApp" }).click();
        await expect(page.getByText(/Code reçu sur WhatsApp au \+229/)).toBeVisible({
          timeout: 20_000,
        });
        await page.getByLabel("Chiffre 1 sur 6").fill(DEMO_CODE);
        // Le passage par /apres-connexion est une redirection : on attend l'espace du rôle.
        await page.waitForURL((url) => url.pathname.startsWith(account.home), {
          timeout: 20_000,
        });
        await context.storageState({ path: sessionFile(project, persona) });
        return;
      } catch (error) {
        if (attempt >= 2) throw error;
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

/**
 * Reprend la session enregistrée du profil courant et ouvre `path` (par défaut l'accueil de
 * l'espace, là où arrive une connexion réelle). Remplace une connexion complète par code.
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
