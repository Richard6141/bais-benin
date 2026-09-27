import type { Metadata } from "next";
import { EmptyState } from "@/components/feedback/empty-state";
import { HelpTip } from "@/components/forms/help-tip";
import { PageHeader } from "@/components/layout/page-header";
import { requireRole } from "@/features/auth/session";
import { DamageList } from "@/features/damage/damage-list";
import { listDamageDeclarations } from "@/modules/fires";

export const metadata: Metadata = { title: "Sinistres" };

// Sinistres de l'agent (ADR-0038 §2) : déclarations proposées par la mesure satellite de surface
// brûlée, sur les exploitations qu'il a enregistrées ; celles à visiter d'abord, puis celles déjà
// confirmées ou écartées.
export default async function AgentDamagesPage() {
  const user = await requireRole("AGENT_AGRICULTURE", { returnTo: "/agent/sinistres" });
  const rows = await listDamageDeclarations(user.actor);
  const proposed = rows.filter((row) => row.status === "PROPOSED");
  const reviewed = rows.filter((row) => row.status !== "PROPOSED");
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Feux"
        title="Sinistres"
        description={
          proposed.length > 0
            ? `${proposed.length} sinistre${proposed.length > 1 ? "s" : ""} à constater sur place.`
            : "Aucun sinistre à constater pour l'instant."
        }
      />
      {rows.length === 0 ? (
        <EmptyState
          title="Aucun sinistre"
          description="Après un feu près d'une parcelle, la surface brûlée est estimée par satellite ; une déclaration arrive ici si elle le justifie."
        />
      ) : null}
      {proposed.length > 0 ? (
        <section aria-labelledby="a-constater" className="flex flex-col gap-3">
          <div className="flex items-center gap-1">
            <h2 id="a-constater" className="text-lg font-semibold">
              À constater sur place
            </h2>
            <HelpTip label="Sinistres à constater">
              Le satellite compare l&apos;image d&apos;avant le feu à celle d&apos;après et estime
              une surface brûlée. Allez voir : confirmez ce qui a brûlé, ou écartez le sinistre
              (brûlis volontaire, pas de dégât).
            </HelpTip>
          </div>
          <DamageList rows={proposed} hrefOf={(row) => `/agent/sinistres/${row.id}`} />
        </section>
      ) : null}
      {reviewed.length > 0 ? (
        <section aria-labelledby="deja-vus" className="flex flex-col gap-3">
          <h2 id="deja-vus" className="text-lg font-semibold">
            Déjà constatés
          </h2>
          <DamageList rows={reviewed} />
        </section>
      ) : null}
    </div>
  );
}
