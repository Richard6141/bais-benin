import type {
  RemoteSensingProvider,
  SceneSummary,
  VegetationInterval,
} from "@/services/ports/remote-sensing-provider";

// Adaptateur fixture : séries NDVI synthétiques et déterministes, sans réseau ni compte, pour la
// démonstration et les tests. Le profil suit le régime des pluies selon la latitude (bimodal au
// sud, unimodal au nord) ; une parcelle sur huit, choisie par sa géométrie, reste nue toute la
// saison, pour que la confrontation déclaration / satellite ait des écarts à montrer.
// Aucune image : la couche de la carte n'est rendue qu'avec le vrai fournisseur.

const DAY_MS = 86_400_000;
// Latitude de bascule entre régime bimodal (sud) et unimodal (nord), comme la seed territoire.
const BIMODAL_NORTH_LIMIT = 8.5;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Pseudo-aléatoire reproductible dans [0, 1[ pour une graine et un rang. */
function noise(seed: number, index: number): number {
  const value = Math.sin(seed * 0.0001 + index * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

function bump(dayOfYear: number, peak: number, width: number): number {
  const distance = Math.min(Math.abs(dayOfYear - peak), 365 - Math.abs(dayOfYear - peak));
  return Math.exp(-((distance / width) ** 2));
}

/** NDVI saisonnier attendu d'un couvert cultivé à cette latitude, pour un jour de l'année. */
export function seasonalNdvi(latitude: number, dayOfYear: number): number {
  const dry = 0.2;
  if (latitude < BIMODAL_NORTH_LIMIT) {
    // Grande saison (pic vers fin juin) et petite saison (pic vers mi-octobre).
    return dry + 0.45 * bump(dayOfYear, 178, 38) + 0.35 * bump(dayOfYear, 288, 28);
  }
  // Saison unique, pic fin août.
  return dry + 0.5 * bump(dayOfYear, 240, 45);
}

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 1);
  return Math.floor((date.getTime() - start) / DAY_MS) + 1;
}

export function createFixtureRemoteSensingProvider(): RemoteSensingProvider {
  return {
    id: "fixture",
    canProcess: true,
    provenance: {
      sourceId: "BAIS_SEED",
      reliability: "SYNTHETIC",
      licence: "Données synthétiques de démonstration",
      attribution: "Série NDVI synthétique (démonstration BAIS)",
    },

    async searchScenes(request): Promise<SceneSummary[]> {
      const from = Date.parse(request.from);
      const to = Date.parse(request.to);
      const scenes: SceneSummary[] = [];
      // Revisite de cinq jours, un passage par carreau fictif.
      for (let time = to; time >= from && scenes.length < request.limit; time -= 5 * DAY_MS) {
        const index = scenes.length;
        const cloudCover = Math.round(noise(time / DAY_MS, index) * 900) / 10;
        if (request.maxCloudCover !== undefined && cloudCover >= request.maxCloudCover) continue;
        scenes.push({
          id: `FIXTURE_S2_${new Date(time).toISOString().slice(0, 10)}`,
          acquiredAt: new Date(time).toISOString(),
          cloudCover,
          platform: index % 2 === 0 ? "sentinel-2a" : "sentinel-2c",
          gridCode: "MGRS-31PDM",
        });
      }
      return scenes;
    },

    async renderImage() {
      return null;
    },

    async vegetationStatistics(request): Promise<VegetationInterval[]> {
      const ring = request.geometry.coordinates[0] ?? [];
      const latitude =
        ring.reduce((sum, point) => sum + (point[1] ?? 0), 0) / Math.max(1, ring.length);
      const seed = hashString(JSON.stringify(ring));
      const bare = seed % 8 === 0;
      const intervals: VegetationInterval[] = [];
      const step = request.intervalDays * DAY_MS;
      for (let time = Date.parse(request.from); time < Date.parse(request.to); time += step) {
        const index = intervals.length;
        const middle = new Date(time + step / 2);
        // Un intervalle sur cinq entièrement nuageux, comme en pleine saison des pluies.
        const cloudy = noise(seed, index) < 0.2;
        const expected = bare
          ? 0.16
          : request.expectedCover === "PERMANENT"
            ? 0.56
            : seasonalNdvi(latitude, dayOfYear(middle));
        const value = expected + (noise(seed, index + 100) - 0.5) * 0.06;
        intervals.push({
          from: new Date(time).toISOString(),
          to: new Date(Math.min(time + step, Date.parse(request.to))).toISOString(),
          ndviMean: cloudy ? null : Number(value.toFixed(3)),
          ndviStdDev: cloudy ? null : 0.05,
          validPixels: cloudy ? 0 : 120,
          maskedPixels: cloudy ? 120 : 0,
        });
      }
      return intervals;
    },
  };
}
