import type { ReactNode } from "react";
import { SourceCaption } from "@/components/data-display/source-caption";
import { cn } from "@/lib/utils";

export interface KeyFigure {
  label: string;
  /** Chiffre déjà formaté, ou mot court (« Non mesurée »). */
  value: ReactNode;
  unit?: string;
}

interface KeyFiguresProps {
  /** Nom de la rangée pour les lecteurs d'écran. */
  label: string;
  figures: readonly KeyFigure[];
  source: string;
  sourceDate?: string;
  className?: string;
}

// Rangée compacte de chiffres pour un accueil d'espace : deux à quatre chiffres côte à côte dans
// un seul encadré, séparés par un filet, et une seule ligne de source dessous. Bien plus basse
// qu'une tuile par chiffre, elle tient sur un téléphone de 360 px.
export function KeyFigures({ label, figures, source, sourceDate, className }: KeyFiguresProps) {
  return (
    <section aria-label={label} className={cn("flex flex-col gap-1.5", className)}>
      <dl
        className={cn(
          "grid divide-x rounded-lg border bg-card",
          figures.length === 2 && "grid-cols-2",
          figures.length === 3 && "grid-cols-3",
          // Quatre chiffres : deux rangées de deux sur téléphone, une seule ligne au-delà.
          figures.length >= 4 &&
            "grid-cols-2 sm:grid-cols-4 [&>div:nth-child(3)]:border-l-0 sm:[&>div:nth-child(3)]:border-l [&>div:nth-child(n+3)]:border-t sm:[&>div:nth-child(n+3)]:border-t-0",
        )}
      >
        {figures.map((figure) => (
          <div key={figure.label} className="flex min-w-0 flex-col gap-0.5 px-3 py-3 sm:px-4">
            <dt className="order-2 text-sm leading-tight text-muted-foreground">{figure.label}</dt>
            <dd className="tabular order-1 flex items-baseline gap-1 text-xl font-bold text-heading sm:text-2xl">
              {figure.value}
              {figure.unit ? (
                <span className="text-sm font-medium text-muted-foreground">{figure.unit}</span>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      <SourceCaption source={source} date={sourceDate} />
    </section>
  );
}
