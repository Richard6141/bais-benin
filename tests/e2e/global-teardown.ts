import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { STARTED_AT_FILE, SNAPSHOT_FILE, cleanDisabled, runCleanScript } from "./clean-db";

// Après la suite : retire ce que les parcours ont créé depuis l'horodatage de début et restaure
// les exploitations visitées. Les comptes utilisés sont ceux de démonstration, semés et conservés
// d'une exécution à l'autre : aucun compte n'est supprimé. Un échec de nettoyage est signalé sans
// faire échouer la suite.
export default async function globalTeardown() {
  if (cleanDisabled() || !existsSync(STARTED_AT_FILE)) return;
  const since = (await readFile(STARTED_AT_FILE, "utf8")).trim();
  const args = ["clean", "--since", since];
  if (existsSync(SNAPSHOT_FILE)) args.push("--snapshot", SNAPSHOT_FILE);
  try {
    runCleanScript(args);
  } catch {
    console.warn("Nettoyage de la base de démonstration incomplet : lancez pnpm e2e:clean.");
  }
}
