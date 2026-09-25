import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

// État vide : un encadré sobre (bordure fine, fond gris léger), un titre court, une explication
// et au plus une action. Ni illustration ni motif décoratif (docs/modules/charte-officielle.md).
export function EmptyState({ title, description, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-lg border bg-muted/40 px-6 py-10 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 text-muted-foreground [&>svg]:size-6" aria-hidden>
          {icon}
        </div>
      ) : null}
      <h3 className="text-base font-semibold">{title}</h3>
      {description ? (
        <p className="mt-2 max-w-md text-sm text-balance text-muted-foreground">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
