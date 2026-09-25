import pino from "pino";

// Journal structuré. Les identifiants sensibles (téléphones, NPI) ne doivent
// jamais y transiter : la liste de rédaction ci-dessous les masque par sécurité
// même si un appelant les passe par erreur.
// B5 : "code" (le code à usage unique, journalisé en clair par le canal console de
// développement — services/messaging/console/console-channel.ts — canal de toute façon
// interdit en production par lib/env.ts), "authorization" et "cookie" s'ajoutent à la liste
// pour qu'aucun jeton de session ou en-tête d'authentification ne finisse jamais en clair
// dans un journal, y compris logué à la racine de l'objet (pas seulement un niveau en dessous).
const redactedKeys = [
  "phone",
  "phoneE164",
  "npi",
  "password",
  "otp",
  "token",
  "code",
  "authorization",
  "cookie",
];
const redactedPaths = redactedKeys.flatMap((key) => [key, `*.${key}`]);

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
