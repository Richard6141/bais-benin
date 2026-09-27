import { describe, expect, it } from "vitest";
import {
  FIRE_CRITICAL_DISTANCE_M,
  bearingDegrees,
  directionFr,
  distanceFr,
  fieldFr,
  fireMessageSms,
  fireMessageWhatsApp,
  fireSeverity,
  passageFr,
  type FireExposure,
} from "../fire-message";

// Parcelle près de Djougou ; environ 111 m par millième de degré de latitude, 110 m de longitude.
const parcel = { lat: 9.7, lon: 1.67 };
// 14 h 05 à Porto-Novo (UTC+1).
const detectedAt = new Date("2026-09-27T13:05:00Z");
const now = new Date("2026-09-27T15:00:00Z");

const exposure = (overrides: Partial<FireExposure> = {}): FireExposure => ({
  distanceM: 620,
  parcel,
  fire: { lat: parcel.lat + 0.004, lon: parcel.lon + 0.004 },
  detectedAt,
  cropName: "Maïs",
  ...overrides,
});

describe("direction du feu depuis la parcelle", () => {
  it("donne le cap vers les quatre points cardinaux", () => {
    expect(bearingDegrees(parcel, { lat: 9.71, lon: 1.67 })).toBeCloseTo(0, 0);
    expect(bearingDegrees(parcel, { lat: 9.7, lon: 1.68 })).toBeCloseTo(90, 0);
    expect(bearingDegrees(parcel, { lat: 9.69, lon: 1.67 })).toBeCloseTo(180, 0);
    expect(bearingDegrees(parcel, { lat: 9.7, lon: 1.66 })).toBeCloseTo(270, 0);
  });

  it("dit la direction en huit secteurs, comme on la dit", () => {
    expect(directionFr(bearingDegrees(parcel, { lat: 9.704, lon: 1.674 }))).toBe("au nord-est");
    expect(directionFr(bearingDegrees(parcel, { lat: 9.696, lon: 1.666 }))).toBe("au sud-ouest");
    expect(directionFr(90)).toBe("à l'est");
    expect(directionFr(270)).toBe("à l'ouest");
    expect(directionFr(350)).toBe("au nord");
    expect(directionFr(-10)).toBe("au nord");
    expect(directionFr(157)).toBe("au sud-est");
  });
});

describe("distance lisible", () => {
  it("arrondit à 100 m sous le kilomètre, sans fausse précision", () => {
    expect(distanceFr(40)).toBe("moins de 100 m");
    expect(distanceFr(620)).toBe("environ 600 m");
    expect(distanceFr(480)).toBe("environ 500 m");
    expect(distanceFr(960)).toBe("environ 1 km");
    expect(distanceFr(1260)).toBe("environ 1,3 km");
  });
});

describe("gravité selon la distance", () => {
  it("passe en critique sous 500 m, reste un avertissement jusqu'à 1 km", () => {
    expect(fireSeverity(120)).toBe("CRITICAL");
    expect(fireSeverity(FIRE_CRITICAL_DISTANCE_M - 1)).toBe("CRITICAL");
    expect(fireSeverity(FIRE_CRITICAL_DISTANCE_M)).toBe("WARNING");
    expect(fireSeverity(990)).toBe("WARNING");
  });
});

describe("heure du passage du satellite", () => {
  it("se lit à l'heure du Bénin, relative au jour", () => {
    expect(passageFr(detectedAt, now)).toBe("aujourd'hui à 14 h 05");
    expect(passageFr(new Date("2026-09-26T22:40:00Z"), now)).toBe("hier à 23 h 40");
    // 23 h 30 UTC le 26 : déjà 0 h 30 le 27 au Bénin.
    expect(passageFr(new Date("2026-09-26T23:30:00Z"), now)).toBe("aujourd'hui à 0 h 30");
    expect(passageFr(new Date("2026-09-24T08:00:00Z"), now)).toBe("le 24/09 à 9 h 00");
  });
});

describe("message au producteur", () => {
  it("nomme son champ avec l'élision du français", () => {
    expect(fieldFr("Maïs")).toBe("votre champ de maïs");
    expect(fieldFr("Igname")).toBe("votre champ d'igname");
    expect(fieldFr("Arachide")).toBe("votre champ d'arachide");
    expect(fieldFr(null)).toBe("votre champ");
  });

  it("dit où, quand, quoi faire, qui appeler et ce que vaut la détection", () => {
    const text = fireMessageWhatsApp(exposure(), now);
    expect(text).toContain(
      "feu est détecté à environ 600 m au nord-est de votre champ de maïs, au passage du satellite aujourd'hui à 14 h 05",
    );
    expect(text).toContain("coupez un pare-feu");
    expect(text).toContain("prévenez vos voisins");
    expect(text).toContain("sapeurs-pompiers au 118");
    expect(text).toContain("Détecté par satellite, à vérifier sur place");
    expect(text).toContain("brûlage contrôlé");
    expect(text).not.toContain("urgente");
    expect(text).not.toMatch(/[·…—]/);
  });

  it("annonce l'urgence sous 500 m", () => {
    const text = fireMessageWhatsApp(exposure({ distanceM: 250 }), now);
    expect(text.startsWith("BAIS, alerte feu urgente : ")).toBe(true);
  });

  it("tient en un SMS, même dans le cas le plus long", () => {
    const longest = exposure({
      distanceM: 40,
      fire: { lat: parcel.lat + 0.004, lon: parcel.lon - 0.004 },
      detectedAt: new Date("2026-09-27T22:59:00Z"),
    });
    const sms = fireMessageSms(longest);
    expect(sms.length).toBeLessThanOrEqual(160);
    expect(sms).toContain("moins de 100 m au nord-ouest");
    expect(sms).toContain("Pompiers : 118");
    expect(sms).not.toMatch(/[·…—]/);
  });
});
