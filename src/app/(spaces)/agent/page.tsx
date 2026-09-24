import { ClipboardCheck, MapPinned, RefreshCw } from "lucide-react";
import type { Metadata } from "next";
import { requireRole } from "@/features/auth/session";
import { SpaceWelcome } from "@/features/auth/space-welcome";

export const metadata: Metadata = { title: "Espace agent" };

export default async function AgentSpacePage() {
  const user = await requireRole("AGENT_AGRICULTURE");
  return (
    <SpaceWelcome
      eyebrow="Espace agent de terrain"
      title={`Bonjour, ${user.name}`}
      description="Enregistrez et vérifiez les exploitations de votre commune, même sans réseau."
      steps={[
        {
          title: "Enregistrer une exploitation",
          description: "Sept écrans courts, position GPS récupérée en un geste.",
          icon: MapPinned,
        },
        {
          title: "Vérifier sur le terrain",
          description: "Relevé de parcelle et confirmation des cultures déclarées.",
          icon: ClipboardCheck,
        },
        {
          title: "Synchroniser",
          description: "Vos saisies attendent sur l'appareil et partent au retour du réseau.",
          icon: RefreshCw,
        },
      ]}
    />
  );
}
