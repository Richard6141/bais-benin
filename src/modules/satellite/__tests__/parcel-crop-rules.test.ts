import { describe, expect, it } from "vitest";
import {
  FIELD_VISIT_WEIGHT,
  cropDoubtReason,
  trainingLabel,
  visitPriority,
} from "../parcel-crop-rules";

// Apprentissage actif (ADR-0030, lot 2) : quelle étiquette apprend le modèle, dans quel ordre
// l'agent visite, et ce qu'on lui dit.

describe("étiquette d'entraînement", () => {
  const base = {
    crop_code: "MAIZE",
    verified: false,
    visit_outcome: null,
    observed_crop_code: null,
  };

  it("préfère la culture constatée sur place, avec un poids double", () => {
    expect(trainingLabel({ ...base, verified: true, observed_crop_code: "COTTON" })).toEqual({
      group: "COTTON",
      weight: FIELD_VISIT_WEIGHT,
      source: "observed",
    });
  });

  it("garde la déclaration d'une exploitation vérifiée au bureau, avec un poids simple", () => {
    expect(trainingLabel({ ...base, verified: true })).toEqual({
      group: "MAIZE",
      weight: 1,
      source: "desk",
    });
  });

  it("donne un poids double à une déclaration confirmée par une visite de la parcelle", () => {
    expect(trainingLabel({ ...base, visit_outcome: "CONFIRMED" })?.weight).toBe(FIELD_VISIT_WEIGHT);
  });

  it("écarte une parcelle rejetée à la visite, ou simplement déclarée", () => {
    expect(trainingLabel({ ...base, verified: true, visit_outcome: "REJECTED" })).toBeNull();
    expect(trainingLabel(base)).toBeNull();
    expect(trainingLabel({ ...base, crop_code: "INCONNUE", verified: true })).toBeNull();
  });
});

describe("file de visite", () => {
  it("met d'abord les désaccords sûrs, puis les incertaines les moins sûres", () => {
    const order = [
      { name: "incertaine 55 %", priority: visitPriority("UNCERTAIN", 0.55) },
      { name: "désaccord 90 %", priority: visitPriority("DIFFERS", 0.9) },
      { name: "incertaine 30 %", priority: visitPriority("UNCERTAIN", 0.3) },
      { name: "désaccord 65 %", priority: visitPriority("DIFFERS", 0.65) },
    ]
      .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
      .map((entry) => entry.name);
    expect(order).toEqual([
      "désaccord 90 %",
      "désaccord 65 %",
      "incertaine 30 %",
      "incertaine 55 %",
    ]);
    expect(visitPriority("AGREES", 0.95)).toBeNull();
  });

  it("dit à l'agent ce que voit le satellite, ce qui est déclaré et avec quelle confiance", () => {
    const differs = cropDoubtReason({
      agreement: "DIFFERS",
      measuredLabel: "Coton",
      declaredLabel: "Maïs",
      confidence: 0.72,
    });
    expect(differs).toMatch(/^Satellite : coton, déclaré : maïs, confiance 72\s%$/);
    const uncertain = cropDoubtReason({
      agreement: "UNCERTAIN",
      measuredLabel: "Soja",
      declaredLabel: "Soja",
      confidence: 0.48,
    });
    expect(uncertain).toMatch(/^Satellite incertain : soja peut-être, confiance 48\s%$/);
    expect(`${differs}${uncertain}`).not.toMatch(/[·…—;]/);
  });
});
