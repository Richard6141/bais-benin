"use client";

import { RotateCcw } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";
import { useTourProgress } from "./progress";
import { TOURS, nextStep, stepForPath, stepLink, type TourRole } from "./steps";
import { TourSpotlight } from "./tour-spotlight";

interface GuidedTourProps {
  role: TourRole;
  userId: string;
  /** Compte de démonstration : bandeau discret qui propose l'étape suivante. */
  demo: boolean;
}

// Parcours guidé d'un espace, monté dans sa coque : marque faite l'étape dont on visite l'écran,
// met en évidence l'étape ouverte depuis les « Premiers pas » et, pour les seuls comptes de
// démonstration, propose en haut de page le scénario suivant et de tout recommencer.
export function GuidedTour({ role, userId, demo }: GuidedTourProps) {
  const steps = TOURS[role];
  const pathname = usePathname();
  const params = useSearchParams();
  const { progress, markDone, reset } = useTourProgress(role, userId);

  useEffect(() => {
    const step = stepForPath(steps, pathname);
    if (step) markDone(step.id);
  }, [steps, pathname, markDone]);

  if (!progress) return null;
  const done = new Set(progress.done);
  const touring = params.has("pas");
  const following = nextStep(steps, done);

  return (
    <>
      <TourSpotlight steps={steps} done={done} onShown={markDone} />
      {demo && !touring ? (
        <aside
          aria-label="Démonstration"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-dashed bg-muted/40 px-3 py-2 text-sm print:hidden"
        >
          <span className="rounded-sm bg-primary px-1.5 py-0.5 text-xs font-bold text-primary-foreground">
            Démonstration
          </span>
          {following ? (
            <Link
              href={stepLink(following) as Route}
              className="inline-flex min-h-11 items-center font-semibold text-primary underline-offset-4 hover:underline md:min-h-0"
            >
              Scénario suivant : {following.title}
            </Link>
          ) : (
            <span>Scénario terminé pour ce rôle.</span>
          )}
          <button
            type="button"
            onClick={reset}
            className="ml-auto inline-flex min-h-11 items-center gap-1 text-muted-foreground underline-offset-4 hover:text-foreground hover:underline md:min-h-0"
          >
            <RotateCcw className="size-3.5" aria-hidden />
            Recommencer
          </button>
        </aside>
      ) : null}
    </>
  );
}
