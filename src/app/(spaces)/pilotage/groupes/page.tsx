import type { Metadata, Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { GroupsTable } from "@/features/producer-groups/group-views";
import { listGroups } from "@/modules/producer-groups";

export const metadata: Metadata = { title: "Groupes de producteurs" };

// Groupes de producteurs (ADR-0024) : formés depuis le palmarès, ministère seulement. La liste ne
// montre que les en-têtes ; la liste nominative d'un groupe s'ouvre sur sa fiche, journalisée.
export default async function ProducerGroupsPage() {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/groupes" });
  const groups = await listGroups(user.actor);
  const active = groups.filter((g) => g.archivedAt === null);
  const archived = groups.filter((g) => g.archivedAt !== null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Centre de pilotage"
        title="Groupes de producteurs"
        description="Formés depuis le palmarès, pour consulter, exporter et écrire aux membres. Données nominatives réservées au ministère."
        actions={
          <Button asChild variant="outline" className="h-11">
            <Link href={"/pilotage/palmares" as Route}>Former un groupe</Link>
          </Button>
        }
      />
      {active.length === 0 ? (
        <p className="rounded-sm border bg-muted/40 p-4 text-sm">
          Aucun groupe en cours. Formez-en un depuis le{" "}
          <Link href={"/pilotage/palmares" as Route} className="underline underline-offset-4">
            palmarès
          </Link>
          , avec la culture, la campagne et la zone voulues.
        </p>
      ) : (
        <GroupsTable rows={active} caption="Groupes en cours" />
      )}
      {archived.length > 0 ? (
        <section aria-labelledby="groupes-archives" className="flex flex-col gap-3">
          <h2 id="groupes-archives" className="text-lg font-semibold">
            Groupes archivés
          </h2>
          <GroupsTable rows={archived} caption="Groupes archivés" />
        </section>
      ) : null}
    </div>
  );
}
