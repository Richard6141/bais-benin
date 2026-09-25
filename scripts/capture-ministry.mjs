import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { join } from "node:path";

// Connexion à l'espace ministère pour les captures d'écran. Le compte de démonstration
// ministere@bais.demo n'a pas de double authentification et doit rester ainsi : on crée un compte
// ADMIN_STATE jetable du domaine réservé @e2e.bais.invalid (scripts/e2e-accounts.ts), on active la
// double authentification par l'interface, puis on le supprime à la fin (appeler `cleanup` dans un
// finally). Même mécanisme que tests/e2e/helpers/ministry.ts, porté ici en JavaScript.

const EMAIL = "e2e-ministere-captures@e2e.bais.invalid";
const PASSWORD = "E2e-Bais-Captures-2026!";
const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
const accountsScript = join(process.cwd(), "scripts", "e2e-accounts.ts");

function runAccounts(args) {
  execFileSync(process.execPath, [tsxCli, accountsScript, ...args], { stdio: "inherit" });
}

// --- TOTP (RFC 6238, HMAC-SHA1, 6 chiffres, pas de 30 s), mêmes réglages que le greffon twoFactor.

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32Decode(input) {
  const clean = input.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error(`Caractère base 32 invalide : ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

function totp(secret, timeMs = Date.now()) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(Math.floor(timeMs / 30_000)));
  const digest = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code =
    ((digest[offset] & 0x7f) << 24) |
    (digest[offset + 1] << 16) |
    (digest[offset + 2] << 8) |
    digest[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

const currentStep = () => Math.floor(Date.now() / 30_000);

// --- État du script : compte créé, clé, dernier pas consommé, session réutilisée entre écrans.

const state = { created: false, secret: null, lastStep: -1, cookies: null };

async function submitInstitutionForm(page, baseUrl) {
  await page.goto(`${baseUrl}/connexion/institution`);
  await page.getByLabel("Adresse e-mail professionnelle").fill(EMAIL);
  await page.getByLabel("Mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => url.pathname !== "/connexion/institution", { timeout: 20_000 });
}

// Better-auth refuse un code déjà consommé : on attend le pas suivant si besoin.
async function fillFreshCode(page) {
  if (currentStep() <= state.lastStep) {
    await page.waitForTimeout(30_000 - (Date.now() % 30_000) + 300);
  }
  await page.getByLabel("Chiffre 1 sur 6").fill(totp(state.secret));
  state.lastStep = currentStep();
}

async function activateTwoFactor(page, baseUrl) {
  runAccounts([
    "create",
    "--email",
    EMAIL,
    "--password",
    PASSWORD,
    "--name",
    "Ministère (captures)",
  ]);
  state.created = true;
  await submitInstitutionForm(page, baseUrl);
  await page.goto(`${baseUrl}/compte/securite?obligatoire=1`);
  await page.getByLabel("Confirmez votre mot de passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Continuer" }).click();
  const manual = page.getByText("Saisie manuelle").locator("code");
  await manual.waitFor({ timeout: 20_000 });
  const secret = ((await manual.textContent()) ?? "").trim();
  if (!/^[A-Z2-7]+=*$/.test(secret)) throw new Error(`Clé TOTP illisible : « ${secret} »`);
  state.secret = secret;
  // Pendant la vérification, « Activer » devient « Vérification… » : attendre sa disparition
  // validait avant la réponse du serveur. On attend l'écran de confirmation, et on retente une
  // fois au pas suivant si le code est refusé.
  const done = page.getByText("Double authentification activée");
  const refused = page.getByText(/Code refusé/);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) state.lastStep = currentStep();
    await fillFreshCode(page);
    await done.or(refused).first().waitFor({ timeout: 20_000 });
    if (await done.isVisible()) return;
  }
  throw new Error("Activation de la double authentification refusée deux fois");
}

/**
 * Ouvre `path` connecté au compte ministère. Le premier appel crée le compte, active la double
 * authentification puis répond au défi ; les suivants réutilisent les cookies de session, sans
 * nouveau code (chaque écran a son propre contexte de navigateur).
 */
export async function ministrySignIn(page, baseUrl, path) {
  if (state.cookies) {
    await page.context().addCookies(state.cookies);
  } else {
    if (!state.secret) await activateTwoFactor(page, baseUrl);
    // Connexion complète, défi compris, dans une session neuve : c'est le parcours réel.
    await page.context().clearCookies();
    await submitInstitutionForm(page, baseUrl);
    if (!page.url().includes("/connexion/institution/verification")) {
      throw new Error(`Défi de double authentification attendu, page obtenue : ${page.url()}`);
    }
    await fillFreshCode(page);
    await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 15_000 });
    state.cookies = await page.context().cookies();
  }
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  if (/\/compte\/securite|\/connexion/.test(new URL(page.url()).pathname)) {
    throw new Error(`Accès ministère refusé, page obtenue : ${page.url()}`);
  }
}

/** Supprime le compte de captures s'il a été créé. À appeler dans un finally. */
export function cleanupMinistryAccount() {
  if (!state.created) return;
  try {
    runAccounts(["delete", "--email", EMAIL]);
  } catch {
    console.warn(`Compte ${EMAIL} non supprimé : lancer tsx scripts/e2e-accounts.ts delete`);
  }
}
