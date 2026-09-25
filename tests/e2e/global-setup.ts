import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { FullConfig } from "@playwright/test";
import {
  STARTED_AT_FILE,
  STATE_DIR,
  SNAPSHOT_FILE,
  cleanDisabled,
  runCleanScript,
} from "./clean-db";
import { PHONE_ACCOUNTS, savePhoneSession, type PhonePersona } from "./helpers/sessions";

// Avant la suite : horodatage de début et instantané de l'état de vérification des exploitations,
// pour que le nettoyage final restaure exactement les exploitations visitées par les tests ; puis
// une session par profil pour chaque compte de démonstration, ministère compris (ADR-0012 : tous
// les rôles se connectent par NPI et code WhatsApp, sans compte jetable ni double authentification).
export default async function globalSetup(config: FullConfig) {
  await mkdir(STATE_DIR, { recursive: true });
  // Sessions d'une exécution précédente : elles sont recréées à chaque exécution.
  for (const file of await readdir(STATE_DIR)) {
    if (file.startsWith("session-")) await rm(join(STATE_DIR, file), { force: true });
  }

  // Les limites de débit d'abord : l'enregistrement des sessions ci-dessous envoie des codes.
  if (!cleanDisabled()) {
    try {
      runCleanScript(["reset-rate-limits"]);
    } catch {
      console.warn(
        "Limites de débit non remises à zéro : des connexions pourraient être refusées.",
      );
    }
  }

  // Une connexion par profil et par persona, au lieu d'une par test (limite d'envoi de codes).
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

  if (cleanDisabled()) return;
  // Une seconde de marge : l'horloge du serveur et celle du poste de test peuvent différer.
  await writeFile(STARTED_AT_FILE, new Date(Date.now() - 1000).toISOString());
  try {
    runCleanScript(["snapshot", "--out", SNAPSHOT_FILE]);
  } catch {
    console.warn("Instantané impossible (base injoignable ?) : le nettoyage final sera partiel.");
  }
}
