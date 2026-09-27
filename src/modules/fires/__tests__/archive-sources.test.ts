import { describe, expect, it } from "vitest";
import { parseFirmsCsv } from "@/services/fires/firms-public";
import {
  apiAreaPath,
  apiChunks,
  archiveSeasonWindow,
  lastCompleteSeason,
  parseAvailability,
  pickApiSource,
  yearlyArchivePath,
} from "../archive-sources";

// Saison de feux passée (ADR-0039) : période, fichiers annuels, tranches de l'API, choix du jeu
// standard ou quasi temps réel, et sources fixes écartées des archives.

/** Emprise du Bénin de l'ingestion (ingest.ts, BENIN_FIRE_BBOX), recopiée : pas de base ici. */
const BENIN_FIRE_BBOX: [number, number, number, number] = [0.7, 6.1, 3.95, 12.5];

describe("saison à importer", () => {
  it("va du 1er novembre au 1er mai, à l'heure du Bénin", () => {
    const window = archiveSeasonWindow(2025);
    expect(window.from.toISOString()).toBe("2025-10-31T23:00:00.000Z");
    expect(window.to.toISOString()).toBe("2026-04-30T23:00:00.000Z");
  });

  it("prend par défaut la dernière saison sèche terminée", () => {
    expect(lastCompleteSeason(new Date("2026-09-27T10:00:00Z"))).toBe(2025);
    expect(lastCompleteSeason(new Date("2026-03-10T10:00:00Z"))).toBe(2024);
    expect(lastCompleteSeason(new Date("2026-05-02T10:00:00Z"))).toBe(2025);
  });

  it("nomme les archives annuelles par pays comme FIRMS", () => {
    expect(yearlyArchivePath("viirs-jpss1", 2024)).toBe(
      "/data/country/viirs-jpss1/2024/viirs-jpss1_2024_Benin.csv",
    );
  });
});

describe("API FIRMS", () => {
  it("découpe la saison en tranches de 5 jours au plus, sans trou", () => {
    const window = archiveSeasonWindow(2025);
    const chunks = apiChunks(window.from, window.to);
    expect(chunks[0]).toEqual({ date: "2025-10-31", days: 5 });
    const total = chunks.reduce((sum, chunk) => sum + chunk.days, 0);
    // Du 31 octobre (23 h UTC) au 30 avril inclus : 182 jours UTC.
    expect(total).toBe(182);
    expect(chunks.every((chunk) => chunk.days >= 1 && chunk.days <= 5)).toBe(true);
    expect(chunks).toHaveLength(37);
  });

  it("construit l'adresse d'une tranche", () => {
    expect(
      apiAreaPath("abc123", "VIIRS_SNPP_SP", BENIN_FIRE_BBOX, { date: "2025-11-05", days: 5 }),
    ).toBe("/api/area/csv/abc123/VIIRS_SNPP_SP/0.7,6.1,3.95,12.5/5/2025-11-05");
  });

  it("préfère le traitement standard s'il couvre la tranche, sinon le quasi temps réel", () => {
    const availability = parseAvailability(
      [
        "data_id,min_date,max_date",
        "VIIRS_SNPP_SP,2012-01-20,2026-01-31",
        "VIIRS_SNPP_NRT,2025-12-01,2026-09-26",
        "MODIS_NRT,2025-08-01,2026-09-26",
      ].join("\n"),
    );
    const candidates = ["VIIRS_SNPP_SP", "VIIRS_SNPP_NRT"];
    expect(pickApiSource(candidates, availability, { date: "2025-11-05", days: 5 })).toBe(
      "VIIRS_SNPP_SP",
    );
    expect(pickApiSource(candidates, availability, { date: "2026-03-01", days: 5 })).toBe(
      "VIIRS_SNPP_NRT",
    );
    // À cheval sur la fin du traitement standard : le quasi temps réel couvre toute la tranche.
    expect(pickApiSource(candidates, availability, { date: "2026-01-30", days: 5 })).toBe(
      "VIIRS_SNPP_NRT",
    );
    expect(
      pickApiSource(["MODIS_SP", "MODIS_NRT"], availability, { date: "2025-11-05", days: 5 }),
    ).toBe("MODIS_NRT");
    expect(
      pickApiSource(["VIIRS_NOAA21_SP", "VIIRS_NOAA21_NRT"], availability, {
        date: "2025-11-05",
        days: 5,
      }),
    ).toBeNull();
  });
});

describe("archives annuelles", () => {
  it("écarte les sources fixes (sites industriels) et garde les feux de végétation", () => {
    const csv = [
      "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type",
      "10.95204,1.20817,304.73,0.53,0.5,2025-12-01,0058,N,VIIRS,n,2,289.46,1.05,N,0",
      "6.35,2.43,330.1,0.4,0.4,2025-12-01,1306,N,VIIRS,h,2,300.1,25.0,D,2",
      "10.93268,1.21059,300.41,0.53,0.5,2025-12-02,1254,N,VIIRS,h,2,289.16,0.53,D,0",
    ].join("\n");
    const rows = parseFirmsCsv(csv, "VIIRS_SNPP", BENIN_FIRE_BBOX);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      latitude: 10.93268,
      confidenceRaw: "h",
      daynight: "D",
      acquiredAt: new Date("2025-12-02T12:54:00Z"),
    });
  });
});
