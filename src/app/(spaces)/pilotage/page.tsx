import { BarChart3, Map, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import { requireRole } from "@/features/auth/session";
import { SpaceWelcome } from "@/features/auth/space-welcome";

export const metadata: Metadata = { title: "Centre de pilotage" };

export default async function MinistrySpacePage() {
  const user = await requireRole("ADMIN_STATE");
  return (
    <SpaceWelcome
      eyebrow="Centre de pilotage"
      title={`Bienvenue, ${user.name}`}
      description="Indicateurs nationaux, alertes en cours et qualité des données, du pays à la commune."
      steps={[
        {
          title: "Indicateurs",
          description: "Agriculteurs, surfaces, productions, avec la part vérifiée.",
          icon: BarChart3,
        },
        {
          title: "Carte nationale",
          description: "Descente département, commune, exploitation.",
          icon: Map,
        },
        {
          title: "Alertes",
          description: "Zones à risque et exploitations touchées, en temps réel.",
          icon: ShieldAlert,
        },
      ]}
    />
  );
}
