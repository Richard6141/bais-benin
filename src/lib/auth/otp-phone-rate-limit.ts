import { prisma } from "@/database/client";

// B4 : limite par numéro de téléphone, en plus de la limite par IP déjà configurée sur
// /phone-number/send-otp (auth.ts, rateLimit.customRules). Une même IP peut représenter tout
// un quartier au Bénin (CGNAT, docs/06) : la fenêtre y reste volontairement large. À l'inverse,
// un même numéro qui reçoit plus de PHONE_OTP_MAX codes en PHONE_OTP_WINDOW_SECONDS est anormal
// quel que soit le nombre d'adresses IP utilisées pour le demander (répartition sur un botnet,
// par exemple), et mérite sa propre limite indépendante.
//
// Fenêtre fixe, même algorithme que le limiteur natif de better-auth (api/rate-limiter/index.mjs,
// decideConsume) : reproduit ici à la main sur la même table (auth_rate_limit), car la
// bibliothèque ne sait limiter que par IP et par chemin, jamais par un champ arbitraire de la
// charge utile. La paire lecture-puis-écriture n'est pas atomique : une rafale de requêtes
// strictement simultanées pour un même numéro pourrait dépasser la limite de quelques unités.
// C'est un compromis accepté ici (comme pour le stockage "database" de better-auth lui-même) ;
// une contrainte d'unicité empêcherait seulement la création en double, pas ce dépassement.
const PHONE_OTP_WINDOW_SECONDS = 15 * 60;
const PHONE_OTP_MAX = 5;

export async function checkPhoneOtpRateLimit(
  phoneNumber: string,
  now: number = Date.now(),
): Promise<boolean> {
  const key = `otp-phone:${phoneNumber}`;
  const windowMs = PHONE_OTP_WINDOW_SECONDS * 1000;

  const existing = await prisma.rateLimit.findUnique({ where: { key } });
  if (!existing) {
    await prisma.rateLimit.create({ data: { key, count: 1, lastRequest: BigInt(now) } });
    return true;
  }

  const lastRequest = Number(existing.lastRequest);
  if (now - lastRequest >= windowMs) {
    await prisma.rateLimit.update({ where: { key }, data: { count: 1, lastRequest: BigInt(now) } });
    return true;
  }
  if (existing.count >= PHONE_OTP_MAX) return false;

  await prisma.rateLimit.update({
    where: { key },
    data: { count: { increment: 1 }, lastRequest: BigInt(now) },
  });
  return true;
}
