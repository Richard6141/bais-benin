import { Badge } from "@/components/ui/badge";
import type { ReportListItem } from "@/modules/reports";
import { LOCATION_SOURCE_LABELS, REPORT_STATUS_LABELS, REPORT_TYPE_LABELS } from "./labels";
import { ReviewForm } from "./review-form";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" });

interface ReportDetailProps {
  report: ReportListItem;
  cropName: string | null;
  /** L'acteur peut confirmer ou écarter (report.review) et le signalement attend encore. */
  canReview: boolean;
}

// Fiche d'un signalement pour l'agent et le ministère : ce qui a été vu, où, par qui, la photo,
// puis la décision après visite.
export function ReportDetail({ report, cropName, canReview }: ReportDetailProps) {
  const status = REPORT_STATUS_LABELS[report.status];
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={status.tone}>{status.label}</Badge>
        <span className="text-sm text-muted-foreground">
          {REPORT_TYPE_LABELS[report.type].label}
          {cropName ? ` · ${cropName}` : ""}
        </span>
      </div>
      <p className="text-base whitespace-pre-line">{report.description}</p>
      {report.hasPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element -- photo servie par une route authentifiée
        <img
          src={`/api/v1/reports/${report.id}/photo`}
          alt={`Photo du signalement : ${REPORT_TYPE_LABELS[report.type].label.toLowerCase()}`}
          className="max-h-96 w-fit rounded-md border"
        />
      ) : null}
      <dl className="grid gap-3 text-sm sm:grid-cols-[180px_1fr]">
        <dt className="text-muted-foreground">Observé le</dt>
        <dd>{dateFormatter.format(report.observedAt)}</dd>
        <dt className="text-muted-foreground">Exploitation</dt>
        <dd>
          {report.farm.name ?? report.farm.code} ({report.farm.code}) · {report.farm.farmerName}
        </dd>
        <dt className="text-muted-foreground">Parcelle</dt>
        <dd>{report.parcelCode ?? "Toute l'exploitation"}</dd>
        <dt className="text-muted-foreground">Commune</dt>
        <dd>{report.communeName}</dd>
        <dt className="text-muted-foreground">Position</dt>
        <dd>{LOCATION_SOURCE_LABELS[report.locationSource] ?? report.locationSource}</dd>
        <dt className="text-muted-foreground">Signalé par</dt>
        <dd>{report.reportedByName}</dd>
        {report.review ? (
          <>
            <dt className="text-muted-foreground">Suite donnée</dt>
            <dd>
              {dateFormatter.format(report.review.at)}
              {report.review.byName ? ` par ${report.review.byName}` : ""}
              {report.review.note ? ` : ${report.review.note}` : ""}
            </dd>
          </>
        ) : null}
      </dl>
      {canReview && report.status === "SUBMITTED" ? (
        <section className="border-t pt-6">
          <h2 className="mb-4 text-lg font-semibold">Après la visite</h2>
          <ReviewForm reportId={report.id} />
        </section>
      ) : null}
    </div>
  );
}
