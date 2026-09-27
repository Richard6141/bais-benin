import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/database/client";
import { apiChunks, archiveSeasonWindow, importFireArchive } from "@/modules/fires";

// Import d'une saison de feux passée (ADR-0039) sur la vraie base, avec un faux serveur FIRMS :
// un fichier annuel manquant n'écrit rien ; sinon même fusion entre satellites, sources fixes et
// feux hors frontière écartés, aucune alerte ni passage d'ingestion ; relancer ne crée rien ; l'API
// est lue par tranches de 5 jours et une clé refusée arrête tout. Saison lointaine (2031) : aucun
// feu réel de la base n'y tombe.

const SEASON = 2031;
const since = new Date(Date.now() - 60_000);
const BASE = "https://firms.test";
const VIIRS_HEADER =
  "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_ti5,frp,daynight,type";
const MODIS_HEADER =
  "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight,type";

/** Réponses du faux serveur, par chemin ; 404 sinon. */
function server(files: Record<string, string>) {
  const calls: string[] = [];
  const fetchImpl = async (url: string) => {
    const path = url.replace(BASE, "");
    calls.push(path);
    const body = files[path];
    return new Response(body ?? "Not Found", { status: body === undefined ? 404 : 200 });
  };
  return { calls, fetchImpl };
}

const yearly = (source: string, year: number) =>
  `/data/country/${source}/${year}/${source}_${year}_Benin.csv`;

const files: Record<string, string> = {
  // Un feu près de Parakou vu par SNPP, puis par NOAA-20 au même passage (fusionnés) ; un site
  // industriel (type 2, écarté) ; un feu au Nigeria (hors frontière, écarté à l'écriture).
  [yearly("viirs-snpp", SEASON)]: [
    VIIRS_HEADER,
    `9.3401,2.6302,331.2,0.4,0.4,${SEASON}-12-10,1254,N,VIIRS,n,2,295.1,6.3,D,0`,
    `6.3600,2.4300,340.0,0.4,0.4,${SEASON}-12-10,1254,N,VIIRS,h,2,300.0,30.0,D,2`,
    `9.1000,3.9000,329.0,0.4,0.4,${SEASON}-12-10,1254,N,VIIRS,n,2,294.0,5.0,D,0`,
  ].join("\n"),
  [yearly("viirs-snpp", SEASON + 1)]: VIIRS_HEADER,
  [yearly("viirs-jpss1", SEASON)]: [
    VIIRS_HEADER,
    `9.3405,2.6309,335.8,0.4,0.4,${SEASON}-12-10,1340,1,VIIRS,h,2,296.0,9.1,D,0`,
  ].join("\n"),
  [yearly("viirs-jpss1", SEASON + 1)]: VIIRS_HEADER,
  [yearly("modis", SEASON)]: MODIS_HEADER,
  [yearly("modis", SEASON + 1)]: [
    MODIS_HEADER,
    `10.3002,1.3801,330,1.1,1.0,${SEASON + 1}-02-14,1030,Terra,MODIS,85,61.03,300.1,20.4,D,0`,
  ].join("\n"),
};

describe("import d'une saison de feux passée", () => {
  afterAll(async () => {
    await prisma.fireDetection.deleteMany({ where: { createdAt: { gte: since } } });
    await prisma.$disconnect();
  });

  it("n'écrit rien quand une archive annuelle manque", async () => {
    const partial = { ...files };
    delete partial[yearly("modis", SEASON + 1)];
    const { fetchImpl } = server(partial);
    const result = await importFireArchive({ season: SEASON, baseUrl: BASE, fetchImpl });
    expect(result).toMatchObject({ mode: "yearly", status: "missing", created: 0 });
    expect(result.missing).toEqual([yearly("modis", SEASON + 1)]);
    expect(await prisma.fireDetection.count({ where: { createdAt: { gte: since } } })).toBe(0);
  });

  it("fusionne les satellites, écarte sources fixes et feux hors frontière, sans alerte", async () => {
    const { fetchImpl, calls } = server(files);
    const alertsBefore = await prisma.alert.count();
    const runsBefore = await prisma.fireIngestionRun.count();
    const result = await importFireArchive({ season: SEASON, baseUrl: BASE, fetchImpl });
    expect(calls).toHaveLength(6);
    // Lues : SNPP (2 feux de végétation), NOAA-20 (1), MODIS (1) ; le site industriel est écarté
    // à la lecture.
    expect(result).toMatchObject({ status: "imported", fetched: 4, merged: 0 });
    // Parakou (SNPP et NOAA-20 fusionnés) et le nord-ouest (MODIS) ; le feu du Nigeria est écarté.
    expect(result.created).toBe(2);
    const window = archiveSeasonWindow(SEASON);
    const stored = await prisma.fireDetection.findMany({
      where: { detectedAt: { gte: window.from, lt: window.to } },
      select: { sensors: true, confidence: true, communeId: true },
    });
    expect(stored).toHaveLength(2);
    expect(stored.find((row) => row.sensors.length === 2)).toMatchObject({
      sensors: ["VIIRS_SNPP", "VIIRS_NOAA20"],
      confidence: "HIGH",
    });
    expect(await prisma.alert.count()).toBe(alertsBefore);
    expect(await prisma.fireIngestionRun.count()).toBe(runsBefore);

    // Relancée, la commande ne crée rien : trois lignes déjà connues ; celle du Nigeria, jamais
    // écrite, est relue puis écartée de nouveau à la frontière.
    const again = await importFireArchive({
      season: SEASON,
      baseUrl: BASE,
      fetchImpl: server(files).fetchImpl,
    });
    expect(again).toMatchObject({ status: "imported", created: 0, merged: 0, skipped: 3 });
  });

  it("lit l'API par tranches de 5 jours, et s'arrête sur une clé refusée", async () => {
    const window = archiveSeasonWindow(SEASON);
    const chunks = apiChunks(window.from, window.to);
    const availability = [
      "data_id,min_date,max_date",
      `VIIRS_SNPP_NRT,${SEASON}-01-01,${SEASON + 1}-12-31`,
    ].join("\n");
    const responses: Record<string, string> = {
      [`/api/data_availability/csv/cle-essai-1234/ALL`]: availability,
    };
    for (const chunk of chunks) {
      responses[
        `/api/area/csv/cle-essai-1234/VIIRS_SNPP_NRT/0.7,6.1,3.95,12.5/${chunk.days}/${chunk.date}`
      ] = VIIRS_HEADER;
    }
    const { fetchImpl, calls } = server(responses);
    const result = await importFireArchive({
      season: SEASON,
      mapKey: "cle-essai-1234",
      baseUrl: BASE,
      fetchImpl,
      pause: async () => {},
      dryRun: true,
    });
    expect(result).toMatchObject({ mode: "api", status: "dry-run", fetched: 0 });
    expect(calls).toHaveLength(1 + chunks.length);
    // Les trois autres capteurs n'ont aucun jeu disponible : leurs tranches sont signalées.
    expect(result.missing).toHaveLength(3 * chunks.length);

    const refused = async () =>
      new Response("Invalid MAP_KEY.", { status: 200 }) as unknown as Response;
    await expect(
      importFireArchive({
        season: SEASON,
        mapKey: "mauvaise-cle",
        baseUrl: BASE,
        fetchImpl: refused,
      }),
    ).rejects.toThrow(/Invalid MAP_KEY/);
  });
});
