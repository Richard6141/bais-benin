"use client";

import { X } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { nextStep, stepLink, type TourStep } from "./steps";

interface TourSpotlightProps {
  steps: readonly TourStep[];
  done: ReadonlySet<string>;
  onShown: (stepId: string) => void;
}

interface Box {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PAD = 6;
const FALLBACK = "main h1";

// Mise en évidence d'une étape ouverte depuis les « Premiers pas » (?pas=<id>) : l'écran est
// assombri sauf l'élément à toucher, entouré d'un anneau, et une bulle dit ce que l'étape apprend
// et mène à la suivante. Rien ne bloque la page : on touche l'élément à travers le voile.
export function TourSpotlight({ steps, done, onShown }: TourSpotlightProps) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const stepId = params.get("pas");
  const index = steps.findIndex((step) => step.id === stepId);
  const step = index >= 0 ? steps[index] : undefined;
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    if (!step) return;
    onShown(step.id);
    let element: Element | null = null;
    let frame = 0;
    let attempts = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // L'élément peut arriver après le premier rendu (carte, contenu chargé) : on le cherche
    // pendant trois secondes, puis on suit sa position au défilement.
    const locate = () => {
      element =
        (step.target ? document.querySelector(step.target) : null) ??
        document.querySelector(FALLBACK);
      if (!element && attempts++ < 15) {
        window.setTimeout(locate, 200);
        return;
      }
      element?.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
      track();
    };
    // Un nouvel état seulement quand la position change : pas de rendu à chaque image.
    let last = "";
    const track = () => {
      if (element) {
        const rect = element.getBoundingClientRect();
        const key = `${rect.top}:${rect.left}:${rect.width}:${rect.height}`;
        if (key !== last) {
          last = key;
          setBox({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });
        }
      }
      frame = window.requestAnimationFrame(track);
    };
    locate();
    return () => {
      window.cancelAnimationFrame(frame);
      setBox(null);
    };
  }, [step, onShown]);

  if (!step) return null;
  const following = nextStep(steps, new Set([...done, step.id]), step.id);
  const close = () => {
    const rest = new URLSearchParams(params.toString());
    rest.delete("pas");
    const query = rest.toString();
    router.replace((query ? `${pathname}?${query}` : pathname) as Route, { scroll: false });
  };

  return (
    <>
      {box ? (
        <div
          aria-hidden
          className="pointer-events-none fixed z-30 rounded-lg ring-4 ring-primary/70 transition-all duration-200"
          style={{
            top: box.top - PAD,
            left: box.left - PAD,
            width: box.width + PAD * 2,
            height: box.height + PAD * 2,
            boxShadow: "0 0 0 9999px rgba(10, 22, 40, 0.28)",
          }}
        />
      ) : null}
      <section
        aria-label="Étape en cours"
        aria-live="polite"
        className="fixed inset-x-3 bottom-20 z-50 flex flex-col gap-3 rounded-lg border bg-card p-4 shadow-overlay md:inset-x-auto md:right-6 md:bottom-6 md:w-96"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className="tabular text-sm text-muted-foreground">
              Étape {index + 1} sur {steps.length}
            </p>
            <h2 className="text-base font-semibold">{step.title}</h2>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Fermer les premiers pas"
            onClick={close}
          >
            <X aria-hidden />
          </Button>
        </div>
        <p className="text-sm">{step.why}</p>
        <div className="flex flex-wrap gap-2">
          {following ? (
            <Button asChild className="h-11 md:h-9">
              <Link href={stepLink(following) as Route}>Étape suivante : {following.title}</Link>
            </Button>
          ) : (
            <Button type="button" className="h-11 md:h-9" onClick={close}>
              Terminer le parcours
            </Button>
          )}
        </div>
      </section>
    </>
  );
}
