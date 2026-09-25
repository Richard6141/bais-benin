import { describe, expect, it, vi } from "vitest";
import { decimal, formatCsv } from "../csv";

vi.mock("@/database/client", () => ({ prisma: {} }));

const { REFRESH_MAX_AGE_MS, refreshReason } = await import("../refresh");

describe("CSV pour Excel en français", () => {
  it("écrit le BOM, le point-virgule, la virgule décimale et des cellules vides pour null", () => {
    const csv = formatCsv(
      ["culture", "superficie_ha", "production_t", "masque_k"],
      [
        ["Maïs", 929.977, null, false],
        ["Riz", 12, 0.5, true],
      ],
    );
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).startsWith("culture;superficie_ha;production_t;masque_k\r\n")).toBe(true);
    expect(csv).toContain("Maïs;929,977;;false\r\n");
    expect(csv).toContain("Riz;12;0,5;true\r\n");
    expect(decimal(1.23456, 2)).toBe("1,23");
    expect(decimal(null)).toBe("");
  });

  it("protège les séparateurs, les guillemets et les formules", () => {
    const csv = formatCsv(["nom"], [["Adja; Ouèrè"], ['dit "le grand"'], ["=SOMME(A1)"], ["-3"]]);
    expect(csv).toContain('"Adja; Ouèrè"');
    expect(csv).toContain('"dit ""le grand"""');
    expect(csv).toContain("'=SOMME(A1)");
    expect(csv).toContain("\r\n-3\r\n");
  });
});

describe("décision de rafraîchir les agrégats", () => {
  const now = new Date("2026-09-25T10:00:00Z");
  const minutesAgo = (m: number) => new Date(now.getTime() - m * 60_000);

  it("rafraîchit la première fois, après une écriture, ou après une heure", () => {
    expect(refreshReason({ refreshedAt: null, lastChange: null, now })).toBe("never");
    expect(refreshReason({ refreshedAt: minutesAgo(20), lastChange: minutesAgo(5), now })).toBe(
      "changed",
    );
    expect(
      refreshReason({
        refreshedAt: new Date(now.getTime() - REFRESH_MAX_AGE_MS - 1),
        lastChange: null,
        now,
      }),
    ).toBe("expired");
    expect(refreshReason({ refreshedAt: minutesAgo(20), lastChange: minutesAgo(30), now })).toBe(
      "fresh",
    );
  });
});
