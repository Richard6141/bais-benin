import { CloudDrizzle, CloudRain, Sun, Thermometer } from "lucide-react";
import { EmptyState } from "@/components/feedback/empty-state";
import { SourceCaption } from "@/components/data-display/source-caption";
import { cn } from "@/lib/utils";

export interface WeatherDay {
  /** Date ISO AAAA-MM-JJ. */
  date: string;
  tMaxC: number | null;
  tMinC: number | null;
  rainMm: number | null;
  /** true pour un jour de prévision, false pour un jour observé. */
  forecast: boolean;
}

interface WeatherStripProps {
  days: readonly WeatherDay[];
  source: string;
  sourceDate?: string;
  className?: string;
}

// Seuils du moteur de règles : pluie forte au-delà de 10 mm, chaleur à partir de 36 °C.
export function weatherKind(day: WeatherDay): {
  kind: "HEAT" | "HEAVY_RAIN" | "RAIN" | "DRY";
  label: string;
} {
  if ((day.tMaxC ?? 0) >= 36) return { kind: "HEAT", label: "Forte chaleur" };
  if ((day.rainMm ?? 0) > 10) return { kind: "HEAVY_RAIN", label: "Forte pluie" };
  if ((day.rainMm ?? 0) >= 1) return { kind: "RAIN", label: "Pluie faible" };
  return { kind: "DRY", label: "Sec" };
}

const ICONS = { HEAT: Thermometer, HEAVY_RAIN: CloudRain, RAIN: CloudDrizzle, DRY: Sun } as const;
const weekday = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
const dayMonth = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
const number = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const fmt = (value: number | null, unit: string) =>
  value === null ? "–" : `${number.format(value)} ${unit}`;

// Bandeau météo : défile horizontalement dans son propre conteneur, la page ne déborde jamais.
// Les jours prévus sont séparés des jours observés par un repère « Prévision ».
export function WeatherStrip({ days, source, sourceDate, className }: WeatherStripProps) {
  if (days.length === 0) {
    return (
      <EmptyState
        title="Pas de données météo"
        description="Les relevés de la commune apparaîtront après la prochaine mise à jour."
        className={className}
      />
    );
  }
  const firstForecast = days.findIndex((day) => day.forecast);

  return (
    <figure className={cn("flex min-w-0 flex-col gap-2", className)}>
      {/* `relative` est indispensable : sans lui, les libellés sr-only (position absolue) des jours
          ont pour bloc conteneur la page entière, échappent au défilement du bandeau et élargissent
          la mise en page mobile (931 px mesurés au lieu de 412 sur Pixel 7). */}
      <div className="relative max-w-full overflow-x-auto pb-2">
        <ol className="flex w-max gap-2" aria-label="Météo jour par jour">
          {days.map((day, index) => {
            const { kind, label } = weatherKind(day);
            const Icon = ICONS[kind];
            const date = new Date(`${day.date}T12:00:00`);
            return (
              <li key={day.date} className="flex items-stretch gap-2">
                {index === firstForecast ? (
                  <span className="flex items-center border-l-2 border-dashed border-primary pl-2 text-xs font-semibold text-primary [writing-mode:vertical-rl]">
                    Prévision
                  </span>
                ) : null}
                <div
                  data-forecast={day.forecast}
                  className={cn(
                    "flex w-24 flex-col items-center gap-1 rounded-lg border p-3 text-center",
                    day.forecast ? "border-dashed bg-card" : "bg-muted",
                  )}
                >
                  <span className="text-xs font-semibold capitalize">{weekday.format(date)}</span>
                  <span className="tabular text-xs text-muted-foreground">
                    {dayMonth.format(date)}
                  </span>
                  <Icon
                    aria-hidden
                    className={cn(
                      "my-1 size-7",
                      kind === "HEAT"
                        ? "text-warning"
                        : kind === "DRY"
                          ? "text-watch"
                          : "text-info",
                    )}
                  />
                  <span className="sr-only">{label}</span>
                  <span className="tabular text-sm font-semibold">{fmt(day.tMaxC, "°C")}</span>
                  <span className="tabular text-xs text-muted-foreground">
                    {fmt(day.tMinC, "°C")}
                  </span>
                  <span className="tabular text-xs">{fmt(day.rainMm, "mm")}</span>
                </div>
              </li>
            );
          })}
        </ol>
      </div>
      <figcaption>
        <SourceCaption source={source} date={sourceDate} />
      </figcaption>
    </figure>
  );
}
