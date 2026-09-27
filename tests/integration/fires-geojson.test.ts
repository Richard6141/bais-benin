import { describe, expect, it } from "vitest";
import { firesToGeoJson, type FireFeature } from "@/modules/fires/queries";

const FIRE: FireFeature = {
  id: "9251bcb9-a179-4074-922c-7c81b66c5be9",
  detectedAt: "2026-09-26T13:44:00.000Z",
  latitude: 9.7,
  longitude: 1.67,
  sensors: ["VIIRS_SNPP"],
  confidence: "NOMINAL",
  frpMw: 3.17,
  communeName: "Djougou",
};

describe("collection GeoJSON des feux", () => {
  it("porte l'identifiant du feu dans les propriétés, pas seulement au sommet", () => {
    const collection = firesToGeoJson([FIRE]);
    const feature = collection.features[0]!;
    // MapLibre ne garde le champ `id` d'une source GeoJSON que s'il est castable en nombre ;
    // un UUID ne l'est pas. La fiche du feu (fire-layer.ts) lit donc properties.id, jamais feature.id.
    expect(feature.properties.id).toBe(FIRE.id);
  });
});
