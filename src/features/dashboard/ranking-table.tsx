import type { ReactNode } from "react";
import { MaskedValue } from "@/components/data-display/masked-value";
import { NoValue } from "@/components/data-display/no-value";
import {
  SortableTable,
  type SortableCell,
  type SortableColumn,
  type SortableRow,
} from "@/components/data-display/sortable-table";
import { Badge } from "@/components/ui/badge";
import type { TerritoryRanking, TerritoryRankingRow } from "@/modules/analytics";
import { formatTonnes } from "./crop-production";
import { formatHectares, formatInteger, formatShare } from "./dashboard-logic";

interface RankingTableProps {
  ranking: TerritoryRanking;
  /** Lien d'une ligne : communes du département (B1) ou fiche commune (B2). */
  hrefFor: (row: TerritoryRankingRow) => string;
  /** Nom de la culture filtrée, pour l'en-tête de la colonne de production. */
  cropName?: string;
}

function valueCell(
  row: TerritoryRankingRow,
  value: number | null,
  format: (v: number) => string,
  empty: ReactNode = <NoValue />,
): SortableCell {
  if (row.masked) return { display: <MaskedValue />, sort: null };
  return { display: value === null ? empty : format(value), sort: value };
}

function toRow(row: TerritoryRankingRow, href: string | undefined): SortableRow {
  const none = !row.masked && row.farmCount === 0;
  const measured: SortableCell = row.masked
    ? { display: <MaskedValue />, sort: null }
    : {
        // Déclaré et mesuré côte à côte : la part relevée dit sur quoi repose le mesuré.
        display:
          row.measuredAreaHa === null ? (
            <NoValue />
          ) : (
            `${formatHectares(row.measuredAreaHa)}${row.measuredParcelShare === null ? "" : ` (${formatShare(row.measuredParcelShare)})`}`
          ),
        sort: row.measuredAreaHa,
      };
  return {
    key: row.code,
    href: none || row.masked ? undefined : href,
    muted: none,
    cells: {
      name: { display: row.name, sort: row.name },
      zone: {
        display: row.zoneCode ? <Badge variant="outline">{row.zoneCode}</Badge> : <NoValue />,
        sort: row.zoneCode,
      },
      farms: none
        ? { display: "aucune exploitation", sort: 0 }
        : valueCell(row, row.farmCount, formatInteger),
      farmers: valueCell(row, row.farmerCount, formatInteger),
      declared: valueCell(row, row.declaredAreaHa, formatHectares),
      measured,
      verified: valueCell(row, row.verifiedShare, formatShare),
      production: valueCell(row, row.productionT, formatTonnes, "non déclarée"),
    },
  };
}

// B1 et B2 : classement des territoires. Tri par colonne côté navigateur, rang recalculé selon
// la colonne triée ; les lignes masquées (moins de 5 exploitations) ne se classent pas.
export function RankingTable({ ranking, hrefFor, cropName }: RankingTableProps) {
  const communes = ranking.level === "commune";
  const columns: SortableColumn[] = [
    { key: "name", label: communes ? "Commune" : "Département" },
    ...(communes ? [{ key: "zone", label: "ZAE", sortable: false }] : []),
    { key: "farms", label: "Exploitations", align: "right" as const },
    { key: "farmers", label: "Producteurs", align: "right" as const },
    { key: "declared", label: "Surface déclarée", align: "right" as const },
    { key: "measured", label: "Surface mesurée", align: "right" as const },
    { key: "verified", label: "Part vérifiée", align: "right" as const },
    {
      key: "production",
      label: cropName ? `Production (${cropName.toLowerCase()})` : "Production",
      align: "right" as const,
    },
  ];
  const sortKey: Record<string, string> = {
    farmCount: "farms",
    declaredAreaHa: "declared",
    measuredAreaHa: "measured",
    verifiedShare: "verified",
    productionT: "production",
  };
  return (
    <SortableTable
      caption={communes ? "Communes classées" : "Départements classés"}
      columns={columns}
      rows={ranking.rows.map((row) => toRow(row, hrefFor(row)))}
      footer={toRow(ranking.total, undefined)}
      initialSort={{ key: sortKey[ranking.sortBy] ?? "farms", direction: "descending" }}
      ranked
    />
  );
}
