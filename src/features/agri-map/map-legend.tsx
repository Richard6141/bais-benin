import { CHOROPLETH_SCALE, FARM_COLORS, METRICS, type MetricKey } from "./map-config";

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
    <div className="rounded-lg border bg-card/95 p-3 text-xs shadow-card backdrop-blur">
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
                  className="size-3 shrink-0 rounded-sm border border-black/10"
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
