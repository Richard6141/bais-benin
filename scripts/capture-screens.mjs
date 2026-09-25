import { mkdir } from "node:fs/promises";
import { chromium, devices } from "@playwright/test";
import { cleanupMinistryAccount, ministrySignIn } from "./capture-ministry.mjs";

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
  // Parcours A1-A7 hors ligne, puis retour du réseau et attente de la puce « À jour ».
  async enrolOffline(page, lastName) {
    await actions.downloadOfflineData(page);
    await page.goto(`${baseUrl}/agent/enregistrer`);
    await page.getByRole("heading", { name: "Quel producteur ?" }).waitFor();
    await page.context().setOffline(true);
    await page.getByRole("button", { name: "Nouveau producteur" }).click();
    await page.getByLabel("Prénom").fill("Adjoa");
    await page.getByLabel("Nom", { exact: true }).fill(lastName);
    await page.getByRole("button", { name: "Femme" }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.getByRole("button", { name: "Saisir la position à la main" }).click();
    await page.getByLabel("Latitude").fill("9,70");
    await page.getByLabel("Longitude").fill("1,67");
    await page.getByRole("button", { name: "Utiliser ces coordonnées" }).click();
    await page.getByText("Djougou (Donga)").waitFor();
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.getByLabel("Superficie totale").fill("2,5");
    await page.getByRole("button", { name: "Terre familiale" }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.getByRole("button", { name: "Sans parcelle pour l'instant" }).click();
    await page.getByRole("group").first().getByRole("button").first().click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.getByRole("checkbox").click();
    await page.getByRole("button", { name: "Enregistrer" }).click();
    await page.getByText("Exploitation enregistrée sur cet appareil").waitFor();
    await page.context().setOffline(false);
    const chip = page.locator("[data-sync-state]").first();
    await chip.getByRole("button", { name: "Synchroniser maintenant" }).click();
    await page.locator('[data-sync-state="UP_TO_DATE"]').first().waitFor({ timeout: 30_000 });
  },
  async institutionSignIn(page, email) {
    await page.goto(`${baseUrl}/connexion/institution`);
    await page.getByLabel("Adresse e-mail professionnelle").fill(email);
    await page.getByLabel("Mot de passe").fill(demoPassword);
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL((url) => !url.pathname.startsWith("/connexion"), { timeout: 15_000 });
    await page.waitForLoadState("networkidle");
  },
  // Espace ministère, double authentification comprise (compte jetable, voir capture-ministry.mjs).
  ministrySignIn: (page, path) => ministrySignIn(page, baseUrl, path),
  // Carte peinte : la capture se fait à la taille de la fenêtre (voir la boucle plus bas).
  async waitForMap(page) {
    await page.locator('[data-map-idle="true"]').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(500);
  },
};

// Chaque étape déclare ses écrans ; `dark` bascule le thème, `print` rend la feuille d'impression,
// `prepare` joue un parcours avant la capture.
const plans = {
  // Tableau de bord national : compte ministère jetable, double authentification comprise.
  "etape-7": [
    {
      name: "pilotage-national-desktop",
      context: desktop,
      fullPage: false,
      prepare: (page) => actions.ministrySignIn(page, "/pilotage"),
    },
    {
      name: "pilotage-production-desktop",
      context: desktop,
      fullPage: false,
      prepare: async (page) => {
        await actions.ministrySignIn(page, "/pilotage");
        await page.locator("#production").evaluate((section) => section.scrollIntoView());
        await page.waitForTimeout(1200);
      },
    },
    {
      name: "pilotage-carte-desktop",
      context: desktop,
      fullPage: false,
      prepare: async (page) => {
        await actions.ministrySignIn(page, "/pilotage");
        await page.locator("#carte").evaluate((section) => section.scrollIntoView());
        await actions.waitForMap(page);
        await page.waitForTimeout(700);
      },
    },
    {
      name: "pilotage-territoires-desktop",
      context: desktop,
      prepare: (page) => actions.ministrySignIn(page, "/pilotage/territoires"),
    },
    {
      name: "pilotage-communes-donga-desktop",
      context: desktop,
      prepare: (page) =>
        actions.ministrySignIn(page, "/pilotage/territoires?departementCode=BJ-DO"),
    },
    {
      name: "pilotage-commune-fiche-desktop",
      context: desktop,
      prepare: (page) => actions.ministrySignIn(page, "/pilotage/communes/BJ-DON-003"),
    },
    {
      name: "pilotage-qualite-desktop",
      context: desktop,
      prepare: (page) => actions.ministrySignIn(page, "/pilotage/qualite"),
    },
    {
      name: "pilotage-fiche-impression",
      context: desktop,
      // Rendu de la feuille d'impression (A4) : sans navigation, en-tête ni commandes.
      print: true,
      prepare: (page) => actions.ministrySignIn(page, "/pilotage/fiche"),
    },
    {
      name: "pilotage-national-mobile",
      context: mobile,
      fullPage: false,
      prepare: async (page) => {
        await actions.ministrySignIn(page, "/pilotage");
        // Les listes de filtres affichent leur valeur une fois hydratées.
        await page
          .getByLabel("Campagne")
          .first()
          .filter({ hasText: /\d{4}-\d{4}/ })
          .waitFor();
      },
    },
    {
      name: "agent-tableau-de-bord-desktop",
      context: desktop,
      prepare: async (page) => {
        await actions.phoneSignIn(page, "0190000001");
        await actions.phoneVerify(page);
        await page.goto(`${baseUrl}/agent/tableau-de-bord`, { waitUntil: "networkidle" });
      },
    },
    {
      name: "agent-tableau-de-bord-mobile",
      context: mobile,
      fullPage: false,
      prepare: async (page) => {
        await actions.phoneSignIn(page, "0190000001");
        await actions.phoneVerify(page);
        await page.goto(`${baseUrl}/agent/tableau-de-bord`, { waitUntil: "networkidle" });
        await page.waitForTimeout(800);
      },
    },
    {
      name: "cooperative-desktop",
      context: desktop,
      prepare: async (page) => {
        await actions.institutionSignIn(page, "cooperative@bais.demo");
        await page.goto(`${baseUrl}/cooperative`, { waitUntil: "networkidle" });
      },
    },
    {
      name: "design-system-tableau-de-bord-mobile",
      context: mobile,
      fullPage: false,
      prepare: async (page) => {
        await page.goto(`${baseUrl}/design-system#tableau-de-bord`, { waitUntil: "networkidle" });
        // Défilement vers l'ancre puis glissement de l'en-tête collant : on attend la fin.
        await page.waitForTimeout(1500);
      },
    },
  ],
  "etape-6": [
    {
      name: "agriculteur-alertes-mobile",
      context: mobile,
      prepare: async (page) => {
        await actions.phoneSignIn(page, "0190000002");
        await actions.phoneVerify(page);
        await page.goto(`${baseUrl}/agriculteur/alertes`, { waitUntil: "networkidle" });
      },
    },
    {
      name: "agriculteur-alerte-fiche-mobile",
      context: mobile,
      fullPage: false,
      prepare: async (page) => {
        await actions.phoneSignIn(page, "0190000002");
        await actions.phoneVerify(page);
        await page.goto(`${baseUrl}/agriculteur/alertes`, { waitUntil: "networkidle" });
        await page.locator('a[href^="/agriculteur/alertes/"]').first().click();
        await page.waitForURL(/\/agriculteur\/alertes\/.+/);
        await page.waitForLoadState("networkidle");
      },
    },
    {
      name: "agriculteur-meteo-mobile",
      context: mobile,
      prepare: async (page) => {
        await actions.phoneSignIn(page, "0190000002");
        await actions.phoneVerify(page);
        await page.goto(`${baseUrl}/agriculteur/meteo`, { waitUntil: "networkidle" });
      },
    },
    {
      name: "agent-alertes-desktop",
      context: desktop,
      prepare: async (page) => {
        await actions.phoneSignIn(page, "0190000001");
        await actions.phoneVerify(page);
        await page.goto(`${baseUrl}/agent/alertes`, { waitUntil: "networkidle" });
      },
    },
    {
      name: "agent-alerte-fiche-desktop",
      context: desktop,
      prepare: async (page) => {
        await actions.phoneSignIn(page, "0190000001");
        await actions.phoneVerify(page);
        await page.goto(`${baseUrl}/agent/alertes`, { waitUntil: "networkidle" });
        await page.locator('a[href^="/agent/alertes/"]').first().click();
        await page.waitForURL(/\/agent\/alertes\/.+/);
        await page.waitForLoadState("networkidle");
      },
    },
    {
      name: "agent-alerte-fiche-mobile",
      context: mobile,
      // Fenêtre seule : résumé chiffré, filtre par village et début de la liste paginée.
      fullPage: false,
      prepare: async (page) => {
        await actions.phoneSignIn(page, "0190000001");
        await actions.phoneVerify(page);
        await page.goto(`${baseUrl}/agent/alertes`, { waitUntil: "networkidle" });
        await page.locator('a[href^="/agent/alertes/"]').first().click();
        await page.waitForURL(/\/agent\/alertes\/.+/);
        await page.waitForLoadState("networkidle");
        await page.locator("#exploitations").evaluate((section) => section.scrollIntoView());
        // L'en-tête collant glisse en place après le défilement : on attend la fin de l'animation.
        await page.waitForTimeout(1200);
      },
    },
    {
      name: "pilotage-alertes-desktop",
      context: desktop,
      fullPage: false,
      prepare: async (page) => {
        await actions.ministrySignIn(page, "/pilotage/alertes");
        await actions.waitForMap(page);
      },
    },
    {
      name: "pilotage-alerte-fiche-desktop",
      context: desktop,
      prepare: async (page) => {
        await actions.ministrySignIn(page, "/pilotage/alertes");
        await page.getByRole("list", { name: "Alertes actives" }).getByRole("link").first().click();
        await page.waitForURL(/\/pilotage\/alertes\/.+/);
        await page.getByText("Conditions de la règle").first().waitFor();
        await page.waitForLoadState("networkidle");
      },
    },
    {
      name: "pilotage-regles-desktop",
      context: desktop,
      prepare: (page) => actions.ministrySignIn(page, "/pilotage/regles"),
    },
    {
      name: "pilotage-regle-fiche-desktop",
      context: desktop,
      prepare: async (page) => {
        await actions.ministrySignIn(page, "/pilotage/regles");
        await page.locator('main a[href^="/pilotage/regles/"]').first().click();
        await page.waitForURL(/\/pilotage\/regles\/.+/);
        await page.getByText("Conditions actuelles").waitFor();
        // Simulation en lecture seule sur les seuils actuels : aucune alerte, aucun message.
        await page.getByRole("button", { name: "Simuler sur 30 jours" }).click();
        await page.getByRole("heading", { name: /^Simulation/ }).waitFor({ timeout: 120_000 });
        await page.waitForTimeout(300);
      },
    },
    {
      name: "design-system-monitoring-desktop",
      path: "/design-system#monitoring",
      context: desktop,
    },
  ],
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
      // La barre d'action est fixée en bas d'écran : une capture pleine page la placerait au milieu.
      fullPage: false,
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
        // Le bouton s'anime en passant à l'état actif : on attend la fin de la transition.
        await page.locator("footer button:enabled", { hasText: "Continuer" }).waitFor();
        await page.waitForTimeout(400);
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
      // La file compte des dizaines de lignes : la hauteur d'écran suffit à montrer le rendu.
      fullPage: false,
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
        // La file est propre à l'appareil : un enregistrement complet hors ligne puis synchronisé
        // la remplit de lignes « Enregistrée ». Le producteur porte le préfixe « Testhors » pour
        // être retiré ensuite par pnpm e2e:clean.
        await actions.enrolOffline(page, `TesthorsCapture${Date.now().toString(36).toUpperCase()}`);
        await page.goto(`${baseUrl}/agent/synchronisation`);
        await page.getByText("Enregistrée", { exact: true }).first().waitFor({ timeout: 15_000 });
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

// Troisième argument facultatif : ne refaire que certains écrans, séparés par des virgules
// (`node scripts/capture-screens.mjs etape-5 agent-fiche-desktop,agent-accueil-desktop`).
const only = process.argv[3]?.split(",");
const targets = plans[step]?.filter((target) => !only || only.includes(target.name));
if (!targets) {
  console.error(`Étape inconnue : ${step}. Étapes disponibles : ${Object.keys(plans).join(", ")}`);
  process.exit(1);
}

await mkdir(outputDir, { recursive: true });
const browser = await chromium.launch();

// Le compte ministère jetable est supprimé même si une capture échoue.
try {
  for (const target of targets) {
    // Le service worker précache en arrière-plan et empêche l'état « réseau au repos » :
    // inutile pour une capture, il est bloqué.
    const context = await browser.newContext({ ...target.context, serviceWorkers: "block" });
    const page = await context.newPage();
    if (target.prepare) {
      await target.prepare(page);
    } else {
      await page.goto(`${baseUrl}${target.path}`, { waitUntil: "networkidle" });
    }
    if (target.print) {
      await page.emulateMedia({ media: "print" });
      await page.waitForTimeout(200);
    }
    if (target.dark) {
      await page.getByRole("button", { name: "Passer au thème sombre" }).click();
      await page.waitForTimeout(300);
    }
    const file = `${outputDir}/${target.name}.png`;
    // Une page pleine hauteur redimensionne la fenêtre au moment de la capture, ce qui vide le
    // tampon WebGL de la carte : les écrans cartographiques sont capturés à la taille de la fenêtre.
    const fullPage = target.fullPage ?? true;
    // Pleine page après un défilement (clic en bas de page) : l'en-tête collant serait dessiné au
    // milieu de l'image. On remonte en haut avant la capture.
    if (fullPage) {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
    }
    await page.screenshot({ path: file, fullPage });
    console.log(file);
    await context.close();
  }
} finally {
  await browser.close();
  cleanupMinistryAccount();
}
