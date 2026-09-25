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
  // Premier lancement de l'espace agent : référentiel et exploitations mis en cache local.
  async downloadOfflineData(page) {
    await page.goto(`${baseUrl}/agent/premier-lancement`);
    await page.getByRole("button", { name: "Télécharger" }).click();
    await page.getByRole("status").filter({ hasText: "Terminé" }).waitFor({ timeout: 30_000 });
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
  "etape-5": [
    {
      name: "agent-accueil-desktop",
      context: desktop,
      prepare: async (page) => {
        await actions.phoneSignIn(page, "0190000001");
        await actions.phoneVerify(page);
      },
    },
    {
      name: "agent-enregistrer-mobile",
      context: mobile,
      prepare: async (page) => {
        await actions.phoneSignIn(page, "0190000001");
        await actions.phoneVerify(page);
        await actions.downloadOfflineData(page);
        // Écran A2 : position déjà saisie, commune déduite sur l'appareil.
        await page.goto(`${baseUrl}/agent/enregistrer`);
        await page.getByRole("heading", { name: "Quel producteur ?" }).waitFor();
        await page.getByRole("button", { name: "Nouveau producteur" }).click();
        await page.getByLabel("Prénom").fill("Adjoa");
        await page.getByLabel("Nom", { exact: true }).fill("Hounkpatin");
        await page.getByRole("button", { name: "Femme" }).click();
        await page.getByRole("button", { name: "Continuer" }).click();
        await page.getByRole("button", { name: "Saisir la position à la main" }).click();
        await page.getByLabel("Latitude").fill("9,70");
        await page.getByLabel("Longitude").fill("1,67");
        await page.getByRole("button", { name: "Utiliser ces coordonnées" }).click();
        await page.getByText("Djougou (Donga)").waitFor();
      },
    },
    {
      name: "agent-fiche-desktop",
      context: desktop,
      prepare: async (page) => {
        await actions.phoneSignIn(page, "0190000001");
        await actions.phoneVerify(page);
        await page.goto(`${baseUrl}/agent/exploitations`);
        await page.locator('a[href^="/agent/exploitations/"]').first().click();
        await page.getByRole("tab", { name: "Résumé" }).waitFor();
        await page.waitForLoadState("networkidle");
      },
    },
    {
      name: "agent-verification-mobile",
      context: mobile,
      prepare: async (page) => {
        await actions.phoneSignIn(page, "0190000001");
        await actions.phoneVerify(page);
        await page.goto(`${baseUrl}/agent/verification`);
        await page.waitForLoadState("networkidle");
      },
    },
    {
      name: "agriculteur-accueil-mobile",
      context: mobile,
      prepare: async (page) => {
        await actions.phoneSignIn(page, "0190000002");
        await actions.phoneVerify(page);
      },
    },
    {
      name: "agriculteur-recolte-mobile",
      context: mobile,
      prepare: async (page) => {
        await actions.phoneSignIn(page, "0190000002");
        await actions.phoneVerify(page);
        // Écran C2 : la culture est choisie, la quantité reste à saisir.
        await page.goto(`${baseUrl}/agriculteur/recolte`);
        await page.getByRole("heading", { name: "Quelle culture avez-vous récoltée ?" }).waitFor();
        await page.getByRole("group").first().getByRole("button").first().click();
        await page.getByRole("button", { name: "C'est celle-ci" }).click();
        await page.getByLabel("Quantité récoltée").waitFor();
      },
    },
    {
      name: "synchronisation-desktop",
      context: desktop,
      prepare: async (page) => {
        await actions.phoneSignIn(page, "0190000001");
        await actions.phoneVerify(page);
        await page.goto(`${baseUrl}/agent/synchronisation`);
        await page.waitForLoadState("networkidle");
      },
    },
  ],
  "etape-0": [
    { name: "accueil-desktop", path: "/", context: desktop },
    { name: "accueil-mobile", path: "/", context: mobile },
    { name: "hors-connexion-mobile", path: "/hors-ligne", context: mobile },
  ],
  "etape-1": [
    { name: "design-system-desktop", path: "/design-system", context: desktop },
    { name: "design-system-desktop-sombre", path: "/design-system", context: desktop, dark: true },
    { name: "design-system-mobile", path: "/design-system", context: mobile },
    { name: "accueil-sombre", path: "/", context: desktop, dark: true },
  ],
  "etape-4": [
    {
      name: "carte-nationale-desktop",
      context: desktop,
      fullPage: false,
      prepare: async (page) => {
        await page.goto(`${baseUrl}/carte`);
        await page.getByText("Pour ces filtres").waitFor({ timeout: 20_000 });
        await page.locator('[data-map-idle="true"]').waitFor({ timeout: 30_000 });
        await page.waitForTimeout(500);
      },
    },
    {
      name: "carte-mais-donga-desktop",
      context: desktop,
      fullPage: false,
      prepare: async (page) => {
        await page.goto(
          `${baseUrl}/carte?cropCode=MAIZE&departementCode=BJ-DO&metric=verifiedShare`,
        );
        await page.getByText("Pour ces filtres").waitFor({ timeout: 20_000 });
        await page.locator('[data-map-idle="true"]').waitFor({ timeout: 30_000 });
        await page.waitForTimeout(500);
      },
    },
    {
      name: "carte-mobile",
      context: mobile,
      fullPage: false,
      prepare: async (page) => {
        await page.goto(`${baseUrl}/carte`);
        await page.getByText("Pour ces filtres").waitFor({ timeout: 20_000 });
        await page.locator('[data-map-idle="true"]').waitFor({ timeout: 30_000 });
        await page.waitForTimeout(500);
      },
    },
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
  // Une page pleine hauteur redimensionne la fenêtre au moment de la capture, ce qui vide le
  // tampon WebGL de la carte : les écrans cartographiques sont capturés à la taille de la fenêtre.
  await page.screenshot({ path: file, fullPage: target.fullPage ?? true });
  console.log(file);
  await context.close();
}

await browser.close();
