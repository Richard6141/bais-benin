import { describe, expect, it, vi } from "vitest";
import type { Actor } from "@/modules/authorization";

vi.mock("@/database/client", () => ({
  prisma: { commune: { findMany: vi.fn(async () => [{ id: "djougou" }]) } },
}));

const { analyticsScope, assertFiltersAllowed, canFilterByStatus, requireNational } =
  await import("../scope");

const actor = (
  role: Actor["grants"][number]["role"],
  scopeType: Actor["grants"][number]["scopeType"],
  scopeId: string | null = null,
): Actor => ({
  userId: `u-${role}`,
  grants: [{ role, scopeType, scopeId }],
});

const ministry = actor("ADMIN_STATE", "NATIONAL");
const agent = actor("AGENT_AGRICULTURE", "COMMUNE", "djougou");
const buyer = actor("BUYER", "SELF");

describe("périmètre des agrégats (revue de sécurité, C1)", () => {
  it("fait confiance au ministère, pas à l'agent ni à l'acheteur de portée nationale", async () => {
    // ADR-0014 : un agent ne lit plus toutes les exploitations de sa commune (farm.read = OWN),
    // seulement celles qu'il a enregistrées. Il n'est donc plus « de confiance » pour les
    // agrégats de toute sa commune : le masquage des petits effectifs s'applique aussi à lui.
    expect(await analyticsScope(ministry)).toMatchObject({ national: true, trusted: true });
    expect(await analyticsScope(agent)).toMatchObject({
      national: false,
      communeIds: ["djougou"],
      trusted: false,
    });
    expect(await analyticsScope(buyer)).toMatchObject({ national: true, trusted: false });
  });

  it("réserve le classement national et le filtre par statut aux acteurs de confiance", async () => {
    const buyerScope = await analyticsScope(buyer);
    expect(() => requireNational(buyerScope)).toThrow(/réservé au ministère/);
    expect(() => requireNational(buyerScope)).toThrow(
      expect.objectContaining({ code: "FORBIDDEN" }),
    );
    expect(() => assertFiltersAllowed({ verificationStatus: "DECLARED" }, buyerScope)).toThrow(
      /statut de vérification/,
    );
    expect(() => assertFiltersAllowed({ cropCode: "MAIZE" }, buyerScope)).not.toThrow();

    const ministryScope = await analyticsScope(ministry);
    expect(() => requireNational(ministryScope)).not.toThrow();
    expect(() =>
      assertFiltersAllowed({ verificationStatus: "DECLARED" }, ministryScope),
    ).not.toThrow();
  });

  it("n'ouvre le filtre par statut de l'API publique qu'à la lecture nationale du registre", () => {
    expect(canFilterByStatus(null)).toBe(false);
    expect(canFilterByStatus(buyer)).toBe(false);
    expect(canFilterByStatus(agent)).toBe(false);
    expect(canFilterByStatus(ministry)).toBe(true);
  });
});
