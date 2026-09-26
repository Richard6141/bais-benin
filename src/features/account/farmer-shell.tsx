"use client";

import {
  BellRing,
  Bug,
  CloudSun,
  FileBadge,
  History,
  Home,
  LandPlot,
  LifeBuoy,
  MessageCircleQuestion,
  MessageSquareWarning,
  Wheat,
} from "lucide-react";
import { Suspense, type ReactNode } from "react";
import { SpaceNav, type SpaceNavItem } from "@/components/layout/space-nav";
import { GuidedTour } from "@/features/onboarding/guided-tour";

// Rubriques du producteur. La barre basse du téléphone garde ce qu'il fait le plus souvent : son
// accueil, ses champs, ses alertes, signaler un problème ; le reste est sous « Plus ».
const NAV: readonly SpaceNavItem[] = [
  { href: "/agriculteur", label: "Accueil", icon: Home, exact: true, bar: true, top: true },
  { href: "/agriculteur/champs", label: "Mes champs", icon: LandPlot, bar: true, top: true },
  {
    href: "/agriculteur/alertes",
    label: "Alertes",
    icon: BellRing,
    bar: true,
    top: true,
  },
  {
    href: "/agriculteur/signaler",
    label: "Signaler",
    icon: MessageSquareWarning,
    bar: true,
    top: true,
  },
  { href: "/agriculteur/recolte", label: "Déclarer une récolte", icon: Wheat, top: true },
  {
    href: "/agriculteur/demandes",
    label: "Mes demandes",
    icon: LifeBuoy,
    match: ["/agriculteur/solliciter"],
    top: true,
  },
  { href: "/agriculteur/signalements", label: "Mes signalements", icon: Bug },
  { href: "/agriculteur/attestation", label: "Mon attestation", icon: FileBadge },
  { href: "/agriculteur/meteo", label: "Météo", icon: CloudSun },
  { href: "/agriculteur/historique", label: "Mon historique", icon: History },
  { href: "/agriculteur/assistant", label: "Poser une question", icon: MessageCircleQuestion },
];

// Coque de l'espace producteur : chaque page de l'espace garde un chemin vers les autres, sur
// ordinateur (onglets) comme sur téléphone (barre basse sous le pouce).
export function FarmerShell({
  userId,
  demo,
  children,
}: {
  userId: string;
  demo: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 pb-24 md:pb-0">
      <SpaceNav label="Espace producteur" items={NAV} />
      <Suspense fallback={null}>
        <GuidedTour role="producteur" userId={userId} demo={demo} />
      </Suspense>
      {children}
    </div>
  );
}
