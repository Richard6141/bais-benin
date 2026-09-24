import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { formatDate, formatHa } from "@/features/registry/agent/labels";
import { PRIORITY_LABELS, priorityReasons } from "@/features/registry/verification/priority";
import { verificationQueue } from "@/modules/registry";

export const metadata: Metadata = { title: "À vérifier" };

export default async function VerificationQueuePage() {
  const user = await requireRole("AGENT_AGRICULTURE");
  const queue = await verificationQueue(user.actor, 100);
  const now = new Date();
  const ranked = queue
    .map((farm) => ({ farm, reasons: priorityReasons(farm, now) }))
    .sort(
      (a, b) =>
        b.reasons.length - a.reasons.length ||
        a.farm.createdAt.getTime() - b.farm.createdAt.getTime(),
    );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Vérification terrain"
        title="Exploitations à vérifier"
        description="Déclarées sans visite. Les motifs de priorité sont calculés à partir de la déclaration ; aucun ne bloque."
      />
      {ranked.length === 0 ? (
        <EmptyState
          title="Aucune exploitation à vérifier dans vos communes"
          description="Toutes les exploitations de votre périmètre ont été visitées."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {ranked.map(({ farm, reasons }) => (
            <li key={farm.id}>
              <Card className="p-0">
                <Link
                  href={`/agent/verification/${farm.id}` as Route}
                  className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-accent/60"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="truncate font-semibold">{farm.farmer.displayName}</span>
                      {reasons.map((reason) => (
                        <Badge key={reason} variant={reason === "AREA_GAP" ? "warning" : "watch"}>
                          {PRIORITY_LABELS[reason]}
                        </Badge>
                      ))}
                    </div>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {farm.commune.name}
                      {farm.village ? `, ${farm.village}` : ""} · déclarée le{" "}
                      {formatDate(farm.createdAt)}
                    </p>
                    <p className="tabular mt-1 text-sm">
                      {formatHa(farm.declaredAreaHa)} déclarés · {farm.parcelCount} parcelle
                      {farm.parcelCount > 1 ? "s" : ""}
                    </p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                </Link>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
