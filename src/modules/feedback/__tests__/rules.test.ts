import { describe, expect, it } from "vitest";
import {
  MESSAGE_MAX,
  cleanPagePath,
  feedbackInput,
  maskFeedbackMessage,
  roleForPage,
} from "../rules";

// Avis des testeurs : validation du formulaire, page nettoyée, rôle rattaché et masquage.

const valid = {
  kind: "BUG",
  message: "Le bouton Enregistrer ne répond pas",
  pagePath: "/agent/enregistrer",
  device: "MOBILE",
};

describe("avis des testeurs", () => {
  it("accepte un avis complet, note facultative de 1 à 5", () => {
    expect(feedbackInput.safeParse(valid).success).toBe(true);
    expect(feedbackInput.parse({ ...valid, rating: "4" }).rating).toBe(4);
    expect(feedbackInput.safeParse({ ...valid, rating: 6 }).success).toBe(false);
    expect(feedbackInput.safeParse({ ...valid, rating: 0 }).success).toBe(false);
  });

  it("exige un message, borné à 1 000 caractères, et un type connu", () => {
    expect(feedbackInput.safeParse({ ...valid, message: "  " }).success).toBe(false);
    expect(
      feedbackInput.safeParse({ ...valid, message: "a".repeat(MESSAGE_MAX + 1) }).success,
    ).toBe(false);
    expect(feedbackInput.safeParse({ ...valid, kind: "PRAISE" }).success).toBe(false);
    expect(feedbackInput.safeParse({ ...valid, device: "TABLET" }).success).toBe(false);
  });

  it("masque numéros de téléphone, NPI et adresses e-mail", () => {
    const masked = maskFeedbackMessage(
      "Appelez-moi au 01 97 12 34 56 ou +229 0197123456, mon NPI est 1234567890123, écrire à a.b@exemple.bj",
    );
    expect(masked).not.toMatch(/97 12 34 56|0197123456|1234567890123|a\.b@exemple\.bj/);
    expect(masked).toContain("[numéro masqué]");
    expect(masked).toContain("[adresse masquée]");
    // Les nombres agronomiques restent lisibles.
    expect(maskFeedbackMessage("30 000 ha pour la campagne 2026-2027")).toBe(
      "30 000 ha pour la campagne 2026-2027",
    );
  });

  it("garde le chemin de la page sans paramètres ni ancre", () => {
    expect(cleanPagePath("/carte?parcelle=019284a0-0000#fiche")).toBe("/carte");
    expect(cleanPagePath("https://exemple.bj/agent")).toBe("/");
    expect(cleanPagePath("//exemple.bj")).toBe("/");
  });

  it("rattache l'avis au rôle de l'espace testé, si l'auteur l'a", () => {
    expect(roleForPage("/agent/exploitations", ["ADMIN_STATE", "AGENT_AGRICULTURE"])).toBe(
      "AGENT_AGRICULTURE",
    );
    expect(roleForPage("/pilotage/cultures", ["FARMER"])).toBe("FARMER");
    expect(roleForPage("/carte", ["ADMIN_STATE"])).toBe("ADMIN_STATE");
    expect(roleForPage("/carte", [])).toBeNull();
  });
});
