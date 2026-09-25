import type { Metadata, Route } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { requireRole } from "@/features/auth/session";
import { outcomeFilter } from "@/features/assistant/assistant-logic";
import { JournalView } from "@/features/assistant/journal-view";
import { readJournal } from "@/modules/assistant";

export const metadata: Metadata = { title: "Journal de l'assistant" };

// D (agent) : conversations de ses communes, sans auteur. La lecture est journalisée.
export default async function AgentJournalPage(props: PageProps<"/agent/assistant/journal">) {
  const user = await requireRole("AGENT_AGRICULTURE", { returnTo: "/agent/assistant/journal" });
  const outcome = outcomeFilter((await props.searchParams).issue);
  const entries = await readJournal(user.actor, { outcome, limit: 100 });

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        eyebrow="Assistant agricole"
        title="Journal de mes communes"
        description="Questions posées dans vos communes et issue de chaque réponse, sans le nom de leur auteur."
        actions={
          <Button asChild variant="outline" className="h-11">
            <Link href={"/agent/assistant" as Route}>Retour à l&apos;assistant</Link>
          </Button>
        }
      />
      <JournalView entries={entries} basePath="/agent/assistant/journal" outcome={outcome} />
    </div>
  );
}
