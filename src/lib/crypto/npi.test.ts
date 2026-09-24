import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptNpi,
  encryptNpi,
  keyringFromEnv,
  maskNpi,
  npiBlindIndex,
  sameBlindIndex,
  type NpiKeyring,
} from "./npi";

const keyring: NpiKeyring = {
  encryptionKeys: new Map([[1, randomBytes(32)]]),
  hashKey: randomBytes(32),
};
const context = {
  table: "user",
  column: "npi_ciphertext",
  recordId: "0192aa01-0000-7000-8000-000000000001",
};

describe("protection du NPI", () => {
  it("chiffre puis déchiffre avec un format versionné", () => {
    const stored = encryptNpi("1234567890123", context, keyring);
    expect(stored.startsWith("v1.")).toBe(true);
    expect(stored.split(".")).toHaveLength(4);
    expect(decryptNpi(stored, context, keyring)).toBe("1234567890123");
  });

  it("produit un chiffré différent à chaque appel", () => {
    const first = encryptNpi("1234567890123", context, keyring);
    const second = encryptNpi("1234567890123", context, keyring);
    expect(first).not.toBe(second);
  });

  it("refuse un chiffré déplacé vers une autre fiche", () => {
    const stored = encryptNpi("1234567890123", context, keyring);
    expect(() => decryptNpi(stored, { ...context, recordId: "autre" }, keyring)).toThrow();
  });

  it("refuse une clé inconnue", () => {
    const stored = encryptNpi("1234567890123", context, keyring);
    const other: NpiKeyring = { ...keyring, encryptionKeys: new Map([[2, randomBytes(32)]]) };
    expect(() => decryptNpi(stored, context, other)).toThrow(/v1 inconnue/);
  });

  it("calcule un index aveugle stable, insensible aux espaces", () => {
    const a = npiBlindIndex("1234 5678 90123", keyring);
    const b = npiBlindIndex("1234567890123", keyring);
    expect(sameBlindIndex(a, b)).toBe(true);
    expect(sameBlindIndex(a, npiBlindIndex("1234567890124", keyring))).toBe(false);
  });

  it("masque tout sauf les deux derniers chiffres", () => {
    expect(maskNpi("1234567890123")).toBe("•••• •••• •••2 3");
  });

  it("construit le trousseau depuis l'environnement ou renvoie null", () => {
    expect(keyringFromEnv({})).toBeNull();
    const built = keyringFromEnv({
      NPI_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
      NPI_HASH_KEY: randomBytes(32).toString("base64"),
    });
    expect(built?.encryptionKeys.get(1)?.length).toBe(32);
  });
});
