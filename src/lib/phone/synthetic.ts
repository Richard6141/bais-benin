// Numéros inventés des fiches de démonstration (database/seed/generators/identifiers.ts) : dix
// chiffres béninois, préfixe 01, troisième chiffre après le préfixe forcé à 9. La plage est
// supposée non attribuée par les opérateurs, sans que rien ne le garantisse : aucun message ne
// doit partir vers elle hors production.

export const SYNTHETIC_PHONE_PATTERN = /^\+22901\d{2}9\d{5}$/;

/** Numéro E.164 de la plage inventée du jeu de démonstration. */
export function isSyntheticPhone(e164: string): boolean {
  return SYNTHETIC_PHONE_PATTERN.test(e164);
}
