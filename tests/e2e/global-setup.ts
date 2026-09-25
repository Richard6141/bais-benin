import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FullConfig } from "@playwright/test";
import {
  STARTED_AT_FILE,
  STATE_DIR,
  SNAPSHOT_FILE,
  accountsDisabled,
  cleanDisabled,
  runAccountsScript,
  runCleanScript,
} from "./clean-db";
import {
  MINISTRY_TEST_PASSWORD,
  activateMinistryTwoFactor,
  ministryEmailFor,
} from "./helpers/ministry";
import { PHONE_ACCOUNTS, savePhoneSession, type PhonePersona } from "./helpers/sessions";

// Avant la suite : horodatage de début et instantané de l'état de vérification des exploitations,
// pour que le nettoyage final restaure exactement les exploitations visitées par les tests ; puis
// un compte ministère jetable par profil, double authentification activée par l'interface.
export default async function globalSetup(config: FullConfig) {
  await mkdir(STATE_DIR, { recursive: true });
  // Les clés TOTP d'une exécution précédente ne valent plus : les comptes sont recréés.
  for (const file of await readdir(STATE_DIR)) {
    if (file.startsWith("totp-") || file.startsWith("session-"))
      await rm(join(STATE_DIR, file), { force: true });
  }

  // Les limites de débit d'abord : l'activation de la double authentification ci-dessous se connecte.
  if (!cleanDisabled()) {
    try {
      runCleanScript(["reset-rate-limits"]);
    } catch {
      console.warn(
        "Limites de débit non remises à zéro : des connexions pourraient être refusées.",
      );
    }
  }

  // Une connexion par OTP par profil et par persona, au lieu d'une par test (limite d'envoi).
  for (const project of config.projects) {
    const baseURL = project.use.baseURL ?? config.webServer?.url ?? "http://localhost:3000";
    for (const persona of Object.keys(PHONE_ACCOUNTS) as PhonePersona[]) {
      try {
        await savePhoneSession(baseURL, project.name, persona);
      } catch (error) {
        console.warn(
          `Session ${persona} non enregistrée pour ${project.name} : ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (!accountsDisabled()) {
    for (const project of config.projects) {
      try {
        runAccountsScript([
          "create",
          "--email",
          ministryEmailFor(project.name),
          "--password",
          MINISTRY_TEST_PASSWORD,
          "--name",
          `Ministère (test ${project.name})`,
        ]);
        // Activation de la double authentification une seule fois par profil, par l'interface :
        // les tests ne font ensuite que répondre au défi, sans course entre tests parallèles.
        const baseURL = project.use.baseURL ?? config.webServer?.url ?? "http://localhost:3000";
        await activateMinistryTwoFactor(baseURL, project.name);
      } catch (error) {
        console.warn(
          `Compte ministère de test incomplet pour ${project.name} : ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  if (cleanDisabled()) return;
  // Une seconde de marge : l'horloge du serveur et celle du poste de test peuvent différer.
  await writeFile(STARTED_AT_FILE, new Date(Date.now() - 1000).toISOString());
  try {
    runCleanScript(["snapshot", "--out", SNAPSHOT_FILE]);
  } catch {
    console.warn("Instantané impossible (base injoignable ?) : le nettoyage final sera partiel.");
  }
}
