import type { Metadata } from "next";
import { requireRole } from "@/features/auth/session";
import { ReportsListPage, parseStatus } from "@/features/reports/report-pages";

export const metadata: Metadata = { title: "Signalements de terrain" };

// Tous les signalements du pays. Le ministère statue sur ceux qu'aucun agent ne suit
// (exploitations enregistrées par leur producteur, ADR-0013).
export default async function PilotageReportsPage(props: PageProps<"/pilotage/signalements">) {
  const user = await requireRole("ADMIN_STATE", { returnTo: "/pilotage/signalements" });
  const params = await props.searchParams;
  return (
    <ReportsListPage
      user={user}
      space={{ eyebrow: "Centre de pilotage", base: "/pilotage/signalements" }}
      status={parseStatus(params.statut) ?? (params.statut === undefined ? "SUBMITTED" : undefined)}
      description="Ravageurs, maladies des cultures et maladies animales signalés par les producteurs et les agents, dans tout le pays."
    />
  );
}
