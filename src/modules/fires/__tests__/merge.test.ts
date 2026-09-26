import { describe, expect, it } from "vitest";
import { parseFirmsCsv } from "@/services/fires/firms-public";
import type { RawFireDetection } from "@/services/ports/fire-detection-provider";
import { distanceM, mergeDetections, normalizeConfidence } from "../merge";

// Dédoublonnage entre satellites (ADR-0022) et lecture des fichiers FIRMS.

const BENIN: readonly [number, number, number, number] = [0.7, 6.1, 3.95, 12.5];
let counter = 0;
const newId = () => `fire-${++counter}`;

function raw(values: Partial<RawFireDetection>): RawFireDetection {
  return {
    sensor: "VIIRS_SNPP",
    latitude: 9.7,
    longitude: 1.67,
    acquiredAt: new Date("2026-09-26T12:40:00Z"),
    confidenceRaw: "nominal",
    frpMw: 5,
    brightnessK: 330,
    daynight: "D",
    ...values,
  };
}

describe("lecture des fichiers FIRMS", () => {
  it("lit les colonnes par leur nom et ne garde que l'emprise du Bénin", () => {
    const csv = [
      "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight",
      "9.70123,1.67456,331.2,0.4,0.37,2026-09-26,0130,N,high,2.0NRT,290.1,7.85,N",
      "28.63659,9.78059,299.42,0.4,0.37,2026-09-26,0111,N,nominal,2.0NRT,278.94,0.55,N",
    ].join("\n");
    const rows = parseFirmsCsv(csv, "VIIRS_SNPP", BENIN);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      latitude: 9.70123,
      longitude: 1.67456,
      confidenceRaw: "high",
      frpMw: 7.85,
      brightnessK: 331.2,
      daynight: "N",
    });
    expect(rows[0]!.acquiredAt.toISOString()).toBe("2026-09-26T01:30:00.000Z");
  });

  it("lit aussi le format MODIS (brightness, confiance de 0 à 100)", () => {
    const csv = [
      "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,confidence,version,bright_t31,frp,daynight",
      "9.7,1.67,321.72,1.0,1.0,2026-09-26,933,A,85,6.1NRT,293.9,96.03,D",
    ].join("\n");
    const [row] = parseFirmsCsv(csv, "MODIS", BENIN);
    expect(row).toMatchObject({ brightnessK: 321.72, confidenceRaw: "85" });
    expect(row!.acquiredAt.toISOString()).toBe("2026-09-26T09:33:00.000Z");
  });

  it("ramène les confiances VIIRS et MODIS à trois niveaux", () => {
    expect(normalizeConfidence("high")).toBe("HIGH");
    expect(normalizeConfidence("n")).toBe("NOMINAL");
    expect(normalizeConfidence("low")).toBe("LOW");
    expect(normalizeConfidence("85")).toBe("HIGH");
    expect(normalizeConfidence("50")).toBe("NOMINAL");
    expect(normalizeConfidence("12")).toBe("LOW");
  });
});

describe("dédoublonnage entre satellites", () => {
  it("fusionne un même feu vu par deux satellites au même passage", () => {
    const { created, updated, skipped } = mergeDetections(
      [],
      [
        raw({ sensor: "VIIRS_SNPP", confidenceRaw: "nominal", frpMw: 5 }),
        // 200 m plus loin, 40 minutes plus tard, par NOAA-20 et MODIS.
        raw({
          sensor: "VIIRS_NOAA20",
          latitude: 9.7018,
          acquiredAt: new Date("2026-09-26T13:20:00Z"),
          confidenceRaw: "high",
          frpMw: 9,
        }),
        raw({ sensor: "MODIS", latitude: 9.7009, confidenceRaw: "40", frpMw: 12 }),
      ],
      newId,
    );
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({
      sensors: ["VIIRS_SNPP", "VIIRS_NOAA20", "MODIS"],
      confidence: "HIGH",
      frpMw: 12,
    });
    expect(created[0]!.detectedAt.toISOString()).toBe("2026-09-26T12:40:00.000Z");
    expect(updated).toEqual([]);
    expect(skipped).toBe(0);
  });

  it("garde deux feux éloignés ou de passages différents", () => {
    const far = raw({ latitude: 9.71 });
    expect(distanceM(raw({}), far)).toBeGreaterThan(1000);
    const later = raw({ acquiredAt: new Date("2026-09-26T23:00:00Z") });
    expect(mergeDetections([], [raw({}), far, later], newId).created).toHaveLength(3);
  });

  it("ne recompte pas un fichier relu, complète une détection déjà enregistrée", () => {
    const first = mergeDetections([], [raw({})], newId).created;
    const again = mergeDetections(first, [raw({})], newId);
    expect(again).toMatchObject({ created: [], updated: [], skipped: 1 });

    const completed = mergeDetections(first, [raw({ sensor: "VIIRS_NOAA21", frpMw: 20 })], newId);
    expect(completed.created).toEqual([]);
    expect(completed.updated[0]).toMatchObject({
      id: first[0]!.id,
      sensors: ["VIIRS_SNPP", "VIIRS_NOAA21"],
      frpMw: 20,
    });
  });
});
