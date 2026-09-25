import type { Metadata } from "next";
import { requireRole } from "@/features/auth/session";
import { ReportDetailPage } from "@/features/reports/report-pages";

export const metadata: Metadata = { title: "Signalement" };

export default async function AgentReportPage(props: PageProps<"/agent/signalements/[id]">) {
  const { id } = await props.params;
  const user = await requireRole("AGENT_AGRICULTURE", { returnTo: `/agent/signalements/${id}` });
  return (
    <ReportDetailPage
      user={user}
      space={{ eyebrow: "Espace agent de terrain", base: "/agent/signalements" }}
      reportId={id}
    />
  );
}
