import type { Metadata } from "next";
import { Suspense } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { requireRole } from "@/features/auth/session";
import { EnrolmentWizard } from "@/features/registry/enrolment/enrolment-wizard";
import { scopedCommunes } from "@/modules/registry/scope";

export const metadata: Metadata = { title: "Enregistrer une exploitation" };

// Le serveur ne fait que vérifier le rôle et transmettre le périmètre : tout le parcours vit sur
// l'appareil, sans réseau, dans la base locale de l'agent.
export default async function EnrolmentPage() {
  const user = await requireRole("AGENT_AGRICULTURE", { returnTo: "/agent/enregistrer" });
  const scope = await scopedCommunes(user.actor);
  const allowedCommuneCodes =
    scope === "all" ? "all" : scope === "none" ? [] : scope.map((c) => c.code);
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader
        eyebrow="Registre"
        title="Enregistrer une exploitation"
        description="Sept écrans courts. Tout est sauvegardé sur l'appareil à chaque étape."
      />
      <Suspense fallback={<Skeleton className="h-40" />}>
        <EnrolmentWizard userId={user.id} allowedCommuneCodes={allowedCommuneCodes} />
      </Suspense>
    </div>
  );
}
