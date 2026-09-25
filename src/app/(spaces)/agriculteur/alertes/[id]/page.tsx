import { Lightbulb } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CATEGORY_LABELS, formatPeriod } from "@/components/data-display/alert-labels";
import {
  IndicatorExplanation,
  parseExplainedLines,
} from "@/components/data-display/indicator-explanation";
import { ReliabilityBadge } from "@/components/data-display/reliability-badge";
import { SeverityBadge } from "@/components/data-display/severity-badge";
import { SourceCaption } from "@/components/data-display/source-caption";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { requireRole } from "@/features/auth/session";
import { AcknowledgeButton } from "@/features/monitoring/acknowledge-button";
import { formatSourceDate } from "@/features/monitoring/alert-views";
import { getAlertDetail } from "@/modules/monitoring";

export const metadata: Metadata = { title: "Alerte" };

// A2 : le conseil d'abord, en grand ; l'explication ensuite ; la lecture est enregistrée à
// l'ouverture et « J'ai compris » la confirme.
export default async function FarmerAlertPage(props: PageProps<"/agriculteur/alertes/[id]">) {
  const { id } = await props.params;
  const user = await requireRole("FARMER", { returnTo: `/agriculteur/alertes/${id}` });
  const alert = /^[0-9a-f-]{36}$/i.test(id) ? await getAlertDetail(user.actor, id) : null;
  if (!alert) notFound();
  const category = CATEGORY_LABELS[alert.category];

  return (
    <article className="mx-auto flex w-full max-w-xl flex-col gap-6" aria-labelledby="alert-title">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SeverityBadge severity={alert.severity} size="large" />
          <span className="inline-flex items-center gap-1.5 text-base text-muted-foreground">
            <category.Icon aria-hidden className="size-5" />
            {category.label} · {alert.communeName}
          </span>
        </div>
        <h1 id="alert-title" className="text-3xl font-semibold tracking-tight text-balance">
          {alert.title}
        </h1>
      </header>

      <Card className="border-primary/40 bg-accent">
        <CardContent className="flex flex-col gap-2">
          <p className="flex items-center gap-2 text-xl font-semibold text-accent-foreground">
            <Lightbulb aria-hidden className="size-6" />
            Que faire ?
          </p>
          <p className="text-lg leading-relaxed text-accent-foreground">{alert.advice}</p>
        </CardContent>
      </Card>

      <p className="text-lg leading-relaxed">{alert.message}</p>
      <p className="tabular text-base text-muted-foreground">
        {formatPeriod(alert.startsOn, alert.endsOn)}
      </p>

      {alert.explanation.length > 0 ? (
        <IndicatorExplanation conditions={parseExplainedLines(alert.explanation)} />
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <ReliabilityBadge level={alert.reliability === "SYNTHETIC" ? "SYNTHETIC" : "ESTIMATED"} />
        <SourceCaption source={alert.source} date={formatSourceDate(alert.sourceDate)} />
      </div>

      <AcknowledgeButton alertId={alert.id} readAt={alert.readAt} />
      <Button asChild variant="outline" className="h-14 w-full text-base">
        <Link href="/agriculteur/alertes">Toutes mes alertes</Link>
      </Button>
    </article>
  );
}
