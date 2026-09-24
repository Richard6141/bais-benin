import pino from "pino";

// Journal structuré. Les identifiants sensibles (téléphones, NPI) ne doivent
// jamais y transiter : la liste de rédaction ci-dessous les masque par sécurité
// même si un appelant les passe par erreur.
const redactedPaths = ["*.phone", "*.phoneE164", "*.npi", "*.password", "*.otp", "*.token"];

const level = process.env.LOG_LEVEL ?? "info";
const isDevelopment = process.env.NODE_ENV !== "production";

export const logger = pino({
  level,
  redact: { paths: redactedPaths, censor: "[masqué]" },
  base: { service: "bais" },
  ...(isDevelopment
    ? {
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "HH:MM:ss" },
        },
      }
    : {}),
});

export type Logger = typeof logger;
