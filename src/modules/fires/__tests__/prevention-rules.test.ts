import { describe, expect, it } from "vitest";
import {
  FIRE_PREVENTION_TEXT,
  fireSeasons,
  isFireSeason,
  mostAffectedCommunes,
  preventionSubjectId,
  weekKey,
} from "../prevention-rules";

// Prévention de la saison des feux (ADR-0038 §3) : saison au Bénin, semaine d'envoi, identifiant
// stable par producteur et par semaine, communes du tiers le plus touché.

describe("saison des feux", () => {
  it("va de novembre à avril, à l'heure du Bénin", () => {
    expect(isFireSeason(new Date("2026-11-02T08:00:00Z"))).toBe(true);
    expect(isFireSeason(new Date("2027-04-30T12:00:00Z"))).toBe(true);
    expect(isFireSeason(new Date("2027-05-01T12:00:00Z"))).toBe(false);
    expect(isFireSeason(new Date("2026-09-27T08:00:00Z"))).toBe(false);
    // 31 octobre à 23 h 30 UTC : déjà le 1er novembre à Porto-Novo.
    expect(isFireSeason(new Date("2026-10-31T23:30:00Z"))).toBe(true);
  });

  it("situe la saison en cours et la saison passée", () => {
    const january = fireSeasons(new Date("2027-01-18T07:00:00Z"));
    expect(january.current.from.toISOString()).toBe("2026-10-31T23:00:00.000Z");
    expect(january.previous.from.toISOString()).toBe("2025-10-31T23:00:00.000Z");
    expect(january.previous.to.toISOString()).toBe("2026-04-30T23:00:00.000Z");
    const november = fireSeasons(new Date("2026-11-09T07:00:00Z"));
    expect(november.current.from.toISOString()).toBe("2026-10-31T23:00:00.000Z");
  });
});

describe("envoi de la semaine", () => {
  it("rattache chaque jour au lundi de sa semaine", () => {
    expect(weekKey(new Date("2026-11-09T07:00:00Z"))).toBe("2026-11-09");
    expect(weekKey(new Date("2026-11-15T20:00:00Z"))).toBe("2026-11-09");
    // Dimanche 23 h 30 UTC : lundi 0 h 30 à Porto-Novo.
    expect(weekKey(new Date("2026-11-15T23:30:00Z"))).toBe("2026-11-16");
  });

  it("donne le même identifiant pour le même producteur la même semaine, un autre sinon", () => {
    const farmer = "019284a0-0000-7000-8000-000000000001";
    const id = preventionSubjectId(farmer, "2026-11-09");
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(preventionSubjectId(farmer, "2026-11-09")).toBe(id);
    expect(preventionSubjectId(farmer, "2026-11-16")).not.toBe(id);
    expect(preventionSubjectId("019284a0-0000-7000-8000-000000000002", "2026-11-09")).not.toBe(id);
  });

  it("donne un conseil court, sans lien ni ponctuation interdite", () => {
    expect(FIRE_PREVENTION_TEXT).toContain("pare-feu");
    expect(FIRE_PREVENTION_TEXT).toContain("118");
    expect(FIRE_PREVENTION_TEXT).not.toMatch(/https?:|www\.|[·…—]/);
  });
});

describe("communes les plus touchées", () => {
  const commune = (id: string, detections: number, area = 1000) => ({
    commune_id: id,
    area_km2: area,
    detections,
  });

  it("retient le tiers le plus dense, avec au moins 5 détections pour 100 km²", () => {
    const rows = [
      commune("a", 400), // 40 pour 100 km²
      commune("b", 30), // 3 : trop peu, même dans le premier tiers
      commune("c", 200),
      commune("d", 10),
      commune("e", 0),
      commune("f", 90, 500), // 18
    ];
    // Six communes : le tiers, ce sont les deux plus denses (a puis c).
    expect(mostAffectedCommunes(rows)).toEqual(["a", "c"]);
  });

  it("ne retient rien quand les feux sont rares partout", () => {
    expect(mostAffectedCommunes([commune("a", 20), commune("b", 10), commune("c", 0)])).toEqual([]);
    expect(mostAffectedCommunes([])).toEqual([]);
  });
});
