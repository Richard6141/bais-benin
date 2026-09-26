import type { Metadata, Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { ArchiveGroupButton } from "@/features/producer-groups/archive-group-button";
import {
  GroupFigures,
  GroupMembersTable,
  GroupMessages,
  shortDate,
} from "@/features/producer-groups/group-views";
import { MessageComposer } from "@/features/producer-groups/message-composer";
import {
  MAX_GROUP_MESSAGE_LENGTH,
  getGroup,
  type ProducerGroupDetail,
} from "@/modules/producer-groups";

export const metadata: Metadata = { title: "Groupe de producteurs" };

function criteriaLine(group: ProducerGroupDetail): string {
  const zone = group.communeName
    ? `commune de ${group.communeName}`
    : group.departementName
      ? `département ${group.departementName}`
      : "tout le Bénin";
  const { metric, verifiedOnly, eligibleCount } = group.criteria;
  const ranking = metric === "yield" ? "au rendement à l'hectare" : "à la production totale";
  const farms = verifiedOnly
    ? "exploitations vérifiées seulement"
    : "exploitations vérifiées ou non";
  const among = eligibleCount > 0 ? ` parmi ${eligibleCount} classables` : "";
  const count = group.figures.members;
  return (
    `${group.cropName}, campagne ${group.campaignCode}, ${zone}. ` +
    `${count} premier${count > 1 ? "s" : ""}${among}, classement ${ranking}, ${farms}. ` +
    `Formé le ${shortDate.format(group.createdAt)} par ${group.createdByName}.`
  );
}

// Fiche d'un groupe de producteurs (ADR-0024) : critères, chiffres, membres avec leur champ sur la
// carte, export et message WhatsApp aux membres consentants. Chaque ouverture est journalisée.
export default async function ProducerGroupPage(props: PageProps<"/pilotage/groupes/[id]">) {
  const { id } = await props.params;
  const user = await requireRole("ADMIN_STATE", { returnTo: `/pilotage/groupes/${id}` });
  const group = await getGroup(user.actor, id);
  if (!group) notFound();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Centre de pilotage"
        title={group.name}
        description={criteriaLine(group)}
        actions={
          <>
            <Button asChild variant="outline" className="h-11">
              <Link href={"/pilotage/groupes" as Route}>Tous les groupes</Link>
            </Button>
            <Button asChild variant="outline" className="h-11">
              <a href={`/api/v1/analytics/producer-groups/${group.id}/members.csv`}>
                Exporter (CSV)
              </a>
            </Button>
          </>
        }
      />
      {group.archivedAt ? (
        <Badge variant="outline" className="h-7 px-3 text-sm">
          Archivé le {shortDate.format(group.archivedAt)}
        </Badge>
      ) : null}
      <GroupFigures figures={group.figures} />
      <section aria-labelledby="membres" className="flex flex-col gap-3">
        <h2 id="membres" className="text-lg font-semibold">
          Membres
        </h2>
        <GroupMembersTable members={group.members} byYield={group.criteria.metric === "yield"} />
      </section>
      {group.archivedAt ? null : (
        <MessageComposer
          groupId={group.id}
          members={group.figures.members}
          consented={group.figures.consented}
          demo={group.figures.demo}
          maxLength={MAX_GROUP_MESSAGE_LENGTH}
        />
      )}
      <GroupMessages messages={group.messages} />
      {group.archivedAt ? null : (
        <div className="border-t pt-5 print:hidden">
          <ArchiveGroupButton groupId={group.id} />
        </div>
      )}
    </div>
  );
}
