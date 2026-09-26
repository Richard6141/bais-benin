import { Badge } from "@/components/ui/badge";
import { formatNational } from "@/lib/auth/phone";
import type { AssistanceItem } from "@/modules/assistance";
import { HandleForm } from "./handle-form";
import { ASSISTANCE_CATEGORY_LABELS, ASSISTANCE_STATUS_LABELS } from "./labels";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" });

interface RequestListProps {
  requests: readonly AssistanceItem[];
  /** Vue de l'agent : contact du producteur et actions de traitement. */
  forAgent?: boolean;
  empty: string;
}

// Demandes d'assistance, de la plus récente à la plus ancienne, avec leur historique : reçue,
// prise en charge (par qui, quand), résolue (réponse donnée).
export function RequestList({ requests, forAgent = false, empty }: RequestListProps) {
  if (requests.length === 0) return <p className="text-muted-foreground">{empty}</p>;
  return (
    <ul className="flex flex-col divide-y rounded-md border">
      {requests.map((request) => {
        const status = ASSISTANCE_STATUS_LABELS[request.status];
        return (
          <li key={request.id} className="flex flex-col gap-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">
                {ASSISTANCE_CATEGORY_LABELS[request.category].label}
              </span>
              <Badge variant={status.tone}>{status.label}</Badge>
            </div>
            <p className="text-sm whitespace-pre-line">{request.description}</p>
            <ol className="flex flex-col gap-1 text-sm text-muted-foreground">
              <li>
                Reçue le {dateFormatter.format(request.createdAt)}, {request.communeName}
                {request.farm ? `, ${request.farm.name ?? request.farm.code}` : ""}
              </li>
              {request.takenAt ? (
                <li>
                  Prise en charge le {dateFormatter.format(request.takenAt)}
                  {request.handledByName ? ` par ${request.handledByName}` : ""}
                </li>
              ) : null}
              {request.resolvedAt ? (
                <li>Résolue le {dateFormatter.format(request.resolvedAt)}</li>
              ) : null}
            </ol>
            {request.resolutionNote ? (
              <p className="text-sm">
                <span className="font-medium">Réponse : </span>
                {request.resolutionNote}
              </p>
            ) : null}
            {forAgent ? (
              <>
                <p className="text-sm">
                  <span className="font-medium">Contact : </span>
                  {request.requesterName}
                  {request.requesterPhone
                    ? ` (+229 ${formatNational(request.requesterPhone.slice(4))})`
                    : ""}
                </p>
                {request.status !== "RESOLVED" ? (
                  <HandleForm requestId={request.id} status={request.status} />
                ) : null}
              </>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
