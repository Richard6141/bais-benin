import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  /** Rubrique de la page (« Espace agent de terrain ») : affichée en fil d'Ariane, en gris. */
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

// En-tête de page des portails de l'administration : un fil d'Ariane discret (« Accueil ›
// rubrique »), un titre en gras, une phrase d'explication, un filet de séparation. Pas de
// sur-titre coloré au-dessus du titre (docs/modules/charte-officielle.md).
export function PageHeader({ eyebrow, title, description, actions, className }: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 border-b pb-5 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="max-w-3xl">
        {eyebrow ? (
          <nav aria-label="Fil d'Ariane" className="mb-2 text-sm text-muted-foreground">
            <ol className="flex flex-wrap items-center gap-1.5">
              <li>Accueil</li>
              <li aria-hidden>›</li>
              <li aria-current="page">{eyebrow}</li>
            </ol>
          </nav>
        ) : null}
        <h1 className="text-2xl font-bold tracking-tight text-balance sm:text-3xl">{title}</h1>
        {description ? (
          <p className="mt-2 text-base text-pretty text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap gap-2">{actions}</div> : null}
    </header>
  );
}
