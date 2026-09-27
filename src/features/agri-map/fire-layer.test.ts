import { afterEach, describe, expect, it, vi } from "vitest";
import type { FireBrief } from "./fire-layer";

class FakePopup {
  setLngLat() {
    return this;
  }
  setDOMContent() {
    return this;
  }
  addTo() {
    return this;
  }
  on() {
    return this;
  }
}

vi.mock("maplibre-gl", () => ({ Popup: FakePopup }));

const { fillFireBrief, popupContent, showFireLayer, FIRE_IDS } = await import("./fire-layer");

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

  it("montre les exploitations, les cultures, les deux comptes de producteurs et le lien de l'alerte", () => {
    const brief = document.createElement("div");
    const data: FireBrief = {
      inScope: true,
      farmsWithin500m: 2,
      farmsWithin1km: 5,
      crops: ["Maïs", "Coton"],
      notifiedByMessage: 3,
      informedInApp: 4,
      alertHref: "/pilotage/alertes/abc",
    };
    fillFireBrief(brief, data);
    expect(brief.textContent).toContain("2 exploitations à moins de 500 m");
    expect(brief.textContent).toContain("5 à moins d'1 km");
    expect(brief.textContent).toContain("Maïs, Coton");
    expect(brief.textContent).toContain("3 producteurs prévenus par WhatsApp ou SMS");
    expect(brief.textContent).toContain("4 informés dans l'application");
    const link = brief.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/pilotage/alertes/abc");
    expect(link?.textContent).toBe("Voir l'alerte");
  });

  it("n'affiche aucun compte de producteurs plutôt qu'un zéro inquiétant", () => {
    const brief = document.createElement("div");
    fillFireBrief(brief, {
      inScope: true,
      farmsWithin500m: 1,
      farmsWithin1km: 1,
      crops: [],
      notifiedByMessage: 0,
      informedInApp: 0,
      alertHref: null,
    });
    expect(brief.textContent).not.toContain("prévenu");
    expect(brief.textContent).not.toContain("informé");
  });

  it("dit que le feu est hors périmètre sans en révéler les chiffres", () => {
    const brief = document.createElement("div");
    fillFireBrief(brief, {
      inScope: false,
      farmsWithin500m: 0,
      farmsWithin1km: 0,
      crops: [],
      notifiedByMessage: 0,
      informedInApp: 0,
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
      notifiedByMessage: 0,
      informedInApp: 0,
      alertHref: null,
    });
    expect(brief.textContent).not.toMatch(/·|…|—/);
    expect(brief.textContent).toContain("Aucune culture déclarée");
  });
});

describe("clic sur un feu", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("appelle la fiche avec l'identifiant des propriétés, jamais celui du sommet", async () => {
    const handlers: Record<string, (event: unknown) => void> = {};
    const fakeMap = {
      getSource: () => undefined,
      addSource: () => {},
      addLayer: () => {},
      on: (event: string, arg2: unknown, arg3?: (event: unknown) => void) => {
        if (typeof arg2 === "string") handlers[`${event}:${arg2}`] = arg3!;
        else handlers[event] = arg2 as (event: unknown) => void;
      },
      getCanvas: () => ({ style: {} }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;

    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({}) }));
    vi.stubGlobal("fetch", fetchMock);

    showFireLayer(fakeMap, { type: "FeatureCollection", features: [] });
    const click = handlers[`click:${FIRE_IDS.layer}`]!;
    // MapLibre a coercé l'id du sommet en NaN (un UUID n'est pas castable en nombre) : le clic
    // doit ignorer feature.id et lire properties.id, où l'identifiant utile a été dupliqué.
    click({
      features: [
        {
          id: Number.NaN,
          properties: {
            id: "9251bcb9-a179-4074-922c-7c81b66c5be9",
            detectedAt: "2026-09-26T13:44:00.000Z",
          },
        },
      ],
      lngLat: { lng: 1.67, lat: 9.7 },
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/v1/fires/9251bcb9-a179-4074-922c-7c81b66c5be9/brief",
      expect.anything(),
    );
  });
});
