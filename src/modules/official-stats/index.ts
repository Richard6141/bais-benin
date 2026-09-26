// Statistiques agricoles officielles (ADR-0034) : import des chiffres de la DSA et de FAOSTAT,
// rapprochement avec le registre et l'enquête aréolaire.

export {
  CROP_ALIASES,
  MAX_BYTES,
  MAX_ROWS,
  normalize,
  parseNumber,
  parseOfficialCsv,
  type CsvLookups,
  type OfficialLevel,
  type OfficialMetric,
  type OfficialRow,
} from "./csv";
export { importOfficialStatistics, type ImportResult } from "./import";
export {
  getOfficialReconciliation,
  type OfficialImportSummary,
  type OfficialReconciliation,
  type ReconciliationRow,
} from "./reconcile";
