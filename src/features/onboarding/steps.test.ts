import { describe, expect, it } from "vitest";
import { TOURS, nextStep, stepForPath, stepLink } from "./steps";

describe("parcours « Premiers pas »", () => {
  it("donne à chaque rôle des étapes uniques, dans son espace", () => {
    const spaces = { ministere: "/pilotage", agent: "/agent", producteur: "/agriculteur" };
    for (const [role, steps] of Object.entries(TOURS)) {
      const ids = steps.map((step) => step.id);
      expect(new Set(ids).size).toBe(ids.length);
      for (const step of steps) {
        expect(step.href.startsWith(spaces[role as keyof typeof spaces])).toBe(true);
        // Texte affiché sans les séparateurs exclus de la charte.
        expect(`${step.title} ${step.why}`).not.toMatch(/[·…—]/);
      }
    }
  });

  it("ouvre une étape avec sa mise en évidence, en gardant la requête de l'écran", () => {
    const [situation, , carte] = TOURS.ministere;
    expect(stepLink(situation!)).toBe("/pilotage?pas=situation");
    expect(stepLink(carte!)).toBe("/pilotage?onglet=carte&pas=carte");
  });

  it("reconnaît l'écran d'une étape, sans confondre un onglet avec l'accueil", () => {
    expect(stepForPath(TOURS.ministere, "/pilotage")?.id).toBe("situation");
    expect(stepForPath(TOURS.agent, "/agent/demandes")?.id).toBe("demandes");
    expect(stepForPath(TOURS.agent, "/agent/demandes/xyz")).toBeNull();
  });

  it("propose l'étape suivante non faite, en reprenant au début", () => {
    const steps = TOURS.producteur;
    expect(nextStep(steps, new Set())?.id).toBe("champs");
    expect(nextStep(steps, new Set(["champs", "alertes"]), "alertes")?.id).toBe("recolte");
    expect(nextStep(steps, new Set(["recolte"]), "attestation")?.id).toBe("champs");
    expect(nextStep(steps, new Set(steps.map((step) => step.id)))).toBeNull();
  });
});
