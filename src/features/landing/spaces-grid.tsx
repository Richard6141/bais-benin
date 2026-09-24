import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { landingPhotos, type LandingPhotoKey } from "@/features/landing/photos";

interface Space {
  title: string;
  audience: string;
  description: string;
  photo: LandingPhotoKey;
  href: Route;
}

const spaces: Space[] = [
  {
    title: "Agriculteur",
    audience: "Producteurs et productrices",
    description: "Voir son exploitation, déclarer une récolte, recevoir les alertes sur WhatsApp.",
    photo: "cassava",
    href: "/connexion",
  },
  {
    title: "Agent de terrain",
    audience: "Conseillers des ATDA et agents communaux",
    description:
      "Enregistrer et vérifier des exploitations hors connexion, synchroniser plus tard.",
    photo: "yam",
    href: "/connexion",
  },
  {
    title: "Coopérative",
    audience: "Gestionnaires de coopératives et d'unions",
    description: "Suivre ses membres, agréger les volumes, répondre aux demandes d'achat.",
    photo: "gari",
    href: "/connexion/institution",
  },
  {
    title: "Acheteur",
    audience: "Transformateurs, grossistes, programmes publics",
    description: "Trouver des récoltes vérifiées par produit, zone et volume.",
    photo: "market",
    href: "/connexion/institution",
  },
  {
    title: "Commune",
    audience: "Mairies et services agricoles communaux",
    description: "Une vue de l'agriculture communale : exploitations, cultures, alertes.",
    photo: "irrigation",
    href: "/connexion/institution",
  },
  {
    title: "Ministère",
    audience: "Analystes et directions du MAEP",
    description: "Le centre de pilotage national : indicateurs, risques, qualité des données.",
    photo: "aerial",
    href: "/connexion/institution",
  },
];

export function SpacesGrid() {
  return (
    <section
      id="espaces"
      aria-labelledby="espaces-titre"
      className="scroll-mt-20 border-b border-border/70"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
        <div className="max-w-2xl">
          <h2 id="espaces-titre" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Six espaces, un seul registre
          </h2>
          <p className="mt-4 text-muted-foreground">
            Chaque acteur travaille dans un espace adapté à son rôle et à son périmètre. Toutes les
            saisies alimentent la même base, et chacun ne voit que ce qui le concerne.
          </p>
        </div>
        <ul className="mt-10 grid gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {spaces.map((space) => {
            const photo = landingPhotos[space.photo];
            return (
              <li key={space.title}>
                <Link
                  href={space.href}
                  className="group block rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                >
                  <div className="relative aspect-[3/2] overflow-hidden rounded-xl bg-muted">
                    <Image
                      src={photo.src}
                      alt={photo.alt}
                      fill
                      sizes="(min-width: 1024px) 30vw, (min-width: 640px) 50vw, 100vw"
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                    />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold">{space.title}</h3>
                  <p className="text-sm text-muted-foreground">{space.audience}</p>
                  <p className="mt-2 text-sm">{space.description}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
