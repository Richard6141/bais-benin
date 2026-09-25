import { describe, expect, it } from "vitest";
import { actorTerritory, authorize, scopeFilter, type Actor, type RoleGrant } from "../authorize";
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
  registeredByUserId: ME,
  communeId: COMMUNE_A,
  departementId: DEPARTEMENT_X,
  organizationIds: [ORGANIZATION_1],
};
const outOfScope = {
  ownerUserId: OTHER,
  registeredByUserId: OTHER,
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
          case "OWN":
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
  it("un agent départemental couvre les communes de son département (farm.create)", () => {
    // farm.create reste SCOPE pour l'agent (là où il a le droit d'enregistrer une exploitation) ;
    // farm.read est désormais OWN, indépendant de la commune (voir « ADR-0014 »).
    const actor: Actor = {
      userId: ME,
      grants: [{ role: "AGENT_AGRICULTURE", scopeType: "DEPARTEMENT", scopeId: DEPARTEMENT_X }],
      communeIdsByDepartement: new Map([[DEPARTEMENT_X, [COMMUNE_A]]]),
    };
    expect(authorize(actor, "farm.create", { communeId: COMMUNE_A }).allowed).toBe(true);
    expect(authorize(actor, "farm.create", { communeId: COMMUNE_B }).allowed).toBe(false);
  });

  it("cumule les affectations : la première qui autorise suffit", () => {
    const actor: Actor = {
      userId: ME,
      grants: [
        { role: "FARMER", scopeType: "SELF", scopeId: null },
        { role: "AGENT_AGRICULTURE", scopeType: "COMMUNE", scopeId: COMMUNE_B },
      ],
    };
    // farm.verify (OWN pour l'agent) : seule l'exploitation qu'il a enregistrée compte, la
    // commune ne suffit plus.
    expect(
      authorize(actor, "farm.verify", { registeredByUserId: ME, communeId: COMMUNE_B }).allowed,
    ).toBe(true);
    expect(
      authorize(actor, "farm.verify", { registeredByUserId: OTHER, communeId: COMMUNE_B }).allowed,
    ).toBe(false);
    expect(authorize(actor, "farm.read", { ownerUserId: ME, communeId: COMMUNE_A }).allowed).toBe(
      true,
    );
  });

  it("refuse tout à un compte sans affectation", () => {
    const actor: Actor = { userId: ME, grants: [] };
    expect(authorize(actor, "listing.read").allowed).toBe(false);
    expect(scopeFilter(actor, "farm.read")).toEqual({ kind: "none" });
  });

  it("ADR-0014 : un agent ne lit que ce qu'il a lui-même enregistré, jamais toute sa commune", () => {
    const actor: Actor = { userId: ME, grants: [grantFor("AGENT_AGRICULTURE")] };
    // Dans sa commune, mais enregistrée par quelqu'un d'autre : refusé.
    expect(
      authorize(actor, "farm.read", { communeId: COMMUNE_A, registeredByUserId: OTHER }).allowed,
    ).toBe(false);
    // Enregistrée par lui, même si (par hypothèse) hors de sa commune assignée : autorisé.
    expect(
      authorize(actor, "farm.read", { communeId: COMMUNE_B, registeredByUserId: ME }).allowed,
    ).toBe(true);
  });

  it("farmer.contact.read reste territorial pour l'agent (relais d'alerte, pas le registre)", () => {
    const actor: Actor = { userId: ME, grants: [grantFor("AGENT_AGRICULTURE")] };
    expect(authorize(actor, "farmer.contact.read", { communeId: COMMUNE_A }).allowed).toBe(true);
    expect(authorize(actor, "farmer.contact.read", { communeId: COMMUNE_B }).allowed).toBe(false);
  });
});

describe("filtre de périmètre pour les listes", () => {
  it("renvoie tout pour le ministère", () => {
    expect(scopeFilter({ userId: ME, grants: [grantFor("ADMIN_STATE")] }, "farm.read")).toEqual({
      kind: "all",
    });
  });

  it("renvoie l'union des communes pour un agent multi-affecté (farm.create)", () => {
    const actor: Actor = {
      userId: ME,
      grants: [
        { role: "AGENT_AGRICULTURE", scopeType: "COMMUNE", scopeId: COMMUNE_A },
        { role: "AGENT_AGRICULTURE", scopeType: "COMMUNE", scopeId: COMMUNE_B },
        { role: "FARMER", scopeType: "SELF", scopeId: null },
      ],
    };
    expect(scopeFilter(actor, "farm.create")).toEqual({
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

  it("renvoie « registered » pour un agent sur farm.read (ADR-0014)", () => {
    expect(
      scopeFilter({ userId: ME, grants: [grantFor("AGENT_AGRICULTURE")] }, "farm.read"),
    ).toEqual({ kind: "registered", userId: ME });
  });
});

describe("actorTerritory : périmètre territorial indépendant de la portée d'une action", () => {
  it("couvre toujours la commune assignée, même si farm.read est restreint à OWN", () => {
    const actor: Actor = { userId: ME, grants: [grantFor("AGENT_AGRICULTURE")] };
    expect(actorTerritory(actor)).toEqual({
      kind: "territory",
      communeIds: [COMMUNE_A],
      departementIds: [],
      organizationIds: [],
      includeSelf: false,
    });
  });

  it("renvoie tout pour une affectation nationale", () => {
    expect(actorTerritory({ userId: ME, grants: [grantFor("ADMIN_STATE")] })).toEqual({
      kind: "all",
    });
  });

  it("renvoie « none » pour un rôle sans affectation territoriale", () => {
    expect(actorTerritory({ userId: ME, grants: [grantFor("FARMER")] })).toEqual({ kind: "none" });
  });
});
