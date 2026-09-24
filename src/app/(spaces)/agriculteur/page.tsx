import { Bell, LandPlot, Wheat } from "lucide-react";
import type { Metadata } from "next";
import { requireRole } from "@/features/auth/session";
import { SpaceWelcome } from "@/features/auth/space-welcome";

export const metadata: Metadata = { title: "Mon exploitation" };

export default async function FarmerSpacePage() {
  const user = await requireRole("FARMER");
  return (
    <SpaceWelcome
      eyebrow="Espace agriculteur"
      title={`Bienvenue, ${user.name}`}
      description="Votre exploitation, vos récoltes et vos alertes, au même endroit."
      steps={[
        {
          title: "Mon exploitation",
          description: "Vos parcelles et vos cultures, enregistrées avec votre agent.",
          icon: LandPlot,
        },
        {
          title: "Déclarer une récolte",
          description: "Trois questions, une minute, depuis votre téléphone.",
          icon: Wheat,
        },
        {
          title: "Mes alertes",
          description: "Sécheresse, pluie, marché : vous êtes prévenu sur WhatsApp.",
          icon: Bell,
        },
      ]}
    />
  );
}
