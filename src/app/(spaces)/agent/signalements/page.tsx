import type { Metadata } from "next";
import { requireRole } from "@/features/auth/session";
import { ReportsListPage, parseStatus } from "@/features/reports/report-pages";

export const metadata: Metadata = { title: "Signalements de terrain" };

// Signalements des exploitations que l'agent a enregistrées (ADR-0014), à visiter d'abord.
export default async function AgentReportsPage(props: PageProps<"/agent/signalements">) {
  const user = await requireRole("AGENT_AGRICULTURE", { returnTo: "/agent/signalements" });
  const params = await props.searchParams;
  return (
    <ReportsListPage
      user={user}
      space={{ eyebrow: "Espace agent de terrain", base: "/agent/signalements" }}
      status={parseStatus(params.statut) ?? (params.statut === undefined ? "SUBMITTED" : undefined)}
      description="Problèmes signalés par les producteurs des exploitations que vous avez enregistrées. Passez constater sur place, puis confirmez ou écartez."
    />
  );
}
