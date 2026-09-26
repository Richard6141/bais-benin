import { describe, expect, it } from "vitest";
import { maskWithinCommune, type AssistanceCommuneStats } from "../stats-masking";

// Secret statistique dans une commune affichée (revue de sécurité R6) : cases par statut de
// moins de 5 masquées, complément quand le total de la ligne redonnerait la valeur, délais
// médians publiés sur 5 demandes au moins.

function row(values: Partial<AssistanceCommuneStats>): AssistanceCommuneStats {
  return {
    communeCode: "BJ-DON-003",
    communeName: "Djougou",
    total: 0,
    received: 0,
    inProgress: 0,
    resolved: 0,
    medianHoursToTake: 12,
    medianHoursToResolve: 48,
    masked: false,
    maskedFields: [],
    ...values,
  };
}

describe("masquage des cases d'une commune affichée", () => {
  it("masque une case de moins de 5 et son complément", () => {
    const out = maskWithinCommune(row({ total: 7, received: 1, inProgress: 0, resolved: 6 }));
    // 7 − 0 − 6 redonnerait 1 : la case « résolues » est masquée aussi.
    expect(out).toMatchObject({ received: null, inProgress: 0, resolved: null, total: 7 });
    expect(out.maskedFields).toEqual(["received", "resolved"]);
    // 6 demandes prises en charge, 6 résolues : les délais restent publiés.
    expect(out).toMatchObject({ medianHoursToTake: 12, medianHoursToResolve: 48 });
  });

  it("ne publie pas un délai médian calculé sur moins de 5 demandes", () => {
    const out = maskWithinCommune(row({ total: 8, received: 2, inProgress: 3, resolved: 3 }));
    expect(out).toMatchObject({ medianHoursToTake: 12, medianHoursToResolve: null });
    expect(out.maskedFields).toContain("medianHoursToResolve");
  });

  it("laisse intactes une ligne sans petite case et une commune déjà masquée", () => {
    expect(
      maskWithinCommune(row({ total: 15, received: 5, inProgress: 5, resolved: 5 })).maskedFields,
    ).toEqual([]);
    const hidden = row({ masked: true, total: null, received: null });
    expect(maskWithinCommune(hidden)).toBe(hidden);
  });
});
