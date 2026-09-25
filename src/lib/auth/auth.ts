import crypto from "node:crypto";
import { betterAuth, type GenericEndpointContext } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { phoneNumber, twoFactor } from "better-auth/plugins";
import { prisma } from "@/database/client";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { isDemoPhone, isValidBeninPhone } from "@/lib/auth/phone";
import { checkPhoneOtpRateLimit } from "@/lib/auth/otp-phone-rate-limit";
import { getServerEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { recordAudit, type AuditAction } from "@/modules/audit";
import { getMessagingChannel } from "@/services/messaging";

const env = getServerEnv();

const OTP_EXPIRY_MINUTES = 5;
const DAY = 60 * 60 * 24;

// A1 : plus aucun repli sur un secret par défaut. lib/env.ts fait déjà échouer le
// démarrage si AUTH_SECRET manque en production (NODE_ENV=production, hors phase de build
// Next.js) ; en développement/test, un secret éphémère est généré ici si l'opérateur n'en a
// pas fourni, pour ne pas bloquer un `pnpm dev` sans .env complet — il change à chaque
// redémarrage du process, donc les sessions ne survivent jamais un redéploiement.
function resolveAuthSecret(): string {
  if (env.AUTH_SECRET) return env.AUTH_SECRET;
  if (env.NODE_ENV === "production") {
    // lib/env.ts aurait déjà dû lever une erreur avant d'arriver ici ; filet de sécurité.
    throw new Error("AUTH_SECRET est obligatoire en production");
  }
  logger.warn(
    "AUTH_SECRET absent : secret de session éphémère généré pour ce process de développement",
  );
  return crypto.randomBytes(32).toString("base64");
}

// Pile d'authentification (ADR-0010) : sessions en base révocables, OTP téléphone
// livré par le canal de messagerie, TOTP pour les comptes institutionnels, limiteur
// de débit stocké en base pour rester cohérent entre plusieurs instances.
export const auth = betterAuth({
  appName: "BAIS",
  baseURL: env.APP_URL,
  secret: resolveAuthSecret(),
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  advanced: {
    database: { generateId: "uuid" },
    cookiePrefix: "bais",
    // B4 : X-Forwarded-For n'est crédité que derrière un relais explicitement listé
    // (TRUSTED_PROXIES) — sinon better-auth ignore l'en-tête par défaut et retombe sur une
    // adresse indistincte, ce qui affaiblirait silencieusement la limite de débit par IP.
    ipAddress: {
      ipAddressHeaders: ["x-forwarded-for"],
      trustedProxies: env.TRUSTED_PROXIES
        ? env.TRUSTED_PROXIES.split(",")
            .map((entry) => entry.trim())
            .filter(Boolean)
        : [],
    },
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
    max: 60,
    // Les limites sont par adresse IP. Au Bénin, un quartier entier peut sortir derrière la
    // même adresse (opérateurs mobiles en CGNAT) : les fenêtres restent larges ici, et la
    // protection fine par numéro vient d'allowedAttempts sur le code lui-même.
    customRules: {
      "/phone-number/send-otp": { window: 15 * 60, max: 30 },
      "/phone-number/verify": { window: 15 * 60, max: 60 },
      "/sign-in/email": { window: 15 * 60, max: 30 },
      "/two-factor/verify-totp": { window: 15 * 60, max: 30 },
    },
  },
  hooks: {
    // Journal d'audit des événements de compte que la bibliothèque traite seule.
    after: createAuthMiddleware(async (ctx) => {
      const action = AUDITED_PATHS[ctx.path];
      if (!action) return;
      const session = ctx.context.newSession ?? ctx.context.session;
      // B4 : ip vient de la session déjà créée par better-auth (internal-adapter.mjs), qui
      // applique advanced.ipAddress.trustedProxies — jamais d'une relecture manuelle de
      // X-Forwarded-For ici, qui accorderait foi à l'en-tête même hors de tout relais de
      // confiance et permettrait à n'importe quel client d'usurper l'adresse journalisée.
      await recordAudit({
        action,
        actorId: session?.user.id ?? null,
        ip: session?.session.ipAddress || null,
        userAgent: ctx.request?.headers.get("user-agent") ?? null,
      });
    }),
  },
  plugins: [
    phoneNumber({
      otpLength: 6,
      expiresIn: OTP_EXPIRY_MINUTES * 60,
      allowedAttempts: 5,
      phoneNumberValidator: (value) => isValidBeninPhone(value),
      sendOTP: async ({ phoneNumber: to, code }) => {
        // B4 : limite par numéro, en plus de la limite par IP déjà posée sur ce chemin
        // (rateLimit.customRules ci-dessus) — voir otp-phone-rate-limit.ts pour le raisonnement.
        // Les numéros de démonstration en sont exemptés : ce ne sont jamais de vrais
        // destinataires (donc rien à protéger d'un envoi répété), et les scénarios de
        // démonstration/tests s'y reconnectent délibérément très souvent.
        if (!isDemoPhone(to) && !(await checkPhoneOtpRateLimit(to))) {
          throw new APIError("FORBIDDEN", { message: "Trop de codes envoyés pour ce numéro" });
        }
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
      // Comptes de démonstration (A2) : un code fixe, uniquement pour la liste blanche exacte
      // de isDemoPhone (les numéros réellement semés, jamais un motif large), et seulement si
      // OTP_DEMO_CODE est défini — ce qui est de toute façon interdit en production par
      // lib/env.ts. Fournir verifyOTP remplace entièrement la vérification native du greffon,
      // y compris son compteur de tentatives : verifyStoredOtp le reproduit ci-dessous pour
      // que ce chemin personnalisé ne devienne pas un moyen de forcer un code par essais
      // répétés.
      verifyOTP: env.OTP_DEMO_CODE
        ? async ({ phoneNumber: to, code }, ctx) => {
            if (env.APP_ENV !== "production" && isDemoPhone(to) && code === env.OTP_DEMO_CODE) {
              return true;
            }
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

// Chemins better-auth dont le succès mérite une trace d'audit (docs/06 §6).
const AUDITED_PATHS: Record<string, AuditAction> = {
  "/sign-out": "auth.sign_out",
  "/phone-number/send-otp": "auth.otp_requested",
  "/two-factor/enable": "auth.two_factor_enabled",
  "/two-factor/disable": "auth.two_factor_disabled",
  "/revoke-session": "auth.session_revoked",
  "/revoke-sessions": "auth.session_revoked",
  "/revoke-other-sessions": "auth.session_revoked",
};

type VerifyContext = GenericEndpointContext | undefined;

// A2 : reproduit la vérification par défaut du greffon phone-number (routes.mjs,
// verifyPhoneNumberOTP) quand le code de démonstration ne s'applique pas — y compris son
// compteur de tentatives, qui serait sinon totalement contourné par notre verifyOTP
// personnalisé (fournir verifyOTP désactive le chemin natif dans son ensemble, compteur
// inclus). Le budget (OTP_ALLOWED_ATTEMPTS) doit rester aligné avec allowedAttempts déclaré
// juste au-dessus dans la configuration du greffon.
const OTP_ALLOWED_ATTEMPTS = 5;

async function verifyStoredOtp(ctx: VerifyContext, to: string, code: string): Promise<boolean> {
  if (!ctx) return false;
  const existing = await ctx.context.internalAdapter.findVerificationValue(to);
  if (!existing || existing.expiresAt < new Date()) return false;

  const [, rawAttempts] = existing.value.split(":");
  const priorAttempts = parseAttempts(rawAttempts);
  if (priorAttempts >= OTP_ALLOWED_ATTEMPTS) {
    await ctx.context.internalAdapter.deleteVerificationByIdentifier(to);
    return false;
  }

  // Consomme la ligne : deux vérifications concurrentes ne peuvent jamais réussir toutes les
  // deux avec le même code (protection contre les courses).
  const consumed = await ctx.context.internalAdapter.consumeVerificationValue(to);
  if (!consumed) return false;
  const [storedCode, consumedRawAttempts] = consumed.value.split(":");
  const attempts = parseAttempts(consumedRawAttempts);
  if (attempts >= OTP_ALLOWED_ATTEMPTS) return false;

  if (storedCode !== code) {
    // Recrée la ligne avec le compteur incrémenté, comme le ferait le greffon natif.
    await ctx.context.internalAdapter.createVerificationValue({
      value: `${storedCode}:${attempts + 1}`,
      identifier: to,
      expiresAt: consumed.expiresAt,
    });
    return false;
  }
  return true;
}

function parseAttempts(value: string | undefined): number {
  const attempts = Number(value ?? 0);
  return Number.isSafeInteger(attempts) && attempts > 0 ? attempts : 0;
}

export type AuthSession = typeof auth.$Infer.Session;
