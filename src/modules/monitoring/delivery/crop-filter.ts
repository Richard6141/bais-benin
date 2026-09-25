import type { RuleNode } from "@/modules/monitoring/rules";

// Filtre de destinataires déduit de la définition d'une règle : les conditions `crop_in` et
// `crop_stage_in` (hors négation) disent quelles cultures et quels stades l'alerte concerne.
// Une règle sans condition de culture concerne toutes les exploitations de la commune.

export interface CropFilter {
  cropCodes: string[] | null;
  stages: string[] | null;
}

function collect(
  node: RuleNode,
  out: { crops: Set<string>; stages: Set<string> },
  negated: boolean,
) {
  if ("all" in node) return node.all.forEach((child) => collect(child, out, negated));
  if ("any" in node) return node.any.forEach((child) => collect(child, out, negated));
  if ("not" in node) return collect(node.not, out, !negated);
  if (negated) return;
  const values = (Array.isArray(node.value) ? node.value : [node.value]).map(String);
  if (node.indicator === "crop_in") values.forEach((v) => out.crops.add(v));
  if (node.indicator === "crop_stage_in") values.forEach((v) => out.stages.add(v));
}

export function cropFilterFromDefinition(definition: RuleNode): CropFilter {
  const out = { crops: new Set<string>(), stages: new Set<string>() };
  collect(definition, out, false);
  return {
    cropCodes: out.crops.size > 0 ? [...out.crops].sort() : null,
    stages: out.stages.size > 0 ? [...out.stages].sort() : null,
  };
}
