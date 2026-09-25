import { describe, expect, it } from "vitest";
import pino from "pino";

// B5 : même liste de rédaction que logger.ts, vérifiée isolément (le logger par défaut du
// module force un transport pino-pretty en développement, peu pratique à capturer ici).
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

function loggerWithSink() {
  const lines: string[] = [];
  const stream = { write: (chunk: string) => lines.push(chunk) };
  const logger = pino({ redact: { paths: redactedPaths, censor: "[masqué]" } }, stream);
  return { logger, lines };
}

describe("logger", () => {
  it("masque un code à usage unique journalisé à la racine de l'objet", () => {
    const { logger, lines } = loggerWithSink();
    logger.info({ to: "+22901000000", code: "123456" }, "Code à usage unique");
    const entry = JSON.parse(lines[0]!);
    expect(entry.code).toBe("[masqué]");
  });

  it("masque authorization et cookie, à la racine et imbriqués", () => {
    const { logger, lines } = loggerWithSink();
    logger.info(
      { authorization: "Bearer secret", headers: { cookie: "bais.session_token=abc" } },
      "requête",
    );
    const entry = JSON.parse(lines[0]!);
    expect(entry.authorization).toBe("[masqué]");
    expect(entry.headers.cookie).toBe("[masqué]");
  });

  it("ne masque pas les champs sans rapport", () => {
    const { logger, lines } = loggerWithSink();
    logger.info({ commune: "BJ-DON-003", farmCount: 5 }, "agrégat");
    const entry = JSON.parse(lines[0]!);
    expect(entry.commune).toBe("BJ-DON-003");
    expect(entry.farmCount).toBe(5);
  });
});
