import { describe, expect, it, vi } from "vitest";

vi.mock("@/database/client", () => ({ prisma: {} }));

const { CODE_LENGTH, formatAttestationCode, newAttestationCode, normalizeAttestationCode } =
  await import("../attestations");

describe("numéro d'attestation", () => {
  it("tire 16 caractères sans lettres ni chiffres qui se confondent", () => {
    for (let i = 0; i < 50; i += 1) {
      const code = newAttestationCode();
      expect(code).toHaveLength(CODE_LENGTH);
      expect(code).not.toMatch(/[01ILO]/);
    }
  });

  it("s'affiche par groupes de quatre et se relit quelle que soit la saisie", () => {
    const code = newAttestationCode(Buffer.from(Array.from({ length: 16 }, (_, i) => i * 7)));
    const shown = formatAttestationCode(code);
    expect(shown).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(normalizeAttestationCode(shown.toLowerCase())).toBe(code);
    expect(normalizeAttestationCode(shown.replaceAll("-", " "))).toBe(code);
  });

  it("refuse un numéro incomplet ou hors alphabet", () => {
    expect(normalizeAttestationCode("ABCD-EFGH")).toBeNull();
    expect(normalizeAttestationCode("ABCD-EFGH-JKMN-PQR0")).toBeNull();
  });
});
