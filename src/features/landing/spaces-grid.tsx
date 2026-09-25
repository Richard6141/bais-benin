import {
  BarChart3,
  ChevronRight,
  ClipboardList,
  Handshake,
  Landmark,
  ShoppingBasket,
  Sprout,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

interface Space {
  title: string;
  audience: string;
  description: string;
  icon: LucideIcon;
  href: Route;
}

const spaces: Space[] = [
  {
    title: "Agriculteur",
    audience: "Producteurs et productrices",
    description: "Voir son exploitation, déclarer une récolte, recevoir les alertes sur WhatsApp.",
    icon: Sprout,
    href: "/connexion",
  },
  {
    title: "Agent de terrain",
    audience: "Conseillers des ATDA et agents communaux",
    description:
      "Enregistrer et vérifier des exploitations hors connexion, synchroniser plus tard.",
    icon: ClipboardList,
    href: "/connexion",
  },
  {
    title: "Coopérative",
    audience: "Gestionnaires de coopératives et d'unions",
    description: "Suivre ses membres, agréger les volumes, répondre aux demandes d'achat.",
    icon: Handshake,
    href: "/connexion/institution",
  },
  {
    title: "Acheteur",
    audience: "Transformateurs, grossistes, programmes publics",
    description: "Trouver des récoltes vérifiées par produit, zone et volume.",
    icon: ShoppingBasket,
    href: "/connexion/institution",
  },
  {
    title: "Commune",
    audience: "Mairies et services agricoles communaux",
    description: "L'agriculture de la commune : exploitations, cultures, alertes.",
    icon: Landmark,
    href: "/connexion/institution",
  },
  {
    title: "Ministère",
    audience: "Directions du ministère",
    description: "Le centre de pilotage national : indicateurs, alertes, qualité des données.",
    icon: BarChart3,
    href: "/connexion/institution",
  },
];

// Accès par espace, à la manière des listes de services de service-public.bj : une tuile
// bordée par public, avec son pictogramme, sa description et un lien « Accéder ».
export function SpacesGrid() {
  return (
    <section id="espaces" aria-labelledby="espaces-titre" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <h2 id="espaces-titre" className="border-b pb-3 text-xl sm:text-2xl">
          Accéder à votre espace
        </h2>
        <p className="mt-3 text-muted-foreground">
          Chaque espace correspond à un rôle et à un périmètre : tous alimentent le même registre,
          et chacun ne voit que ce qui le concerne.
        </p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spaces.map((space) => {
            const Icon = space.icon;
            return (
              <li key={space.title}>
                <Link
                  href={space.href}
                  className="group flex h-full flex-col gap-3 rounded-lg border bg-card p-5 transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-marine-soft text-primary dark:bg-accent">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span>
                      <span className="block font-bold text-heading">{space.title}</span>
                      <span className="block text-sm text-muted-foreground">{space.audience}</span>
                    </span>
                  </span>
                  <span className="text-sm">{space.description}</span>
                  <span className="mt-auto inline-flex items-center gap-1 text-sm font-semibold text-primary underline-offset-4 group-hover:underline">
                    Accéder
                    <ChevronRight className="size-4" aria-hidden />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
