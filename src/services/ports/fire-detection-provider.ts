// Port des détections de feux actifs (ADR-0022). L'adaptateur lit les fichiers publics de NASA
// FIRMS ; le domaine dédoublonne, rattache chaque feu à une commune et lève les alertes.

export type FireSensorCode = "VIIRS_SNPP" | "VIIRS_NOAA20" | "VIIRS_NOAA21" | "MODIS";

/** Une ligne de détection telle que publiée par un capteur, avant dédoublonnage. */
export interface RawFireDetection {
  sensor: FireSensorCode;
  latitude: number;
  longitude: number;
  /** Heure d'acquisition, en UTC. */
  acquiredAt: Date;
  /** Confiance telle que publiée : low / nominal / high (VIIRS) ou 0 à 100 (MODIS). */
  confidenceRaw: string;
  /** Puissance radiative du feu, en mégawatts. */
  frpMw: number | null;
  /** Température de brillance du canal de détection, en kelvins. */
  brightnessK: number | null;
  daynight: "D" | "N" | null;
}

export interface FireFetchResult {
  detections: RawFireDetection[];
  /** Fichiers qui n'ont pas pu être lus (les autres sont gardés). */
  failedFiles: string[];
}

/** Emprise [ouest, sud, est, nord] en degrés. */
export type BBox = readonly [number, number, number, number];

export interface FireDetectionProvider {
  readonly id: string;
  /** Détections des dernières 24 heures dans l'emprise. */
  fetchRecent(bbox: BBox): Promise<FireFetchResult>;
}
