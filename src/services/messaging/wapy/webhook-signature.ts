import { createHmac, timingSafeEqual } from "node:crypto";

// Vérification de la signature des webhooks wapy.pro : en-tête `X-Wapy-Signature` de la forme
// `sha256=<HMAC-SHA256 hexadécimal du corps brut>`, calculé avec le secret reçu lors de
// l'enregistrement du webhook (docs/09 §1). Comparaison en temps constant.

export function signWapyPayload(rawBody: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(rawBody, "utf8").digest("hex")}`;
}

export function verifyWapySignature(
  rawBody: string,
  header: string | null,
  secret: string,
): boolean {
  if (!header || !secret) return false;
  const expected = Buffer.from(signWapyPayload(rawBody, secret), "utf8");
  const received = Buffer.from(header.trim(), "utf8");
  return expected.length === received.length && timingSafeEqual(expected, received);
}
