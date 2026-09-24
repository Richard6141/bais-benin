/**
 * Identifiants déterministes du jeu de démonstration.
 *
 * Les UUID sont dérivés du contenu (graine, type, séquence) par hachage, à la manière d'un UUID v5,
 * pour qu'une même graine produise les mêmes identifiants : une anomalie peut alors être documentée
 * par son identifiant et retrouvée après régénération. Le hachage est un double FNV-1a 64 bits sur
 * BigInt, sans dépendance, largement suffisant pour éviter les collisions sur quelques centaines de
 * milliers de lignes.
 */

const FNV_OFFSET = 0xcbf29ce484222325n;
const FNV_PRIME = 0x100000001b3n;
const MASK_64 = 0xffffffffffffffffn;

function fnv1a64(text: string, salt: bigint): bigint {
  let hash = FNV_OFFSET ^ salt;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= BigInt(text.charCodeAt(index));
    hash = (hash * FNV_PRIME) & MASK_64;
  }
  return hash;
}

/** UUID au format v5 (version 5, variante RFC 4122) dérivé d'une clé textuelle. */
export function deterministicUuid(key: string): string {
  const high = fnv1a64(key, 0n);
  const low = fnv1a64(key, 0x9e3779b97f4a7c15n);
  const hex = (high.toString(16).padStart(16, "0") + low.toString(16).padStart(16, "0")).split("");
  hex[12] = "5";
  hex[16] = "89ab"[Number.parseInt(hex[16] ?? "0", 16) % 4] ?? "8";
  const raw = hex.join("");
  return `${raw.slice(0, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}-${raw.slice(16, 20)}-${raw.slice(20, 32)}`;
}

/** Trois premières lettres d'un libellé, en majuscules sans accent ni ponctuation (N'Dali → NDA). */
export function codeFragment(label: string): string {
  const letters = label
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^A-Za-z]/g, "")
    .toUpperCase();
  return letters.slice(0, 3).padEnd(3, "X");
}

export function farmerCode(sequence: number): string {
  return `BJ-F-${String(sequence).padStart(9, "0")}`;
}

export function farmCode(departementName: string, communeName: string, sequence: number): string {
  return `BJ-${codeFragment(departementName)}-${codeFragment(communeName)}-${String(sequence).padStart(6, "0")}`;
}

/**
 * Numéro béninois à dix chiffres, préfixe 01 (docs/08 §6.6). Le troisième chiffre après le préfixe
 * est forcé à 9, plage non attribuée par les opérateurs, pour qu'aucun numéro généré ne puisse
 * joindre une personne réelle. Le format retourné est E.164 : +22901XXXXXXXX.
 */
export function syntheticPhone(sevenDigits: number): string {
  const digits = String(sevenDigits % 10_000_000).padStart(7, "0");
  return `+22901${digits.slice(0, 2)}9${digits.slice(2)}`;
}

export const SYNTHETIC_PHONE_PATTERN = /^\+22901\d{2}9\d{5}$/;
