import { prisma } from "@/database/client";

// Limiteur par clé arbitraire (numéro de téléphone, compte…) sur la table de better-auth
// (auth_rate_limit), là où la bibliothèque ne sait limiter que par adresse IP et par chemin.
// Fenêtre fixe, même algorithme que le limiteur natif (api/rate-limiter/index.mjs,
// decideConsume). La paire lecture-puis-écriture n'est pas atomique : une rafale strictement
// simultanée pour une même clé peut dépasser la limite de quelques unités. Compromis accepté,
// comme pour le stockage « database » de better-auth lui-même.

export interface RateLimitRule {
  windowSeconds: number;
  max: number;
}

/** Consomme une unité pour `key` ; faux si la limite de la fenêtre est déjà atteinte. */
export async function consumeRateLimit(
  key: string,
  rule: RateLimitRule,
  now: number = Date.now(),
): Promise<boolean> {
  const windowMs = rule.windowSeconds * 1000;
  const existing = await prisma.rateLimit.findUnique({ where: { key } });
  if (!existing) {
    await prisma.rateLimit.create({ data: { key, count: 1, lastRequest: BigInt(now) } });
    return true;
  }
  if (now - Number(existing.lastRequest) >= windowMs) {
    await prisma.rateLimit.update({ where: { key }, data: { count: 1, lastRequest: BigInt(now) } });
    return true;
  }
  if (existing.count >= rule.max) return false;
  await prisma.rateLimit.update({
    where: { key },
    data: { count: { increment: 1 }, lastRequest: BigInt(now) },
  });
  return true;
}
