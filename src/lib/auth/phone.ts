import { parsePhoneNumberFromString } from "libphonenumber-js/min";

// Numérotation béninoise depuis 2024 : dix chiffres commençant par 01, soit +229 01 XX XX XX XX.
// On accepte les saisies avec espaces, tirets ou sans indicatif et on normalise en E.164.

export interface NormalizedPhone {
  e164: string;
  national: string;
}

export function normalizeBeninPhone(raw: string): NormalizedPhone | null {
  const cleaned = raw.replace(/[\s.\-()]/g, "");
  const parsed = parsePhoneNumberFromString(cleaned, "BJ");
  if (!parsed || !parsed.isPossible() || parsed.country !== "BJ") return null;
  const national = parsed.nationalNumber;
  if (!/^01\d{8}$/.test(national)) return null;
  return { e164: parsed.number, national: formatNational(national) };
}

export function formatNational(national: string): string {
  return national.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

export function isValidBeninPhone(raw: string): boolean {
  return normalizeBeninPhone(raw) !== null;
}

// A2 : liste blanche EXACTE des numéros de démonstration réellement semés
// (src/database/seed/steps/accounts.seed.ts — DEMO_ACCOUNTS et DEMO_FARMER_PHONE), et non un
// motif large « 01 9X… » qui couvrirait dix millions de numéros fictifs jamais attribués mais
// jamais vérifiés non plus. N'importe quel autre numéro béninois valide passe par le circuit
// OTP réel, même en développement.
const DEMO_PHONE_NUMBERS: ReadonlySet<string> = new Set(["+2290190000001", "+2290190000002"]);

export function isDemoPhone(e164: string): boolean {
  return DEMO_PHONE_NUMBERS.has(e164);
}
