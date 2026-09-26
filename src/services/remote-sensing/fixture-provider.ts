import type {
  RadarInterval,
  RemoteSensingProvider,
  SceneSummary,
  VegetationInterval,
  VegetationStatisticsRequest,
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

/** Pixels de 10 m de la parcelle (surface approchée de l'anneau en WGS84). */
// Confusions plausibles de la classification, par code de classe : coton et céréales se
// ressemblent, un riz mal repéré passe en culture annuelle, un verger en savane, un jardin
// de contre-saison en jachère.
const FIXTURE_CONFUSION: Record<number, number> = { 1: 2, 2: 3, 3: 2, 4: 7, 5: 6 };

/**
 * Parcelle d'une exploitation vérifiée (matrice de confusion) : la classe déclarée domine quatre
 * fois sur cinq, sinon sa confusion la plus plausible ; quelques pixels de bordure et de nuage.
 */
function parcelClassPixels(expected: number, total: number, seed: number): number[] {
  const pixels = new Array<number>(10).fill(0);
  const confused = FIXTURE_CONFUSION[expected] ?? 6;
  const [major, minor] = seed % 100 < 80 ? [expected, confused] : [confused, expected];
  pixels[major] = Math.round(total * 0.7);
  pixels[minor] = (pixels[minor] ?? 0) + Math.round(total * 0.18);
  pixels[7] = (pixels[7] ?? 0) + Math.round(total * 0.07);
  pixels[0] = (pixels[0] ?? 0) + Math.max(0, total - Math.round(total * 0.95));
  return pixels;
}

function parcelPixels(ring: number[][]): number {
  if (ring.length < 4) return 0;
  const lat = ring.reduce((sum, point) => sum + (point[1] ?? 0), 0) / ring.length;
  const mx = 111_320 * Math.cos((lat * Math.PI) / 180);
  let twice = 0;
  for (let i = 0; i < ring.length - 1; i += 1) {
    const [x1, y1] = ring[i] as [number, number];
    const [x2, y2] = ring[i + 1] as [number, number];
    twice += x1 * mx * (y2 * 111_320) - x2 * mx * (y1 * 111_320);
  }
  return Math.max(1, Math.round(Math.abs(twice) / 2 / 100));
}

/** Écart de vigueur au pic, au plus, de part et d'autre de la série moyenne. */
const VIGOUR_RANGE = 0.1;

/**
 * Vigueur synthétique d'une parcelle, entre -VIGOUR_RANGE et +VIGOUR_RANGE : 60 % tient à sa
 * commune (sols, pluies, pratiques), 40 % à la parcelle elle-même. Ainsi certaines communes, et
 * donc certains départements, ressortent meilleurs que d'autres, de façon reproductible. Zéro
 * sans clés de démonstration.
 */
export function demoVigour(keys: { commune: string; parcel: string } | undefined): number {
  if (!keys) return 0;
  const unit = (value: string) => (avalanche(hashString(value)) / 0xffffffff) * 2 - 1;
  return (
    VIGOUR_RANGE * (0.6 * unit(`commune:${keys.commune}`) + 0.4 * unit(`parcelle:${keys.parcel}`))
  );
}

// Brassage final (murmur3) : des identifiants voisins (UUID v7, codes de commune qui ne
// diffèrent que d'un chiffre) donnent sinon des valeurs groupées.
function avalanche(hash: number): number {
  let value = hash;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  value = Math.imul(value, 0xc2b2ae35);
  value ^= value >>> 16;
  return value >>> 0;
}

/** Applique la vigueur au couvert au-dessus du sol nu (0,2) : le pic bouge, pas la base. */
function withVigour(cover: number, vigour: number, peakAmplitude: number): number {
  if (vigour === 0) return cover;
  return 0.2 + (cover - 0.2) * (1 + vigour / peakAmplitude);
}

/**
 * Couvert synthétique d'une culture annuelle à une date : autour de la période de pic de la
 * culture quand l'appelant la donne, sinon selon le régime des pluies de la latitude.
 */
function seasonalCover(
  latitude: number,
  date: Date,
  expectedPeak: { from: string; to: string } | undefined,
): number {
  if (!expectedPeak) return seasonalNdvi(latitude, dayOfYear(date));
  const from = Date.parse(expectedPeak.from);
  const to = Date.parse(expectedPeak.to);
  const middle = new Date((from + to) / 2);
  const width = Math.max(25, (to - from) / DAY_MS / 2);
  return 0.2 + 0.5 * bump(dayOfYear(date), dayOfYear(middle), width);
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
    radarProvenance: {
      sourceId: "BAIS_SEED",
      reliability: "SYNTHETIC",
      licence: "Données synthétiques de démonstration",
      attribution: "Série radar synthétique (démonstration BAIS)",
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

    // Champ synthétique autour du centre de la fenêtre : un rectangle de maïs de 1 à 4 ha dans
    // la brousse, une jachère voisine. Taille et position varient avec l'emprise, de façon
    // reproductible, pour que la démonstration propose des contours sans compte Copernicus.
    async fieldFeatures(request) {
      const { width, height } = request;
      const seed = hashString(request.envelope.map((v) => Math.round(v)).join(","));
      const fieldW = 10 + (seed % 11);
      const fieldH = 10 + ((seed >> 4) % 11);
      const left = Math.floor(width / 2) - Math.floor(fieldW / 2) - ((seed >> 8) % 3);
      const top = Math.floor(height / 2) - Math.floor(fieldH / 2) - ((seed >> 10) % 3);
      const peak = new Float32Array(width * height);
      const low = new Float32Array(width * height);
      const swir = new Float32Array(width * height);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const index = y * width + x;
          const inField = x >= left && x < left + fieldW && y >= top && y < top + fieldH;
          const inFallow =
            x >= left + fieldW && x < left + fieldW + 8 && y >= top && y < top + fieldH;
          const jitter = (noise(seed, index) - 0.5) * 0.04;
          peak[index] = (inField ? 0.72 : inFallow ? 0.3 : 0.45) + jitter;
          low[index] = (inField ? 0.18 : inFallow ? 0.15 : 0.3) + jitter / 2;
          swir[index] = inField ? 0.16 : inFallow ? 0.3 : 0.22;
        }
      }
      return { width, height, peak, low, swir, processingUnits: null };
    },

    async vegetationStatistics(request) {
      return { intervals: syntheticNdvi(request), processingUnits: null };
    },

    // Répartition synthétique des classes, proportionnelle à la surface de la géométrie :
    // cultures annuelles, savane et jachère dominent ; coton au nord seulement.
    // Riz de démonstration : 1 à 3 % de la commune au sud, moins au nord, toujours un peu plus
    // que ce que l'optique retient (rizières de bas-fond sous les nuages).
    async riceRadarStatistics(request) {
      const ring =
        request.geometry.type === "Polygon"
          ? (request.geometry.coordinates[0] ?? [])
          : (request.geometry.coordinates[0]?.[0] ?? []);
      const seed = hashString(JSON.stringify(ring).slice(0, 400));
      const observedPixels = Math.round(
        (parcelPixels(ring) * 100) / (request.resolutionM * request.resolutionM),
      );
      const share = (request.latitude >= 9 ? 0.01 : 0.02) + noise(seed, 500) * 0.015;
      return {
        ricePixels: Math.round(observedPixels * share),
        observedPixels,
        processingUnits: null,
      };
    },

    async cropAreaStatistics(request) {
      const ring =
        request.geometry.type === "Polygon"
          ? (request.geometry.coordinates[0] ?? [])
          : (request.geometry.coordinates[0]?.[0] ?? []);
      const seed = hashString(JSON.stringify(ring).slice(0, 400));
      const total = Math.round(
        (parcelPixels(ring) * 100) / (request.resolutionM * request.resolutionM),
      );
      if (request.expectedClass !== undefined) {
        return {
          classPixels: parcelClassPixels(request.expectedClass, total, seed),
          processingUnits: null,
        };
      }
      const north = request.latitude >= 9;
      // Parts indicatives : non classé, riz, annuelles, coton, pérennes, maraîchage, jachère,
      // naturel, eau, bâti.
      const shares = [
        0.03,
        0.02,
        0.3,
        north ? 0.08 : 0,
        0.06,
        0.01,
        0.15,
        north ? 0.31 : 0.39,
        0.02,
        0.02,
      ];
      const classPixels = shares.map((share, index) =>
        Math.round(total * share * (0.85 + noise(seed, index + 300) * 0.3)),
      );
      // Le sud, plus nuageux en pleine saison, voit moins de mois de pluie que le nord.
      const rainyMonthsSeen = Number(((north ? 3.8 : 2.6) + noise(seed, 400) * 1.2).toFixed(2));
      return { classPixels, rainyMonthsSeen, processingUnits: null };
    },

    // Radar : pas de nuage. Même régime saisonnier que le NDVI, en indice RVI (0,2 au sol nu,
    // 0,5 à 0,6 en plein couvert), une parcelle sur huit restée nue, comme pour l'optique.
    async radarStatistics(request) {
      const ring = request.geometry.coordinates[0] ?? [];
      const latitude =
        ring.reduce((sum, point) => sum + (point[1] ?? 0), 0) / Math.max(1, ring.length);
      const seed = hashString(JSON.stringify(ring));
      const bare = seed % 8 === 0;
      const pixels = parcelPixels(ring);
      const vigour = demoVigour(request.demoKeys);
      const intervals: RadarInterval[] = [];
      const step = request.intervalDays * DAY_MS;
      for (let time = Date.parse(request.from); time < Date.parse(request.to); time += step) {
        const index = intervals.length;
        const middle = new Date(time + step / 2);
        const cover = bare
          ? 0.2
          : request.expectedCover === "PERMANENT"
            ? withVigour(0.55, vigour * 0.7, 0.35)
            : withVigour(
                0.2 + (seasonalCover(latitude, middle, request.expectedPeak) - 0.2) * 0.7,
                vigour * 0.7,
                0.35,
              );
        const rvi = Number((cover + (noise(seed, index + 200) - 0.5) * 0.04).toFixed(3));
        intervals.push({
          from: new Date(time).toISOString(),
          to: new Date(Math.min(time + step, Date.parse(request.to))).toISOString(),
          rviMean: rvi,
          vhDbMean: Number((-22 + rvi * 14).toFixed(2)),
          validPixels: pixels,
          maskedPixels: 0,
        });
      }
      return { intervals, processingUnits: null };
    },
  };
}

