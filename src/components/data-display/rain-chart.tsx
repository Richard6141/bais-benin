import { SourceCaption } from "@/components/data-display/source-caption";
import { cn } from "@/lib/utils";

export interface RainDay {
  /** Date ISO AAAA-MM-JJ. */
  date: string;
  rainMm: number | null;
  forecast?: boolean;
}

interface RainChartProps {
  days: readonly RainDay[];
  /** Seuil facultatif (mm par jour), tracé en pointillés. */
  thresholdMm?: number;
  thresholdLabel?: string;
  source?: string;
  sourceDate?: string;
  className?: string;
}

const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const dayMonth = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const WIDTH = 600;
const HEIGHT = 180;
const PAD = { top: 12, right: 8, bottom: 24, left: 32 };

/** Résumé textuel du graphique, lu par les lecteurs d'écran à la place des barres. */
export function describeRain(days: readonly RainDay[]): string {
  const observed = days.filter((day) => !day.forecast);
  const total = observed.reduce((sum, day) => sum + (day.rainMm ?? 0), 0);
  const dry = observed.filter((day) => (day.rainMm ?? 0) < 1).length;
  const forecast = days.filter((day) => day.forecast);
  const forecastTotal = forecast.reduce((sum, day) => sum + (day.rainMm ?? 0), 0);
  let text = `Cumul de pluie sur ${observed.length} jours : ${number.format(total)} mm, ${dry} jour${dry > 1 ? "s" : ""} sec${dry > 1 ? "s" : ""}.`;
  if (forecast.length > 0)
    text += ` Prévision sur ${forecast.length} jours : ${number.format(forecastTotal)} mm.`;
  return text;
}

// Barres SVG maison : aucune bibliothèque de graphiques pour un seul histogramme léger. Les jours
// prévus sont hachurés, jamais colorés autrement : la texture porte l'information.
export function RainChart({
  days,
  thresholdMm,
  thresholdLabel,
  source,
  sourceDate,
  className,
}: RainChartProps) {
  const max = Math.max(thresholdMm ?? 0, ...days.map((day) => day.rainMm ?? 0), 10);
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const band = plotW / Math.max(days.length, 1);
  const y = (mm: number) => PAD.top + plotH - (mm / max) * plotH;
  const summary = describeRain(days);
  // Une étiquette de date tous les sept jours environ, pour ne pas surcharger l'axe.
  const step = Math.max(1, Math.round(days.length / 5));

  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={summary}
        className="h-auto w-full"
      >
        <defs>
          <pattern
            id="rain-forecast"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <rect width="6" height="6" className="fill-card" />
            <line x1="0" y1="0" x2="0" y2="6" strokeWidth="3" className="stroke-info" />
          </pattern>
        </defs>
        {[0, max / 2, max].map((tick) => (
          <g key={tick}>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(tick)}
              y2={y(tick)}
              className="stroke-border"
              strokeWidth="1"
            />
            <text
              x={PAD.left - 4}
              y={y(tick) + 4}
              textAnchor="end"
              className="fill-muted-foreground text-[10px]"
            >
              {number.format(tick)}
            </text>
          </g>
        ))}
        {days.map((day, index) => {
          const mm = day.rainMm ?? 0;
          const x = PAD.left + index * band + band * 0.15;
          return (
            <rect
              key={day.date}
              data-forecast={Boolean(day.forecast)}
              x={x}
              y={y(mm)}
              width={band * 0.7}
              height={Math.max(PAD.top + plotH - y(mm), mm > 0 ? 1 : 0)}
              rx="1.5"
              className={day.forecast ? "stroke-info" : "fill-info"}
              fill={day.forecast ? "url(#rain-forecast)" : undefined}
            />
          );
        })}
        {thresholdMm !== undefined ? (
          <g>
            <line
              x1={PAD.left}
              x2={WIDTH - PAD.right}
              y1={y(thresholdMm)}
              y2={y(thresholdMm)}
              strokeDasharray="5 4"
              strokeWidth="1.5"
              className="stroke-warning"
            />
            <text
              x={WIDTH - PAD.right}
              y={y(thresholdMm) - 4}
              textAnchor="end"
              className="fill-warning text-[10px]"
            >
              {thresholdLabel ?? `Seuil ${number.format(thresholdMm)} mm`}
            </text>
          </g>
        ) : null}
        {days.map((day, index) =>
          index % step === 0 ? (
            <text
              key={`label-${day.date}`}
              x={PAD.left + index * band + band / 2}
              y={HEIGHT - 6}
              textAnchor="middle"
              className="fill-muted-foreground text-[10px]"
            >
              {dayMonth.format(new Date(`${day.date}T12:00:00`))}
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span>{summary}</span>
        {source ? <SourceCaption source={source} date={sourceDate} /> : null}
      </figcaption>
    </figure>
  );
}
