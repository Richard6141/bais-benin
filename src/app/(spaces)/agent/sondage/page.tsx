import { ChevronRight } from "lucide-react";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/feedback/empty-state";
import { HelpTip } from "@/components/forms/help-tip";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LAND_COVER_LABELS } from "@/features/area-survey/labels";
import { requireRole } from "@/features/auth/session";
import { listSurveyPoints } from "@/modules/area-survey";
import { listCrops } from "@/modules/registry";

export const metadata: Metadata = { title: "Points d'enquête" };

const count = new Intl.NumberFormat("fr-FR");

// Points d'enquête de l'agent (ADR-0033) : les points tirés dans ses communes pour la campagne,
// ceux qui restent à visiter d'abord. Un point ne désigne aucun producteur.
export default async function SurveyPointsPage() {
  const user = await requireRole("AGENT_AGRICULTURE");
  const [points, crops] = await Promise.all([listSurveyPoints(user.actor), listCrops()]);
  const cropNames = new Map(crops.map((crop) => [crop.code, crop.nameFr]));
  const ordered = [...points].sort(
    (a, b) =>
      Number(a.observation !== null) - Number(b.observation !== null) ||
      a.code.localeCompare(b.code),
  );
  const visited = points.filter((point) => point.observation !== null).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Enquête de terrain"
        title="Points d'enquête"
        description={
          points.length > 0
            ? `${count.format(visited)} points constatés sur ${count.format(points.length)} dans vos communes.`
            : "Aucun point tiré dans vos communes pour cette campagne."
        }
      />
      {points.length === 0 ? (
        <EmptyState
          title="Aucun point à visiter"
          description="Les points sont tirés par le ministère dans les communes d'enquête."
        />
      ) : (
        <section aria-labelledby="points-titre" className="flex flex-col gap-3">
          <div className="flex items-center gap-1">
            <h2 id="points-titre" className="text-lg font-semibold">
              À visiter d&apos;abord
            </h2>
            <HelpTip label="Points d'enquête">
              Chaque point est tiré au hasard sur le territoire. Notez ce que vous voyez au point
              même : ces constats donnent les surfaces de chaque culture dans la commune, avec leur
              marge d&apos;erreur. Un point oublié ou mal choisi fausse le chiffre.
            </HelpTip>
          </div>
          <ul className="flex flex-col gap-2">
            {ordered.map((point) => (
              <li key={point.id}>
                <Card className="p-0">
                  <Link
                    href={`/agent/sondage/${point.id}` as Route}
                    className="flex min-h-16 items-center gap-3 px-4 py-3 hover:bg-accent/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="font-mono font-semibold">{point.code}</span>
                        {point.observation ? (
                          <Badge variant="success">
                            {point.observation.landCover === "CROP" && point.observation.cropCode
                              ? (cropNames.get(point.observation.cropCode) ??
                                point.observation.cropCode)
                              : LAND_COVER_LABELS[
                                  point.observation.landCover as keyof typeof LAND_COVER_LABELS
                                ]}
                          </Badge>
                        ) : (
                          <Badge variant="watch">À visiter</Badge>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {point.communeName}
                      </p>
                    </div>
                    <ChevronRight className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                  </Link>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
