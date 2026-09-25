import { consumeRateLimit } from "@/lib/rate-limit";

// B4 : limite par numéro de téléphone, en plus de la limite par IP déjà configurée sur
// /phone-number/send-otp (auth.ts, rateLimit.customRules). Une même IP peut représenter tout
// un quartier au Bénin (CGNAT, docs/06) : la fenêtre y reste volontairement large. À l'inverse,
// un même numéro qui reçoit plus de 5 codes en 15 minutes est anormal quel que soit le nombre
// d'adresses IP utilisées pour le demander (répartition sur un botnet, par exemple), et mérite
// sa propre limite indépendante (lib/rate-limit.ts pour l'algorithme).
const PHONE_OTP_RULE = { windowSeconds: 15 * 60, max: 5 };

export function checkPhoneOtpRateLimit(
  phoneNumber: string,
  now: number = Date.now(),
): Promise<boolean> {
  return consumeRateLimit(`otp-phone:${phoneNumber}`, PHONE_OTP_RULE, now);
}
