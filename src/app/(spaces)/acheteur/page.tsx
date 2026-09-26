import { Award, FileSearch, MapPinned } from "lucide-react";
import type { Metadata, Route } from "next";
import { ActionList } from "@/components/layout/action-list";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/features/auth/session";

export const metadata: Metadata = { title: "Espace acheteur" };

// Espace acheteur : seulement ce qui existe aujourd'hui, sans promettre la recherche de récoltes
// ni les demandes d'achat, qui ne sont pas encore construites. Trois gestes utiles : voir où se
// cultive un produit, vérifier l'attestation d'un fournisseur, repérer les meilleurs producteurs.
export default async function BuyerSpacePage() {
  const user = await requireRole("BUYER");
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader
        eyebrow="Espace acheteur"
        title={`Bonjour, ${user.name}`}
        description="Repérez les zones de production et vérifiez vos fournisseurs. La recherche de récoltes vérifiées par volume viendra dans une prochaine version."
      />
      <ActionList
        title="Ce que vous pouvez faire aujourd'hui"
        idle=""
        actions={[
          {
            href: "/carte?metric=declaredAreaHa" as Route,
            icon: MapPinned,
            title: "Voir où se cultive un produit",
            detail:
              "La carte agricole, filtrée par culture : surfaces et exploitations par commune.",
          },
          {
            href: "/verifier" as Route,
            icon: FileSearch,
            title: "Vérifier l'attestation d'un producteur",
            detail: "Le numéro inscrit sur l'attestation dit si elle est authentique et à jour.",
          },
          {
            href: "/palmares" as Route,
            icon: Award,
            title: "Consulter le palmarès des producteurs",
            detail: "Les meilleurs producteurs publiés par le ministère, avec leur accord.",
          },
        ]}
      />
    </div>
  );
}
