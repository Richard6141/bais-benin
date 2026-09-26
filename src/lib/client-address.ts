import { getServerEnv } from "@/lib/env";

// Adresse du client d'une requête, pour les limites de débit hors better-auth. Même règle que
// l'authentification (B4) : X-Forwarded-For n'est crédité que derrière un relais listé dans
// TRUSTED_PROXIES. On retire de la droite de la chaîne les relais de confiance ; la première
// adresse restante est celle du client. Sans relais configuré, l'en-tête est ignoré (un client
// pourrait l'écrire lui-même) et l'adresse est inconnue.

function ipv4ToNumber(value: string): number | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const byte = Number(part);
    if (byte > 255) return null;
    result = result * 256 + byte;
  }
  return result;
}

/** Vrai si `address` est l'une des entrées (adresse exacte ou plage CIDR IPv4). */
export function matchesProxy(address: string, entries: readonly string[]): boolean {
  for (const entry of entries) {
    if (entry === address) return true;
    const [range, bitsText] = entry.split("/");
    if (!range || bitsText === undefined) continue;
    const bits = Number(bitsText);
    const base = ipv4ToNumber(range);
    const candidate = ipv4ToNumber(address);
    if (base === null || candidate === null || !Number.isInteger(bits) || bits < 0 || bits > 32) {
      continue;
    }
    const size = 2 ** (32 - bits);
    if (Math.floor(base / size) === Math.floor(candidate / size)) return true;
  }
  return false;
}

export function clientAddressFrom(
  forwardedFor: string | null,
  trustedProxies: readonly string[],
): string | null {
  if (!forwardedFor || trustedProxies.length === 0) return null;
  const chain = forwardedFor
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  while (chain.length > 0 && matchesProxy(chain[chain.length - 1] ?? "", trustedProxies)) {
    chain.pop();
  }
  return chain[chain.length - 1] ?? null;
}

export function clientAddress(headers: Headers): string | null {
  const configured = getServerEnv().TRUSTED_PROXIES;
  const trusted = configured
    ? configured
        .split(",")
        .map((entry) => entry.trim())
        .filter(Boolean)
    : [];
  return clientAddressFrom(headers.get("x-forwarded-for"), trusted);
}
