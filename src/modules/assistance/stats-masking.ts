import { K_ANONYMITY, maskSmallCells } from "@/modules/analytics/k-anonymity";

// Secret statistique dans une commune affichée (revue de sécurité R6), en fonction pure : cases
// par statut de moins de 5 masquées, avec le complément quand le total de la ligne redonnerait la
// valeur, et délais médians publiés sur 5 demandes au moins.

export type AssistanceStatField =
  "received" | "inProgress" | "resolved" | "medianHoursToTake" | "medianHoursToResolve";

export interface AssistanceCommuneStats {
  communeCode: string;
  communeName: string;
  total: number | null;
  received: number | null;
  inProgress: number | null;
  resolved: number | null;
  medianHoursToTake: number | null;
  medianHoursToResolve: number | null;
  masked: boolean;
  /** Cases masquées d'une commune affichée (secret statistique). */
  maskedFields: AssistanceStatField[];
}

const STATUS_FIELDS = ["received", "inProgress", "resolved"] as const;

/** Masque les cases de moins de 5 d'une commune affichée, et les délais sur trop peu de demandes. */
export function maskWithinCommune(row: AssistanceCommuneStats): AssistanceCommuneStats {
  if (row.masked) return row;
  const cells = STATUS_FIELDS.map((field) => ({ field, count: row[field] ?? 0 }));
  const hidden = maskSmallCells(cells, {
    count: (cell) => cell.count,
    groupTotal: true,
    fields: ["count"],
  });
  const out: AssistanceCommuneStats = { ...row, maskedFields: [] };
  hidden.forEach((cell, index) => {
    if (!cell.masked) return;
    const field = cells[index]!.field;
    out[field] = null;
    out.maskedFields.push(field);
  });
  // Prise en charge : demandes en cours et résolues (une résolution directe vaut prise en charge).
  const taken = (row.inProgress ?? 0) + (row.resolved ?? 0);
  if (row.medianHoursToTake !== null && taken < K_ANONYMITY) {
    out.medianHoursToTake = null;
    out.maskedFields.push("medianHoursToTake");
  }
  if (row.medianHoursToResolve !== null && (row.resolved ?? 0) < K_ANONYMITY) {
    out.medianHoursToResolve = null;
    out.maskedFields.push("medianHoursToResolve");
  }
  return out;
}
