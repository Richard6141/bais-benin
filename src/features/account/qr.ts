"use server";

import encodeQR from "@paulmillr/qr";

// Rendu SVG d'un URI TOTP côté serveur : le secret ne transite que dans la réponse
// de better-auth et dans cette action, jamais dans une image stockée.
export async function totpQrSvg(uri: string): Promise<string> {
  if (!uri.startsWith("otpauth://totp/")) throw new Error("URI TOTP invalide");
  return encodeQR(uri, "svg", { scale: 4, border: 1 });
}
