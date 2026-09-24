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

  it("refuse une configuration sans DATABASE_URL", () => {
    expect(() => parseServerEnv({})).toThrow(/DATABASE_URL/);
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
