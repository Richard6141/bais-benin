import type { ReactNode } from "react";
import { MaskedValue } from "@/components/data-display/masked-value";
import { cn } from "@/lib/utils";

export interface CampaignPoint {
  campaign: string;
  value: number | "masked" | null;
  /** Texte de la valeur, déjà formaté. */
  display?: string;
}

export interface CampaignSeries {
  key: string;
  label: string;
  leading?: ReactNode;
  /** Points de la plus ancienne à la plus récente campagne. */
  points: readonly CampaignPoint[];
}

interface CampaignComparisonProps {
  series: readonly CampaignSeries[];
  /** Ce que mesurent les barres (« Production déclarée »), lu avant chaque série. */
  metricLabel: string;
  className?: string;
}

const signed = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0, signDisplay: "always" });

/** Variation entre les deux dernières campagnes, seulement si toutes deux ont une valeur. */
function lastVariation(points: readonly CampaignPoint[]) {
  const current = points.at(-1);
  const previous = points.at(-2);
  if (typeof current?.value !== "number" || typeof previous?.value !== "number") return null;
  if (previous.value === 0) return null;
  return {
    percent: ((current.value - previous.value) / previous.value) * 100,
    against: previous.campaign,
  };
}

// Petits multiples : une carte par culture, une barre par campagne, même échelle à l'intérieur
// d'une carte. La variation dit toujours contre quelle campagne elle compare. Chaque barre porte
// sa valeur en clair : le graphique se lit sans la couleur et à l'impression.
export function CampaignComparison({ series, metricLabel, className }: CampaignComparisonProps) {
  return (
    <ul
      aria-label={`${metricLabel} par campagne`}
      className={cn("grid gap-4 sm:grid-cols-2 lg:grid-cols-3", className)}
    >
      {series.map((item) => {
        const max = Math.max(
          0,
          ...item.points.map((point) => (typeof point.value === "number" ? point.value : 0)),
        );
        const variation = lastVariation(item.points);
        return (
          <li key={item.key} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
            <p className="flex items-center gap-2 font-medium">
              {item.leading}
              {item.label}
            </p>
            <div className="flex h-28 items-end gap-3" aria-hidden>
              {item.points.map((point) => (
                <div key={point.campaign} className="flex h-full flex-1 flex-col justify-end">
                  <div
                    className="w-full rounded-t-sm bg-primary"
                    style={{
                      height:
                        typeof point.value === "number" && max > 0
                          ? `${Math.max(2, Math.round((point.value / max) * 100))}%`
                          : "0%",
                    }}
                  />
                </div>
              ))}
            </div>
            <dl
              className="grid gap-3"
              style={{ gridTemplateColumns: `repeat(${item.points.length}, minmax(0, 1fr))` }}
            >
              {item.points.map((point) => (
                <div key={point.campaign} className="flex min-w-0 flex-col">
                  <dt className="tabular text-xs text-muted-foreground">{point.campaign}</dt>
                  <dd className="tabular text-sm font-medium">
                    {point.value === "masked" ? (
                      <MaskedValue />
                    ) : point.value === null ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      (point.display ?? String(point.value))
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="tabular text-sm text-muted-foreground">
              {variation
                ? `${signed.format(variation.percent)} % contre ${variation.against}`
                : "Pas de comparaison : une des deux dernières campagnes n'a pas de donnée."}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
