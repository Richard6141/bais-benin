// Connexion des comptes de démonstration pour les captures d'écran (ADR-0012) : tous les rôles,
// ministère compris, se connectent par leur NPI et le numéro relié, puis le code de démonstration
// OTP_DEMO_CODE. Ni compte jetable, ni mot de passe, ni double authentification par application.
//
// Copie de src/lib/auth/demo-accounts.ts (source de vérité, semée par le seed) : ce script est
// lancé par node sans chargeur TypeScript et ne peut pas l'importer. À tenir alignée.
export const DEMO_ACCOUNTS = {
  agent: { npi: "1000000000001", phoneDigits: "0190000001" },
  farmer: { npi: "1000000000002", phoneDigits: "0190000002" },
  ministry: { npi: "1000000000003", phoneDigits: "0190000003" },
  cooperative: { npi: "1000000000004", phoneDigits: "0190000004" },
  buyer: { npi: "1000000000005", phoneDigits: "0190000005" },
};

const demoCode = process.env.OTP_DEMO_CODE ?? "246810";

/** NPI du compte de démonstration relié à ce numéro national. */
function npiFor(phoneDigits) {
  const account = Object.values(DEMO_ACCOUNTS).find((a) => a.phoneDigits === phoneDigits);
  if (!account) throw new Error(`Aucun compte de démonstration pour le numéro ${phoneDigits}`);
  return account.npi;
}

/** Premier écran : NPI et numéro, puis attente de l'écran du code. */
export async function requestDemoCode(page, baseUrl, phoneDigits) {
  await page.goto(`${baseUrl}/connexion`);
  // « Votre NPI » est aussi la fin du libellé du numéro : correspondance exacte.
  await page.getByLabel("Votre NPI", { exact: true }).fill(npiFor(phoneDigits));
  await page.getByLabel("Numéro de téléphone relié à votre NPI").fill(phoneDigits);
  await page.getByRole("button", { name: "Recevoir mon code sur WhatsApp" }).click();
  await page.getByText(/Code reçu sur WhatsApp au \+229/).waitFor();
}

/** Second écran : code de démonstration, puis attente de l'espace du rôle. */
export async function enterDemoCode(page) {
  await page.getByLabel("Chiffre 1 sur 6").fill(demoCode);
  await page.waitForURL((url) => !/^\/(connexion|apres-connexion)/.test(url.pathname), {
    timeout: 15_000,
  });
  await page.waitForLoadState("networkidle");
}

// Cookies de la session ministère, réutilisés d'un écran à l'autre (chaque écran a son propre
// contexte de navigateur) : un seul envoi de code pour toutes les captures du pilotage, au lieu
// d'un par écran, sous la limite de 30 envois par 15 minutes et par adresse IP.
let ministryCookies = null;

/** Ouvre `path` connecté au compte ministère de démonstration. */
export async function ministrySignIn(page, baseUrl, path) {
  if (ministryCookies) {
    await page.context().addCookies(ministryCookies);
  } else {
    await requestDemoCode(page, baseUrl, DEMO_ACCOUNTS.ministry.phoneDigits);
    await enterDemoCode(page);
    ministryCookies = await page.context().cookies();
  }
  await page.goto(`${baseUrl}${path}`, { waitUntil: "networkidle" });
  if (/^\/(connexion|acces-refuse)/.test(new URL(page.url()).pathname)) {
    throw new Error(`Accès ministère refusé, page obtenue : ${page.url()}`);
  }
}
