import { describe, expect, it } from "vitest";
import { fireEmptyMessage } from "./fire-status";

describe("message d'une couche de feux vide", () => {
  it("donne le total sur 7 jours quand la fenêtre de 24 heures est vide", () => {
    expect(fireEmptyMessage("24h", 5)).toBe(
      "Aucun feu détecté ces dernières 24 heures. 5 sur 7 jours.",
    );
  });

  it("reste sobre tant que le total sur 7 jours n'est pas connu", () => {
    expect(fireEmptyMessage("24h", null)).toBe("Aucun feu détecté ces dernières 24 heures.");
  });

  it("ne redemande rien de plus large pour une fenêtre de 7 jours déjà vide", () => {
    expect(fireEmptyMessage("7j", 0)).toBe("Aucun feu détecté ces 7 derniers jours.");
  });
});
