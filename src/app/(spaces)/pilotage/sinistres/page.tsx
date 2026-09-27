import { Download } from "lucide-react";
import type { Metadata } from "next";
import { EmptyState } from "@/components/feedback/empty-state";
import { HelpTip } from "@/components/forms/help-tip";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { DamageList } from "@/features/damage/damage-list";
import { DAMAGE_STATUS_LABELS } from "@/features/damage/labels";
import { listDamageDeclarations, type DamageFilters } from "@/modules/fires";

export const metadata: Metadata = { title: "Sinistres" };

const STATUSES = ["PROPOSED", "CONFIRMED", "REJECTED"] as const;

// Déclarations de sinistre après un feu (ADR-0038 §2), vue du ministère : proposées par la mesure
// satellite de surface brûlée, confirmées ou écartées sur place par les agents. Export CSV pour
// les programmes d'assistance et les assureurs ; aucune n'entraîne de paiement automatique.
export default async function PilotageDamagesPage(props: PageProps<"/pilotage/sinistres">) {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/sinistres" });
  const search = (await props.searchParams) as Record<string, string | string[] | undefined>;
  const etat = typeof search.etat === "string" ? search.etat : undefined;
  const status = STATUSES.find((value) => value === etat);
  const filters: DamageFilters = status ? { status } : {};
  const rows = await listDamageDeclarations(user.actor, filters);
  const exportHref = `/api/v1/damages/export.csv${status ? `?etat=${status}` : ""}`;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Centre de pilotage"
        title="Sinistres"
        description={`${rows.length} déclaration${rows.length > 1 ? "s" : ""} de sinistre après un feu, du plus récent au plus ancien.`}
        actions={
          <Button asChild variant="outline" className="h-11">
            <a href={exportHref} download>
              <Download aria-hidden />
              Exporter en CSV
            </a>
          </Button>
        }
      />
      <form method="get" className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="filtre-etat" className="text-sm font-medium">
            État
          </label>
          <select
            id="filtre-etat"
            name="etat"
            defaultValue={status ?? ""}
            className="h-11 rounded-md border bg-background px-3 text-base"
          >
            <option value="">Tous</option>
            {STATUSES.map((value) => (
              <option key={value} value={value}>
                {DAMAGE_STATUS_LABELS[value]}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" className="h-11">
          Filtrer
        </Button>
        <HelpTip label="Déclarations de sinistre">
          Après un feu près d&apos;une parcelle au contour relevé, le satellite compare l&apos;image
          d&apos;avant et celle d&apos;après (Sentinel-2) et estime une surface brûlée. À partir de
          0,1 ha ou 10 % de la parcelle, une déclaration est proposée ; l&apos;agent qui a
          enregistré l&apos;exploitation la confirme ou l&apos;écarte sur place. La déclaration est
          une pièce, pas un paiement.
        </HelpTip>
      </form>
      {rows.length === 0 ? (
        <EmptyState
          title="Aucune déclaration"
          description="Les déclarations arrivent 15 jours après un feu, quand la surface brûlée le justifie."
        />
      ) : (
        <DamageList rows={rows} />
      )}
    </div>
  );
}
