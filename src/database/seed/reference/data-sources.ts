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
    // Population par commune du bilan alimentaire (ADR-0035), additionnée sur le raster.
    id: "WORLDPOP",
    name: "WorldPop Global2 (population à 100 m, 2015-2030)",
    organization: "WorldPop, Université de Southampton",
    url: "https://hub.worldpop.org/geodata/listing?id=135",
    licence: "CC BY 4.0, DOI 10.5258/SOTON/WP00839",
    kind: "PUBLIC_OPEN_DATA",
  },
  {
    // Statistiques nationales reprises par la FAO (ADR-0034), importées par le ministère.
    id: "FAOSTAT",
    name: "FAOSTAT, cultures et produits animaux (QCL)",
    organization: "Organisation des Nations unies pour l'alimentation et l'agriculture (FAO)",
    url: "https://www.fao.org/faostat/en/#data/QCL",
    licence:
      "CC BY 4.0, citer « FAO, FAOSTAT : Crops and livestock products (QCL) », avec la date de consultation",
    kind: "PUBLIC_OPEN_DATA",
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
    // Contours de champs de référence (ADR-0029) : modèle PRUE appliqué à des mosaïques Sentinel-2.
    id: "FTW_GLOBAL",
    name: "Fields of The World, contours de champs à 10 m (PRUE)",
    organization: "Taylor Geospatial Institute et partenaires (Fields of The World)",
    url: "https://fieldsofthe.world",
    licence: "CC BY 4.0, « Fields of The World, Taylor Geospatial Institute »",
    kind: "MODEL",
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
