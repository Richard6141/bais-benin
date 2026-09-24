import { mkdir } from "node:fs/promises";
import { chromium, devices } from "@playwright/test";

// Captures d'écran de vérification manuelle, jointes au rapport de fin d'étape.
// Usage : le serveur doit tourner (pnpm start), puis : node scripts/capture-screens.mjs <etape>
// Exemple : node scripts/capture-screens.mjs etape-0

const step = process.argv[2] ?? "capture";
const baseUrl = process.env.APP_URL ?? "http://localhost:3000";
const outputDir = `docs/rapports/captures/${step}`;

const targets = [
  { name: "accueil-desktop", path: "/", viewport: { width: 1440, height: 900 } },
  { name: "accueil-mobile", path: "/", device: devices["Pixel 7"] },
  { name: "hors-connexion-mobile", path: "/~offline", device: devices["Pixel 7"] },
];

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch();

for (const target of targets) {
  const context = await browser.newContext(
    target.device ? { ...target.device } : { viewport: target.viewport },
  );
  const page = await context.newPage();
  await page.goto(`${baseUrl}${target.path}`, { waitUntil: "networkidle" });
  const file = `${outputDir}/${target.name}.png`;
  await page.screenshot({ path: file, fullPage: true });
  console.log(file);
  await context.close();
}

await browser.close();
