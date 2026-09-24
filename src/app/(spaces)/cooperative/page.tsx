import { Handshake, Sigma, Users } from "lucide-react";
import type { Metadata } from "next";
import { requireRole } from "@/features/auth/session";
import { SpaceWelcome } from "@/features/auth/space-welcome";

export const metadata: Metadata = { title: "Espace coopérative" };

export default async function CooperativeSpacePage() {
  const user = await requireRole("COOPERATIVE");
  return (
    <SpaceWelcome
      eyebrow="Espace coopérative"
      title={`Bienvenue, ${user.name}`}
      description="Vos membres, vos volumes agrégés et les appels d'achat auxquels répondre."
      steps={[
        {
          title: "Membres",
          description: "La liste de vos producteurs et leurs exploitations vérifiées.",
          icon: Users,
        },
        {
          title: "Volumes",
          description: "Production agrégée par culture et par campagne.",
          icon: Sigma,
        },
        {
          title: "Marché",
          description: "Répondre à une demande d'achat au nom de la coopérative.",
          icon: Handshake,
        },
      ]}
    />
  );
}
