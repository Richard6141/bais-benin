import {
  CHOROPLETH_SCALE,
  FARM_COLORS,
  METRICS,
  NDVI_SCALE,
  NO_DATA_COLOR,
  copernicusAttribution,
  type MetricKey,
  type SkyView,
} from "./map-config";

interface MapLegendProps {
  metric: MetricKey;
  breaks: number[];
  showFarms: boolean;
}

// Légende de la choroplèthe : bornes réelles des classes, pas des libellés génériques.
export function MapLegend({ metric, breaks, showFarms }: MapLegendProps) {
  const format = METRICS[metric].format;
  const classes = breaks.length + 1;
  return (
    <div className="rounded-lg border bg-card p-3 text-xs">
      <p className="font-medium">
        {METRICS[metric].label}
        {METRICS[metric].unit ? ` (${METRICS[metric].unit})` : ""}
      </p>
      {breaks.length === 0 ? (
        <p className="mt-1 text-muted-foreground">Aucune exploitation pour ces filtres.</p>
      ) : (
        <ol className="mt-2 flex flex-col gap-1">
          {Array.from({ length: classes }, (_, index) => {
            const lower = index === 0 ? 0 : (breaks[index - 1] ?? 0);
            const upper = breaks[index];
            return (
              <li key={index} className="flex items-center gap-2">
                <span
                  className="size-3.5 shrink-0 rounded-sm border border-black/10"
                  style={{
                    background: CHOROPLETH_SCALE[Math.min(index, CHOROPLETH_SCALE.length - 1)],
                  }}
                />
                <span className="tabular text-muted-foreground">
                  {upper === undefined
                    ? `> ${format(lower)}`
                    : `${format(lower)} – ${format(upper)}`}
                </span>
              </li>
            );
          })}
          {/* Communes sans exploitation ou masquées (moins de 5 exploitations) : hors échelle. */}
          <li className="flex items-center gap-2">
            <span
              className="size-3.5 shrink-0 rounded-sm border border-black/10"
              style={{ background: NO_DATA_COLOR }}
            />
            <span className="text-muted-foreground">Sans donnée ou moins de 5</span>
          </li>
        </ol>
      )}
      {showFarms ? (
        <>
          <p className="mt-3 font-medium">Exploitations</p>
          <ul className="mt-1 flex flex-col gap-1">
            <LegendDot color={FARM_COLORS.FIELD_VERIFIED} label="Vérifiée sur le terrain" />
            <LegendDot color={FARM_COLORS.AGENT_VERIFIED} label="Vérifiée par un agent" />
            <LegendDot color={FARM_COLORS.DECLARED} label="Déclarée" />
          </ul>
        </>
      ) : null}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="text-muted-foreground">{label}</span>
    </li>
  );
}

const decimal = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

// Repères de lecture de l'indice : trois paliers nommés, les autres classes portent leurs bornes.
const NDVI_HINTS: Record<number, string> = {
  0: "sol nu, eau, bâti",
  3: "culture en croissance",
  7: "couvert dense",
};

interface SkyLegendProps {
  view: SkyView;
  periodLabel: string;
  /** Image détaillée proposée aux zooms rapprochés (compte connecté). */
  detail: boolean;
}

// Légende de la vue du ciel : classes du NDVI, ou lecture de l'image en couleur naturelle, avec
// la source et la mention exigée par la licence Copernicus.
export function SkyLegend({ view, periodLabel, detail }: SkyLegendProps) {
  return (
    <div className="rounded-lg border bg-card p-3 text-xs">
      {view.layer === "ndvi" ? (
        <>
          <p className="font-medium">Indice de végétation (NDVI)</p>
          <ol className="mt-2 flex flex-col gap-1">
            {[...NDVI_SCALE].reverse().map((entry, reversedIndex) => {
              const index = NDVI_SCALE.length - 1 - reversedIndex;
              const lower = index === 0 ? null : NDVI_SCALE[index - 1]?.max;
              const range =
                entry.max === null
                  ? `≥ ${decimal.format(lower ?? 0)}`
                  : lower === null || lower === undefined
                    ? `< ${decimal.format(entry.max)}`
                    : `${decimal.format(lower)} – ${decimal.format(entry.max)}`;
              return (
                <li key={entry.color} className="flex items-center gap-2">
                  <span
                    className="size-3.5 shrink-0 rounded-sm border border-black/10"
                    style={{ background: entry.color }}
                  />
                  <span className="tabular text-muted-foreground">
                    {range}
                    {NDVI_HINTS[index] ? ` · ${NDVI_HINTS[index]}` : ""}
                  </span>
                </li>
              );
            })}
          </ol>
          <p className="mt-2 text-muted-foreground">Nuages et ombres masqués (transparents).</p>
        </>
      ) : (
        <>
          <p className="font-medium">Image en couleur naturelle</p>
          <p className="mt-1 text-muted-foreground">
            Scènes les moins nuageuses du mois ; les nuages restants sont visibles.
          </p>
        </>
      )}
      <p className="mt-2 text-muted-foreground">
        Sentinel-2, {periodLabel}
        {detail ? " · détail en zoomant" : " · connectez-vous pour le détail"}
      </p>
      <p className="mt-1 text-muted-foreground">{copernicusAttribution(view.period)}</p>
    </div>
  );
}
