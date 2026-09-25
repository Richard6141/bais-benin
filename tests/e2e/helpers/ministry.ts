import type { Page, TestInfo } from "@playwright/test";
import { openAs } from "./sessions";

// Connexion à l'espace ministère pour les tests de bout en bout. Depuis ADR-0012, le ministère se
// connecte comme tous les rôles (NPI, numéro relié, code WhatsApp) : ni compte jetable, ni double
// authentification par application. Le compte ministère de démonstration est connecté une fois
// par profil (desktop, mobile) par le globalSetup, et tous les parcours du pilotage (alertes,
// règles, tableau de bord, assistant) reprennent cette session au lieu de consommer un envoi de
// code à chaque test.

/**
 * Ouvre `path` (par défaut le centre de pilotage) avec la session ministère enregistrée pour le
 * profil courant.
 */
export async function signInAsMinistry(page: Page, testInfo: TestInfo, path = "/pilotage") {
  await openAs(page, testInfo, "ministry", path);
}
