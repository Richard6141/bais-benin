import { CheckCircle2, ChevronRight, type LucideIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { cn } from "@/lib/utils";

export interface MomentAction {
  href: Route;
  icon: LucideIcon;
  /** Ce qu'il y a à faire, en verbe (« Vérifier 12 exploitations »). */
  title: string;
  /** Pourquoi maintenant, en une phrase courte. */
  detail?: string;
  /** Urgent : la pastille de l'icône passe en couleur d'alerte. */
  urgent?: boolean;
}

interface ActionListProps {
  title?: string;
  actions: readonly MomentAction[];
  /** Phrase affichée quand il n'y a rien à faire. */
  idle: string;
  className?: string;
}

// « Les actions du moment » en tête d'un accueil d'espace : trois à cinq choses à faire,
// chacune avec son nombre et sa raison, qui ouvrent directement l'écran où les faire. Quand rien
// n'attend, une phrase le dit, sans liste vide.
export function ActionList({
  title = "À faire maintenant",
  actions,
  idle,
  className,
}: ActionListProps) {
  return (
    <section aria-labelledby="actions-du-moment" className={cn("flex flex-col gap-2", className)}>
      <h2 id="actions-du-moment" className="text-lg font-semibold">
        {title}
      </h2>
      {actions.length === 0 ? (
        <p className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3 text-sm">
          <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
          {idle}
        </p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border bg-card">
          {actions.map((action) => (
            <li key={action.href + action.title}>
              <Link
                href={action.href}
                className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40 focus-visible:bg-accent/60 focus-visible:outline-none"
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-sm",
                    action.urgent
                      ? "bg-critical/10 text-critical"
                      : "bg-marine-soft text-primary dark:bg-accent",
                  )}
                >
                  <action.icon className="size-5" aria-hidden />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-semibold text-heading">{action.title}</span>
                  {action.detail ? (
                    <span className="text-sm text-muted-foreground">{action.detail}</span>
                  ) : null}
                </span>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
