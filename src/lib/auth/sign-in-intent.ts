import { decryptNpi, encryptNpi, keyringFromEnv, type NpiKeyring } from "@/lib/crypto/npi";
import { getServerEnv } from "@/lib/env";

// Intention de connexion : le NPI et le numéro saisis au premier écran, conservés entre l'envoi
// du code et sa vérification dans un cookie httpOnly de courte durée. Le NPI y est chiffré
// (AES-256-GCM, clé NPI_ENCRYPTION_KEY) et lié au numéro et à l'échéance par les données
// associées : un cookie recopié avec un autre numéro, ou prolongé, ne se déchiffre plus.

export const SIGN_IN_INTENT_COOKIE = "bais.connexion";
export const SIGN_IN_INTENT_TTL_SECONDS = 10 * 60;

export interface SignInIntent {
  npi: string;
  phone: string;
}

function keyring(): NpiKeyring {
  const ring = keyringFromEnv(getServerEnv());
  if (!ring) throw new Error("NPI_ENCRYPTION_KEY et NPI_HASH_KEY sont nécessaires à la connexion");
  return ring;
}

const contextFor = (phone: string, expiresAt: number) => ({
  table: "sign_in_intent",
  column: "npi",
  recordId: `${phone}|${expiresAt}`,
});

export function sealSignInIntent(intent: SignInIntent, now = Date.now()): string {
  const expiresAt = Math.floor(now / 1000) + SIGN_IN_INTENT_TTL_SECONDS;
  const sealed = encryptNpi(intent.npi, contextFor(intent.phone, expiresAt), keyring());
  return [intent.phone, expiresAt, sealed].join("~");
}

export function openSignInIntent(value: string | undefined, now = Date.now()): SignInIntent | null {
  if (!value) return null;
  const [phone, expiresPart, sealed] = value.split("~");
  const expiresAt = Number(expiresPart);
  if (!phone || !sealed || !Number.isInteger(expiresAt)) return null;
  if (expiresAt < Math.floor(now / 1000)) return null;
  try {
    return { phone, npi: decryptNpi(sealed, contextFor(phone, expiresAt), keyring()) };
  } catch {
    return null;
  }
}

/** Lit l'intention depuis l'en-tête Cookie d'une requête (points d'accès better-auth). */
export function signInIntentFromHeaders(headers: Headers | undefined): SignInIntent | null {
  const cookie = headers?.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SIGN_IN_INTENT_COOKIE) return openSignInIntent(decodeURIComponent(rest.join("=")));
  }
  return null;
}
