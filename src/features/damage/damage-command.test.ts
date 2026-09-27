import { describe, expect, it } from "vitest";
import { damageDeclarationReviewPayload } from "@/modules/sync/commands";
import { buildDamageReview, parseHectares } from "./damage-command";

// Constat d'un sinistre (ADR-0038 §2) traduit en commande hors ligne : décision obligatoire,
// surface constatée pour une confirmation, raison pour un rejet ; la charge utile passe le même
// contrôle que côté serveur.

const base = {
  declarationId: "019284a0-0000-7000-8000-00000000d001",
  decision: null,
  observedAreaHa: "",
  cropCode: "",
  cropStage: "",
  note: "",
  reason: "",
  now: new Date("2026-12-28T10:00:00Z"),
} as const;

describe("constat d'un sinistre", () => {
  it("lit une surface avec une virgule ou un point", () => {
    expect(parseHectares("0,75")).toBe(0.75);
    expect(parseHectares("1.5")).toBe(1.5);
    expect(parseHectares(" 2 ")).toBe(2);
    expect(parseHectares("")).toBeNull();
    expect(parseHectares("deux")).toBeNull();
    expect(parseHectares("-1")).toBeNull();
  });

  it("demande une décision, puis une surface pour confirmer", () => {
    expect(buildDamageReview(base)).toEqual({
      ok: false,
      error: "Dites si le sinistre est confirmé ou écarté.",
    });
    expect(buildDamageReview({ ...base, decision: "CONFIRMED" })).toMatchObject({ ok: false });
    const built = buildDamageReview({
      ...base,
      decision: "CONFIRMED",
      observedAreaHa: "0,8",
      cropCode: "MAIZE",
      cropStage: "GROWING",
      note: "  Moitié du champ  ",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.payload).toEqual({
      id: base.declarationId,
      decision: "CONFIRMED",
      observedAreaHa: 0.8,
      cropCode: "MAIZE",
      cropStage: "GROWING",
      note: "Moitié du champ",
      reviewedAt: "2026-12-28T10:00:00.000Z",
    });
    expect(damageDeclarationReviewPayload.safeParse(built.payload).success).toBe(true);
  });

  it("demande une raison pour écarter", () => {
    expect(buildDamageReview({ ...base, decision: "REJECTED", reason: "ok" })).toMatchObject({
      ok: false,
    });
    const built = buildDamageReview({
      ...base,
      decision: "REJECTED",
      reason: "Brûlis volontaire du producteur",
      observedAreaHa: "3",
    });
    expect(built.ok).toBe(true);
    if (!built.ok) return;
    expect(built.payload).toEqual({
      id: base.declarationId,
      decision: "REJECTED",
      reason: "Brûlis volontaire du producteur",
      reviewedAt: "2026-12-28T10:00:00.000Z",
    });
    expect(damageDeclarationReviewPayload.safeParse(built.payload).success).toBe(true);
  });
});
