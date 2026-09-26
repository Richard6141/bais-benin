import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { Route } from "next";
import { EmptyState } from "@/components/feedback/empty-state";
import { HelpTip } from "@/components/forms/help-tip";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { formatDate, formatHa } from "@/features/registry/agent/labels";
import { PRIORITY_LABELS, priorityReasons } from "@/features/registry/verification/priority";
import { verificationQueue } from "@/modules/registry";
import { listCropVisitPriorities, listFlaggedFarms } from "@/modules/satellite";

export const metadata: Metadata = { title: "À vérifier" };

export default async function VerificationQueuePage() {
  const user = await requireRole("AGENT_AGRICULTURE");
  // Signalements satellite (ADR-0016) : seulement les exploitations que l'agent a enregistrées.
  // Cultures à confirmer (ADR-0030) : là où une visite apprend le plus au modèle de culture.
  const [queue, flagged, cropDoubts] = await Promise.all([
    verificationQueue(user.actor, 100),
    listFlaggedFarms(user.actor, 50),
    listCropVisitPriorities(user.actor, 20),
  ]);
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
      {cropDoubts.length > 0 ? (
        <section aria-labelledby="cultures-titre" className="flex flex-col gap-3">
          <div className="flex items-center gap-1">
            <h2 id="cultures-titre" className="text-lg font-semibold">
              Cultures à confirmer
            </h2>
            <HelpTip label="Cultures à confirmer">
              Parcelles où le satellite voit une autre culture que celle déclarée, ou hésite. Notez
              à la visite la culture que vous voyez : chaque visite apprend au satellite à mieux
              reconnaître les cultures.
            </HelpTip>
          </div>
          <ul className="flex flex-col gap-2">
            {cropDoubts.map((doubt) => (
              <li key={doubt.parcelId}>
                <Card className="p-0">
                  <Link
                    href={`/agent/verification/${doubt.farmId}` as Route}
                    className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-accent/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate font-semibold">{doubt.farmerName}</span>
                        <Badge variant={doubt.agreement === "DIFFERS" ? "warning" : "watch"}>
                          {doubt.agreement === "DIFFERS" ? "Culture différente" : "Incertain"}
                        </Badge>
                      </div>
                      <p className="mt-0.5 text-sm">{doubt.reason}</p>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {doubt.parcelCode}, {doubt.communeName}
                        {doubt.village ? `, ${doubt.village}` : ""}
                      </p>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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
                      {farm.village ? `, ${farm.village}` : ""}, déclarée le{" "}
                      {formatDate(farm.createdAt)}
                    </p>
                    <p className="tabular mt-1 text-sm">
                      {formatHa(farm.declaredAreaHa)} déclarés, {farm.parcelCount} parcelle
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
      {flagged.length > 0 ? (
        <section aria-labelledby="satellite-titre" className="flex flex-col gap-3">
          <h2 id="satellite-titre" className="text-lg font-semibold">
            Signalées par le satellite
          </h2>
          <p className="text-sm text-muted-foreground">
            Parcelles dont la végétation observée par Sentinel-2 ne correspond pas à la culture
            déclarée. Une visite confirme la culture ou corrige la déclaration.
          </p>
          <ul className="flex flex-col gap-2">
            {flagged.map((farm) => (
              <li key={farm.farm_id}>
                <Card className="p-0">
                  <Link
                    href={`/agent/exploitations/${farm.farm_id}` as Route}
                    className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-accent/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="truncate font-mono text-sm font-semibold">
                          {farm.farm_code}
                        </span>
                        <Badge variant="warning">
                          {farm.flagged_parcels} parcelle{farm.flagged_parcels > 1 ? "s" : ""} à
                          vérifier
                        </Badge>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {farm.commune_name}
                        {farm.village ? `, ${farm.village}` : ""}, {farm.crop_names.join(", ")}
                      </p>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
