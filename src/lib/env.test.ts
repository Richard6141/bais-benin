import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

// A1 : APP_ENV est fail-closed (défaut "production" si absent) depuis le durcissement de
// l'étape 9. Ces tests visent le comportement de développement explicite : ils fixent
// APP_ENV="development" comme le fait .env.example, pour ne pas se confondre avec les tests
// dédiés au fail-closed lui-même, plus bas.
const validEnv = {
  DATABASE_URL: "postgresql://bais:secret@localhost:5432/bais",
  APP_ENV: "development",
};

// Clé de 32 octets valide en base64 (openssl rand -base64 32), pour AUDIT_IP_HASH_KEY.
const VALID_BASE64_KEY = "kCt+SqGC5z2ELW/WHhNvkKA/K0laNNmouh6h7o9jnqI=";

describe("parseServerEnv", () => {
  it("accepte une configuration minimale et applique les valeurs par défaut", () => {
    const env = parseServerEnv(validEnv);
    expect(env.NODE_ENV).toBe("development");
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("bascule en production fail-closed si APP_ENV n'est pas précisé explicitement", () => {
    // Une variable oubliée en déploiement doit se comporter comme de la production
    // (secrets obligatoires), jamais l'inverse.
    expect(() => parseServerEnv({ DATABASE_URL: validEnv.DATABASE_URL })).toThrow(/CRON_SECRET/);
    expect(
      parseServerEnv({
        DATABASE_URL: validEnv.DATABASE_URL,
        CRON_SECRET: "x".repeat(32),
        MESSAGING_PRIMARY_CHANNEL: "wapy",
        WAPY_API_KEY: "x".repeat(20),
        AUDIT_IP_HASH_KEY: VALID_BASE64_KEY,
      }).APP_ENV,
    ).toBe("production");
  });

  it("interdit le canal console/fixture d'envoi de code en production (B5)", () => {
    const prodBase = {
      ...validEnv,
      APP_ENV: "production",
      CRON_SECRET: "x".repeat(32),
      AUTH_SECRET: "x".repeat(32),
      AUDIT_IP_HASH_KEY: VALID_BASE64_KEY,
    };
    expect(() => parseServerEnv(prodBase)).toThrow(/MESSAGING_PRIMARY_CHANNEL/);
    expect(() => parseServerEnv({ ...prodBase, MESSAGING_PRIMARY_CHANNEL: "fixture" })).toThrow(
      /MESSAGING_PRIMARY_CHANNEL/,
    );
    expect(() => parseServerEnv({ ...prodBase, MESSAGING_PRIMARY_CHANNEL: "wapy" })).toThrow(
      /WAPY_API_KEY/,
    );
    expect(
      parseServerEnv({
        ...prodBase,
        MESSAGING_PRIMARY_CHANNEL: "wapy",
        WAPY_API_KEY: "x".repeat(20),
      }).MESSAGING_PRIMARY_CHANNEL,
    ).toBe("wapy");
  });

  it("accepte une configuration vide au moment du build Next.js", () => {
    // NEXT_PHASE=phase-production-build (posé par Next.js pendant `next build`) exempte des
    // exigences de production : aucune requête n'est encore servie, et l'image de build peut
    // ne pas encore avoir les secrets d'exécution.
    const env = parseServerEnv({ NEXT_PHASE: "phase-production-build" });
    expect(env.DATABASE_URL).toBe("");
    expect(env.APP_ENV).toBe("production");
  });

  it("interdit le code de démonstration et exige le secret en production réelle", () => {
    expect(() =>
      parseServerEnv({ ...validEnv, APP_ENV: "production", OTP_DEMO_CODE: "123456" }),
    ).toThrow(/OTP_DEMO_CODE|AUTH_SECRET|CRON_SECRET/);
    expect(
      parseServerEnv({
        ...validEnv,
        APP_ENV: "demo",
        OTP_DEMO_CODE: "123456",
        NODE_ENV: "production",
        AUTH_SECRET: "x".repeat(32),
      }).OTP_DEMO_CODE,
    ).toBe("123456");
  });

  it("exige AUTH_SECRET dès que NODE_ENV=production, même hors build, même si APP_ENV ne l'est pas", () => {
    expect(() => parseServerEnv({ ...validEnv, NODE_ENV: "production" })).toThrow(/AUTH_SECRET/);
    expect(
      parseServerEnv({
        ...validEnv,
        NODE_ENV: "production",
        AUTH_SECRET: "x".repeat(32),
      }).AUTH_SECRET,
    ).toBe("x".repeat(32));
  });

  it("exige AUDIT_IP_HASH_KEY en production (C4)", () => {
    expect(() =>
      parseServerEnv({
        ...validEnv,
        APP_ENV: "production",
        CRON_SECRET: "x".repeat(32),
        AUTH_SECRET: "x".repeat(32),
        MESSAGING_PRIMARY_CHANNEL: "wapy",
        WAPY_API_KEY: "x".repeat(20),
      }),
    ).toThrow(/AUDIT_IP_HASH_KEY/);
    expect(
      parseServerEnv({
        ...validEnv,
        APP_ENV: "production",
        CRON_SECRET: "x".repeat(32),
        AUTH_SECRET: "x".repeat(32),
        MESSAGING_PRIMARY_CHANNEL: "wapy",
        WAPY_API_KEY: "x".repeat(20),
        AUDIT_IP_HASH_KEY: VALID_BASE64_KEY,
      }).AUDIT_IP_HASH_KEY,
    ).toBe(VALID_BASE64_KEY);
  });

  it("refuse une DATABASE_URL qui n'est pas PostgreSQL", () => {
    expect(() => parseServerEnv({ ...validEnv, DATABASE_URL: "mysql://localhost/bais" })).toThrow(
      /URL PostgreSQL/,
    );
  });

  it("refuse un niveau de log inconnu", () => {
    expect(() => parseServerEnv({ ...validEnv, LOG_LEVEL: "verbose" })).toThrow(/LOG_LEVEL/);
  });
});
