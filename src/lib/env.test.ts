import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

const validEnv = {
  DATABASE_URL: "postgresql://bais:secret@localhost:5432/bais",
};

describe("parseServerEnv", () => {
  it("accepte une configuration minimale et applique les valeurs par défaut", () => {
    const env = parseServerEnv(validEnv);
    expect(env.NODE_ENV).toBe("development");
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("accepte une DATABASE_URL vide au moment du build", () => {
    expect(parseServerEnv({}).DATABASE_URL).toBe("");
  });

  it("interdit le code de démonstration et exige le secret en production réelle", () => {
    expect(() =>
      parseServerEnv({ ...validEnv, APP_ENV: "production", OTP_DEMO_CODE: "123456" }),
    ).toThrow(/OTP_DEMO_CODE|AUTH_SECRET/);
    expect(
      parseServerEnv({
        ...validEnv,
        APP_ENV: "demo",
        OTP_DEMO_CODE: "123456",
        NODE_ENV: "production",
      }).OTP_DEMO_CODE,
    ).toBe("123456");
  });

  it("exige https pour le point d'accès de l'assistant, sauf en local", () => {
    expect(() =>
      parseServerEnv({ ...validEnv, ASSISTANT_LLM_BASE_URL: "http://modele.exemple.bj/v1" }),
    ).toThrow(/https/);
    expect(
      parseServerEnv({ ...validEnv, ASSISTANT_LLM_BASE_URL: "http://localhost:11434/v1" })
        .ASSISTANT_LLM_BASE_URL,
    ).toBe("http://localhost:11434/v1");
    const env = parseServerEnv({ ...validEnv, ASSISTANT_LLM_BASE_URL: "" });
    expect(env.ASSISTANT_LLM_BASE_URL).toBeUndefined();
    expect(env.ASSISTANT_DAILY_LIMIT).toBe(2000);
  });

  it("refuse une DATABASE_URL qui n'est pas PostgreSQL", () => {
    expect(() => parseServerEnv({ DATABASE_URL: "mysql://localhost/bais" })).toThrow(
      /URL PostgreSQL/,
    );
  });

  it("refuse un niveau de log inconnu", () => {
    expect(() => parseServerEnv({ ...validEnv, LOG_LEVEL: "verbose" })).toThrow(/LOG_LEVEL/);
  });
});
