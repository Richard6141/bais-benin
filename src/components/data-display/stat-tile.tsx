import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import type { ReactNode } from "react";
import { ReliabilityBadge, type Reliability } from "@/components/data-display/reliability-badge";
import { SourceCaption } from "@/components/data-display/source-caption";
import { cn } from "@/lib/utils";

export interface StatTrend {
  // Variation relative en pourcentage par rapport à la période de comparaison.
  value: number;
  label?: string;
  // Une baisse peut être une bonne nouvelle (alertes) : l'appelant le précise.
  positiveIsGood?: boolean;
}

interface StatTileProps {
  label: string;
  value: string | number;
  unit?: string;
  trend?: StatTrend;
  source?: string;
  sourceDate?: string;
  reliability?: Reliability;
  icon?: ReactNode;
  /**
   * Valeur en mots (« À jour », « Démonstration ») plutôt qu'un chiffre : corps plus petit sur
   * la même hauteur de ligne, pour tenir dans une tuile étroite sans changer sa hauteur.
   */
  wordValue?: boolean;
  className?: string;
}

const numberFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });

// Tuile d'indicateur : la valeur, sa tendance et sa provenance sur la même surface.
// Un chiffre sans source ne doit jamais apparaître seul (docs/01, principe 2).
export function StatTile({
  label,
  value,
  unit,
  trend,
  source,
  sourceDate,
  reliability,
  icon,
  wordValue = false,
  className,
}: StatTileProps) {
  const formattedValue = typeof value === "number" ? numberFormatter.format(value) : value;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground shadow-card",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</p>
        {icon ? <span className="text-muted-foreground [&>svg]:size-4">{icon}</span> : null}
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-semibold tracking-tight",
            wordValue ? "text-xl leading-9 break-words" : "tabular text-3xl",
          )}
        >
          {formattedValue}
        </span>
        {unit ? <span className="text-sm text-muted-foreground">{unit}</span> : null}
      </div>
      {trend ? <TrendLine trend={trend} /> : null}
      {(source || reliability) && (
        <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1 border-t pt-3">
          {reliability ? (
            <ReliabilityBadge level={reliability} className="max-w-full whitespace-normal" />
          ) : null}
          {source ? <SourceCaption source={source} date={sourceDate} /> : null}
        </div>
      )}
    </div>
  );
}

function TrendLine({ trend }: { trend: StatTrend }) {
  const { value, label, positiveIsGood = true } = trend;
  const isFlat = Math.abs(value) < 0.05;
  const isImproving = positiveIsGood ? value > 0 : value < 0;
  const tone = isFlat ? "text-muted-foreground" : isImproving ? "text-success" : "text-warning";
  const Icon = isFlat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  const signed = `${value > 0 ? "+" : ""}${numberFormatter.format(value)} %`;

  return (
    <p className={cn("tabular flex items-center gap-1 text-sm", tone)}>
      <Icon className="size-4" aria-hidden />
      <span>{signed}</span>
      {label ? <span className="text-muted-foreground">{label}</span> : null}
    </p>
  );
}
