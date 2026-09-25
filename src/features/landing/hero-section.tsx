import { Info } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { landingPhotos } from "@/features/landing/photos";

// Bandeau d'accueil d'un portail de l'administration : une photographie du terrain en bandeau,
// un encadré plein (aplat marine, sans dégradé ni transparence) qui dit ce qu'est la plateforme
// et donne les deux accès principaux, puis une bande d'information sur la nature des données.
export function HeroSection() {
  return (
    <section aria-labelledby="accueil-titre">
      <div className="relative">
        <div className="relative h-56 bg-muted sm:h-72 lg:h-80">
          <Image
            src={landingPhotos.hero.src}
            alt={landingPhotos.hero.alt}
            fill
            priority
            sizes="100vw"
            className="object-cover object-[60%_45%]"
          />
        </div>
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <div className="relative -mt-16 max-w-2xl bg-band p-6 text-band-foreground sm:-mt-24 sm:p-8">
            <h1
              id="accueil-titre"
              className="text-2xl leading-tight font-bold text-white sm:text-3xl"
            >
              Plateforme nationale d&apos;information agricole
            </h1>
            <p className="mt-3 text-base text-white/90">
              Registre des exploitations, carte agricole, alertes agro-climatiques, assistant
              technique et centre de pilotage du ministère, dans une même base de données.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <Button asChild variant="secondary" className="h-11 px-5">
                <Link href="/connexion">Accéder à mon espace</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                className="h-11 border-white bg-transparent px-5 text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="/carte">Consulter la carte agricole</Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
      <div className="mt-8 border-y bg-muted/60">
        <p className="mx-auto flex w-full max-w-6xl items-start gap-3 px-4 py-3 text-sm sm:px-6">
          <span className="inline-flex shrink-0 items-center gap-1 rounded-sm bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground uppercase">
            <Info className="size-3.5" aria-hidden />
            Info
          </span>
          <span>
            Plateforme de démonstration : les exploitations, producteurs et chiffres présentés sont
            fictifs.
          </span>
        </p>
      </div>
    </section>
  );
}
