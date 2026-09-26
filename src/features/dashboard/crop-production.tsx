import { BarList } from "@/components/data-display/bar-list";
import { CROP_CODES, CropGlyph, type CropCode } from "@/components/data-display/crop-glyph";
import { MaskedValue } from "@/components/data-display/masked-value";
import { SortableTable, type SortableRow } from "@/components/data-display/sortable-table";
import type { AnalyticsProvenance, CropProductionRow } from "@/modules/analytics";
import {
  formatDecimal,
  formatHectares,
  formatInteger,
  formatShare,
  signedPercent,
} from "./dashboard-logic";
import { ProvenanceNote } from "./provenance";

/** Pictogramme de culture, décoratif à côté du nom écrit. */
export function cropLeading(code: string) {
  return (CROP_CODES as readonly string[]).includes(code) ? (
    <span aria-hidden>
      <CropGlyph code={code as CropCode} size={24} className="size-5" />
    </span>
  ) : null;
}

export const formatTonnes = (t: number) => `${t >= 100 ? formatInteger(t) : formatDecimal(t)} t`;

interface CropProductionProps {
  rows: readonly CropProductionRow[];
  provenance: AnalyticsProvenance;
  /** Lien d'une culture : filtre toute la page sur elle (null : pas de lien, fiche commune). */
  hrefForCrop: ((cropCode: string) => string) | null;
  /** Faux sur la fiche imprimable : le tableau complet s'imprime déplié. */
  foldTable?: boolean;
}

function yieldDetail(row: CropProductionRow): string {
  if (row.masked) return "";
  const parts: string[] = [];
  if (row.areaHa !== null) parts.push(formatHectares(row.areaHa));
  if (row.yieldTPerHa !== null) {
    const gap =
      row.yieldGapPct === null ? "" : ` (${signedPercent(row.yieldGapPct)} contre la référence)`;
    parts.push(`rendement indicatif ${formatDecimal(row.yieldTPerHa)} t/ha${gap}`);
  }
  if (row.verifiedShare !== null) parts.push(`${formatShare(row.verifiedShare)} vérifiée`);
  return parts.join(", ");
}

function verifiedDetail(row: CropProductionRow): string {
  return row.masked || row.verifiedShare === null
    ? ""
    : `${formatShare(row.verifiedShare)} vérifiée`;
}

const cell = (
  row: CropProductionRow,
  value: number | null,
  format: (v: number) => string,
  empty = "—",
) =>
  row.masked
    ? { display: <MaskedValue />, sort: null }
    : { display: value === null ? empty : format(value), sort: value };

// A3 (et C2 au grain commune) : production déclarée par culture. Les barres donnent l'ordre de
// grandeur, le tableau les chiffres ; une culture sans récolte déclarée dit « récolte non
// déclarée », jamais 0. Le rendement est indicatif : production ÷ superficie récoltée déclarée.
export function CropProduction({
  rows,
  provenance,
  hrefForCrop,
  foldTable = true,
}: CropProductionProps) {
  // Campagne ouverte sans récolte déclarée : des barres toutes vides ne diraient rien, on montre
  // la superficie cultivée, avec la phrase qui le dit.
  const hasProduction = rows.some((row) => !row.masked && row.productionT !== null);
  const tableRows: SortableRow[] = rows.map((row) => ({
    key: row.cropCode,
    href: hrefForCrop && !row.masked ? hrefForCrop(row.cropCode) : undefined,
    cells: {
      crop: { display: row.cropName, sort: row.cropName },
      area: cell(row, row.areaHa, formatHectares),
      measured: cell(row, row.measuredAreaHa, formatHectares),
      production: cell(row, row.productionT, formatTonnes, "non déclarée"),
      yield: cell(row, row.yieldTPerHa, (v) => `${formatDecimal(v)} t/ha`),
      reference: cell(row, row.typicalYieldTPerHa, (v) => `${formatDecimal(v)} t/ha`),
      gap: cell(row, row.yieldGapPct, signedPercent),
      verified: cell(row, row.verifiedShare, formatShare),
    },
  }));

  return (
    <div className="flex flex-col gap-6">
      {hasProduction ? null : (
        <p className="text-sm text-muted-foreground">
          Aucune récolte déclarée pour cette campagne : les barres montrent la superficie cultivée
          déclarée, en attendant les premières déclarations.
        </p>
      )}
      <BarList
        label={
          hasProduction ? "Production déclarée par culture" : "Superficie cultivée par culture"
        }
        items={rows.slice(0, 8).map((row) => {
          const value = hasProduction ? row.productionT : row.areaHa;
          return {
            key: row.cropCode,
            label: row.cropName,
            leading: cropLeading(row.cropCode),
            value: row.masked ? ("masked" as const) : value,
            display:
              value === null
                ? undefined
                : hasProduction
                  ? formatTonnes(value)
                  : formatHectares(value),
            emptyLabel: "récolte non déclarée",
            detail: hasProduction ? yieldDetail(row) : verifiedDetail(row),
            href: hrefForCrop && !row.masked ? hrefForCrop(row.cropCode) : undefined,
          };
        })}
      />
      {/* Le tableau complet se déplie : les barres donnent déjà l'essentiel, et une page de
          pilotage lue sur téléphone reste courte. Déplié sur la fiche imprimable. */}
      <details
        className="group rounded-xl border bg-card print:border-0"
        open={!foldTable || rows.length <= 8}
      >
        <summary className="flex min-h-11 cursor-pointer items-center px-4 text-sm font-medium print:hidden">
          Tableau complet des {rows.length} cultures
        </summary>
        <div className="px-2 pb-2">
          <SortableTable
            caption="Production par culture"
            initialSort={{ key: hasProduction ? "production" : "area", direction: "descending" }}
            columns={[
              { key: "crop", label: "Culture" },
              { key: "area", label: "Superficie déclarée", align: "right" },
              { key: "measured", label: "Superficie mesurée", align: "right" },
              { key: "production", label: "Production déclarée", align: "right" },
              { key: "yield", label: "Rendement indicatif", align: "right" },
              { key: "reference", label: "Référence", align: "right" },
              { key: "gap", label: "Écart", align: "right" },
              { key: "verified", label: "Part vérifiée", align: "right" },
            ]}
            rows={tableRows}
          />
        </div>
      </details>
      <ProvenanceNote provenance={provenance} />
    </div>
  );
}
