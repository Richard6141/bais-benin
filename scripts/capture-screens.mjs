import { mkdir } from "node:fs/promises";
import { chromium, devices } from "@playwright/test";

// Captures d'écran de vérification manuelle, jointes au rapport de fin d'étape.
// Usage : le serveur doit tourner (pnpm start), puis : node scripts/capture-screens.mjs <etape>
// Exemple : node scripts/capture-screens.mjs etape-1

const step = process.argv[2] ?? "capture";
const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const outputDir = `docs/rapports/captures/${step}`;

const desktop = { viewport: { width: 1440, height: 900 } };
const mobile = { ...devices["Pixel 7"] };

// Chaque étape déclare ses écrans ; `dark` bascule le thème via le bouton de l'en-tête.
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
  await page.goto(`${baseUrl}${target.path}`, { waitUntil: "networkidle" });
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
