import { z } from "zod";

// Variables lues côté serveur. L'application refuse de démarrer si une variable
// obligatoire manque : mieux vaut une erreur claire au lancement qu'une panne
// silencieuse au premier appel à la base.

const base64Key = (bytes: number, name: string) =>
  z
    .string()
    .optional()
    .refine((value) => value === undefined || Buffer.from(value, "base64").length === bytes, {
      message: `${name} doit être une clé de ${bytes} octets encodée en base64`,
    });

const serverSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    APP_URL: z.url().default("http://localhost:3000"),
    DATABASE_URL: z
      .string()
      .min(1, "DATABASE_URL est obligatoire")
      .refine((value) => value.startsWith("postgres://") || value.startsWith("postgresql://"), {
        message: "DATABASE_URL doit être une URL PostgreSQL",
      }),
    LOG_LEVEL: z.enum(["trace", "debug", "info", "warn", "error", "fatal"]).default("info"),

    // Authentification
    AUTH_SECRET: z.string().min(32, "AUTH_SECRET doit faire au moins 32 caractères").optional(),
    OTP_DEMO_CODE: z
      .string()
      .regex(/^\d{6}$/, "OTP_DEMO_CODE doit être un code à 6 chiffres")
      .optional(),

    // Messagerie
    MESSAGING_PRIMARY_CHANNEL: z.enum(["console", "wapy", "fixture"]).default("console"),
    WAPY_API_URL: z.url().default("https://wapy.pro"),
    WAPY_API_KEY: z.string().optional(),
    WAPY_WEBHOOK_SECRET: z.string().optional(),

    // NPI : chiffrement AES-256-GCM et index HMAC, deux clés distinctes de 32 octets.
    NPI_ENCRYPTION_KEY: base64Key(32, "NPI_ENCRYPTION_KEY"),
    NPI_HASH_KEY: base64Key(32, "NPI_HASH_KEY"),
    NPI_LENGTH: z.coerce.number().int().min(10).max(13).default(13),
    IDENTITY_VERIFICATION_PROVIDER: z.enum(["anip-local", "anip-xroad"]).default("anip-local"),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === "production") {
      if (!env.AUTH_SECRET) {
        ctx.addIssue({
          code: "custom",
          path: ["AUTH_SECRET"],
          message: "obligatoire en production",
        });
      }
      if (env.OTP_DEMO_CODE) {
        ctx.addIssue({
          code: "custom",
          path: ["OTP_DEMO_CODE"],
          message: "le code de démonstration est interdit en production",
        });
      }
    }
  });

export type ServerEnv = z.infer<typeof serverSchema>;

export type EnvSource = Record<string, string | undefined>;

export function parseServerEnv(source: EnvSource): ServerEnv {
  const result = serverSchema.safeParse(source);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(racine)"} : ${issue.message}`)
      .join("\n");
    throw new Error(`Configuration invalide :\n${details}`);
  }
  return result.data;
}

let cachedEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  cachedEnv ??= parseServerEnv(process.env);
  return cachedEnv;
}
