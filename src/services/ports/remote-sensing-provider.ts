// Port de télédétection (docs/02 §6, ADR-0016). Adaptateurs : Copernicus Data Space Ecosystem
// (catalogue STAC public et API de traitement du compte CDSE) et fixture (profils de végétation
// synthétiques, sans réseau, pour la démonstration et les tests). Le module satellite ne connaît
// que ce contrat : aucun fournisseur commercial intermédiaire n'est branché derrière.

import type { BBox, Envelope3857 } from "@/lib/geo/tile-math";

export type RemoteSensingProviderId = "cdse" | "fixture";

/** Couche d'image produite côté fournisseur : couleur naturelle ou indice de végétation. */
export type ImageryLayer = "TRUE_COLOR" | "NDVI";

export interface PolygonGeometry {
  type: "Polygon";
  /** Anneaux en [longitude, latitude] WGS84, le premier extérieur. */
  coordinates: number[][][];
}

export interface SceneSearchRequest {
  bbox: BBox;
  /** Début et fin de la période, ISO 8601 (UTC). */
  from: string;
  to: string;
  /** Nombre maximal de scènes rendues (le fournisseur pagine au besoin). */
  limit: number;
  /** Scènes plus nuageuses écartées dès le catalogue, en pour cent. */
  maxCloudCover?: number;
}

/** Scène Sentinel-2 L2A trouvée dans le catalogue. */
export interface SceneSummary {
  id: string;
  acquiredAt: string;
  /** Couverture nuageuse de la scène entière, en pour cent. */
  cloudCover: number | null;
  platform: string | null;
  /** Carreau MGRS (« MGRS-31PEP »). */
  gridCode: string | null;
}

export interface ImageryRequest {
  layer: ImageryLayer;
  /** Emprise demandée en EPSG:3857, pour se caler sur les tuiles de la carte. */
  envelope: Envelope3857;
  width: number;
  height: number;
  from: string;
  to: string;
  /** Scènes plus nuageuses ignorées, en pour cent. */
  maxCloudCover: number;
}

export interface ImageryResult {
  /** Image PNG avec canal alpha : nuages et absence de donnée sont transparents. */
  image: Uint8Array;
  /** Unités de traitement décomptées par le fournisseur, quand il les indique. */
  processingUnits: number | null;
}

export interface VegetationStatisticsRequest {
  geometry: PolygonGeometry;
  from: string;
  to: string;
  /** Pas d'agrégation en jours (10 : une valeur par décade). */
  intervalDays: number;
  /**
   * Couvert attendu d'après la culture déclarée : saisonnier (culture annuelle) ou permanent
   * (plantation). Sert seulement à la fixture pour synthétiser une série plausible ; un vrai
   * fournisseur mesure et l'ignore.
   */
  expectedCover?: "SEASONAL" | "PERMANENT";
}

/** NDVI moyen d'une géométrie sur un intervalle, pixels nuageux exclus. */
export interface VegetationInterval {
  from: string;
  to: string;
  ndviMean: number | null;
  ndviStdDev: number | null;
  /** Pixels retenus (sans nuage ni ombre) et pixels exclus. */
  validPixels: number;
  maskedPixels: number;
}

export interface RemoteSensingProvenance {
  sourceId: "COPERNICUS_S2" | "BAIS_SEED";
  /** Mesure satellitaire interprétée (ESTIMATED) ou série synthétique (SYNTHETIC). */
  reliability: "ESTIMATED" | "SYNTHETIC";
  licence: string;
  /** Mention à afficher avec toute image ou valeur dérivée. */
  attribution: string;
}

export interface RemoteSensingProvider {
  readonly id: RemoteSensingProviderId;
  readonly provenance: RemoteSensingProvenance;
  /** Vrai si les API de traitement sont utilisables (compte configuré pour CDSE). */
  readonly canProcess: boolean;
  searchScenes(request: SceneSearchRequest): Promise<SceneSummary[]>;
  /** Image de l'emprise ; null si le fournisseur ne produit pas d'image (fixture). */
  renderImage(request: ImageryRequest): Promise<ImageryResult | null>;
  vegetationStatistics(request: VegetationStatisticsRequest): Promise<VegetationInterval[]>;
}

export class RemoteSensingProviderError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
  ) {
    super(message);
    this.name = "RemoteSensingProviderError";
  }
}

/** Les API de traitement demandent un compte CDSE : levée tant qu'il n'est pas configuré. */
export class RemoteSensingNotConfiguredError extends Error {
  constructor() {
    super("Imagerie satellite non configurée : identifiants CDSE absents");
    this.name = "RemoteSensingNotConfiguredError";
  }
}
