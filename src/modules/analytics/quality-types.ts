// Types publics de la qualité des données (pilotage-parcours-ux §2.D) et de la fraîcheur des
// agrégats. Aucun nom de producteur ni d'agent : des comptes et des communes seulement.

export interface AnalyticsFreshness {
  /** Dernière commande de synchronisation reçue d'un terminal. */
  lastSyncAt: Date | null;
  /** Dernière ingestion météo terminée (réussie ou partielle). */
  lastIngestionAt: Date | null;
  /** Plus ancien des derniers rafraîchissements des deux vues d'agrégats. */
  aggregatesRefreshedAt: Date | null;
  /** Agrégats rafraîchis il y a plus de 30 minutes (bandeau). */
  aggregatesStale: boolean;
  /** Météo ingérée il y a plus de 48 heures (bandeau). */
  weatherStale: boolean;
}

/** Tranches d'écart relatif entre superficie déclarée et superficie relevée d'une parcelle. */
export interface GapBuckets {
  under10: number;
  from10to20: number;
  from20to50: number;
  over50: number;
}

export interface CommuneGap {
  code: string;
  name: string;
  departementCode: string;
  /** Moins de 5 parcelles relevées : écart médian et part signalée masqués. */
  masked: boolean;
  measuredParcels: number | null;
  /** Écart relatif médian, de 0 à 1 (0,25 = 25 %). */
  medianGap: number | null;
  /** Part des parcelles dont l'écart atteint 20 % (seuil de signalement du registre). */
  flaggedShare: number | null;
}

export interface AgeBuckets {
  under30Days: number;
  from30to180Days: number;
  over180Days: number;
}

export interface CommuneAgeing extends Partial<AgeBuckets> {
  code: string;
  name: string;
  departementCode: string;
  /** Moins de 5 exploitations déclarées dans la commune : tranches masquées. */
  masked: boolean;
  declaredFarms: number | null;
}

export interface DataQuality {
  filters: { departementCode?: string; communeCode?: string };
  /** D1 : parcelles relevées, écarts au déclaré. */
  gaps: {
    measuredParcels: number;
    buckets: GapBuckets;
    medianGap: number | null;
    flaggedShare: number | null;
    /** Les 10 communes aux écarts médians les plus forts (lignes masquées exclues du classement). */
    worstCommunes: CommuneGap[];
  };
  /** D2 : exploitations DECLARED par ancienneté depuis la déclaration. */
  ageing: {
    totals: AgeBuckets;
    /** Communes triées par nombre d'exploitations déclarées depuis plus de 180 jours. */
    communes: CommuneAgeing[];
  };
  /** D3 : couverture des agents (ministère seulement, sinon null). */
  coverage: {
    communesWithoutAgent: Array<{ code: string; name: string; departementCode: string }>;
    activeAgents: number;
    agentsWithoutSync14d: number;
    /** Répartition des agents par nombre de visites sur 30 jours. */
    visits30d: { none: number; from1to5: number; from6to20: number; over20: number };
  } | null;
  /** D4 : paires de producteurs probablement en double (compte seulement ; ministère, sinon null). */
  duplicates: { probablePairs: number } | null;
  /** D5 */
  freshness: AnalyticsFreshness;
  generatedAt: Date;
}

export type ExportKind = "indicators" | "production";

export interface CsvExport {
  kind: ExportKind;
  /** Nom de fichier proposé, par exemple « bais-indicateurs-2026-2027.csv ». */
  filename: string;
  /** Contenu complet, BOM UTF-8 compris, séparateur « ; », virgule décimale. */
  content: string;
  rows: number;
}
