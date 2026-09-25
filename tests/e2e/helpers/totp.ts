import { createHmac } from "node:crypto";

// Code TOTP (RFC 6238, HMAC-SHA1, 6 chiffres, pas de 30 s), calculé sans dépendance à partir de la
// clé en base 32 affichée pour la saisie manuelle. Mêmes réglages que le greffon twoFactor.

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/g, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error(`Caractère base 32 invalide : ${char}`);
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export function totp(secret: string, timeMs: number = Date.now(), period = 30, digits = 6): string {
  const counter = Math.floor(timeMs / 1000 / period);
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const code =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    ((digest[offset + 1] ?? 0) << 16) |
    ((digest[offset + 2] ?? 0) << 8) |
    (digest[offset + 3] ?? 0);
  return String(code % 10 ** digits).padStart(digits, "0");
}

/** Millisecondes avant le prochain pas de 30 s, pour éviter de rejouer un code déjà consommé. */
export function msUntilNextStep(timeMs: number = Date.now(), period = 30): number {
  return period * 1000 - (timeMs % (period * 1000));
}
