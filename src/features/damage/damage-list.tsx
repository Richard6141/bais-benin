import { ChevronRight, Flame } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CROP_STAGE_LABELS } from "@/features/registry/agent/labels";
import type { DamageRow } from "@/modules/fires";
import { DAMAGE_STATUS_LABELS } from "./labels";

const day = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Africa/Porto-Novo" });
const hectares = (value: unknown) =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(Number(value));

const VARIANT = { PROPOSED: "watch", CONFIRMED: "critical", REJECTED: "offline" } as const;

/** Ligne de synthèse d'une déclaration : estimation satellite, puis constat s'il existe. */
function summary(row: DamageRow): string {
  const estimate = `Estimation satellite : ${hectares(row.estimatedLowHa)} à ${hectares(row.estimatedHighHa)} ha brûlés`;
  if (row.status === "CONFIRMED" && row.observedAreaHa !== null) {
    const crop = row.crop
      ? `, ${row.crop.nameFr}${row.cropStage ? ` ${CROP_STAGE_LABELS[row.cropStage]?.toLowerCase() ?? ""}` : ""}`
      : "";
    return `Constaté : ${hectares(row.observedAreaHa)} ha brûlés${crop}. ${estimate}.`;
  }
  if (row.status === "REJECTED") return `Écartée : ${row.rejectReason ?? "sans raison donnée"}.`;
  return `${estimate}, à confirmer sur place.`;
}

// Déclarations de sinistre (ADR-0038 §2), du feu le plus récent au plus ancien : exploitation,
// parcelle, date du feu, état, et ce que disent le satellite et l'agent. `hrefOf` donne un lien
// vers la visite (espace agent) ; sans lui, la liste se lit seulement.
export function DamageList({
  rows,
  hrefOf,
  showFarmer = true,
}: {
  rows: readonly DamageRow[];
  hrefOf?: (row: DamageRow) => string;
  showFarmer?: boolean;
}) {
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => {
        const body = (
          <div className="flex min-h-16 items-start gap-3 px-4 py-3">
            <Flame className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-semibold">
                  {showFarmer
                    ? `${row.farm.farmer.firstName} ${row.farm.farmer.lastName}`
                    : row.farm.name}
                </span>
                <Badge variant={VARIANT[row.status]}>{DAMAGE_STATUS_LABELS[row.status]}</Badge>
                {row.burnAssessment.reliability === "SYNTHETIC" ? (
                  <Badge variant="outline">Démonstration</Badge>
                ) : null}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">
                Feu du {day.format(row.occurredAt)}, parcelle {row.parcel.code},{" "}
                {row.farm.commune.name}
              </p>
              <p className="mt-1 text-sm">{summary(row)}</p>
            </div>
            {hrefOf ? (
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
            ) : null}
          </div>
        );
        return (
          <li key={row.id}>
            <Card className="p-0">
              {hrefOf ? (
                <Link href={hrefOf(row) as Route} className="block hover:bg-accent/60">
                  {body}
                </Link>
              ) : (
                body
              )}
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
