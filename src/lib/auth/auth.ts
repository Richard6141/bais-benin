import { betterAuth, type GenericEndpointContext } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber, twoFactor } from "better-auth/plugins";
import { prisma } from "@/database/client";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { isDemoPhone, isValidBeninPhone } from "@/lib/auth/phone";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getMessagingChannel } from "@/services/messaging";

const env = getServerEnv();

const OTP_EXPIRY_MINUTES = 5;
const DAY = 60 * 60 * 24;

// Pile d'authentification (ADR-0010) : sessions en base révocables, OTP téléphone
// livré par le canal de messagerie, TOTP pour les comptes institutionnels, limiteur
// de débit stocké en base pour rester cohérent entre plusieurs instances.
export const auth = betterAuth({
  appName: "BAIS",
  baseURL: env.APP_URL,
  secret: env.AUTH_SECRET ?? "secret-de-developpement-a-remplacer-avant-mise-en-production",
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  advanced: {
    database: { generateId: "uuid" },
    cookiePrefix: "bais",
  },
  user: {
    additionalFields: {
      preferredLocale: { type: "string", required: false, defaultValue: "fr", input: false },
      status: { type: "string", required: false, defaultValue: "ACTIVE", input: false },
    },
  },
  session: {
    // 30 jours glissants pour les agriculteurs et agents (contrainte de terrain) ;
    // les comptes institutionnels sont raccourcis à 12 h par un contrôle applicatif.
    expiresIn: 30 * DAY,
    updateAge: DAY,
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  emailAndPassword: {
    enabled: true,
    // Les comptes institutionnels sont créés par invitation, jamais par inscription libre.
    disableSignUp: true,
    minPasswordLength: 12,
    password: { hash: hashPassword, verify: verifyPassword },
  },
  rateLimit: {
    enabled: true,
    storage: "database",
    modelName: "rateLimit",
    window: 60,
    max: 30,
    customRules: {
      "/phone-number/send-otp": { window: 60 * 60, max: 5 },
      "/phone-number/verify": { window: 15 * 60, max: 5 },
      "/sign-in/email": { window: 15 * 60, max: 10 },
      "/two-factor/verify-totp": { window: 15 * 60, max: 10 },
    },
  },
  plugins: [
    phoneNumber({
      otpLength: 6,
      expiresIn: OTP_EXPIRY_MINUTES * 60,
      allowedAttempts: 5,
      phoneNumberValidator: (value) => isValidBeninPhone(value),
      sendOTP: ({ phoneNumber: to, code }) => {
        // Envoi sans attente : la latence du fournisseur ne doit pas révéler si le numéro existe.
        void getMessagingChannel()
          .send({
            kind: "OTP",
            to,
            code,
            service: "BAIS",
            expiresInMinutes: OTP_EXPIRY_MINUTES,
            idempotencyKey: `otp-${to}-${Math.floor(Date.now() / 60_000)}`,
          })
          .catch((error: unknown) => {
            logger.error({ err: error }, "Échec d'envoi du code à usage unique");
          });
      },
      // Comptes de démonstration : un code fixe, uniquement pour les numéros fictifs 01 9X…
      // et seulement si OTP_DEMO_CODE est défini (interdit en production, voir lib/env.ts).
      verifyOTP: env.OTP_DEMO_CODE
        ? async ({ phoneNumber: to, code }, ctx) => {
            if (isDemoPhone(to) && code === env.OTP_DEMO_CODE) return true;
            return verifyStoredOtp(ctx, to, code);
          }
        : undefined,
      signUpOnVerification: {
        // better-auth exige un e-mail unique ; les agriculteurs n'en ont pas.
        getTempEmail: (to) => `${to.replace("+", "")}@telephone.bais.invalid`,
        getTempName: (to) => to,
      },
    }),
    twoFactor({
      issuer: "BAIS",
      totpOptions: { digits: 6, period: 30 },
    }),
    nextCookies(),
  ],
});

type VerifyContext = GenericEndpointContext | undefined;

// Reproduit la vérification par défaut du greffon quand le code de démonstration ne s'applique pas.
async function verifyStoredOtp(ctx: VerifyContext, to: string, code: string): Promise<boolean> {
  if (!ctx) return false;
  const record = await ctx.context.internalAdapter.findVerificationValue(to);
  if (!record || record.expiresAt < new Date()) return false;
  const [storedCode] = record.value.split(":");
  return storedCode === code;
}

export type AuthSession = typeof auth.$Infer.Session;
