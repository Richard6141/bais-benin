"use server";

import { cookies } from "next/headers";
import { normalizeBeninPhone } from "@/lib/auth/phone";
import {
  SIGN_IN_INTENT_COOKIE,
  SIGN_IN_INTENT_TTL_SECONDS,
  sealSignInIntent,
} from "@/lib/auth/sign-in-intent";
import { getServerEnv } from "@/lib/env";
import { validateNpiFormat } from "@/modules/identity";

export type PrepareSignInResult =
  | { ok: true; phone: string; national: string }
  | { ok: false; field: "npi" | "phone"; message: string };

// Premier écran de connexion (ADR-0012) : contrôle de forme du NPI et du numéro, puis dépôt de
// l'intention chiffrée dans un cookie httpOnly. L'envoi du code est ensuite demandé par le
// navigateur à better-auth, qui refuse tout envoi sans cette intention pour le même numéro.
// Rien n'est lu en base ici : l'écran ne dit jamais si un NPI est connu de la plateforme.
export async function prepareSignIn(input: {
  npi: string;
  phoneDigits: string;
}): Promise<PrepareSignInResult> {
  const npi = input.npi.replace(/\D/g, "");
  const format = validateNpiFormat(npi);
  if (!format.valid) {
    return { ok: false, field: "npi", message: format.reason ?? "NPI invalide" };
  }
  const phone = normalizeBeninPhone(input.phoneDigits);
  if (!phone) {
    return {
      ok: false,
      field: "phone",
      message: "Saisissez les dix chiffres de votre numéro, en commençant par 01.",
    };
  }

  (await cookies()).set(SIGN_IN_INTENT_COOKIE, sealSignInIntent({ npi, phone: phone.e164 }), {
    httpOnly: true,
    sameSite: "lax",
    secure: getServerEnv().APP_URL.startsWith("https://"),
    path: "/",
    maxAge: SIGN_IN_INTENT_TTL_SECONDS,
  });
  return { ok: true, phone: phone.e164, national: phone.national };
}
