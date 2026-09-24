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

// Les numéros de démonstration commencent par 01 9 : ils n'existent pas chez les opérateurs.
export function isDemoPhone(e164: string): boolean {
  return /^\+229019\d{7}$/.test(e164);
}
