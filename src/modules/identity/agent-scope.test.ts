import { describe, expect, it } from "vitest";
import { diffAgentScope, normalizeAgentScope } from "./agent-scope";

describe("périmètre d'un agent", () => {
  it("garde les départements, puis les communes qui n'y sont pas déjà", () => {
    const entries = normalizeAgentScope(
      [
        { id: "djougou", departementId: "donga" },
        { id: "parakou", departementId: "borgou" },
        { id: "parakou", departementId: "borgou" },
      ],
      ["donga", "donga"],
    );
    expect(entries).toEqual([
      { scopeType: "DEPARTEMENT", scopeId: "donga" },
      { scopeType: "COMMUNE", scopeId: "parakou" },
    ]);
  });

  it("ne renvoie rien sans commune ni département", () => {
    expect(normalizeAgentScope([], [])).toEqual([]);
  });

  it("accorde le nouveau, retire l'ancien et laisse ce qui ne change pas", () => {
    const current = [
      { id: "a1", scopeType: "COMMUNE", scopeId: "djougou" },
      { id: "a2", scopeType: "COMMUNE", scopeId: "copargo" },
      { id: "a3", scopeType: "NATIONAL", scopeId: null },
    ];
    const { toGrant, toRevoke } = diffAgentScope(current, [
      { scopeType: "COMMUNE", scopeId: "djougou" },
      { scopeType: "DEPARTEMENT", scopeId: "borgou" },
    ]);
    expect(toGrant).toEqual([{ scopeType: "DEPARTEMENT", scopeId: "borgou" }]);
    expect(toRevoke.map((row) => row.id)).toEqual(["a2", "a3"]);
  });
});
