import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface StepShellProps {
  title: string;
  description?: string;
  children: ReactNode;
  /** Bouton principal unique, fixé en bas d'écran sur mobile (mode « une main »). */
  primaryLabel: string;
  onPrimary: () => void;
  primaryDisabled?: boolean;
  primaryBusy?: boolean;
  onBack?: () => void;
  /** Action secondaire en lien texte (« Sans parcelle pour l'instant », « Finir plus tard »). */
  secondary?: { label: string; onClick: () => void };
  className?: string;
}

// Gabarit d'un écran du parcours : titre court, contenu, barre d'actions en bas. Sur mobile la
// barre reste collée au bas de l'écran pour que le pouce n'ait jamais à remonter.
export function StepShell({
  title,
  description,
  children,
  primaryLabel,
  onPrimary,
  primaryDisabled,
  primaryBusy,
  onBack,
  secondary,
  className,
}: StepShellProps) {
  return (
    <section
      className={cn("flex flex-col gap-5 pb-36 md:pb-0", className)}
      aria-labelledby="step-title"
    >
      <header className="flex flex-col gap-1">
        <h2 id="step-title" className="text-xl font-semibold tracking-tight">
          {title}
        </h2>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </header>
      <div className="flex flex-col gap-3">{children}</div>
      {/* Sur téléphone, la barre d'action se pose au-dessus de la navigation basse de l'espace agent. */}
      <footer className="fixed inset-x-0 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-30 flex flex-col gap-2 border-t bg-background/95 p-4 backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
        <Button
          type="button"
          onClick={onPrimary}
          disabled={primaryDisabled || primaryBusy}
          aria-busy={primaryBusy}
          className="h-14 w-full text-base md:w-auto md:self-start"
        >
          {primaryLabel}
        </Button>
        <div className="flex items-center justify-between gap-3">
          {onBack ? (
            <Button type="button" variant="ghost" size="sm" onClick={onBack}>
              Retour
            </Button>
          ) : (
            <span />
          )}
          {secondary ? (
            <button
              type="button"
              onClick={secondary.onClick}
              className="min-h-11 text-sm text-primary underline-offset-4 hover:underline"
            >
              {secondary.label}
            </button>
          ) : null}
        </div>
      </footer>
    </section>
  );
}

/** Valeur récupérée automatiquement, avec son origine lisible et un lien pour la modifier. */
export function SourcedValue({
  label,
  value,
  origin,
  onEdit,
}: {
  label: string;
  value: string;
  origin: string;
  onEdit?: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-lg border bg-card p-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
        <span className="text-base font-medium">{value}</span>
        <span className="text-xs text-muted-foreground">{origin}</span>
      </div>
      {onEdit ? (
        <button
          type="button"
          onClick={onEdit}
          className="min-h-11 shrink-0 text-sm text-primary underline-offset-4 hover:underline"
        >
          Modifier
        </button>
      ) : null}
    </div>
  );
}
