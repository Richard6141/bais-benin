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
      parseServerEnv({ DATABASE_URL: validEnv.DATABASE_URL, CRON_SECRET: "x".repeat(32) }).APP_ENV,
    ).toBe("production");
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

  it("refuse une DATABASE_URL qui n'est pas PostgreSQL", () => {
    expect(() => parseServerEnv({ ...validEnv, DATABASE_URL: "mysql://localhost/bais" })).toThrow(
      /URL PostgreSQL/,
    );
  });

  it("refuse un niveau de log inconnu", () => {
    expect(() => parseServerEnv({ ...validEnv, LOG_LEVEL: "verbose" })).toThrow(/LOG_LEVEL/);
  });
});
