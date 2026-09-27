import { describe, expect, it } from "vitest";
import { fillFireBrief, popupContent, type FireBrief } from "./fire-layer";

describe("fiche courte d'un feu détecté", () => {
  it("affiche l'heure, la commune, la confiance et une zone de chargement", () => {
    const { root, brief } = popupContent({
      detectedAt: "2026-09-27T10:00:00.000Z",
      commune: "Djougou",
      sensors: "VIIRS_SNPP,MODIS",
      confidence: "HIGH",
      frp: 42,
    });
    expect(root.textContent).toContain("Djougou");
    expect(root.textContent).toContain("haute");
    expect(brief.textContent).toContain("Recherche des exploitations menacées");
  });

  it("montre les exploitations, les cultures, les producteurs prévenus et le lien de l'alerte", () => {
    const brief = document.createElement("div");
    const data: FireBrief = {
      inScope: true,
      farmsWithin500m: 2,
      farmsWithin1km: 5,
      crops: ["Maïs", "Coton"],
      notified: 3,
      alertHref: "/pilotage/alertes/abc",
    };
    fillFireBrief(brief, data);
    expect(brief.textContent).toContain("2 exploitations à moins de 500 m");
    expect(brief.textContent).toContain("5 à moins d'1 km");
    expect(brief.textContent).toContain("Maïs, Coton");
    expect(brief.textContent).toContain("3 producteurs prévenus");
    const link = brief.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/pilotage/alertes/abc");
    expect(link?.textContent).toBe("Voir l'alerte");
  });

  it("dit que le feu est hors périmètre sans en révéler les chiffres", () => {
    const brief = document.createElement("div");
    fillFireBrief(brief, {
      inScope: false,
      farmsWithin500m: 0,
      farmsWithin1km: 0,
      crops: [],
      notified: 0,
      alertHref: null,
    });
    expect(brief.textContent).toBe("Ce feu est hors de votre périmètre.");
  });

  it("signale une panne réseau sans rien affirmer", () => {
    const brief = document.createElement("div");
    fillFireBrief(brief, null);
    expect(brief.textContent).toBe("Détails momentanément indisponibles.");
  });

  it("ne coupe jamais le texte et n'affiche pas de tiret", () => {
    const brief = document.createElement("div");
    fillFireBrief(brief, {
      inScope: true,
      farmsWithin500m: 0,
      farmsWithin1km: 0,
      crops: [],
      notified: 0,
      alertHref: null,
    });
    expect(brief.textContent).not.toMatch(/·|…|—/);
    expect(brief.textContent).toContain("Aucune culture déclarée");
  });
});
