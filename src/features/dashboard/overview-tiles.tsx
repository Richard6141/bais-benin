import type { Route } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatTile, type StatTrend } from "@/components/data-display/stat-tile";
import type { DashboardOverview } from "@/modules/analytics";
import {
  formatHectares,
  formatInteger,
  formatShare,
  formatDecimal,
  variationPercent,
} from "./dashboard-logic";
import { tileProvenance, tileValue } from "./provenance";

interface OverviewTilesProps {
  /** Vue nationale (A2) ou fiche commune (C1, sans campagne précédente). */
  overview: Pick<DashboardOverview, "figures" | "previous" | "provenance">;
  /** Chaîne de requête des filtres, reportée sur les liens des tuiles. */
  query: string;
}

const formatTonnes = (t: number) => `${t >= 100 ? formatInteger(t) : formatDecimal(t)} t`;

function trendAgainst(
  current: number | null,
  previous: number | null | undefined,
  campaign: string | undefined,
): StatTrend | undefined {
  if (!campaign || previous === undefined) return undefined;
  const value = variationPercent(current, previous);
  // La tendance dit toujours contre quoi elle compare, et n'apparaît qu'avec deux données.
  return value === null ? undefined : { value, label: `contre ${campaign}` };
}

// A2 : six indicateurs clés. Déclaré et mesuré côte à côte, jamais l'un à la place de l'autre.
// Chaque tuile ouvre l'écran qui détaille son chiffre, avec les mêmes filtres.
export function OverviewTiles({ overview, query }: OverviewTilesProps) {
  const { figures, previous, provenance } = overview;
  const masked = figures.masked;
  const against = previous?.masked ? undefined : previous?.campaign.code;
  const base = tileProvenance(provenance);
  const suffix = query ? `?${query}` : "";

  const tiles: Array<{ key: string; href: string; tile: ReactNode }> = [
    {
      key: "producteurs",
      href: `/pilotage/territoires${suffix}`,
      tile: (
        <StatTile
          label="Producteurs"
          value={tileValue(figures.farmerCount, masked, formatInteger)}
          {...base}
        />
      ),
    },
    {
      key: "exploitations",
      href: `/pilotage/territoires${suffix}`,
      tile: (
        <StatTile
          label="Exploitations"
          value={tileValue(figures.farmCount, masked, formatInteger)}
          trend={trendAgainst(figures.farmCount, previous?.farmCount, against)}
          {...base}
        />
      ),
    },
    {
      key: "declaree",
      href: `/pilotage/territoires${suffix}`,
      tile: (
        <StatTile
          label="Superficie déclarée"
          value={tileValue(figures.declaredAreaHa, masked, formatHectares)}
          {...base}
          reliability={provenance.synthetic ? "SYNTHETIC" : "DECLARED"}
        />
      ),
    },
    {
      key: "mesuree",
      href: `/pilotage/qualite${suffix}`,
      tile: (
        <StatTile
          label="Superficie mesurée"
          value={tileValue(figures.measuredAreaHa, masked, formatHectares)}
          {...base}
          source={
            figures.measuredParcelShare === null || masked
              ? "Contours relevés au GPS"
              : `${formatShare(figures.measuredParcelShare)} des parcelles relevées au GPS`
          }
          reliability={provenance.synthetic ? "SYNTHETIC" : "FIELD_VERIFIED"}
        />
      ),
    },
    {
      key: "verifiee",
      href: `/pilotage/qualite${suffix}`,
      tile: (
        <StatTile
          label="Part vérifiée"
          value={tileValue(figures.verifiedShare, masked, formatShare)}
          {...base}
          source="Vérifiées par un agent ou sur le terrain"
        />
      ),
    },
    {
      key: "production",
      href: `/pilotage${suffix}#production`,
      tile: (
        <StatTile
          label="Production déclarée"
          value={tileValue(figures.productionT, masked, formatTonnes, "Non déclarée")}
          trend={trendAgainst(figures.productionT, previous?.productionT, against)}
          {...base}
          source={
            figures.declaredHarvestCount
              ? `${formatInteger(figures.declaredHarvestCount)} récoltes déclarées`
              : "Déclarations de récolte"
          }
          reliability={provenance.synthetic ? "SYNTHETIC" : "DECLARED"}
        />
      ),
    },
  ];

  return (
    <section aria-label="Indicateurs clés" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {tiles.map(({ key, href, tile }) =>
        // Valeur masquée : l'explication est un bouton, qui ne peut pas vivre dans un lien.
        masked ? (
          <div key={key}>{tile}</div>
        ) : (
          <Link
            key={key}
            href={href as Route}
            className="rounded-xl transition-shadow hover:shadow-raised focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            {tile}
          </Link>
        ),
      )}
    </section>
  );
}
