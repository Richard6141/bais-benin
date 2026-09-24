import { describe, expect, it } from "vitest";
import { authorize, scopeFilter, type Actor, type RoleGrant } from "../authorize";
import { ACTIONS, POLICY_MATRIX, ROLES, type RoleCode } from "../policies.matrix";

const COMMUNE_A = "commune-a";
const COMMUNE_B = "commune-b";
const DEPARTEMENT_X = "departement-x";
const ORGANIZATION_1 = "organisation-1";
const ME = "user-me";
const OTHER = "user-other";

// Chaque rôle reçoit une affectation représentative de son périmètre habituel.
function grantFor(role: RoleCode): RoleGrant {
  switch (role) {
    case "ADMIN_STATE":
      return { role, scopeType: "NATIONAL", scopeId: null };
    case "AGENT_AGRICULTURE":
      return { role, scopeType: "COMMUNE", scopeId: COMMUNE_A };
    case "FARMER":
      return { role, scopeType: "SELF", scopeId: null };
    case "COOPERATIVE":
      return { role, scopeType: "ORGANIZATION", scopeId: ORGANIZATION_1 };
    case "BUYER":
      return { role, scopeType: "SELF", scopeId: null };
  }
}

const inScope = {
  ownerUserId: ME,
  communeId: COMMUNE_A,
  departementId: DEPARTEMENT_X,
  organizationIds: [ORGANIZATION_1],
};
const outOfScope = {
  ownerUserId: OTHER,
  communeId: COMMUNE_B,
  departementId: "departement-y",
  organizationIds: ["organisation-2"],
};

describe("matrice rôle × action × portée", () => {
  for (const role of ROLES) {
    const actor: Actor = { userId: ME, grants: [grantFor(role)] };
    for (const action of ACTIONS) {
      const reach = POLICY_MATRIX[role][action];
      it(`${role} · ${action} · ${reach}`, () => {
        const inside = authorize(actor, action, inScope).allowed;
        const outside = authorize(actor, action, outOfScope).allowed;
        switch (reach) {
          case "ALL":
            expect(inside).toBe(true);
            expect(outside).toBe(true);
            break;
          case "SCOPE":
          case "SELF":
            expect(inside).toBe(true);
            expect(outside).toBe(false);
            break;
          case "NONE":
            expect(inside).toBe(false);
            expect(outside).toBe(false);
            break;
        }
      });
    }
  }
});

describe("cas particuliers", () => {
  it("un agent départemental couvre les communes de son département", () => {
    const actor: Actor = {
      userId: ME,
      grants: [{ role: "AGENT_AGRICULTURE", scopeType: "DEPARTEMENT", scopeId: DEPARTEMENT_X }],
      communeIdsByDepartement: new Map([[DEPARTEMENT_X, [COMMUNE_A]]]),
    };
    expect(authorize(actor, "farm.read", { communeId: COMMUNE_A }).allowed).toBe(true);
    expect(authorize(actor, "farm.read", { communeId: COMMUNE_B }).allowed).toBe(false);
  });

  it("cumule les affectations : la première qui autorise suffit", () => {
    const actor: Actor = {
      userId: ME,
      grants: [
        { role: "FARMER", scopeType: "SELF", scopeId: null },
        { role: "AGENT_AGRICULTURE", scopeType: "COMMUNE", scopeId: COMMUNE_B },
      ],
    };
    expect(authorize(actor, "farm.verify", { communeId: COMMUNE_B }).allowed).toBe(true);
    expect(authorize(actor, "farm.read", { ownerUserId: ME, communeId: COMMUNE_A }).allowed).toBe(
      true,
    );
  });

  it("refuse tout à un compte sans affectation", () => {
    const actor: Actor = { userId: ME, grants: [] };
    expect(authorize(actor, "listing.read").allowed).toBe(false);
    expect(scopeFilter(actor, "farm.read")).toEqual({ kind: "none" });
  });
});

describe("filtre de périmètre pour les listes", () => {
  it("renvoie tout pour le ministère", () => {
    expect(scopeFilter({ userId: ME, grants: [grantFor("ADMIN_STATE")] }, "farm.read")).toEqual({
      kind: "all",
    });
  });

  it("renvoie l'union des communes et organisations pour un agent multi-affecté", () => {
    const actor: Actor = {
      userId: ME,
      grants: [
        { role: "AGENT_AGRICULTURE", scopeType: "COMMUNE", scopeId: COMMUNE_A },
        { role: "AGENT_AGRICULTURE", scopeType: "COMMUNE", scopeId: COMMUNE_B },
        { role: "FARMER", scopeType: "SELF", scopeId: null },
      ],
    };
    expect(scopeFilter(actor, "farm.read")).toEqual({
      kind: "territory",
      communeIds: [COMMUNE_A, COMMUNE_B],
      departementIds: [],
      organizationIds: [],
      includeSelf: true,
    });
  });

  it("renvoie soi-même pour un agriculteur", () => {
    expect(scopeFilter({ userId: ME, grants: [grantFor("FARMER")] }, "farm.read")).toEqual({
      kind: "self",
      userId: ME,
    });
  });
});
