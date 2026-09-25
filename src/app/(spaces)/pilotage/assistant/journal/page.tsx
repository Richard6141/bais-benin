import type { Metadata, Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { outcomeFilter } from "@/features/assistant/assistant-logic";
import { JournalView } from "@/features/assistant/journal-view";
import { readJournal } from "@/modules/assistant";

export const metadata: Metadata = { title: "Journal de l'assistant" };

// D : journal national anonymisé. « Sans réponse fiable » liste les questions sous le seuil, pour
// prioriser les fiches à écrire ; les retours par réponse repèrent les fiches à revoir.
export default async function MinistryJournalPage(props: PageProps<"/pilotage/assistant/journal">) {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/assistant/journal" });
  const outcome = outcomeFilter((await props.searchParams).issue);
  const entries = await readJournal(user.actor, { outcome, limit: 200 });

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        eyebrow="Centre de pilotage"
        title="Journal des conversations"
        description="Toutes les questions posées à l'assistant, leur issue, les fiches citées et les retours des utilisateurs. L'auteur n'est jamais affiché ; le texte des questions est effacé après 90 jours."
        actions={
          <Button asChild variant="outline" className="h-11">
            <Link href={"/pilotage/assistant" as Route}>Assistant d&apos;analyse</Link>
          </Button>
        }
      />
      <JournalView entries={entries} basePath="/pilotage/assistant/journal" outcome={outcome} />
    </div>
  );
}
