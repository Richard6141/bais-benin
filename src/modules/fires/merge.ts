import type { FireSensorCode, RawFireDetection } from "@/services/ports/fire-detection-provider";

// Dédoublonnage des feux entre satellites (ADR-0022), en fonctions pures. Deux lignes FIRMS
// désignent le même feu quand elles sont à moins de 375 m l'une de l'autre (taille d'un pixel
// VIIRS) et du même passage (une heure au plus d'écart) : une seule détection, avec la liste des
// capteurs, la confiance et la puissance les plus fortes, l'heure la plus ancienne. Une ligne
// déjà fusionnée (même capteur, même heure, même position) n'est jamais comptée deux fois.

export const SAME_FIRE_DISTANCE_M = 375;
export const SAME_PASS_MS = 60 * 60 * 1000;

export type FireConfidenceCode = "LOW" | "NOMINAL" | "HIGH";
const RANK: Record<FireConfidenceCode, number> = { LOW: 0, NOMINAL: 1, HIGH: 2 };

/** VIIRS publie low / nominal / high ; MODIS une valeur de 0 à 100 (seuils FIRMS 30 et 80). */
export function normalizeConfidence(raw: string): FireConfidenceCode {
  const value = raw.trim().toLowerCase();
  if (value === "h" || value === "high") return "HIGH";
  if (value === "n" || value === "nominal") return "NOMINAL";
  if (value === "l" || value === "low") return "LOW";
  const number = Number(value);
  if (value !== "" && Number.isFinite(number)) {
    return number >= 80 ? "HIGH" : number >= 30 ? "NOMINAL" : "LOW";
  }
  return "LOW";
}

export function sourceKey(d: RawFireDetection): string {
  return [d.sensor, d.acquiredAt.toISOString(), d.latitude.toFixed(5), d.longitude.toFixed(5)].join(
    "|",
  );
}

/** Distance à la surface de la Terre, en mètres (formule de haversine). */
export function distanceM(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const rad = Math.PI / 180;
  const dLat = (b.latitude - a.latitude) * rad;
  const dLon = (b.longitude - a.longitude) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.latitude * rad) * Math.cos(b.latitude * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

export interface FireRecord {
  id: string;
  detectedAt: Date;
  latitude: number;
  longitude: number;
  sensors: FireSensorCode[];
  confidence: FireConfidenceCode;
  frpMw: number | null;
  brightnessK: number | null;
  daynight: "D" | "N" | null;
  sourceKeys: string[];
}

export interface MergeResult {
  created: FireRecord[];
  /** Détections déjà enregistrées qu'un autre capteur vient compléter. */
  updated: FireRecord[];
  /** Lignes déjà connues (fichier relu) : aucun effet. */
  skipped: number;
}

// Grille d'environ 550 m : les voisins d'une détection sont dans sa case ou les huit autour.
const CELL_DEG = 0.005;
const cellOf = (lat: number, lon: number): [number, number] => [
  Math.floor(lat / CELL_DEG),
  Math.floor(lon / CELL_DEG),
];

const maxOf = (a: number | null, b: number | null) =>
  a === null ? b : b === null ? a : Math.max(a, b);

export function mergeDetections(
  existing: readonly FireRecord[],
  incoming: readonly RawFireDetection[],
  newId: () => string,
): MergeResult {
  const records = existing.map((record) => ({ ...record, isNew: false, changed: false }));
  const known = new Set(records.flatMap((record) => record.sourceKeys));
  const grid = new Map<string, typeof records>();
  const index = (record: (typeof records)[number]) => {
    const [row, col] = cellOf(record.latitude, record.longitude);
    const key = `${row}|${col}`;
    grid.set(key, [...(grid.get(key) ?? []), record]);
  };
  records.forEach(index);

  // VIIRS d'abord (pixel de 375 m) : une ligne MODIS (1 km) vient compléter un feu déjà situé.
  const ordered = [...incoming].sort(
    (a, b) =>
      Number(a.sensor === "MODIS") - Number(b.sensor === "MODIS") ||
      a.acquiredAt.getTime() - b.acquiredAt.getTime(),
  );
  let skipped = 0;
  for (const raw of ordered) {
    const key = sourceKey(raw);
    if (known.has(key)) {
      skipped += 1;
      continue;
    }
    known.add(key);
    const [row, col] = cellOf(raw.latitude, raw.longitude);
    let match: (typeof records)[number] | undefined;
    for (let dr = -1; dr <= 1 && !match; dr += 1) {
      for (let dc = -1; dc <= 1 && !match; dc += 1) {
        match = grid
          .get(`${row + dr}|${col + dc}`)
          ?.find(
            (record) =>
              Math.abs(record.detectedAt.getTime() - raw.acquiredAt.getTime()) <= SAME_PASS_MS &&
              distanceM(record, raw) <= SAME_FIRE_DISTANCE_M,
          );
      }
    }
    const confidence = normalizeConfidence(raw.confidenceRaw);
    if (match) {
      if (!match.sensors.includes(raw.sensor)) match.sensors = [...match.sensors, raw.sensor];
      match.sourceKeys = [...match.sourceKeys, key];
      if (RANK[confidence] > RANK[match.confidence]) match.confidence = confidence;
      match.frpMw = maxOf(match.frpMw, raw.frpMw);
      match.brightnessK = maxOf(match.brightnessK, raw.brightnessK);
      if (raw.acquiredAt < match.detectedAt) match.detectedAt = raw.acquiredAt;
      match.changed = true;
      continue;
    }
    const record = {
      id: newId(),
      detectedAt: raw.acquiredAt,
      latitude: raw.latitude,
      longitude: raw.longitude,
      sensors: [raw.sensor],
      confidence,
      frpMw: raw.frpMw,
      brightnessK: raw.brightnessK,
      daynight: raw.daynight,
      sourceKeys: [key],
      isNew: true,
      changed: false,
    };
    records.push(record);
    index(record);
  }
  const strip = (record: (typeof records)[number]): FireRecord => ({
    id: record.id,
    detectedAt: record.detectedAt,
    latitude: record.latitude,
    longitude: record.longitude,
    sensors: record.sensors,
    confidence: record.confidence,
    frpMw: record.frpMw,
    brightnessK: record.brightnessK,
    daynight: record.daynight,
    sourceKeys: record.sourceKeys,
  });
  return {
    created: records.filter((r) => r.isNew).map(strip),
    updated: records.filter((r) => !r.isNew && r.changed).map(strip),
    skipped,
  };
}
