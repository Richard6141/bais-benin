import type { Metadata } from "next";
import { requireRole } from "@/features/auth/session";
import { ReportDetailPage } from "@/features/reports/report-pages";

export const metadata: Metadata = { title: "Signalement" };

export default async function PilotageReportPage(props: PageProps<"/pilotage/signalements/[id]">) {
  const { id } = await props.params;
  const user = await requireRole("ADMIN_STATE", { returnTo: `/pilotage/signalements/${id}` });
  return (
    <ReportDetailPage
      user={user}
      space={{ eyebrow: "Centre de pilotage", base: "/pilotage/signalements" }}
      reportId={id}
    />
  );
}
