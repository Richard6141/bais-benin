import type { Route } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CROP_GLYPH_LABELS, type CropCode } from "@/components/data-display/crop-glyph";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import type { CurrentUser } from "@/features/auth/session";
import { getReportForActor, listReportsForActor, type FieldReportStatus } from "@/modules/reports";
import { REPORT_TYPE_LABELS } from "./labels";
import { ReportDetail } from "./report-detail";
import { ReportList } from "./report-list";

// Pages « Signalements » de l'agent et du ministère : même liste, même fiche, seuls la rubrique
// et le chemin changent. La portée vient du droit report.read (ADR-0014 pour l'agent).

interface SpacePaths {
  eyebrow: string;
  base: string;
}

const FILTERS: { status?: FieldReportStatus; label: string }[] = [
  { status: "SUBMITTED", label: "À visiter" },
  { label: "Tous" },
];

export async function ReportsListPage({
  user,
  space,
  status,
  description,
}: {
  user: CurrentUser;
  space: SpacePaths;
  status?: FieldReportStatus;
  description: string;
}) {
  const reports = await listReportsForActor(user.actor, { status });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={space.eyebrow}
        title="Signalements de terrain"
        description={description}
      />
      <nav aria-label="Filtrer les signalements" className="flex flex-wrap gap-2">
        {FILTERS.map((filter) => {
          const active = filter.status === status;
          const href = filter.status ? `${space.base}?statut=${filter.status}` : space.base;
          return (
            <Button key={filter.label} asChild variant={active ? "default" : "outline"}>
              <Link href={href as Route} aria-current={active ? "page" : undefined}>
                {filter.label}
              </Link>
            </Button>
          );
        })}
      </nav>
      <ReportList
        reports={reports}
        detailBase={space.base}
        empty={
          status === "SUBMITTED"
            ? "Aucun signalement en attente de visite."
            : "Aucun signalement pour le moment."
        }
      />
    </div>
  );
}

export async function ReportDetailPage({
  user,
  space,
  reportId,
}: {
  user: CurrentUser;
  space: SpacePaths;
  reportId: string;
}) {
  const report = await getReportForActor(user.actor, reportId);
  if (!report) notFound();
  const cropName = report.cropCode
    ? (CROP_GLYPH_LABELS[report.cropCode as CropCode] ?? report.cropCode)
    : null;
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={space.eyebrow}
        title={`${REPORT_TYPE_LABELS[report.type].label} signalé`}
        actions={
          <Button asChild variant="outline">
            <Link href={space.base as Route}>Tous les signalements</Link>
          </Button>
        }
      />
      <ReportDetail report={report} cropName={cropName} canReview={report.canReview} />
    </div>
  );
}

/** Statut demandé dans l'adresse (?statut=…), s'il est connu. */
export function parseStatus(value: string | string[] | undefined): FieldReportStatus | undefined {
  return value === "SUBMITTED" || value === "CONFIRMED" || value === "DISMISSED"
    ? value
    : undefined;
}
