// Port de télédétection (docs/02 §6, ADR-0016). Adaptateurs : Copernicus Data Space Ecosystem
// (catalogue STAC public et API de traitement du compte CDSE) et fixture (profils de végétation
// synthétiques, sans réseau, pour la démonstration et les tests). Le module satellite ne connaît
// que ce contrat : aucun fournisseur commercial intermédiaire n'est branché derrière.

import type { BBox, Envelope3857 } from "@/lib/geo/tile-math";

export type RemoteSensingProviderId = "cdse" | "fixture";

/** Couche d'image produite côté fournisseur : couleur naturelle ou indice de végétation. */
export type ImageryLayer = "TRUE_COLOR" | "NDVI" | "CROP_CLASSES";

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
  /** Délai de chaque page du catalogue, en millisecondes (30 s par défaut). */
  timeoutMs?: number;
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

/** Contour en EPSG:3857 (mètres) : les pixels hors contour sortent sans donnée (transparents). */
export interface ClipGeometry {
  type: "Polygon" | "MultiPolygon";
  coordinates: number[][][] | number[][][][];
}

export interface ImageryRequest {
  layer: ImageryLayer;
  /** Emprise demandée en EPSG:3857, pour se caler sur les tuiles de la carte. */
  envelope: Envelope3857;
  /** Découpe sur la frontière du pays, dans le même système que l'emprise. */
  clip?: ClipGeometry;
  width: number;
  height: number;
  from: string;
  to: string;
  /** Scènes plus nuageuses ignorées, en pour cent. */
  maxCloudCover: number;
  /** Délai de la requête, en millisecondes (30 s par défaut). */
  timeoutMs?: number;
  /**
   * Mosaïque sans nuages : chaque pixel pris au passage le plus récent où il est dégagé, parmi
   * les passages les moins nuageux de la période (fenêtre glissante des 60 jours).
   */
  cloudFree?: boolean;
  /**
   * Image d'ensemble d'une longue fenêtre : coupée à cette date en deux fenêtres, la récente
   * [splitAt, to] d'abord, l'ancienne [from, splitAt] pour combler ses trous. Sur tout le pays,
   * une seule longue fenêtre laissait des bandes vides.
   */
  splitAt?: string;
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
  /** Période où le couvert doit culminer, pour la seule fixture. */
  expectedPeak?: { from: string; to: string };
  /**
   * Clés de la démonstration, pour la seule fixture : vigueur synthétique reproductible par
   * commune et par parcelle. Un vrai fournisseur mesure et l'ignore.
   */
  demoKeys?: { commune: string; parcel: string };
}

/** Sens d'orbite Sentinel-1 : une parcelle est toujours vue dans le même, pour comparer. */
export type OrbitDirection = "ASCENDING" | "DESCENDING";

export interface RadarStatisticsRequest {
  geometry: PolygonGeometry;
  from: string;
  to: string;
  /** Pas d'agrégation en jours (12 : un passage par orbite). */
  intervalDays: number;
  orbitDirection: OrbitDirection;
  /** Couvert attendu, pour la seule fixture (comme pour le NDVI). */
  expectedCover?: "SEASONAL" | "PERMANENT";
  /** Période où le couvert doit culminer, pour la seule fixture. */
  expectedPeak?: { from: string; to: string };
  /**
   * Clés de la démonstration, pour la seule fixture : vigueur synthétique reproductible par
   * commune et par parcelle. Un vrai fournisseur mesure et l'ignore.
   */
  demoKeys?: { commune: string; parcel: string };
}

/** Indice de végétation radar d'une géométrie sur un intervalle (Sentinel-1, ADR-0019). */
export interface RadarInterval {
  from: string;
  to: string;
  /** RVI = 4·VH / (VV + VH), puissances linéaires ; de 0 (sol nu) à 1 (couvert dense). */
  rviMean: number | null;
  /** Rétrodiffusion VH moyenne, en dB. */
  vhDbMean: number | null;
  validPixels: number;
  maskedPixels: number;
}

export interface MultiPolygonGeometry {
  type: "MultiPolygon";
  coordinates: number[][][][];
}

/** Surfaces par classe de culture sur une géométrie (carte des cultures, ADR-0021). */
export interface CropAreaRequest {
  /** Commune entière, parfois en plusieurs morceaux. */
  geometry: PolygonGeometry | MultiPolygonGeometry;
  from: string;
  to: string;
  /** Côté du pixel au sol, en mètres (100 : un hectare par pixel). */
  resolutionM: number;
  /** Latitude moyenne, pour convertir la résolution au sol en unités Web Mercator. */
  latitude: number;
  /** Abaissement des seuils de végétation dans les zones les plus sèches. */
  zoneOffset: number;
  /** Délai de la requête, en millisecondes (30 s par défaut). */
  timeoutMs?: number;
  /**
   * Code de la classe déclarée d'une parcelle (matrice de confusion) : indice pour la fixture
   * seulement, jamais envoyé à Copernicus.
   */
  expectedClass?: number;
}

/** Séries satellite d'une parcelle pour le modèle de culture (ADR-0030). */
export interface ParcelSeriesRequest {
  geometry: PolygonGeometry;
  from: string;
  to: string;
  /** Latitude moyenne, pour convertir 10 m au sol en unités Web Mercator. */
  latitude: number;
  timeoutMs?: number;
  /** Classe de culture déclarée, pour la seule fixture ; jamais envoyée à Copernicus. */
  expectedGroup?: string;
  /** Clés de la démonstration, pour la seule fixture. */
  demoKeys?: { commune: string; parcel: string };
  /** Parcelle d'une exploitation vérifiée, pour la seule fixture : la culture déclarée est vraie. */
  verified?: boolean;
}

