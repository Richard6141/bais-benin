import { describe, expect, it } from "vitest";
import { countLabel, situationSentence } from "./situation";

describe("countLabel", () => {
  it("accorde le nom et formate le nombre en français", () => {
    expect(countLabel(1, "alerte", "alertes")).toBe("1 alerte");
    expect(countLabel(3, "alerte", "alertes")).toBe("3 alertes");
    expect(countLabel(1200, "exploitation", "exploitations")).toMatch(/^1\s200 exploitations$/);
  });
});

describe("situationSentence", () => {
  const parts = (alerts: number, farms: number, requests: number) => [
    { count: alerts, one: "alerte en cours", many: "alertes en cours" },
    { count: farms, one: "exploitation à vérifier", many: "exploitations à vérifier" },
    { count: requests, one: "demande à traiter", many: "demandes à traiter" },
  ];

  it("ne cite que ce qui n'est pas nul, relié par « et »", () => {
    expect(situationSentence("Djougou", parts(2, 14, 0), "Rien d'urgent.")).toBe(
      "À Djougou : 2 alertes en cours et 14 exploitations à vérifier.",
    );
    expect(situationSentence("Djougou", parts(1, 1, 1), "Rien d'urgent.")).toBe(
      "À Djougou : 1 alerte en cours, 1 exploitation à vérifier et 1 demande à traiter.",
    );
  });

  it("rend la phrase calme quand rien n'attend", () => {
    expect(situationSentence("Djougou", parts(0, 0, 0), "Rien d'urgent à Djougou.")).toBe(
      "Rien d'urgent à Djougou.",
    );
  });

  it("commence par une majuscule sans lieu", () => {
    expect(situationSentence(null, parts(3, 0, 0), "Calme.")).toBe("3 alertes en cours.");
  });
});
