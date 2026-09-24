import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";

export function HeroSection() {
  return (
    <section className="relative overflow-hidden">
      <GridBackdrop />
      <div className="relative mx-auto w-full max-w-6xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28 sm:pb-24">
        <Reveal>
          <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase">
            Plateforme nationale de données agricoles
          </p>
        </Reveal>
        <Reveal delay={0.05}>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-6xl">
            Bénin Agricultural Intelligence System
          </h1>
        </Reveal>
        <Reveal delay={0.1}>
          <p className="mt-6 max-w-2xl text-lg text-pretty text-muted-foreground">
            Un registre national des exploitations, une carte agricole, un moteur d&apos;alertes et
            un centre de pilotage pour répondre en quelques secondes aux questions de l&apos;État,
            tout en servant directement les producteurs, les agents de terrain, les coopératives et
            les acheteurs.
          </p>
        </Reveal>
        <Reveal delay={0.15}>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="#espaces">
                Découvrir les espaces
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#etat-plateforme">État de la plateforme</Link>
            </Button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// Trame de grille discrète : la donnée comme texture de fond, sans image décorative.
function GridBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_top_left,black_35%,transparent_75%)]"
    >
      <div className="absolute inset-0 bg-[linear-gradient(to_right,var(--stone-200)_1px,transparent_1px),linear-gradient(to_bottom,var(--stone-200)_1px,transparent_1px)] bg-[size:56px_56px] opacity-60 dark:opacity-25" />
    </div>
  );
}
