import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// API publique des statistiques territoriales : le filtre par statut de vérification est réservé
// à la lecture nationale du registre (revue de sécurité, C1). Services et session remplacés.

const state = vi.hoisted(() => ({ actor: null as unknown }));
const services = vi.hoisted(() => ({
  getCommuneStats: vi.fn(async () => ({ items: [] })),
  getDepartementStats: vi.fn(async () => ({ items: [] })),
  getNationalStats: vi.fn(async () => ({ farmCount: 10 })),
}));

vi.mock("@/features/auth/api-actor", () => ({
  getApiActor: async () => (state.actor ? { userId: "u", actor: state.actor } : null),
}));
vi.mock("@/modules/analytics", async () => {
  const { z } = await import("zod");
  const { canFilterByStatus } = await import("@/modules/analytics/scope");
  return {
    ...services,
    canFilterByStatus,
    statsFiltersSchema: z.object({
      cropCode: z.string().optional(),
      verificationStatus: z
        .enum(["DECLARED", "AGENT_VERIFIED", "FIELD_VERIFIED", "DISPUTED"])
        .optional(),
    }),
  };
});
vi.mock("@/database/client", () => ({ prisma: {} }));

const { GET } = await import("../route");

const request = (query: string) =>
  new NextRequest(`http://localhost/api/v1/territory/stats?${query}`);

describe("GET /api/v1/territory/stats", () => {
  beforeEach(() => {
    state.actor = null;
    services.getCommuneStats.mockClear();
  });

  it("sert les agrégats publics avec un cache partagé", async () => {
    const response = await GET(request("level=communes&cropCode=MAIZE"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toMatch(/^public/);
  });

  it("refuse le filtre par statut à un visiteur et à un acheteur", async () => {
    expect((await GET(request("verificationStatus=DISPUTED"))).status).toBe(403);
    state.actor = { userId: "b", grants: [{ role: "BUYER", scopeType: "SELF", scopeId: null }] };
    expect((await GET(request("verificationStatus=DISPUTED"))).status).toBe(403);
    expect(services.getCommuneStats).not.toHaveBeenCalled();
  });

  it("l'accepte pour le ministère, en réponse privée", async () => {
    state.actor = {
      userId: "m",
      grants: [{ role: "ADMIN_STATE", scopeType: "NATIONAL", scopeId: null }],
    };
    const response = await GET(request("verificationStatus=DISPUTED"));
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  });
});