/** Série NDVI synthétique d'une parcelle : régime des pluies, nuages, parcelle nue une fois sur huit. */
function syntheticNdvi(request: VegetationStatisticsRequest): VegetationInterval[] {
  const ring = request.geometry.coordinates[0] ?? [];
  const latitude = ring.reduce((sum, point) => sum + (point[1] ?? 0), 0) / Math.max(1, ring.length);
  const seed = hashString(JSON.stringify(ring));
  const bare = seed % 8 === 0;
  const pixels = parcelPixels(ring);
  const vigour = demoVigour(request.demoKeys);
  const intervals: VegetationInterval[] = [];
  const step = request.intervalDays * DAY_MS;
  for (let time = Date.parse(request.from); time < Date.parse(request.to); time += step) {
    const index = intervals.length;
    const middle = new Date(time + step / 2);
    // Un intervalle sur cinq entièrement nuageux, comme en pleine saison des pluies.
    const cloudy = noise(seed, index) < 0.2;
    // Amplitude au pic : 0,5 pour le couvert saisonnier, 0,36 pour une plantation (0,56).
    const expected = bare
      ? 0.16
      : request.expectedCover === "PERMANENT"
        ? withVigour(0.56, vigour, 0.36)
        : withVigour(seasonalCover(latitude, middle, request.expectedPeak), vigour, 0.5);
    const value = expected + (noise(seed, index + 100) - 0.5) * 0.06;
    intervals.push({
      from: new Date(time).toISOString(),
      to: new Date(Math.min(time + step, Date.parse(request.to))).toISOString(),
      ndviMean: cloudy ? null : Number(value.toFixed(3)),
      ndviStdDev: cloudy ? null : 0.05,
      validPixels: cloudy ? 0 : pixels,
      maskedPixels: cloudy ? pixels : 0,
    });
  }
  return intervals;
}
