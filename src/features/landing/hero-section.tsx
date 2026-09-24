import { MapPin, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ReliabilityBadge } from "@/components/data-display/reliability-badge";
import { Button } from "@/components/ui/button";
import { landingPhotos } from "@/features/landing/photos";

// Le héros montre ce que la plateforme produit : une fiche de terrain posée sur le paysage
// qu'elle décrit. La photographie porte le Bénin réel, la fiche porte la donnée.
export function HeroSection() {
  return (
    <section className="border-b border-border/70">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 py-12 sm:px-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:items-center lg:py-20">
        <div className="max-w-xl">
          <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl lg:text-[3.4rem] lg:leading-[1.05]">
            Connaître chaque exploitation. Agir avant la sécheresse.
          </h1>
          <p className="mt-6 text-lg text-pretty text-muted-foreground">
            Le Bénin Agricultural Intelligence System rassemble le registre des exploitations, la
            carte agricole, les alertes climatiques et le marché dans une seule infrastructure
            nationale, au service des producteurs, des agents de terrain, des communes et du
            ministère.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg" className="h-12 px-6 text-base">
              <Link href="/connexion">Ouvrir mon espace</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-6 text-base">
              <Link href="#espaces">Voir les six espaces</Link>
            </Button>
          </div>
          <p className="mt-6 text-sm text-muted-foreground">
            Plateforme de démonstration. Toutes les exploitations décrites sont fictives.
          </p>
        </div>

        <figure className="relative">
          <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-muted lg:aspect-[6/5]">
            <Image
              src={landingPhotos.hero.src}
              alt={landingPhotos.hero.alt}
              fill
              priority
              sizes="(min-width: 1024px) 55vw, 100vw"
              // Cadrage sur les deux tiers droits : la fiche se pose sur la piste, pas sur les personnes.
              className="object-cover object-[68%_50%]"
            />
          </div>
          <FieldRecordCard />
          <figcaption className="sr-only">{landingPhotos.hero.alt}</figcaption>
        </figure>
      </div>
    </section>
  );
}

// Fiche d'exploitation telle que la voit un agent : code, localisation, cultures, vérification.
// Exemple illustratif, marqué comme donnée de démonstration.
function FieldRecordCard() {
  return (
    <div
      className="hero-card absolute right-4 -bottom-6 w-[min(20rem,calc(100%-2rem))] rounded-xl border bg-card p-4 text-card-foreground shadow-raised sm:right-6 lg:right-auto lg:bottom-8 lg:-left-8"
      aria-label="Exemple de fiche d'exploitation"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="tabular font-mono text-xs text-muted-foreground">BJ-DON-003-000418</p>
          <p className="mt-1 font-semibold">Exploitation de Bio Sika</p>
        </div>
        <ReliabilityBadge level="FIELD_VERIFIED" showLabel={false} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-muted-foreground">Commune</dt>
          <dd className="flex items-center gap-1 font-medium">
            <MapPin className="size-3.5 text-primary" aria-hidden />
            Djougou, Donga
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Superficie</dt>
          <dd className="tabular font-medium">3,2 ha · 2 parcelles</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Cultures 2026-2027</dt>
          <dd className="font-medium">Maïs, niébé, igname</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">Vérifiée</dt>
          <dd className="flex items-center gap-1 font-medium">
            <ShieldCheck className="size-3.5 text-success" aria-hidden />
            12 sept. 2026
          </dd>
        </div>
      </dl>
      <p className="mt-3 border-t pt-2 text-xs text-muted-foreground">Donnée de démonstration</p>
    </div>
  );
}
