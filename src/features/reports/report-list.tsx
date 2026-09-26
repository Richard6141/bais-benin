import { Camera } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { ReportListItem } from "@/modules/reports";
import { REPORT_STATUS_LABELS, REPORT_TYPE_LABELS } from "./labels";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

interface ReportListProps {
  reports: readonly ReportListItem[];
  /** Préfixe des fiches (« /agent/signalements ») ; sans lui, la liste n'ouvre pas de fiche. */
  detailBase?: string;
  /** Le producteur voit ses propres signalements : inutile de rappeler son nom. */
  showFarmer?: boolean;
  empty: string;
}

// Liste des signalements, du plus récent au plus ancien, commune aux trois espaces.
export function ReportList({ reports, detailBase, showFarmer = true, empty }: ReportListProps) {
  if (reports.length === 0) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col divide-y rounded-md border">
      {reports.map((report) => {
        const status = REPORT_STATUS_LABELS[report.status];
        const title = (
          <span className="font-semibold">{REPORT_TYPE_LABELS[report.type].label}</span>
        );
        return (
          <li key={report.id} className="flex flex-col gap-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {detailBase ? (
                <Link
                  href={`${detailBase}/${report.id}` as Route}
                  className="underline-offset-4 hover:underline"
                >
                  {title}
                </Link>
              ) : (
                title
              )}
              <Badge variant={status.tone}>{status.label}</Badge>
              {report.hasPhoto ? (
                <Camera aria-label="Photo jointe" className="size-4 text-muted-foreground" />
              ) : null}
            </div>
            <p className="line-clamp-2 text-sm">{report.description}</p>
            <p className="text-sm text-muted-foreground">
              {[
                dateFormatter.format(report.observedAt),
                report.farm.name ?? report.farm.code,
                report.parcelCode,
                report.communeName,
                showFarmer ? report.farm.farmerName : null,
              ]
                .filter(Boolean)
                .join(", ")}
            </p>
            {report.review?.note ? (
              <p className="text-sm">
                <span className="font-medium">Suite donnée : </span>
                {report.review.note}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
