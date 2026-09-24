import {
  Building2,
  Handshake,
  LandPlot,
  Landmark,
  Route,
  ShoppingBasket,
  type LucideIcon,
} from "lucide-react";
import { Reveal } from "@/components/motion/reveal";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface Space {
  title: string;
  description: string;
  icon: LucideIcon;
}

const spaces: Space[] = [
  {
    title: "Agriculteur",
    description: "Voir son exploitation, déclarer une récolte, recevoir alertes et conseils.",
    icon: LandPlot,
  },
  {
    title: "Agent de terrain",
    description:
      "Enregistrer et vérifier des exploitations, hors connexion, synchroniser plus tard.",
    icon: Route,
  },
  {
    title: "Coopérative",
    description: "Suivre ses membres, agréger les volumes, répondre aux appels d'achat.",
    icon: Handshake,
  },
  {
    title: "Acheteur",
    description: "Trouver des productions vérifiées par produit, zone et volume.",
    icon: ShoppingBasket,
  },
  {
    title: "Commune",
    description:
      "Une vue territoriale de l'agriculture communale : exploitations, cultures, alertes.",
    icon: Building2,
  },
  {
    title: "Ministère",
    description:
      "Centre de pilotage national : indicateurs, risques, tendances, qualité des données.",
    icon: Landmark,
  },
];

export function SpacesGrid() {
  return (
    <section id="espaces" aria-labelledby="espaces-titre" className="scroll-mt-20">
      <div className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="max-w-2xl">
          <h2 id="espaces-titre" className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Six espaces, une seule infrastructure de données
          </h2>
          <p className="mt-3 text-muted-foreground">
            Chaque acteur dispose d&apos;un espace adapté à son rôle et à son périmètre. Toutes les
            données alimentent le même registre.
          </p>
        </div>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spaces.map((space, index) => (
            <li key={space.title}>
              <Reveal delay={0.04 * index} className="h-full">
                <Card className="h-full transition-colors hover:border-primary/40">
                  <CardHeader>
                    <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
                      <space.icon className="size-5" aria-hidden />
                    </div>
                    <CardTitle>{space.title}</CardTitle>
                    <CardDescription>{space.description}</CardDescription>
                  </CardHeader>
                </Card>
              </Reveal>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
