// Courbe NDVI d'une parcelle sur la saison (moyennes décadaires Sentinel-2), avec le seuil que la
// culture déclarée devrait atteindre. Les décades masquées par les nuages restent des trous : on
// ne relie pas deux mesures séparées par une absence.

interface NdviSparklineProps {
  series: ReadonlyArray<{ from: string; ndvi: number | null }>;
  expected: number;
  className?: string;
}

const WIDTH = 300;
const HEIGHT = 84;
const PAD_X = 4;
const PAD_Y = 8;

const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "short" });

export function NdviSparkline({ series, expected, className }: NdviSparklineProps) {
  if (series.length < 2) return null;
  const max = Math.max(0.9, ...series.map((point) => point.ndvi ?? 0));
  const x = (index: number) => PAD_X + (index / (series.length - 1)) * (WIDTH - 2 * PAD_X);
  const y = (value: number) => HEIGHT - PAD_Y - (Math.max(0, value) / max) * (HEIGHT - 2 * PAD_Y);

  const segments: string[] = [];
  let current = "";
  series.forEach((point, index) => {
    if (point.ndvi === null) {
      if (current) segments.push(current);
      current = "";
      return;
    }
    current += `${current ? "L" : "M"}${x(index).toFixed(1)},${y(point.ndvi).toFixed(1)}`;
  });
  if (current) segments.push(current);

  const first = series[0]!.from;
  const last = series[series.length - 1]!.from;
  const measured = series.filter((point) => point.ndvi !== null).length;

  return (
    <figure className={className}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="h-auto w-full"
        role="img"
        aria-label={`Évolution de l'indice de végétation, ${measured} mesures sur ${series.length} décades`}
      >
        <line
          x1={PAD_X}
          x2={WIDTH - PAD_X}
          y1={y(expected)}
          y2={y(expected)}
          className="stroke-laterite"
          strokeWidth={1}
          strokeDasharray="4 3"
        />
        {segments.map((d) => (
          <path
            key={d}
            d={d}
            fill="none"
            className="stroke-forest"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        ))}
        {series.map((point, index) =>
          point.ndvi === null ? null : (
            <circle
              key={point.from}
              cx={x(index)}
              cy={y(point.ndvi)}
              r={1.8}
              className="fill-forest"
            />
          ),
        )}
      </svg>
      <figcaption className="mt-1 flex justify-between text-xs text-muted-foreground">
        <span>{monthFormatter.format(new Date(first))}</span>
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-0 w-4 border-t border-dashed border-laterite"
          />
          seuil attendu
        </span>
        <span>{monthFormatter.format(new Date(last))}</span>
      </figcaption>
    </figure>
  );
}
