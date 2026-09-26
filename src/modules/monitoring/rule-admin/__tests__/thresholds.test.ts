import { describe, expect, it } from "vitest";

import { parseRuleDefinition, type RuleNode } from "@/modules/monitoring/rules";
import {
  applyThresholds,
  diffRules,
  explainDefinition,
  listThresholds,
  validateBounds,
  type RuleSnapshot,
} from "../thresholds";

const definition: RuleNode = parseRuleDefinition({
  all: [
    { indicator: "crop_in", value: ["MAIZE"] },
    { indicator: "crop_stage_in", value: ["GROWING", "FLOWERING"] },
    { indicator: "temp_max_max_3d", op: ">=", value: 38 },
    {
      any: [
        { indicator: "rain_sum_10d", op: "<", value: 5 },
        { not: { indicator: "month", op: "==", value: 8 } },
      ],
    },
  ],
});

const snapshot: RuleSnapshot = {
  name: "Chaleur sur maïs",
  description: "Maximum d'au moins 38 °C sur maïs en floraison.",
  severity: "WARNING",
  cooldownHours: 72,
  messageFr: "{commune} : chaleur.",
  messageShort: "BAIS {commune} : chaleur.",
  adviceFr: "Arrosez tôt le matin.",
  definition,
};

describe("formulaire généré depuis l'arbre", () => {
  it("liste un champ par condition numérique, avec chemin, libellé et bornes", () => {
    const fields = listThresholds(definition);
    expect(fields.map((f) => f.path)).toEqual(["all.2", "all.3.any.0", "all.3.any.1.not"]);
    expect(fields[0]).toMatchObject({
      indicator: "temp_max_max_3d",
      op: ">=",
      value: 38,
      unit: "°C",
      min: -10,
      max: 55,
      label: "Température maximale la plus haute sur 3 jours",
    });
    expect(fields[1]).toMatchObject({ indicator: "rain_sum_10d", op: "<", unit: "mm", min: 0 });
    // Les conditions de culture et de stade ne sont pas des seuils numériques.
    expect(fields.some((f) => f.path === "all.0")).toBe(false);
  });

  it("remplace les seuils sans toucher à l'original et refuse un chemin inconnu", () => {
    const updated = applyThresholds(definition, { "all.2": 40, "all.3.any.0": 3 });
    expect(listThresholds(updated).map((f) => f.value)).toEqual([40, 3, 8]);
    expect(listThresholds(definition).map((f) => f.value)).toEqual([38, 5, 8]);
    expect(() => applyThresholds(definition, { "all.0": 1 })).toThrow(RangeError);
    expect(() => applyThresholds(definition, { "all.9": 1 })).toThrow(RangeError);
  });
});

describe("bornes physiques", () => {
  it("accepte les seuils plausibles et refuse pluie négative, température au-delà de 55 °C", () => {
    expect(validateBounds(definition)).toEqual([]);
    const issues = validateBounds(applyThresholds(definition, { "all.2": 60, "all.3.any.0": -5 }));
    expect(issues.map((i) => i.path)).toEqual(["all.2", "all.3.any.0"]);
    expect(issues[0]?.message).toMatch(/60 °C hors des limites \(-10 à 55 °C\)/);
    expect(issues[1]?.message).toMatch(/Cumul de pluie sur 10 jours/);
  });
});

describe("différences entre versions", () => {
  it("liste les textes et les seuils modifiés, rien si identique", () => {
    expect(diffRules(snapshot, snapshot)).toEqual([]);
    const changes = diffRules(snapshot, {
      ...snapshot,
      cooldownHours: 48,
      messageShort: "BAIS {commune} : chaleur forte.",
      definition: applyThresholds(definition, { "all.2": 39 }),
    });
    expect(changes).toEqual([
      { field: "cooldownHours", label: "Délai de refroidissement (heures)", before: 72, after: 48 },
      {
        field: "messageShort",
        label: "Message court",
        before: "BAIS {commune} : chaleur.",
        after: "BAIS {commune} : chaleur forte.",
      },
      {
        field: "definition.all.2",
        label: "Température maximale la plus haute sur 3 jours",
        before: ">= 38",
        after: ">= 39",
      },
    ]);
  });
});

describe("explication lisible", () => {
  it("écrit les conditions en français, cultures et stades traduits", () => {
    expect(explainDefinition(definition)).toEqual([
      "Cultures présentes parmi maïs",
      "Stades des cultures parmi en croissance, en floraison",
      "Température maximale la plus haute sur 3 jours au moins 38 °C",
      "(au moins une) Cumul de pluie sur 10 jours inférieur à 5 mm",
      "(au moins une) pas : Mois égal à 8",
    ]);
  });
});

describe("regroupement de signalements (ADR-0015)", () => {
  const outbreak = parseRuleDefinition({
    all: [
      {
        indicator: "report_cluster",
        params: { type: "PEST", radiusKm: 5, days: 7 },
        op: ">=",
        value: 3,
      },
    ],
  });

  it("propose le nombre d'exploitations, le rayon et la durée comme réglages", () => {
    const fields = listThresholds(outbreak);
    expect(fields.map((f) => [f.path, f.value])).toEqual([
      ["all.0", 3],
      ["all.0#radiusKm", 5],
      ["all.0#days", 7],
    ]);
    expect(fields[0]?.label).toBe(
      "Exploitations ayant signalé des ravageurs à moins de 5 km en 7 jours",
    );
  });

  it("applique un nouveau rayon et une nouvelle durée, et refuse un seuil de 1", () => {
    const next = applyThresholds(outbreak, { "all.0#radiusKm": 10, "all.0#days": 14 });
    expect(parseRuleDefinition(next)).toEqual({
      all: [
        {
          indicator: "report_cluster",
          params: { type: "PEST", radiusKm: 10, days: 14 },
          op: ">=",
          value: 3,
        },
      ],
    });
    expect(validateBounds(applyThresholds(outbreak, { "all.0": 1 }))).toHaveLength(1);
    expect(explainDefinition(outbreak)[0]).toContain("à moins de 5 km en 7 jours au moins 3");
  });
});
