import { FileBadge } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { AttestationControls } from "@/features/attestations/attestation-controls";
import { AttestationDocument } from "@/features/attestations/attestation-document";
import { requireRole } from "@/features/auth/session";
import { getServerEnv } from "@/lib/env";
import { listFarmAttestations } from "@/modules/attestations";
import { listOwnFarms } from "@/modules/registry";

export const metadata: Metadata = { title: "Mon attestation" };

// Attestation d'exploitation du producteur : la dernière établie, prête à imprimer ou à montrer
// à la banque ou à l'assureur, et de quoi en établir une à jour après une récolte ou une visite.
export default async function FarmerAttestationPage() {
  const user = await requireRole("FARMER", { returnTo: "/agriculteur/attestation" });
  const farms = await listOwnFarms(user.id);
  const farm = farms[0];

  if (!farm) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <PageHeader eyebrow="Mon exploitation" title="Mon attestation" />
        <EmptyState
          icon={<FileBadge />}
          title="Aucune exploitation enregistrée"
          description="Votre agent doit d'abord enregistrer votre exploitation : l'attestation la décrit."
        />
      </div>
    );
  }

  const attestations = await listFarmAttestations(user.actor, farm.id);
  const latest = attestations.find((attestation) => !attestation.revokedAt) ?? null;
  const { APP_URL } = getServerEnv();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="print:hidden">
        <PageHeader
          eyebrow="Mon exploitation"
          title="Mon attestation"
          description="Prouvez vos champs et vos récoltes auprès d'une banque, d'une assurance ou d'un programme d'aide. Chaque attestation se vérifie par son code QR."
        />
      </div>
      <AttestationControls
        farmId={farm.id}
        path="/agriculteur/attestation"
        hasAttestation={latest !== null}
      />
      {latest ? (
        <AttestationDocument attestation={latest} appUrl={APP_URL} />
      ) : (
        <p className="rounded-sm border bg-muted/40 p-4 text-sm print:hidden">
          Vous n&apos;avez pas encore d&apos;attestation. Établissez-la en un clic : elle reprend
          les informations de votre exploitation telles que le registre les connaît
          aujourd&apos;hui.
        </p>
      )}
    </div>
  );
}
