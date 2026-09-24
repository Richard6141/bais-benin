import { mkdir } from "node:fs/promises";
import { chromium, devices } from "@playwright/test";

// Captures d'écran de vérification manuelle, jointes au rapport de fin d'étape.
// Usage : le serveur doit tourner (pnpm start), puis : node scripts/capture-screens.mjs <etape>
// Exemple : node scripts/capture-screens.mjs etape-3

const step = process.argv[2] ?? "capture";
const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const outputDir = `docs/rapports/captures/${step}`;
const demoCode = process.env.OTP_DEMO_CODE ?? "246810";
const demoPassword = process.env.DEMO_ACCOUNT_PASSWORD ?? "Demo-Bais-2026!";

const desktop = { viewport: { width: 1440, height: 900 } };
const mobile = { ...devices["Pixel 7"] };

// Actions de préparation réutilisables : connexion par téléphone ou institutionnelle.
const actions = {
  async phoneSignIn(page, nationalDigits) {
    await page.goto(`${baseUrl}/connexion`);
    await page.getByLabel("Votre numéro de téléphone").fill(nationalDigits);
    await page.getByRole("button", { name: "Recevoir mon code" }).click();
    await page.getByText(/Code reçu au \+229/).waitFor();
  },
  async phoneVerify(page) {
    await page.getByLabel("Chiffre 1 sur 6").fill(demoCode);
    await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 15_000 });
    await page.waitForLoadState("networkidle");
  },
  async institutionSignIn(page, email) {
    await page.goto(`${baseUrl}/connexion/institution`);
    await page.getByLabel("Adresse e-mail professionnelle").fill(email);
    await page.getByLabel("Mot de passe").fill(demoPassword);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 15_000 });
    await page.waitForLoadState("networkidle");
  },
};

// Chaque étape déclare ses écrans ; `dark` bascule le thème, `prepare` joue un parcours avant la capture.
const plans = {
  "etape-0": [
    { name: "accueil-desktop", path: "/", context: desktop },
    { name: "accueil-mobile", path: "/", context: mobile },
    { name: "hors-connexion-mobile", path: "/~offline", context: mobile },
  ],
  "etape-1": [
    { name: "design-system-desktop", path: "/design-system", context: desktop },
    { name: "design-system-desktop-sombre", path: "/design-system", context: desktop, dark: true },
    { name: "design-system-mobile", path: "/design-system", context: mobile },
    { name: "accueil-sombre", path: "/", context: desktop, dark: true },
  ],
  "etape-3": [
    { name: "connexion-telephone-mobile", path: "/connexion", context: mobile },
    {
      name: "connexion-code-mobile",
      context: mobile,
      prepare: (page) => actions.phoneSignIn(page, "0190000002"),
    },
    {
      name: "espace-agriculteur-mobile",
      context: mobile,
      prepare: async (page) => {
        await actions.phoneSignIn(page, "0190000002");
        await actions.phoneVerify(page);
      },
    },
    {
      name: "espace-agent-desktop",
      context: desktop,
      prepare: async (page) => {
        await actions.phoneSignIn(page, "0190000001");
        await actions.phoneVerify(page);
      },
    },
    {
      name: "compte-desktop",
      context: desktop,
      prepare: async (page) => {
        await actions.phoneSignIn(page, "0190000002");
        await actions.phoneVerify(page);
        await page.goto(`${baseUrl}/compte`);
        await page.waitForLoadState("networkidle");
      },
    },
    { name: "connexion-institution-desktop", path: "/connexion/institution", context: desktop },
    {
      name: "securite-obligatoire-desktop",
      context: desktop,
      prepare: (page) => actions.institutionSignIn(page, "ministere@bais.demo"),
    },
    {
      name: "acces-refuse-mobile",
      context: mobile,
      prepare: async (page) => {
        await actions.phoneSignIn(page, "0190000002");
        await actions.phoneVerify(page);
        await page.goto(`${baseUrl}/pilotage`);
        await page.waitForLoadState("networkidle");
      },
    },
  ],
};

const targets = plans[step];
if (!targets) {
  console.error(`Étape inconnue : ${step}. Étapes disponibles : ${Object.keys(plans).join(", ")}`);
  process.exit(1);
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch();

for (const target of targets) {
  const context = await browser.newContext(target.context);
  const page = await context.newPage();
  if (target.prepare) {
    await target.prepare(page);
  } else {
    await page.goto(`${baseUrl}${target.path}`, { waitUntil: "networkidle" });
  }
  if (target.dark) {
    await page.getByRole("button", { name: "Passer au thème sombre" }).click();
    await page.waitForTimeout(300);
  }
  const file = `${outputDir}/${target.name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(file);
  await context.close();
}

await browser.close();
