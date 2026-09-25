import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  STARTED_AT_FILE,
  SNAPSHOT_FILE,
  accountsDisabled,
  cleanDisabled,
  runAccountsScript,
  runCleanScript,
} from "./clean-db";

// Après la suite : retire ce que les parcours ont créé depuis l'horodatage de début, restaure les
// exploitations visitées et supprime les comptes ministère jetables (sessions, 2FA et rôles en
// cascade ; le journal d'audit, en ajout seul, garde ses lignes avec un acteur nul). Un échec de
// nettoyage est signalé sans faire échouer la suite.
export default async function globalTeardown() {
  if (!accountsDisabled()) {
    try {
      runAccountsScript(["delete"]);
    } catch {
      console.warn("Comptes ministère de test non supprimés : tsx scripts/e2e-accounts.ts delete.");
    }
  }
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
