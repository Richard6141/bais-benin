import { mkdir, writeFile } from "node:fs/promises";
import {
  STARTED_AT_FILE,
  STATE_DIR,
  SNAPSHOT_FILE,
  cleanDisabled,
  runCleanScript,
} from "./clean-db";

// Avant la suite : horodatage de début et instantané de l'état de vérification des exploitations,
// pour que le nettoyage final restaure exactement les exploitations visitées par les tests.
export default async function globalSetup() {
  if (cleanDisabled()) return;
  await mkdir(STATE_DIR, { recursive: true });
  // Une seconde de marge : l'horloge du serveur et celle du poste de test peuvent différer.
  await writeFile(STARTED_AT_FILE, new Date(Date.now() - 1000).toISOString());
  try {
    runCleanScript(["reset-rate-limits"]);
  } catch {
    console.warn("Limites de débit non remises à zéro : des connexions pourraient être refusées.");
  }
  try {
    runCleanScript(["snapshot", "--out", SNAPSHOT_FILE]);
  } catch {
    console.warn("Instantané impossible (base injoignable ?) : le nettoyage final sera partiel.");
  }
}
