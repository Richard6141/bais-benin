// Sources de données de référence (docs/08 §1). Les identifiants sont stables :
// ils apparaissent dans chaque enregistrement et dans l'interface (« Source : … »).

export type DataSourceKindCode =
  "OFFICIAL" | "FIELD" | "PUBLIC_OPEN_DATA" | "SENSOR" | "MODEL" | "SYNTHETIC";

export interface DataSourceReference {
  id: string;
  name: string;
  organization: string;
  url?: string;
  licence?: string;
  kind: DataSourceKindCode;
}

export const DATA_SOURCES: readonly DataSourceReference[] = [
  {
    id: "MAEP_DSA",
    name: "Statistiques agricoles nationales",
    organization:
      "Ministère de l'Agriculture, de l'Élevage et de la Pêche, Direction de la Statistique Agricole",
    kind: "OFFICIAL",
  },
  {
    id: "INSTAD_RGPH5",
    name: "Recensement général de la population et de l'habitation (RGPH-5)",
    organization: "Institut National de la Statistique et de la Démographie",
    url: "https://instad.bj",
    kind: "OFFICIAL",
  },
  {
    id: "GEOBOUNDARIES",
    name: "geoBoundaries gbOpen (limites administratives ADM1 et ADM2)",
    organization: "William & Mary geoLab",
    url: "https://www.geoboundaries.org",
    licence: "CC BY 4.0",
    kind: "PUBLIC_OPEN_DATA",
  },
  {
    id: "OSM",
    name: "OpenStreetMap",
    organization: "OpenStreetMap Foundation",
    url: "https://www.openstreetmap.org",
    licence: "ODbL 1.0",
    kind: "PUBLIC_OPEN_DATA",
  },
  {
    id: "OPEN_METEO",
    name: "Open-Meteo (prévisions et réanalyse)",
    organization: "Open-Meteo",
    url: "https://open-meteo.com",
    licence: "CC BY 4.0",
    kind: "SENSOR",
  },
  {
    id: "COPERNICUS_S2",
    name: "Copernicus Sentinel-2 L2A (Copernicus Data Space Ecosystem)",
    organization: "Commission européenne et Agence spatiale européenne (programme Copernicus)",
    url: "https://dataspace.copernicus.eu",
    licence:
      "Licence Copernicus (accès libre et gratuit), « Contains modified Copernicus Sentinel data »",
    kind: "SENSOR",
  },
  {
    id: "COPERNICUS_S1",
    name: "Copernicus Sentinel-1 GRD (radar), Copernicus Data Space Ecosystem",
    organization: "Commission européenne et Agence spatiale européenne (programme Copernicus)",
    url: "https://dataspace.copernicus.eu",
    licence:
      "Licence Copernicus (accès libre et gratuit), « Contains modified Copernicus Sentinel data »",
    kind: "SENSOR",
  },
  {
    // Feux actifs en quasi temps réel (ADR-0022) : fichiers publics sans clé.
    id: "NASA_FIRMS",
    name: "Feux actifs NASA FIRMS (VIIRS 375 m, MODIS)",
    organization: "NASA LANCE / FIRMS",
    url: "https://firms.modaps.eosdis.nasa.gov",
    licence: "Données ouvertes de la NASA, citation demandée",
    kind: "SENSOR",
  },
  {
    id: "ATDA_TERRAIN",
    name: "Relevés de terrain des agents",
    organization: "Agences Territoriales de Développement Agricole",
    kind: "FIELD",
  },
  {
    // Signalements de terrain (phase 0) : source des alertes de regroupement (ADR-0015).
    id: "BAIS_SIGNALEMENTS",
    name: "Signalements des producteurs et des agents",
    organization: "Plateforme BAIS",
    kind: "FIELD",
  },
  {
    id: "BAIS_SEED",
    name: "Jeu de données de démonstration BAIS",
    organization: "Équipe BAIS",
    kind: "SYNTHETIC",
  },
];
