import { BarChart3, ChevronRight, ClipboardList, Sprout, type LucideIcon } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

interface Profile {
  id: string;
  title: string;
  tasks: string;
  access: string;
  cta: string;
  icon: LucideIcon;
  href: Route;
}

// Trois profils seulement : ceux qui ont un parcours complet dans la plateforme. Chaque choix dit
// ce qu'on y fait et ce qu'il faut pour entrer, puis ouvre la connexion avec ce profil.
const profiles: Profile[] = [
  {
    id: "producteur",
    title: "Producteur ou productrice",
    tasks:
      "Voir vos champs, recevoir les alertes de votre zone, déclarer une récolte, demander de l'aide.",
    access: "Votre NPI et votre téléphone. Le compte se crée à la première connexion.",
    cta: "Accéder à l'espace producteur",
    icon: Sprout,
    href: "/connexion?profil=producteur" as Route,
  },
  {
    id: "agent",
    title: "Agent de terrain",
    tasks:
      "Préparer la tournée, enregistrer les exploitations sans réseau, vérifier les parcelles.",
    access: "Votre NPI et votre téléphone. Le compte est ouvert par votre direction.",
    cta: "Accéder à l'espace agent",
    icon: ClipboardList,
    href: "/connexion?profil=agent" as Route,
  },
  {
    id: "ministere",
    title: "Ministère",
    tasks: "Suivre la campagne du pays, les alertes et les feux, agir commune par commune.",
    access: "Votre NPI et votre téléphone. Le compte est ouvert par l'administration.",
    cta: "Accéder au centre de pilotage",
    icon: BarChart3,
    href: "/connexion?profil=ministere" as Route,
  },
];

export function WhoAreYou() {
  return (
    <section id="qui-etes-vous" aria-labelledby="qui-titre" className="scroll-mt-32">
      <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6">
        <h2 id="qui-titre" className="border-b pb-3 text-xl sm:text-2xl">
          Qui êtes-vous ?
        </h2>
        <p className="mt-3 max-w-3xl text-muted-foreground">
          Choisissez votre profil : chacun ne voit que ce qui le concerne.
        </p>
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {profiles.map((profile) => {
            const Icon = profile.icon;
            return (
              <li key={profile.id}>
                <Link
                  href={profile.href}
                  className="group flex h-full flex-col rounded-lg border bg-card p-5 transition-colors hover:border-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="flex items-center gap-3">
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-sm bg-marine-soft text-primary dark:bg-accent">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <span className="text-lg font-bold text-heading">{profile.title}</span>
                  </span>
                  <span className="mt-4 text-sm">{profile.tasks}</span>
                  <span className="mt-2 text-sm text-muted-foreground">{profile.access}</span>
                  <span className="mt-auto inline-flex items-center gap-1 pt-5 text-sm font-semibold text-primary underline-offset-4 group-hover:underline">
                    {profile.cta}
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