export interface ParcelSeriesResult {
  /** Une valeur par décade : NDVI, NDMI, part des pixels vus sans nuage (0 à 1). */
  s2: { from: string; to: string; ndvi: number | null; ndmi: number | null; valid: number }[];
  /** Une valeur par pas de 12 jours, en décibels. */
  s1: { from: string; to: string; vv: number | null; vh: number | null }[];
  processingUnits: number | null;
}

/** Riz vu par le radar Sentinel-1 sur une commune (ADR-0026). */
export interface RiceRadarRequest {
  geometry: PolygonGeometry | MultiPolygonGeometry;
  /** Saison des pluies : de mai à novembre au plus. */
  from: string;
  to: string;
  resolutionM: number;
  latitude: number;
  timeoutMs?: number;
}

export interface RiceRadarResult {
  /** Pixels de la commune reconnus comme rizière. */
  ricePixels: number;
  /** Pixels de la commune vus par le radar. */
  observedPixels: number;
  processingUnits: number | null;
}

/**
 * Surface brûlée d'une parcelle (ADR-0038 §2) : dNBR Sentinel-2 entre la dernière image nette
 * avant le feu et la première après, pixel par pixel, sur la fenêtre [preFrom, postTo].
 */
export interface BurnSeverityRequest {
  geometry: PolygonGeometry;
  /** Heure de la détection du feu : sépare les images d'avant de celles d'après. */
  fireAt: string;
  preFrom: string;
  postTo: string;
  /** Latitude moyenne, pour convertir 20 m au sol en unités Web Mercator. */
  latitude: number;
  timeoutMs?: number;
  /** Clé de la parcelle, pour la seule fixture ; jamais envoyée à Copernicus. */
  demoKey?: string;
}

/**
 * Pixels de 20 m par classe : 0 sans image nette avant et après, 1 non brûlé (dNBR < 0,10),
 * 2 brûlé possible (0,10 à 0,27), 3 brûlé (0,27 à 0,66), 4 brûlé sévère (au-delà).
 */
export interface BurnSeverityResult {
  classPixels: [number, number, number, number, number];
  processingUnits: number | null;
}

export interface CropAreaResult {
  /** Pixels par code de classe (index 0 : non classé). */
  classPixels: number[];
  /**
   * Mois de saison des pluies (mai à octobre) vus sans nuage, en moyenne par pixel, de 0 à 6 :
   * la vraie mesure de l'incertitude d'une commune. Null si le fournisseur ne la donne pas.
   */
  rainyMonthsSeen?: number | null;
  processingUnits: number | null;
}

/** Série statistique et unités de traitement décomptées par le fournisseur. */
export interface StatisticsResult<T> {
  intervals: T[];
  processingUnits: number | null;
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

/** Fenêtre de variables par pixel pour la délimitation assistée des champs (phase 3). */
export interface FieldFeaturesRequest {
  /** Emprise en EPSG:3857, centrée sur le point désigné par l'agent. */
  envelope: Envelope3857;
  width: number;
  height: number;
  from: string;
  to: string;
}

/** Variables par pixel, ligne par ligne depuis le nord-ouest ; NaN là où rien n'a été vu. */
export interface FieldFeatures {
  width: number;
  height: number;
  /** NDVI le plus haut de la période. */
  peak: Float32Array;
  /** NDVI le plus bas de la période. */
  low: Float32Array;
  /** Réflectance moyenne B11 (infrarouge moyen), de 0 à 1. */
  swir: Float32Array;
  processingUnits: number | null;
}

export interface RemoteSensingProvenance {
  sourceId: "COPERNICUS_S2" | "COPERNICUS_S1" | "BAIS_SEED";
  /** Mesure satellitaire interprétée (ESTIMATED) ou série synthétique (SYNTHETIC). */
  reliability: "ESTIMATED" | "SYNTHETIC";
  licence: string;
  /** Mention à afficher avec toute image ou valeur dérivée. */
  attribution: string;
}

export interface RemoteSensingProvider {
  readonly id: RemoteSensingProviderId;
  readonly provenance: RemoteSensingProvenance;
  /** Provenance des mesures radar (Sentinel-1). */
  readonly radarProvenance: RemoteSensingProvenance;
  /** Vrai si les API de traitement sont utilisables (compte configuré pour CDSE). */
  readonly canProcess: boolean;
  searchScenes(request: SceneSearchRequest): Promise<SceneSummary[]>;
  /** Image de l'emprise ; null si le fournisseur ne produit pas d'image (fixture). */
  renderImage(request: ImageryRequest): Promise<ImageryResult | null>;
  vegetationStatistics(
    request: VegetationStatisticsRequest,
  ): Promise<StatisticsResult<VegetationInterval>>;
  radarStatistics(request: RadarStatisticsRequest): Promise<StatisticsResult<RadarInterval>>;
  cropAreaStatistics(request: CropAreaRequest): Promise<CropAreaResult>;
  riceRadarStatistics(request: RiceRadarRequest): Promise<RiceRadarResult>;
  parcelSeries(request: ParcelSeriesRequest): Promise<ParcelSeriesResult>;
  fieldFeatures(request: FieldFeaturesRequest): Promise<FieldFeatures>;
  burnSeverity(request: BurnSeverityRequest): Promise<BurnSeverityResult>;
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
